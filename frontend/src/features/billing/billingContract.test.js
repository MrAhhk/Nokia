import fixture from './__fixtures__/billing-v1.json';
import { validateBillingView, selectBillingUi, validateBillingPurchaseInput, validateBillingRefreshReason, validateBillingRecoveryInput } from './billingContract';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fresh = () => JSON.parse(JSON.stringify(fixture));
const set = (v, path, value) => { const keys = path.split('.'); const key = keys.pop(); keys.reduce((o, k) => o[k], v)[key] = value; return v; };

test('synthetic catalog can offer checkout before rights are remotely verified', () => {
  expect(validateBillingView(fixture).ok).toBe(true);
  expect(selectBillingUi(fixture)).toMatchObject({ surface: 'billing', checkout: true });
});
test('unavailable catalog entry can omit its price; available entry cannot', () => {
  const v = fresh(); v.catalog[0] = { ...v.catalog[0], available: false, priceText: '' };
  expect(validateBillingView(v).ok).toBe(true);
  v.catalog[0].available = true; expect(validateBillingView(v).ok).toBe(false);
  v.catalog[0].priceText = ' '; expect(validateBillingView(v).ok).toBe(false);
});
test('wrong schema and partial data cannot become paid access', () => {
  expect(validateBillingView({ schema: 99, access: { full: true } }).ok).toBe(false);
  expect(validateBillingView({ schema: 1 }).ok).toBe(false);
});
const requiredPaths = [];
function collect(value, prefix = '') {
  Object.entries(value).forEach(([key, item]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    requiredPaths.push(path);
    if (item && typeof item === 'object' && !Array.isArray(item)) collect(item, path);
  });
}
collect(fixture);
test.each(requiredPaths)('rejects missing required field %s', path => {
  const v = fresh(); const keys = path.split('.'); const key = keys.pop(); delete keys.reduce((o, k) => o[k], v)[key];
  expect(validateBillingView(v).ok).toBe(false);
});
test.each([
  ['schema', 2], ['controllerEpoch', ''], ['controllerEpoch', 'x'.repeat(129)], ['sequence', -1], ['sequence', 1.5], ['sequence', Number.MAX_SAFE_INTEGER + 1],
  ['legacy.status', 'unknown'], ['legacy.persisted', 1], ['access.full', 'true'], ['access.sources', ['subscription', 'subscription']], ['access.sources', ['receipt']],
  ['capabilities.nativeRecovery', false], ['capabilities.existingFriendRecovery', false], ['capabilities.restore', null],
  ['operation.state', 'failed'], ['operation.id', ''], ['unresolvedPurchase', { id: 'x', plan: 'monthly', stage: 'failed' }],
  ['store.verification', 'VERIFIED'], ['store.fetchedAtMs', 12], ['store.expiresAtMs', -1], ['store.pausedUntilMs', Infinity], ['store.renewState', 'canceled'], ['store.plan', 'annual'], ['issue', 'failure'],
  ['catalog', [{ ...fixture.catalog[0], key: 'premium' }]], ['catalog', [{ ...fixture.catalog[0], priceText: '' }]], ['catalog', [{ ...fixture.catalog[0], available: 'yes' }]], ['catalog', [{ ...fixture.catalog[0], catalogRevision: '' }]], ['catalog', [fixture.catalog[0], fixture.catalog[0]]],
])('rejects invalid %s', (path, value) => expect(validateBillingView(set(fresh(), path, value)).ok).toBe(false));
test('rejects unknown/private fields, getters and exotic objects', () => {
  const v = fresh(); v.store.receipt = 'private'; expect(validateBillingView(v).ok).toBe(false);
  const getter = fresh(); Object.defineProperty(getter, 'sequence', { get() { throw new Error('not JSON'); } });
  expect(validateBillingView(getter).ok).toBe(false);
  const exotic = fresh(); Object.setPrototypeOf(exotic, { extra: true }); expect(validateBillingView(exotic).ok).toBe(false);
});
test('returns a detached deeply immutable snapshot', () => {
  const input = fresh(); const result = validateBillingView(input).value;
  input.catalog[0].title = 'changed'; input.access.sources.push('subscription');
  expect(result.catalog[0].title).toBe(fixture.catalog[0].title);
  expect(result.access.sources).toEqual([]);
  expect(Object.isFrozen(result.catalog[0])).toBe(true);
  expect(Object.isFrozen(result.store)).toBe(true);
  expect(Object.isFrozen(result.access.sources)).toBe(true);
});
test('native full access is used without JS wall-clock or renewal calculations', () => {
  const v = fresh(); v.access = { full: true, sources: ['subscription', 'legacyDevice'] };
  v.store = { ...v.store, subscriptionActive: true, expiresAtMs: 1, renewState: 'off' };
  expect(selectBillingUi(v).surface).toBe('launcher');
  v.access = { full: true, sources: [] }; expect(validateBillingView(v).ok).toBe(false);
});
test.each(['checking', 'checkout', 'restoring'])('interactive %s does not permit another checkout', state => {
  const v = fresh(); v.operation = { id: 'op-1', state, plan: state === 'checkout' ? 'monthly' : null };
  expect(validateBillingView(v).ok).toBe(false); v.capabilities.checkout = false;
  expect(validateBillingView(v).ok).toBe(true);
});
test.each(['prepared', 'pending', 'uncertain'])('unresolved %s keeps restore and recovery available without new checkout', stage => {
  const v = fresh(); v.unresolvedPurchase = { id: 'journal-1', plan: 'lifetime', stage };
  expect(validateBillingView(v).ok).toBe(false); v.capabilities.checkout = false;
  expect(selectBillingUi(v)).toMatchObject({ checkout: false, restore: true, nativeRecovery: true });
});
test('remote provenance requires a timestamp; device snapshots cannot claim one', () => {
  const v = fresh(); v.store.verification = 'remote'; expect(validateBillingView(v).ok).toBe(false);
  v.store.fetchedAtMs = 0; expect(validateBillingView(v).ok).toBe(true);
  v.store.verification = 'device'; expect(validateBillingView(v).ok).toBe(false);
  v.store.fetchedAtMs = null; expect(validateBillingView(v).ok).toBe(true);
});
test('malformed DTO selects safe recovery, never checkout', () => expect(selectBillingUi(null)).toEqual({ surface: 'recovery', checkout: false, restore: false, manage: false, existingFriendRecovery: true, nativeRecovery: true }));
test('public command inputs reject arbitrary products and actions', () => {
  const purchase = { plan: 'lifetime', catalogRevision: 'rev-1', acceptedImmediateCharge: true };
  expect(validateBillingPurchaseInput(purchase).ok).toBe(true);
  expect(validateBillingPurchaseInput({ ...purchase, product: 'other' }).ok).toBe(false);
  expect(validateBillingPurchaseInput({ ...purchase, acceptedImmediateCharge: 'yes' }).ok).toBe(false);
  expect(validateBillingRefreshReason('manage-return').ok).toBe(true);
  expect(validateBillingRefreshReason('focus').ok).toBe(false);
  expect(validateBillingRecoveryInput({ action: 'dialer' }).ok).toBe(true);
  expect(validateBillingRecoveryInput({ action: 'https://example.test' }).ok).toBe(false);
});
test('actual native policy toMap output satisfies the JS contract', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'nokia-billing-wire-'));
  const root = path.resolve(__dirname, '../../..');
  const source = path.join(root, 'android/app/src');
  try {
    const compile = spawnSync('javac', ['-d', temp,
      path.join(source, 'main/java/com/nokialauncher/billing/BillingSnapshot.java'),
      path.join(source, 'main/java/com/nokialauncher/billing/BillingPolicy.java'),
      path.join(source, 'test/java/com/nokialauncher/billing/BillingWireFixture.java')], { encoding: 'utf8', timeout: 15000 });
    expect(compile.error).toBeUndefined(); expect(compile.stderr).toBe(''); expect(compile.status).toBe(0);
    const run = spawnSync('java', ['-cp', temp, 'com.nokialauncher.billing.BillingWireFixture'], { encoding: 'utf8', timeout: 10000 });
    expect(run.error).toBeUndefined(); expect(run.status).toBe(0);
    const views = JSON.parse(run.stdout);
    views.forEach(view => expect(validateBillingView(view).ok).toBe(true));
    expect(selectBillingUi(views[0]).surface).toBe('launcher');
    expect(selectBillingUi(views[1])).toMatchObject({ surface: 'launcher', checkout: false, restore: true });
  } finally {
    const resolvedTemp = path.resolve(temp);
    const relativeTemp = path.relative(path.resolve(os.tmpdir()), resolvedTemp);
    if (!relativeTemp || relativeTemp.startsWith('..') || path.isAbsolute(relativeTemp)) {
      throw new Error('Refusing cleanup outside test temporary directory');
    }
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }
}, 30000);
