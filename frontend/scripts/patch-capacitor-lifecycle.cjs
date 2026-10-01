/* Capacitor 6.2.1 leaves bridge null when Android cannot create a WebView.
 * Keep the upstream Android lifecycle calls, and guard only bridge callbacks.
 * Applied on install and before production builds; no dependency upgrade.
 */
const fs = require('node:fs');
const path = require('node:path');

const guardedCalls = [
  'bridge.saveInstanceState(outState);',
  'this.bridge.onRestart();',
  'this.bridge.onDetachedFromWindow();',
];

function patchBridgeActivity(source, version) {
  if (version !== '6.2.1') {
    throw new Error(`Review the WebView lifecycle patch for Capacitor Android ${version}; expected 6.2.1.`);
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let patched = source;
  for (const call of guardedCalls) {
    const before = `        ${call}`;
    const after = [
      '        if (bridge != null) {',
      `            ${call}`,
      '        }',
    ].join(newline);
    if (patched.includes(after)) continue;
    // Fail before writing if upstream changes: never silently ship an unpatched build.
    if (patched.split(before).length !== 2) {
      throw new Error(`Capacitor lifecycle source changed near ${call}; review the patch.`);
    }
    patched = patched.replace(before, after);
  }
  return patched;
}

function applyPatch() {
  const packageRoot = path.resolve(__dirname, '../node_modules/@capacitor/android');
  const { version } = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const file = path.join(packageRoot, 'capacitor/src/main/java/com/getcapacitor/BridgeActivity.java');
  const source = fs.readFileSync(file, 'utf8');
  const patched = patchBridgeActivity(source, version);
  if (source !== patched) fs.writeFileSync(file, patched);
  console.log(`Capacitor Android ${version}: WebView fallback lifecycle guards verified.`);
}

if (require.main === module) applyPatch();
module.exports = { patchBridgeActivity };
