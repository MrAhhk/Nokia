#!/usr/bin/env python3
"""Verify that manifest Android components have definitions in packaged DEX.

For an AAB, the embedded protobuf manifest is used by default. APK/DEX checks
require the matching text merged/packaged manifest produced by AGP.
Supports single-base AABs only: dynamic-feature manifests and DEX are not
verified. Extend the gate before introducing dynamic features.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path


ANDROID = "{http://schemas.android.com/apk/res/android}"
COMPONENT_TAGS = ("activity", "service", "receiver", "provider")


@dataclass(frozen=True)
class Component:
    kind: str
    declared_name: str
    resolved_name: str


def _u32(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 4 > len(data):
        raise ValueError(f"DEX offset outside file: {offset}")
    return struct.unpack_from("<I", data, offset)[0]


def _uleb128(data: bytes, offset: int) -> tuple[int, int]:
    value = 0
    for shift in range(0, 35, 7):
        if offset >= len(data):
            raise ValueError("truncated DEX ULEB128")
        byte = data[offset]
        offset += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, offset
    raise ValueError("invalid DEX ULEB128")


def dex_defined_classes(data: bytes) -> set[str]:
    if len(data) < 0x70 or not data.startswith(b"dex\n"):
        raise ValueError("not a supported DEX file")
    string_count, string_off = _u32(data, 0x38), _u32(data, 0x3C)
    type_count, type_off = _u32(data, 0x40), _u32(data, 0x44)
    class_count, class_off = _u32(data, 0x60), _u32(data, 0x64)

    strings: list[str] = []
    for index in range(string_count):
        item_off = _u32(data, string_off + index * 4)
        _, text_off = _uleb128(data, item_off)
        end = data.find(b"\0", text_off)
        if end < 0:
            raise ValueError("unterminated DEX string")
        strings.append(data[text_off:end].decode("utf-8", errors="replace"))

    descriptors: list[str] = []
    for index in range(type_count):
        descriptor_index = _u32(data, type_off + index * 4)
        if descriptor_index >= len(strings):
            raise ValueError("DEX type references missing string")
        descriptors.append(strings[descriptor_index])

    classes: set[str] = set()
    for index in range(class_count):
        class_index = _u32(data, class_off + index * 32)
        if class_index >= len(descriptors):
            raise ValueError("DEX class references missing type")
        descriptor = descriptors[class_index]
        if descriptor.startswith("L") and descriptor.endswith(";"):
            classes.add(descriptor[1:-1].replace("/", "."))
    return classes


def artifact_classes(path: Path) -> tuple[set[str], list[str]]:
    if path.suffix.lower() == ".dex":
        return dex_defined_classes(path.read_bytes()), [path.name]
    classes: set[str] = set()
    dex_entries: list[str] = []
    with zipfile.ZipFile(path) as archive:
        for name in sorted(archive.namelist()):
            pattern = r"base/dex/classes(?:[2-9]|[1-9][0-9]+)?\.dex" if path.suffix.lower() == ".aab" else r"classes(?:[2-9]|[1-9][0-9]+)?\.dex"
            if re.fullmatch(pattern, name):
                dex_entries.append(name)
                classes.update(dex_defined_classes(archive.read(name)))
    if not dex_entries:
        raise ValueError(f"artifact contains no DEX files: {path}")
    return classes, dex_entries


def resolve_component_name(package: str, name: str) -> str:
    if name.startswith("."):
        return package + name
    if "." not in name:
        return f"{package}.{name}"
    return name


def _protobuf_fields(data: bytes):
    offset = 0
    while offset < len(data):
        key, offset = _uleb128(data, offset)
        number, wire_type = key >> 3, key & 7
        if wire_type == 0:
            value, offset = _uleb128(data, offset)
        elif wire_type == 1:
            value, offset = data[offset:offset + 8], offset + 8
        elif wire_type == 2:
            size, offset = _uleb128(data, offset)
            value, offset = data[offset:offset + size], offset + size
        elif wire_type == 5:
            value, offset = data[offset:offset + 4], offset + 4
        else:
            raise ValueError(f"unsupported protobuf wire type: {wire_type}")
        if offset > len(data):
            raise ValueError("truncated protobuf field")
        yield number, wire_type, value


def _proto_text(value: bytes) -> str:
    return value.decode("utf-8")


def _proto_attribute(data: bytes) -> tuple[str, str, str]:
    namespace = name = value = ""
    for number, wire_type, field in _protobuf_fields(data):
        if wire_type != 2:
            continue
        if number == 1:
            namespace = _proto_text(field)
        elif number == 2:
            name = _proto_text(field)
        elif number == 3:
            value = _proto_text(field)
    return namespace, name, value


def _proto_element(data: bytes) -> dict[str, object]:
    name = ""
    attributes: dict[tuple[str, str], str] = {}
    children: list[dict[str, object]] = []
    for number, wire_type, field in _protobuf_fields(data):
        if wire_type != 2:
            continue
        if number == 3:
            name = _proto_text(field)
        elif number == 4:
            namespace, attr_name, value = _proto_attribute(field)
            attributes[(namespace, attr_name)] = value
        elif number == 5:
            child = _proto_node(field)
            if child:
                children.append(child)
    return {"name": name, "attributes": attributes, "children": children}


def _proto_node(data: bytes) -> dict[str, object] | None:
    for number, wire_type, field in _protobuf_fields(data):
        if number == 1 and wire_type == 2:
            return _proto_element(field)
    return None


def _components_from_tree(root: dict[str, object]):
    if root["name"] != "manifest":
        raise ValueError("embedded protobuf XML root is not manifest")
    attributes = root["attributes"]
    package = attributes.get(("", "package"), "")
    if not package:
        raise ValueError("embedded manifest has no package")
    application = next(
        (child for child in root["children"] if child["name"] == "application"), None
    )
    if application is None:
        raise ValueError("embedded manifest has no application element")
    android_uri = "http://schemas.android.com/apk/res/android"
    components: list[Component] = []
    aliases: list[dict[str, str]] = []
    for child in application["children"]:
        kind = child["name"]
        attrs = child["attributes"]
        if kind in COMPONENT_TAGS:
            name = attrs.get((android_uri, "name"), "")
            if name:
                components.append(Component(kind, name, resolve_component_name(package, name)))
        elif kind == "activity-alias":
            alias = attrs.get((android_uri, "name"), "")
            target = attrs.get((android_uri, "targetActivity"), "")
            if alias and target:
                resolved_target = resolve_component_name(package, target)
                aliases.append({
                    "alias": resolve_component_name(package, alias),
                    "targetActivity": resolved_target,
                })
                components.append(Component("activity-alias-target", target, resolved_target))
    android_uri = "http://schemas.android.com/apk/res/android"
    version = {
        "versionCode": attributes.get((android_uri, "versionCode"), ""),
        "versionName": attributes.get((android_uri, "versionName"), ""),
    }
    return package, components, aliases, version


def embedded_aab_components(path: Path):
    with zipfile.ZipFile(path) as archive:
        try:
            data = archive.read("base/manifest/AndroidManifest.xml")
        except KeyError as error:
            raise ValueError("AAB has no base embedded manifest") from error
    root = _proto_node(data)
    if root is None:
        raise ValueError("unable to decode embedded protobuf manifest")
    return _components_from_tree(root)


def manifest_components(path: Path):
    root = ET.parse(path).getroot()
    package = root.attrib.get("package", "")
    if not package:
        raise ValueError("manifest has no package attribute; use an AGP merged manifest")
    application = root.find("application")
    if application is None:
        raise ValueError("manifest has no application element")

    components: list[Component] = []
    for kind in COMPONENT_TAGS:
        for element in application.findall(kind):
            name = element.attrib.get(ANDROID + "name")
            if name:
                components.append(Component(kind, name, resolve_component_name(package, name)))

    aliases: list[dict[str, str]] = []
    for element in application.findall("activity-alias"):
        alias = element.attrib.get(ANDROID + "name")
        target = element.attrib.get(ANDROID + "targetActivity")
        if alias and target:
            resolved_target = resolve_component_name(package, target)
            aliases.append({
                "alias": resolve_component_name(package, alias),
                "targetActivity": resolved_target,
            })
            components.append(Component("activity-alias-target", target, resolved_target))
    return package, components, aliases, {
        "versionCode": root.attrib.get(ANDROID + "versionCode", ""),
        "versionName": root.attrib.get(ANDROID + "versionName", ""),
    }


def verify(artifact: Path, manifest: Path | None = None) -> dict[str, object]:
    if manifest is None:
        if artifact.suffix.lower() != ".aab":
            raise ValueError("--manifest is required unless the artifact is an AAB")
        package, components, aliases, version = embedded_aab_components(artifact)
        manifest_name = "base/manifest/AndroidManifest.xml (embedded)"
    else:
        package, components, aliases, version = manifest_components(manifest)
        manifest_name = str(manifest.resolve())
    classes, dex_entries = artifact_classes(artifact)
    if not components:
        raise ValueError("manifest contains no component targets to verify")
    results = [
        {**asdict(component), "present": component.resolved_name in classes}
        for component in components
    ]
    return {
        "artifact": str(artifact.resolve()),
        "artifactSha256": hashlib.sha256(artifact.read_bytes()).hexdigest(),
        "manifest": manifest_name,
        "package": package,
        **version,
        "dexEntries": dex_entries,
        "dexClassCount": len(classes),
        "components": results,
        "activityAliases": aliases,
        "missing": [result for result in results if not result["present"]],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--artifact", required=True, type=Path)
    parser.add_argument("--json", action="store_true", help="emit deterministic JSON")
    args = parser.parse_args()
    try:
        result = verify(args.artifact, args.manifest)
    except (OSError, ValueError, ET.ParseError, zipfile.BadZipFile) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(f"Artifact SHA256: {result['artifactSha256']}")
        print(f"Version: {result['versionName']} (code {result['versionCode']})")
        for component in result["components"]:
            status = "OK" if component["present"] else "MISSING"
            print(f"{status:7} {component['kind']:21} {component['resolved_name']}")
        print(f"Checked {len(result['components'])} component targets across "
              f"{len(result['dexEntries'])} DEX file(s); missing={len(result['missing'])}")
    return 1 if result["missing"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
