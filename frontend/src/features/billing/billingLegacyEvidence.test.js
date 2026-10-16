/** @jest-environment node */
import { serializeBillingLegacyEvidence } from './billingLegacyEvidence';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const helper = fs.readFileSync(path.join(__dirname, '../../../public/billing-legacy-capture.js'), 'utf8');
const key = '__nokiaBillingLegacyCapture';
const frozen = value => Object.freeze(value);
const entry = classification => frozen({ classification });
const capture = (overrides = {}) => frozen({ version: 1, coverage: 'unknown', readStatus: 'complete',
  onboarding: entry('missing'), checkIn: entry('missing'), ...overrides });
function root(value, attributes = {}) {
  return Object.defineProperty({}, key, { value, ...attributes });
}
function actual(values = {}, deny = false) {
  const storage = { getItem: jest.fn(name => {
    if (deny) throw new Error('denied');
    return values[name] ?? null;
  }) };
  const window = { location: { pathname: '/', search: '' }, localStorage: storage };
  vm.runInNewContext(helper, { window, URLSearchParams }, { timeout: 1000 });
  return { window, storage };
}

test.each([
  [{}, 'complete', 'missing', 'missing'],
  [{ 'nokia-launcher.onboarding': '{"completed":false,"index":4}',
    'nokia-launcher.week-check-in.v1': '{"shown":true,"startedAt":12}' }, 'complete', 'historical_valid', 'historical_valid'],
  [{ 'nokia-launcher.onboarding': '{"completed":true,"index":0,"schema":2,"stepId":"welcome"}' }, 'complete', 'current_valid', 'missing'],
  [{ 'nokia-launcher.onboarding': 'a'.repeat(2049) }, 'complete', 'oversized', 'missing'],
  [{ 'nokia-launcher.onboarding': '{' }, 'complete', 'malformed', 'missing'],
  [{ 'nokia-launcher.onboarding': '[]' }, 'complete', 'unsupported', 'missing'],
])('serializes the actual cross-realm helper result %# without another storage read', (values, status, onboarding, checkIn) => {
  const run = actual(values);
  const json = serializeBillingLegacyEvidence(run.window);
  expect(JSON.parse(json)).toMatchObject({ version: 1, coverage: 'unknown', readStatus: status,
    onboarding: { classification: onboarding }, checkIn: { classification: checkIn } });
  expect(json.length).toBeLessThan(1024);
  expect(json).not.toMatch(/startedAt|schema|index|stepId/);
  expect(run.storage.getItem).toHaveBeenCalledTimes(2);
  expect(serializeBillingLegacyEvidence(run.window)).toBe(json);
  expect(run.storage.getItem).toHaveBeenCalledTimes(2);
});

test('unreadable actual helper result is retained for recovery', () => {
  expect(JSON.parse(serializeBillingLegacyEvidence(actual({}, true).window))).toEqual({
    version: 1, coverage: 'unknown', readStatus: 'unreadable',
    onboarding: { classification: 'unreadable' }, checkIn: { classification: 'unreadable' },
  });
});

test.each([null, undefined, {}, root(capture(), { writable: true }),
  root(capture(), { configurable: true }), root(capture(), { enumerable: true }),
  root({ ...capture() }), root(capture({ version: 2 })), root(capture({ coverage: 'known' })),
  root(capture({ onboarding: { classification: 'missing' } })),
  root(capture({ readStatus: 'unreadable' })), root(capture({ onboarding: entry('unreadable') })),
  root(capture({ onboarding: frozen({ classification: 'current_valid' }) })),
  root(capture({ checkIn: frozen({ classification: 'current_valid', shown: true }) })),
  root(capture({ onboarding: frozen({ classification: 'missing', completed: false }) })),
  root(capture({ onboarding: frozen({ classification: 'historical_valid', completed: 'true' }) })),
  root(capture({ checkIn: frozen({ classification: 'historical_valid', completed: true }) })),
  root(capture({ full: true })), root(capture({ [Symbol('rights')]: true })),
  root(capture({ coverage: 'a'.repeat(100000) })), root(capture({ checkIn: new Date() })),
  root(frozen({ version: 1 })), root(capture({ onboarding: frozen(Object.create({ classification: 'missing' })) })),
])('rejects malformed, mutable, extra or role-invalid input %#', value => {
  expect(serializeBillingLegacyEvidence(value)).toBeNull();
});

test('canonical ordering and null prototypes are accepted', () => {
  const value = Object.assign(Object.create(null), { checkIn: entry('missing'), onboarding: entry('missing'),
    readStatus: 'complete', coverage: 'unknown', version: 1 });
  expect(serializeBillingLegacyEvidence(root(frozen(value)))).toBe(
    '{"version":1,"coverage":"unknown","readStatus":"complete","onboarding":{"classification":"missing"},"checkIn":{"classification":"missing"}}');
});

test.each([true, false])('retains only the appropriate validity booleans (%s)', flag => {
  const run = actual({ 'nokia-launcher.onboarding': JSON.stringify({ completed: flag, index: 4 }),
    'nokia-launcher.week-check-in.v1': JSON.stringify({ shown: flag, startedAt: 123 }) });
  expect(JSON.parse(serializeBillingLegacyEvidence(run.window))).toEqual({
    version: 1, coverage: 'unknown', readStatus: 'complete',
    onboarding: { classification: 'historical_valid', completed: flag },
    checkIn: { classification: 'historical_valid', shown: flag },
  });
});

test('root and nested accessors and own toJSON never execute', () => {
  const getter = jest.fn(() => { throw new Error('getter invoked'); });
  const toJSON = jest.fn(() => { throw new Error('toJSON invoked'); });
  const accessorRoot = Object.defineProperty({}, key, { get: getter });
  const accessorCapture = frozen(Object.defineProperty({ ...capture() }, 'coverage', { get: getter }));
  const accessorEntry = frozen(Object.defineProperty({}, 'classification', { get: getter, enumerable: true }));
  for (const value of [accessorRoot, root(accessorCapture), root(capture({ onboarding: accessorEntry })),
    root(capture({ toJSON })), root(capture({ onboarding: frozen({ classification: 'missing', toJSON }) }))]) {
    expect(serializeBillingLegacyEvidence(value)).toBeNull();
  }
  expect(getter).not.toHaveBeenCalled();
  expect(toJSON).not.toHaveBeenCalled();
});

test('foreign and polluted cross-realm prototypes are rejected without inherited getter execution', () => {
  const context = vm.createContext({});
  const value = vm.runInContext('Object.freeze({version:1,coverage:"unknown",readStatus:"complete",onboarding:Object.freeze({classification:"missing"}),checkIn:Object.freeze({classification:"missing"})})', context);
  expect(serializeBillingLegacyEvidence(root(value))).not.toBeNull();
  vm.runInContext('Object.defineProperty(Object.prototype,"full",{get(){throw new Error("must not execute")}})', context);
  expect(serializeBillingLegacyEvidence(root(value))).toBeNull();
  expect(serializeBillingLegacyEvidence(root(frozen(Object.assign(Object.create({ full: true }), capture()))))).toBeNull();
});

test('throwing Proxy reflection recovers; property get traps are never used', () => {
  const get = jest.fn(() => { throw new Error('property read'); });
  const proxy = new Proxy(capture(), { get });
  expect(serializeBillingLegacyEvidence(root(proxy))).not.toBeNull();
  expect(get).not.toHaveBeenCalled();
  for (const trap of ['getOwnPropertyDescriptor', 'getPrototypeOf', 'ownKeys', 'isExtensible']) {
    const value = new Proxy(capture(), { [trap]() { throw new Error('reflection failed'); } });
    expect(serializeBillingLegacyEvidence(root(value))).toBeNull();
  }
  expect(serializeBillingLegacyEvidence(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('failed'); } }))).toBeNull();
});

test('consumer never touches storage, location, network or native getters', () => {
  const window = root(capture());
  const getter = jest.fn(() => { throw new Error('forbidden'); });
  for (const name of ['localStorage', 'location', 'fetch', 'Capacitor', 'NokiaIMEBridge']) {
    Object.defineProperty(window, name, { get: getter });
  }
  expect(serializeBillingLegacyEvidence(window)).not.toBeNull();
  expect(getter).not.toHaveBeenCalled();
});
