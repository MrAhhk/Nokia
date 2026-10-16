// Bridge validation only. Native BillingPolicy owns rights, clocks and payment eligibility.
const plans = ['monthly', 'yearly', 'lifetime'];
const fail = (path) => { throw new Error(`Invalid billing field: ${path}`); };
const bool = (v, p) => typeof v === 'boolean' ? v : fail(p);
const literal = (expected) => (v, p) => v === expected ? v : fail(p);
const enumOf = (values) => (v, p) => values.includes(v) ? v : fail(p);
const text = (max) => (v, p) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v) ? v : fail(p);
const integer = (v, p) => Number.isSafeInteger(v) && v >= 0 ? v : fail(p);
const nullable = (rule) => (v, p) => v === null ? null : rule(v, p);
const array = (rule, max) => (v, p) => {
  if (!Array.isArray(v) || v.length > max) return fail(p);
  return Object.freeze(Array.from(v, (item, i) => rule(item, `${p}[${i}]`)));
};
const object = (shape) => (v, p) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))) return fail(p);
  const keys = Reflect.ownKeys(v);
  if (keys.length !== Object.keys(shape).length || keys.some(k => !Object.prototype.hasOwnProperty.call(shape, k))) return fail(p);
  const result = {};
  for (const [key, rule] of Object.entries(shape)) {
    const descriptor = Object.getOwnPropertyDescriptor(v, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return fail(`${p}.${key}`);
    result[key] = rule(descriptor.value, `${p}.${key}`);
  }
  return Object.freeze(result);
};
const plan = enumOf(plans);
const operationStates = ['idle', 'checking', 'checkout', 'restoring', 'completed', 'canceled'];
const activeStates = ['checking', 'checkout', 'restoring'];
const id = text(128);
const catalogEntry = object({ key: plan, title: text(160), priceText: (v, p) => v === '' ? v : text(128)(v, p), periodText: (v, p) => v === '' ? v : text(128)(v, p), available: bool, catalogRevision: id });
const viewRule = object({
  schema: literal(1), controllerEpoch: id, sequence: integer,
  legacy: object({ status: enumOf(['eligible', 'ineligible', 'needs_recovery']), persisted: bool }),
  access: object({ full: bool, sources: array(enumOf(['legacyDevice', 'storeLifetime', 'subscription']), 3) }),
  capabilities: object({ checkout: bool, restore: bool, manage: bool, existingFriendRecovery: literal(true), nativeRecovery: literal(true) }),
  operation: object({ id: nullable(id), state: enumOf(operationStates), plan: nullable(plan) }),
  unresolvedPurchase: nullable(object({ id, plan, stage: enumOf(['prepared', 'pending', 'uncertain']) })),
  store: object({ verification: enumOf(['remote', 'device', 'unverified']), fetchedAtMs: nullable(integer), lifetimeActive: bool, subscriptionActive: bool, expiresAtMs: nullable(integer), renewState: enumOf(['on', 'off', 'unknown']), plan: nullable(plan), billingProblem: bool, pausedUntilMs: nullable(integer) }),
  issue: enumOf(['none', 'offline', 'provider', 'storage', 'verification', 'pending', 'uncertain', 'unknown_subscription', 'product_unavailable']),
  catalog: array(catalogEntry, 3),
});
const validate = (rule, value, coherence = () => {}) => {
  try {
    const result = rule(value, 'billing');
    coherence(result);
    return { ok: true, value: result };
  } catch (_) { return { ok: false, reason: 'Invalid billing contract' }; }
};
export function validateBillingView(value) {
  return validate(viewRule, value, v => {
    const unique = a => new Set(a).size === a.length;
    if (!unique(v.access.sources) || !unique(v.catalog.map(c => c.key))) fail('duplicates');
    if (v.catalog.some(c => c.available && c.priceText.trim() === '')) fail('catalog.priceText');
    if (v.access.full !== (v.access.sources.length > 0)) fail('access.sources');
    if (v.store.verification !== 'remote' && v.store.fetchedAtMs !== null) fail('store.fetchedAtMs');
    if (v.store.verification === 'remote' && v.store.fetchedAtMs === null) fail('store.fetchedAtMs');
    if (v.operation.state === 'idle' && (v.operation.id !== null || v.operation.plan !== null)) fail('operation');
    if (v.operation.state !== 'idle' && v.operation.id === null) fail('operation.id');
    if (v.operation.state === 'checkout' && v.operation.plan === null) fail('operation.plan');
    if (v.capabilities.checkout && (v.unresolvedPurchase !== null || activeStates.includes(v.operation.state))) fail('capabilities.checkout');
    if (v.capabilities.checkout && !v.catalog.some(c => c.available)) fail('catalog');
  });
}

// Accept only the public facade vocabulary; never accept a product, price, token or URL.
export const validateBillingPurchaseInput = value => validate(object({ plan, catalogRevision: id, acceptedImmediateCharge: bool }), value);
export const validateBillingOperationAcknowledgement = value => validate(object({ operationId: id }), value);
export const validateBillingRefreshReason = value => validate(enumOf(['user', 'checkout', 'manage-return', 'expiry']), value);
export const validateBillingRecoveryInput = value => validate(object({ action: enumOf(['home-settings', 'system-settings', 'dialer', 'ime-settings']) }), value);

// A presentation selection, never an entitlement or checkout policy calculator.
export function selectBillingUi(value) {
  const validated = validateBillingView(value);
  if (!validated.ok) return Object.freeze({ surface: 'recovery', checkout: false, restore: false, manage: false, existingFriendRecovery: true, nativeRecovery: true });
  const v = validated.value;
  return Object.freeze({ surface: v.access.full ? 'launcher' : 'billing', ...v.capabilities });
}
