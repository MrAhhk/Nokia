// Inactive M05 consumer. The caller must establish pre-writer capture provenance
// and invoke the native seal before startup writers. Shape checks cannot
// authenticate a forged frozen value or detect every successful Proxy trap.
const CAPTURE_KEY = '__nokiaBillingLegacyCapture';
const INVALID_CLASSES = ['missing', 'unreadable', 'oversized', 'unsupported', 'malformed'];
const OBJECT_PROTOTYPE_KEYS = [
  'constructor', '__defineGetter__', '__defineSetter__', 'hasOwnProperty',
  '__lookupGetter__', '__lookupSetter__', 'isPrototypeOf', 'propertyIsEnumerable',
  'toString', 'valueOf', '__proto__', 'toLocaleString',
];

function plainPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  if (Object.getPrototypeOf(prototype) !== null) return false;
  // Accept another realm's actual Object.prototype, but no custom prototypes
  // or polluted inherited fields. Inspect descriptors; never read properties.
  const keys = Reflect.ownKeys(prototype);
  if (keys.length !== OBJECT_PROTOTYPE_KEYS.length ||
      keys.some(key => !OBJECT_PROTOTYPE_KEYS.includes(key))) return false;
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor');
  if (!constructor || typeof constructor.value !== 'function' ||
      Function.prototype.toString.call(constructor.value) !== 'function Object() { [native code] }') return false;
  const back = Object.getOwnPropertyDescriptor(constructor.value, 'prototype');
  if (!back || back.value !== prototype) return false;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (key === '__proto__') {
      if (typeof descriptor.get !== 'function' || typeof descriptor.set !== 'function' ||
          !Function.prototype.toString.call(descriptor.get).includes('[native code]') ||
          !Function.prototype.toString.call(descriptor.set).includes('[native code]')) return false;
    } else if (typeof descriptor.value !== 'function' ||
        !Function.prototype.toString.call(descriptor.value).includes('[native code]')) return false;
  }
  return true;
}

function inspected(value, allowed, required) {
  if (!value || typeof value !== 'object' || !plainPrototype(value) || !Object.isFrozen(value)) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length || keys.some(key => !allowed.includes(key)) ||
      required.some(key => !keys.includes(key))) return null;
  const copy = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.writable || descriptor.configurable || !descriptor.enumerable) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

function classification(value, onboarding) {
  const flag = onboarding ? 'completed' : 'shown';
  const fields = inspected(value, ['classification', flag], ['classification']);
  if (!fields) return null;
  const valid = fields.classification === 'historical_valid' ||
    (onboarding && fields.classification === 'current_valid');
  const hasFlag = Object.prototype.hasOwnProperty.call(fields, flag);
  if (valid ? (!hasFlag || typeof fields[flag] !== 'boolean') :
      (hasFlag || !INVALID_CLASSES.includes(fields.classification))) return null;
  const copy = Object.create(null);
  copy.classification = fields.classification;
  if (valid) copy[flag] = fields[flag];
  return copy;
}

/** Canonical bounded helper evidence for native seal, or null for recovery. */
export function serializeBillingLegacyEvidence(root) {
  try {
    if (!root || (typeof root !== 'object' && typeof root !== 'function')) return null;
    const descriptor = Object.getOwnPropertyDescriptor(root, CAPTURE_KEY);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        descriptor.writable || descriptor.configurable || descriptor.enumerable) return null;
    const fields = inspected(descriptor.value,
      ['version', 'coverage', 'readStatus', 'onboarding', 'checkIn'],
      ['version', 'coverage', 'readStatus', 'onboarding', 'checkIn']);
    if (!fields || fields.version !== 1 || fields.coverage !== 'unknown') return null;
    const onboarding = classification(fields.onboarding, true);
    const checkIn = classification(fields.checkIn, false);
    if (!onboarding || !checkIn) return null;
    const readStatus = onboarding.classification === 'unreadable' ||
      checkIn.classification === 'unreadable' ? 'unreadable' : 'complete';
    if (fields.readStatus !== readStatus) return null;
    const copy = Object.create(null);
    copy.version = 1;
    copy.coverage = 'unknown';
    copy.readStatus = readStatus;
    copy.onboarding = onboarding;
    copy.checkIn = checkIn;
    // Only inspected primitives and newly allocated null-prototype copies reach
    // stringify. No untrusted toJSON, getter, raw storage or rights flag does.
    const json = JSON.stringify(copy);
    // All allowlisted wire strings are ASCII; this matches the native byte cap.
    return json.length <= 1024 ? json : null;
  } catch (_) {
    // Reflective Proxy traps can throw. JS cannot identify all successful traps;
    // native authorization and the caller's provenance gate remain necessary.
    return null;
  }
}
