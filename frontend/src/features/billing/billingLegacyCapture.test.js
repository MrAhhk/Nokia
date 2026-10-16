/** @jest-environment node */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Execute the shipped IIFE, not a reimplementation or extracted helper.
const script = fs.readFileSync(path.join(__dirname, '../../..', 'public/billing-legacy-capture.js'), 'utf8');
const onboardingKey = 'nokia-launcher.onboarding';
const checkInKey = 'nokia-launcher.week-check-in.v1';
function execute(values = {}, options = {}) {
  const getItem = jest.fn(key => {
    if (options.readError === key) throw new Error('denied');
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
  });
  const storage = { getItem, setItem: jest.fn(), removeItem: jest.fn(), clear: jest.fn(), key: jest.fn() };
  const storageGetter = jest.fn(() => {
    if (options.storageError) throw new Error('denied');
    return storage;
  });
  const window = { location: { pathname: options.pathname || '/', search: options.search || '' } };
  Object.defineProperty(window, 'localStorage', { get: storageGetter });
  if (options.existing) Object.defineProperty(window, '__nokiaBillingLegacyCapture', options.existing);
  const fetch = jest.fn(() => { throw new Error('network forbidden'); });
  const nativeCall = jest.fn(() => { throw new Error('native forbidden'); });
  Object.defineProperty(window, 'Capacitor', { get: nativeCall });
  Object.defineProperty(window, 'NokiaIMEBridge', { get: nativeCall });
  const context = vm.createContext({ window, URLSearchParams, fetch });
  const run = () => vm.runInContext(script, context, { timeout: 1000 });
  run();
  return { window, result: window.__nokiaBillingLegacyCapture, storage, storageGetter, fetch, nativeCall, run };
}
const onboard = value => execute({ [onboardingKey]: value }).result.onboarding;
const checkIn = value => execute({ [checkInKey]: value }).result.checkIn;

test.each(['?view=keyboard', '?view=%6beyboard', '?view=launcher&view=keyboard', '?view=other'])('route %s never accesses storage', search => {
  const run = execute({}, { search });
  expect(run.storageGetter).not.toHaveBeenCalled();
  expect(run.result).toBeUndefined();
});
test.each(['/privacy', '/terms', '/about', '/index.html', '/unknown'])('%s is outside the launcher capture path', pathname => {
  expect(execute({}, { pathname }).storageGetter).not.toHaveBeenCalled();
});
test('reads exactly the two allowlisted keys; no storage writes, enumeration, network, native work or raw data', () => {
  const run = execute({ [onboardingKey]: '{"completed":false,"index":4}', [checkInKey]: '{"startedAt":12345,"shown":false}', unrelated: 'private' });
  expect(run.storage.getItem.mock.calls).toEqual([[onboardingKey], [checkInKey]]);
  for (const method of ['setItem', 'removeItem', 'clear', 'key']) expect(run.storage[method]).not.toHaveBeenCalled();
  expect(run.fetch).not.toHaveBeenCalled();
  expect(run.nativeCall).not.toHaveBeenCalled();
  expect(run.result).toEqual({ version: 1, coverage: 'unknown', readStatus: 'complete', onboarding: { classification: 'historical_valid', completed: false }, checkIn: { classification: 'historical_valid', shown: false } });
  expect(JSON.stringify(run.result)).not.toMatch(/12345|startedAt|index|stepId|private|eligible|fresh/);
});
test.each([true, false])('historical onboarding accepts completed=%s and every released index', completed => {
  for (let index = 0; index <= 4; index++) expect(onboard(JSON.stringify({ completed, index }))).toEqual({ classification: 'historical_valid', completed });
});
test.each([true, false])('current writer accepts completed=%s and exact matching stable IDs', completed => {
  ['welcome', 'dumb-mode', 'navigation', 'setup'].forEach((stepId, index) => {
    expect(onboard(JSON.stringify({ completed, index, schema: 2, stepId }))).toEqual({ classification: 'current_valid', completed });
  });
});
test.each([true, false])('check-in accepts shown=%s independent of age', shown => {
  for (const startedAt of [0, 1, 1e100]) expect(checkIn(JSON.stringify({ startedAt, shown }))).toEqual({ classification: 'historical_valid', shown });
});
test('missing never asserts a fresh install or known coverage', () => {
  expect(execute().result).toEqual({ version: 1, coverage: 'unknown', readStatus: 'complete', onboarding: { classification: 'missing' }, checkIn: { classification: 'missing' } });
});
test.each([
  '{"completed":false,"index":0,"extra":true}', '{"completed":"false","index":0}',
  '{"completed":false,"index":5}', '{"completed":false,"index":-1}', '{"completed":false,"index":0.5}',
  '{"schema":3,"completed":false,"index":0,"stepId":"welcome"}',
  '{"schema":2,"completed":false,"index":0,"stepId":"setup"}',
  '{"completed":false,"index":{"nested":{"deeper":1}}}', '[]', 'null',
])('unsupported onboarding shape: %s', raw => expect(onboard(raw).classification).toBe('unsupported'));
test.each(['{"startedAt":-1,"shown":false}', '{"startedAt":1e999,"shown":false}', '{"startedAt":"0","shown":false}', '{"startedAt":0,"shown":0}', '{"startedAt":0,"shown":false,"x":1}'])('unsupported check-in: %s', raw => expect(checkIn(raw).classification).toBe('unsupported'));
test.each([
  '', '{', '{"completed":false,"index":0,}', '{"completed":false,"index":0} trailing',
  '{"completed":false,"completed":true,"index":0}',
  '{"completed":false,"\\u0063ompleted":true,"index":0}',
  '{"completed":false,"index":00}', '{"completed":false,"index":NaN}',
  '{"completed":false,"index":0,"bad":"\\q"}',
])('malformed or duplicate input: %s', raw => expect(onboard(raw).classification).toBe('malformed'));
test('escaped legitimate fields work while duplicate Unicode check-in fields fail closed', () => {
  expect(onboard('{"\\u0063ompleted":false,"index":4}').classification).toBe('historical_valid');
  expect(checkIn('{"shown":false,"\\u0073hown":true,"startedAt":0}').classification).toBe('malformed');
});
test('bounds UTF-16 and UTF-8 bytes before parsing including surrogate pairs', () => {
  const valid = '{"completed":false,"index":0}';
  expect(onboard(valid.padEnd(2048)).classification).toBe('historical_valid');
  expect(onboard(valid.padEnd(2049)).classification).toBe('oversized');
  expect(onboard('{"x":"' + 'é'.repeat(1024) + '"}').classification).toBe('oversized');
  expect(onboard('{"x":"' + '😀'.repeat(512) + '"}').classification).toBe('oversized');
});
test('storage and per-key exceptions preserve unreadable rather than empty', () => {
  const denied = execute({}, { storageError: true });
  expect(denied.result.readStatus).toBe('unreadable');
  expect(denied.result.onboarding.classification).toBe('unreadable');
  const partial = execute({}, { readError: onboardingKey });
  expect(partial.storage.getItem).toHaveBeenCalledTimes(2);
  expect(partial.result.checkIn.classification).toBe('missing');
  expect(partial.result.readStatus).toBe('unreadable');
});
test('immutable readonly global survives reexecution without rescanning', () => {
  const run = execute();
  expect(Object.isFrozen(run.result)).toBe(true);
  expect(Object.isFrozen(run.result.onboarding)).toBe(true);
  expect(Object.isFrozen(run.result.checkIn)).toBe(true);
  expect(Object.getOwnPropertyDescriptor(run.window, '__nokiaBillingLegacyCapture')).toMatchObject({ writable: false, configurable: false });
  const original = run.result;
  run.run();
  expect(run.window.__nokiaBillingLegacyCapture).toBe(original);
  expect(run.storage.getItem).toHaveBeenCalledTimes(2);
  expect(run.storageGetter).toHaveBeenCalledTimes(1);
});
test('preexisting malformed globals or accessors are never evaluated as verified capture or rescanned', () => {
  const getter = jest.fn(() => { throw new Error('collision'); });
  const run = execute({}, { existing: { value: { eligible: true }, configurable: true } });
  expect(run.storageGetter).not.toHaveBeenCalled();
  // Avoid reading the accessor in the harness: directly execute the shipped script.
  const window = { location: { search: '', pathname: '/' } };
  Object.defineProperty(window, '__nokiaBillingLegacyCapture', { get: getter });
  Object.defineProperty(window, 'localStorage', { get: run.storageGetter });
  expect(() => vm.runInNewContext(script, { window, URLSearchParams })).not.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(run.storageGetter).not.toHaveBeenCalled();
});
