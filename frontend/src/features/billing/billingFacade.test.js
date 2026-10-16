import * as api from '@/lib/launcherApps';
import fixture from './__fixtures__/billing-v1.json';
let plugin;
test('healthy shell signal is explicit and cannot configure billing or manufacture access', async () => {
  plugin.billingShellReady = jest.fn().mockResolvedValue({ ready: true });
  await expect(api.billingShellReady()).resolves.toEqual({ ready: true });
  expect(plugin.initializeBilling).not.toHaveBeenCalled(); expect(plugin.refreshBilling).not.toHaveBeenCalled();
  for (const value of [{ ready: false }, { ready: true, full: true }, { ready: 'true' }]) {
    plugin.billingShellReady.mockResolvedValue(value); await expect(api.billingShellReady()).rejects.toThrow();
  }
});
test('support export is explicit, bounded and cannot grant access', async () => {
  plugin.getBillingSupportSummary = jest.fn().mockResolvedValue({ text: 'Support ID: unavailable\nVersion: 1.2.6' });
  await expect(api.getBillingSupportSummary()).resolves.toEqual({ text: 'Support ID: unavailable\nVersion: 1.2.6' });
  expect(plugin.initializeBilling).not.toHaveBeenCalled(); expect(plugin.refreshBilling).not.toHaveBeenCalled();
  for (const result of [{ text: 'x'.repeat(2049) }, { text: 'secret\r\n' }, { text: 'ok', token: 'secret' }, { text: true }]) {
    plugin.getBillingSupportSummary.mockResolvedValue(result); await expect(api.getBillingSupportSummary()).rejects.toThrow();
  }
});
beforeEach(() => {
  plugin = { getBillingBootstrapPolicy: jest.fn().mockResolvedValue({ enabled: true }), initializeBilling: jest.fn().mockResolvedValue(fixture), getBillingSnapshot: jest.fn().mockResolvedValue(fixture), refreshBilling: jest.fn().mockResolvedValue(fixture), addListener: jest.fn() };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { LauncherApps: plugin } };
});
afterEach(() => { delete window.Capacitor; });
test('browser disables bootstrap; native missing policy never bypasses', async () => {
  delete window.Capacitor; await expect(api.getBillingBootstrapPolicy()).resolves.toEqual({ enabled: false });
  window.Capacitor = { isNativePlatform: () => true }; await expect(api.getBillingBootstrapPolicy()).rejects.toThrow();
});
test.each([{ enabled: 'true' }, { enabled: true, access: true }, {}])('rejects malformed policy %j', async value => {
  plugin.getBillingBootstrapPolicy.mockResolvedValue(value); await expect(api.getBillingBootstrapPolicy()).rejects.toThrow();
});
test('facade validates native results and bounded inputs', async () => {
  await expect(api.initializeBilling({ captureJson: null })).resolves.toMatchObject({ schema: 1 });
  await expect(api.initializeBilling({ captureJson: 'x'.repeat(1025) })).rejects.toThrow();
  await expect(api.refreshBilling({ reason: 'automatic-poll' })).rejects.toThrow();
  plugin.getBillingSnapshot.mockResolvedValue({ access: { full: true } }); await expect(api.getBillingSnapshot()).rejects.toThrow();
});
test('Restore validates an acknowledgement without accepting returned rights', async () => {
  plugin.restoreBillingPurchases = jest.fn().mockResolvedValue({ operationId: 'restore-1' });
  await expect(api.restoreBillingPurchases()).resolves.toEqual({ operationId: 'restore-1' });
  expect(plugin.restoreBillingPurchases).toHaveBeenCalledTimes(1);
  expect(plugin.initializeBilling).not.toHaveBeenCalled();
  plugin.restoreBillingPurchases.mockResolvedValue({ access: { full: true } });
  await expect(api.restoreBillingPurchases()).rejects.toThrow('billing_invalid_acknowledgement');
});
test('purchase passes only bounded intent and treats acknowledgement as acceptance', async () => {
  plugin.purchaseBillingPlan = jest.fn().mockResolvedValue({ operationId: 'purchase-1' });
  const input = { plan: 'lifetime', catalogRevision: 'catalog-1', acceptedImmediateCharge: true };
  await expect(api.purchaseBillingPlan(input)).resolves.toEqual({ operationId: 'purchase-1' });
  expect(plugin.purchaseBillingPlan).toHaveBeenCalledWith(input);
  for (const bad of [{ ...input, acceptedImmediateCharge: false }, { ...input, plan: 'premium' },
    { ...input, token: 'arbitrary' }, { ...input, catalogRevision: 'x'.repeat(129) }]) {
    await expect(api.purchaseBillingPlan(bad)).rejects.toThrow('billing_invalid_purchase');
  }
  expect(plugin.purchaseBillingPlan).toHaveBeenCalledTimes(1);
  plugin.purchaseBillingPlan.mockResolvedValue(fixture);
  await expect(api.purchaseBillingPlan(input)).rejects.toThrow('billing_invalid_acknowledgement');
});
test.each([{ operationId: '' }, { operationId: 'x'.repeat(129) }, { operationId: null },
  { operationId: 'ok', full: true }, { operationId: 'bad\n' }])('rejects malformed acknowledgement %j', async value => {
  plugin.restoreBillingPurchases = jest.fn().mockResolvedValue(value);
  await expect(api.restoreBillingPurchases()).rejects.toThrow('billing_invalid_acknowledgement');
});
test('explicit reconciliation requests cannot grant access', async () => {
  plugin.reconcileBillingPurchase = jest.fn().mockResolvedValue({ requested: true });
  await expect(api.reconcileBillingPurchase()).resolves.toEqual({ requested: true });
  expect(plugin.initializeBilling).not.toHaveBeenCalled(); expect(plugin.refreshBilling).not.toHaveBeenCalled();
  plugin.reconcileBillingPurchase.mockResolvedValue({ requested: true, full: true });
  await expect(api.reconcileBillingPurchase()).rejects.toThrow();
});
test('Manage opens only the native fixed destination and never interprets opened as rights', async () => {
  plugin.openBillingManagement = jest.fn().mockResolvedValue({ opened: true });
  await expect(api.openBillingManagement()).resolves.toEqual({ opened: true });
  expect(plugin.openBillingManagement).toHaveBeenCalledWith(undefined);
  expect(plugin.initializeBilling).not.toHaveBeenCalled();
  expect(plugin.refreshBilling).not.toHaveBeenCalled();
});
test.each([false, { opened: false }, { opened: 'true' }, { opened: true, full: true }, {}])('Manage rejects invalid opened response %j', async result => {
  plugin.openBillingManagement = jest.fn().mockResolvedValue(result);
  await expect(api.openBillingManagement()).rejects.toThrow();
});
test('Manage rejects response accessors without executing them', async () => {
  const getter = jest.fn(() => true);
  plugin.openBillingManagement = jest.fn().mockResolvedValue(Object.defineProperty({}, 'opened', { get: getter }));
  await expect(api.openBillingManagement()).rejects.toThrow(); expect(getter).not.toHaveBeenCalled();
});
test('late asynchronous listener registration is removed after disposal; malformed events never emit', async () => {
  let resolve; const remove = jest.fn(); const callback = jest.fn();
  plugin.addListener.mockReturnValue(new Promise(done => { resolve = done; }));
  const subscription = api.subscribeToBillingUpdates(callback); await Promise.resolve();
  const handler = plugin.addListener.mock.calls[0][1]; handler({ access: { full: true } }); expect(callback).not.toHaveBeenCalled();
  handler(fixture); expect(callback).toHaveBeenCalledTimes(1);
  subscription.remove(); resolve({ remove }); await subscription.ready; expect(remove).toHaveBeenCalledTimes(1);
  handler(fixture); expect(callback).toHaveBeenCalledTimes(1);
});

test('catalog refresh is explicit and validates the native presentation snapshot', async () => {
  plugin.refreshBillingCatalog = jest.fn().mockResolvedValue(fixture);
  await expect(api.refreshBillingCatalog()).resolves.toMatchObject({ schema: 1 });
  expect(plugin.refreshBillingCatalog).toHaveBeenCalledWith(undefined);
  expect(plugin.initializeBilling).not.toHaveBeenCalled(); expect(plugin.refreshBilling).not.toHaveBeenCalled();
  plugin.refreshBillingCatalog.mockResolvedValue({ access: { full: true } });
  await expect(api.refreshBillingCatalog()).rejects.toThrow('billing_invalid_view');
});
