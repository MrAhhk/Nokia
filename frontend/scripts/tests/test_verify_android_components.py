import importlib.util
import struct
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "verify_android_components.py"
SPEC = importlib.util.spec_from_file_location("verify_android_components", SCRIPT)
verifier = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
sys.modules[SPEC.name] = verifier
SPEC.loader.exec_module(verifier)


def minimal_dex(class_names):
    descriptors = [f"L{name.replace('.', '/')};" for name in class_names]
    header_size = 0x70
    string_ids_off = header_size
    type_ids_off = string_ids_off + 4 * len(descriptors)
    class_defs_off = type_ids_off + 4 * len(descriptors)
    strings_off = class_defs_off + 32 * len(descriptors)
    strings = bytearray()
    string_offsets = []
    for descriptor in descriptors:
        string_offsets.append(strings_off + len(strings))
        encoded = descriptor.encode("utf-8")
        strings.extend(bytes([len(descriptor)]))
        strings.extend(encoded + b"\0")
    data = bytearray(strings_off)
    data[:8] = b"dex\n035\0"
    struct.pack_into("<I", data, 0x20, strings_off + len(strings))
    struct.pack_into("<II", data, 0x38, len(descriptors), string_ids_off)
    struct.pack_into("<II", data, 0x40, len(descriptors), type_ids_off)
    struct.pack_into("<II", data, 0x60, len(descriptors), class_defs_off)
    for index, offset in enumerate(string_offsets):
        struct.pack_into("<I", data, string_ids_off + index * 4, offset)
        struct.pack_into("<I", data, type_ids_off + index * 4, index)
        struct.pack_into("<I", data, class_defs_off + index * 32, index)
    data.extend(strings)
    return bytes(data)


def proto_field(number, data):
    def varint(value):
        result = bytearray()
        while value > 127:
            result.append((value & 127) | 128)
            value >>= 7
        return bytes(result + bytes([value]))
    return varint(number * 8 + 2) + varint(len(data)) + data


def proto_element(name, attributes=(), children=()):
    element = proto_field(3, name.encode())
    for namespace, key, value in attributes:
        attribute = proto_field(1, namespace.encode()) + proto_field(2, key.encode()) + proto_field(3, value.encode())
        element += proto_field(4, attribute)
    for child in children:
        element += proto_field(5, child)
    return proto_field(1, element)


class ComponentVerificationTest(unittest.TestCase):
    def test_embedded_aab_manifest_and_assets_do_not_satisfy_base_class(self):
        android = "http://schemas.android.com/apk/res/android"
        activity = proto_element("activity", [(android, "name", ".MainActivity")])
        manifest = proto_element("manifest", [("", "package", "example.app"),
            (android, "versionCode", "6"), (android, "versionName", "1.2.2")],
            [proto_element("application", children=[activity])])
        with tempfile.TemporaryDirectory() as folder:
            artifact = Path(folder) / "app.aab"
            for present in [False, True]:
                with zipfile.ZipFile(artifact, "w") as archive:
                    archive.writestr("base/manifest/AndroidManifest.xml", manifest)
                    archive.writestr("base/dex/classes.dex", minimal_dex(["example.app.MainActivity"] if present else ["example.Other"]))
                    archive.writestr("base/assets/unused.dex", minimal_dex(["example.app.MainActivity"]))
                result = verifier.verify(artifact)
                self.assertEqual("6", result["versionCode"])
                self.assertEqual(0 if present else 1, len(result["missing"]))
                self.assertEqual(["base/dex/classes.dex"], result["dexEntries"])

    def verify_fixture(self, manifest, classes):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            manifest_path = root / "AndroidManifest.xml"
            artifact_path = root / "fixture.apk"
            manifest_path.write_text(manifest, encoding="utf-8")
            with zipfile.ZipFile(artifact_path, "w") as archive:
                archive.writestr("classes.dex", minimal_dex(classes))
            return verifier.verify(artifact_path, manifest_path)

    def test_detects_package_mismatch_and_missing_component(self):
        result = self.verify_fixture(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
            'package="example.new"><application>'
            '<activity android:name=".MainActivity"/>'
            '<service android:name="example.new.MissingService"/>'
            '</application></manifest>',
            ["example.old.MainActivity"],
        )
        self.assertEqual(
            ["example.new.MainActivity", "example.new.MissingService"],
            [item["resolved_name"] for item in result["missing"]],
        )

    def test_alias_checks_target_without_treating_alias_as_class(self):
        result = self.verify_fixture(
            '<manifest xmlns:android="http://schemas.android.com/apk/res/android" '
            'package="example.app"><application>'
            '<activity android:name="MainActivity"/>'
            '<activity-alias android:name=".Launcher" android:targetActivity=".MainActivity"/>'
            '</application></manifest>',
            ["example.app.MainActivity"],
        )
        self.assertEqual([], result["missing"])
        self.assertEqual("example.app.Launcher", result["activityAliases"][0]["alias"])
        self.assertEqual(2, len(result["components"]))


if __name__ == "__main__":
    unittest.main()
