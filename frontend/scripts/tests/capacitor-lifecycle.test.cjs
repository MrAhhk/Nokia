const test = require('node:test');
const assert = require('node:assert/strict');
const { patchBridgeActivity } = require('../patch-capacitor-lifecycle.cjs');

const original = [
  '        super.onSaveInstanceState(outState);',
  '        bridge.saveInstanceState(outState);',
  '        super.onRestart();',
  '        this.bridge.onRestart();',
  '        super.onDetachedFromWindow();',
  '        this.bridge.onDetachedFromWindow();',
].join('\n');

test('guards all three null-bridge paths without skipping Android lifecycle', () => {
  const patched = patchBridgeActivity(original, '6.2.1');
  assert.equal((patched.match(/if \(bridge != null\)/g) || []).length, 3);
  for (const method of ['onSaveInstanceState(outState)', 'onRestart()', 'onDetachedFromWindow()']) {
    assert.ok(patched.includes(`super.${method};\n        if (bridge != null)`));
  }
});

test('repeated install/build is idempotent', () => {
  const once = patchBridgeActivity(original, '6.2.1');
  assert.equal(patchBridgeActivity(once, '6.2.1'), once);
});

test('preserves Windows line endings', () => {
  const patched = patchBridgeActivity(original.replaceAll('\n', '\r\n'), '6.2.1');
  assert.ok(!patched.replaceAll('\r\n', '').includes('\n'));
  assert.equal(patchBridgeActivity(patched, '6.2.1'), patched);
});

test('refuses unreviewed dependency upgrades', () => {
  assert.throws(() => patchBridgeActivity(original, '7.0.0'), /Review/);
});

test('refuses changed or duplicated callback source before writing', () => {
  assert.throws(() => patchBridgeActivity(original.replace('this.bridge.onRestart();', ''), '6.2.1'), /source changed/);
  assert.throws(() => patchBridgeActivity(`${original}\n        this.bridge.onRestart();`, '6.2.1'), /source changed/);
});
