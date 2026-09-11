#!/usr/bin/env node
// Read-only local ownership lookup and lightweight architecture checks. No dependencies.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "docs/architecture/modules.json"), "utf8"));

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(js|jsx)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name) ? [file] : [];
  });
}

function check() {
  const errors = [];
  const ids = new Set();
  for (const mod of registry.modules) {
    if (ids.has(mod.id)) errors.push(`Duplicate module: ${mod.id}`);
    ids.add(mod.id);
    if (!mod.trace || !mod.files.length || !mod.tests.length) errors.push(`Incomplete module: ${mod.id}`);
    for (const file of [...mod.files, ...mod.tests]) {
      if (!fs.existsSync(path.join(root, file))) errors.push(`${mod.id}: missing ${file}`);
    }
  }
  for (const file of registry.pureRules) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) { errors.push(`Missing pure rule: ${file}`); continue; }
    const source = fs.readFileSync(target, "utf8");
    if (/\b(?:window|document|localStorage|sessionStorage)\s*[.\[]/.test(source)
        || /(?:from\s*|require\s*\(\s*)["'](?:react|react-dom|@capacitor\/|@\/components\/|.*lib\/launcherApps)/.test(source)) {
      errors.push(`${file}: pure rules must not depend on browser/UI/native infrastructure`);
    }
  }
  for (const [file, reason] of Object.entries(registry.nativeAccessOwners)) {
    if (!reason || !fs.existsSync(path.join(root, file))) errors.push(`Stale native access exception: ${file}`);
  }
  for (const absolute of sourceFiles(path.join(root, "src"))) {
    const file = path.relative(root, absolute).split(path.sep).join("/");
    const source = fs.readFileSync(absolute, "utf8");
    if (/\b(?:window\.)?(?:Capacitor|NokiaIMEBridge)\b|["']@capacitor\//.test(source)
        && !Object.hasOwn(registry.nativeAccessOwners, file)) {
      errors.push(`${file}: unregistered native access; extend the existing adapter`);
    }
  }
  if (errors.length) {
    process.stderr.write(errors.map((error) => `- ${error}`).join("\n") + "\n");
    process.exitCode = 1;
  } else {
    console.log(`Architecture check passed: ${ids.size} module entries, existing paths, pure-rule and native-access checks.`);
  }
}

if (process.argv.includes("--check")) {
  check();
} else {
  const query = process.argv.slice(2).join(" ").trim().toLowerCase();
  const terms = query.split(/\s+/).filter(Boolean);
  const matches = registry.modules.filter((mod) => {
    const haystack = [mod.id, ...mod.aliases, ...mod.files].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  if (!matches.length) {
    console.log(`No module matches '${query}'. Try: ${registry.modules.map((mod) => mod.id).join(", ")}`);
    process.exitCode = 1;
  }
  for (const mod of matches) {
    console.log(`\n${mod.id}\nTrace: ${mod.trace}\nOwners:`);
    for (const file of mod.files) console.log(`  ${path.join(root, file)}`);
    console.log("Tests:");
    for (const file of mod.tests) console.log(`  ${path.join(root, file)}`);
  }
}
