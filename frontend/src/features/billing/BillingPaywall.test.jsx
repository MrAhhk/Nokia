import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import BillingPaywall from './BillingPaywall';
import fixture from './__fixtures__/billing-v1.json';
import * as api from '@/lib/launcherApps';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';

jest.mock('@/lib/launcherApps', () => ({ purchaseBillingPlan: jest.fn(), restoreBillingPurchases: jest.fn(), reconcileBillingPurchase: jest.fn(), refreshBillingCatalog: jest.fn(), getBillingSnapshot: jest.fn(), refreshBilling: jest.fn(), openBillingManagement: jest.fn(), getBillingSupportSummary: jest.fn(), openBillingRecovery: jest.fn() }));
jest.mock('@/features/sound/nokiaAudioEngine', () => ({ playKeypadTone: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
test('Settings starts at subscription management without checkout and retains paid-until after cancellation', async () => {
  const expiry = Date.UTC(2030, 0, 1);
  const snapshot = view({ access: { full: true, sources: ['subscription'] },
    store: { ...fixture.store, verification: 'remote', subscriptionActive: true,
      fetchedAtMs: expiry - 86400000, expiresAtMs: expiry, plan: 'monthly', renewState: 'off' } });
  await act(async () => root.render(<BillingPaywall ref={ref} billingView={snapshot}
    onBillingView={publish} initialPage="management" keypadFeedback={false} />));
  expect(container.textContent).toContain('Use until');
  expect(container.textContent).toContain('Monthly');
  expect(container.querySelector('[aria-label="Google Play subscriptions address"]').value).toContain('play.google.com');
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
let root, container, ref, publish;
const view = patch => ({ ...fixture, ...patch });
const busyView = (id = 'buy-1', kind = 'purchase') => view({ capabilities: { ...fixture.capabilities, checkout: false, restore: false }, operation: { id, state: kind === 'restore' ? 'restoring' : 'checkout', plan: kind === 'restore' ? null : 'monthly' } });
const buttons = () => [...container.querySelectorAll('button')];
const button = name => buttons().find(node => node.textContent.includes(name));
const click = async name => act(async () => button(name).click());
const render = async snapshot => act(async () => root.render(<BillingPaywall ref={ref} billingView={snapshot} onBillingView={publish} />));
test('localized plan rows show price once and preserve full terms on confirmation', async () => {
  const catalog = fixture.catalog.map(item => item.key === 'monthly' ? {
    ...item, priceText: '₫52,000', periodText: 'per month; auto-renews until canceled'
  } : item);
  await render(view({ catalog }));
  const monthly = container.querySelector('.billing-lcd__plans button');
  expect(monthly.querySelector('span').textContent).toBe('₫52,000');
  expect(monthly.textContent).toContain('Per month');
  expect(monthly.textContent).toContain('Auto-renewing');
  expect(container.textContent).toContain('Cancel in Google Play');
  expect(monthly.textContent).not.toContain('auto-renews until canceled');
  await click('Monthly');
  expect(container.querySelector('.billing-lcd__price').textContent).toBe('₫52,000');
  expect(container.querySelector('.billing-lcd__period').textContent).toBe('per month; auto-renews until canceled');
  expect(button('Buy').textContent).toBe('Buy ₫52,000');
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('idle uncertain journal offers recovery without claiming an active background check', async () => {
  const unresolved = view({ capabilities: { ...fixture.capabilities, checkout: false },
    operation: { id: null, state: 'idle', plan: null },
    unresolvedPurchase: { id: 'uncertain-1', plan: 'monthly', stage: 'uncertain' }, issue: 'uncertain' });
  await render(unresolved);
  expect(container.textContent).toContain('The purchase result is not confirmed');
  expect(container.textContent).not.toContain('Checking your purchase with Google Play');
  expect(button('Check purchase')).toBeDefined();
  expect(button('Restore purchases').disabled).toBe(false);
  expect(button('Support').disabled).toBe(false);
  expect(button('Android recovery').disabled).toBe(false);
  expect(button('Buy')).toBeUndefined();
  api.getBillingSnapshot.mockResolvedValue(unresolved);
  await click('Restore purchases');
  expect(api.restoreBillingPurchases).toHaveBeenCalledTimes(1);
  expect(button('Restore purchases').disabled).toBe(false);
  expect(container.textContent).toContain('Purchase needs checking');
  expect(container.querySelector('.billing-lcd__body > [role="status"]').textContent).toContain('Restore finished. This purchase is still unconfirmed.');
  await click('Check purchase');
  expect(container.querySelector('.billing-lcd__body > [role="status"]').textContent).toContain('Check finished. This purchase is still unconfirmed.');
  expect(button('Buy')).toBeUndefined();
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
beforeEach(() => {
  jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); ref = createRef(); publish = jest.fn();
  api.purchaseBillingPlan.mockResolvedValue({ operationId: 'buy-1' }); api.restoreBillingPurchases.mockResolvedValue({ operationId: 'restore-1' }); api.getBillingSnapshot.mockResolvedValue(view()); api.refreshBillingCatalog.mockResolvedValue(view()); api.refreshBilling.mockResolvedValue(view()); api.openBillingManagement.mockResolvedValue({ opened: true }); api.reconcileBillingPurchase.mockResolvedValue({ requested: true }); api.openBillingRecovery.mockResolvedValue({ opened: true });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test('keeps three equal plans with actual catalog prices and requires selection before a separate purchase action', async () => {
  api.getBillingSnapshot.mockResolvedValue(busyView());
  await render(view()); expect(container.textContent).toContain('Every plan includes all features'); expect(container.textContent).toContain('TEST 4.99');
  expect(container.querySelector('[aria-pressed=true]')).toBeNull(); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  await click('Monthly'); expect(button('Buy')).toBeDefined(); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  await click('Buy'); expect(api.purchaseBillingPlan).toHaveBeenCalledWith({ plan: 'monthly', catalogRevision: 'synthetic-catalog-v1', acceptedImmediateCharge: false });
  expect(container.textContent).toContain('Waiting for Google Play'); expect(publish).toHaveBeenCalledWith(busyView());
});
test('missing catalog retains all plans and disabled confirmation; native capability stays authoritative', async () => {
  await render(view({ catalog: [], capabilities: { ...fixture.capabilities, checkout: false } }));
  for (const plan of ['Monthly', 'Yearly', 'Lifetime']) expect(button(plan)).toBeDefined();
  await click('Yearly'); expect(button('Buy').disabled).toBe(true); expect(container.textContent).toContain('Price unavailable');
  await click('Buy'); expect(api.purchaseBillingPlan).not.toHaveBeenCalled(); await click('Retry prices'); expect(api.refreshBillingCatalog).toHaveBeenCalledTimes(1);
});
test('Lifetime requires explicit acknowledgement of immediate one-time charge', async () => {
  await render(view()); await click('Lifetime'); expect(button('Buy').disabled).toBe(true);
  await act(async () => container.querySelector('input[type=checkbox]').click()); await click('Buy');
  expect(api.purchaseBillingPlan).toHaveBeenCalledWith({ plan: 'lifetime', catalogRevision: 'synthetic-catalog-v1', acceptedImmediateCharge: true });
});
test('catalog changes remove confirmation and require selecting the updated price again', async () => {
  await render(view()); await click('Monthly');
  await render(view({ sequence: 1, catalog: fixture.catalog.map(item => ({ ...item, priceText: 'LOCAL 9', catalogRevision: 'new' })) }));
  expect(button('Buy')).toBeUndefined(); expect(container.textContent).toContain('Prices changed'); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  await click('Monthly'); await click('Buy'); expect(api.purchaseBillingPlan.mock.calls[0][0].catalogRevision).toBe('new');
});
test('a double purchase tap makes only one request; absence from a snapshot never settles its acknowledgement', async () => {
  api.getBillingSnapshot.mockResolvedValue(busyView());
  let done; api.purchaseBillingPlan.mockReturnValue(new Promise(resolve => { done = resolve; }));
  await render(view()); await click('Monthly'); const buy = button('Buy'); await act(async () => { buy.click(); buy.click(); });
  expect(api.purchaseBillingPlan).toHaveBeenCalledTimes(1); await act(async () => done({ operationId: 'buy-1' }));
  await render(view({ sequence: 2 })); expect(container.textContent).toContain('Waiting for Google Play'); expect(button('Buy')).toBeUndefined();
  api.getBillingSnapshot.mockResolvedValue(view({ sequence: 3 })); await click('Check purchase'); expect(container.textContent).toContain('Purchase checked'); expect(container.textContent).toContain('No access confirmed');
});
test.each(['monthly', 'lifetime'])('pending %s journal blocks checkout and retains order-history recovery', async plan => {
  const pending = view({ capabilities: { ...fixture.capabilities, checkout: false }, unresolvedPurchase: { id: 'pending-1', plan, stage: 'pending' }, issue: 'pending' }); api.getBillingSnapshot.mockResolvedValue(pending);
  await render(pending);
  expect(container.textContent).toContain('Purchase pending'); expect(button('Monthly')).toBeUndefined(); await click('Check purchase');
  expect(api.reconcileBillingPurchase).toHaveBeenCalledTimes(1); expect(container.textContent).toContain('Purchase pending'); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Budget & history');
  expect(container.textContent).toContain('account used to buy');
  expect(button('Support')).toBeDefined();
});
test('Restore releases its local wait after its observed running operation becomes native IDLE', async () => {
  api.getBillingSnapshot.mockResolvedValue(busyView('restore-1', 'restore'));
  await render(view()); await click('Restore purchases'); expect(container.textContent).toContain('Waiting for Google Play');
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  await render(view({ sequence: 2 }));
  expect(container.textContent).toContain('Restore checked'); expect(container.textContent).toContain('No access confirmed'); expect(button('Restore purchases').disabled).toBe(false);
  expect(button('Review plans').hasAttribute('data-primary')).toBe(true);
  await click('Review plans');
  expect(container.textContent).toContain('Choose your plan.');
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  expect(api.reconcileBillingPurchase).not.toHaveBeenCalled();
});

test('Restore event absence and a different controller epoch cannot release the local wait', async () => {
  api.getBillingSnapshot.mockResolvedValue(view());
  let acknowledge;
  api.restoreBillingPurchases.mockReturnValue(new Promise(resolve => { acknowledge = resolve; }));
  await render(view()); await click('Restore purchases');
  await render(view({ sequence: 2 }));
  expect(button('Restore purchases').disabled).toBe(true);
  expect(button('Review plans')).toBeUndefined();
  api.getBillingSnapshot.mockResolvedValue({ ...busyView('restore-1', 'restore'), sequence: 3 });
  await act(async () => acknowledge({ operationId: 'restore-1' }));
  await render(view({ controllerEpoch: 'different', sequence: 4 }));
  expect(button('Restore purchases').disabled).toBe(true);
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('Check purchase shows its asynchronous result while preserving an unresolved journal', async () => {
  const unresolved = view({ capabilities: { ...fixture.capabilities, checkout: false },
    unresolvedPurchase: { id: 'uncertain-1', plan: 'monthly', stage: 'uncertain' }, issue: 'uncertain' });
  api.getBillingSnapshot.mockResolvedValue({ ...unresolved, sequence: 1,
    operation: { id: 'check-1', state: 'checking', plan: null } });
  await render(unresolved); await click('Check purchase');
  await render({ ...unresolved, sequence: 2 });
  expect(container.querySelector('.billing-lcd__body > [role="status"]').textContent).toContain('Check finished. This purchase is still unconfirmed.');
  expect(container.textContent).toContain('Purchase needs checking');
  expect(button('Buy')).toBeUndefined();
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('Manage opens without provider availability and checks only on explicit return action', async () => {
  await render(null); await click('Manage subscription'); expect(api.openBillingManagement).toHaveBeenCalledTimes(1); expect(api.refreshBilling).not.toHaveBeenCalled();
  await click('Check after returning'); expect(api.refreshBilling).toHaveBeenCalledWith({ reason: 'manage-return' }); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('Lifetime and local gift management hide purchase offers while retaining subscription renewal warning and recovery', async () => {
  await render(view({ access: { full: true, sources: ['storeLifetime', 'subscription'] }, store: { ...fixture.store, lifetimeActive: true, subscriptionActive: true, renewState: 'on', plan: 'monthly' } }));
  expect(container.textContent).toContain('Lifetime'); expect(container.textContent).toContain('still renews'); expect(button('Monthly')).toBeUndefined(); expect(button('Restore purchases')).toBeDefined();
});
test('support diagnostics and Android recovery require explicit action and never trigger billing', async () => {
  api.getBillingSupportSummary.mockResolvedValue({ text: 'Support ID: unavailable\nVersion: 1.2.6' }); await render(null);
  expect(api.getBillingSupportSummary).not.toHaveBeenCalled(); await click('Support'); expect(container.textContent).toContain('Nothing is sent automatically'); expect(container.textContent).toContain('Support ID');
  await click('Back'); await click('Android recovery'); await click('Phone'); expect(api.openBillingRecovery).toHaveBeenCalledWith({ action: 'dialer' }); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('Select stays inside LCD when shared keypad owns DOM focus and repeated Select cannot buy', async () => {
  await render(view()); const external = document.createElement('button'); const externalClick = jest.fn(); external.onclick = externalClick; document.body.appendChild(external);
  button('Monthly').focus(); external.focus(); await act(async () => { ref.current.handleKey('SELECT'); ref.current.handleKey('SELECT'); });
  expect(externalClick).not.toHaveBeenCalled(); expect(api.purchaseBillingPlan).not.toHaveBeenCalled(); expect(button('Buy')).toBeDefined();
  await act(async () => ref.current.handleKey('END')); expect(button('Monthly')).toBeDefined(); external.remove();
});
test('late command completion after unmount is ignored', async () => {
  let done; api.refreshBillingCatalog.mockReturnValue(new Promise(resolve => { done = resolve; })); await render(view()); await click('Retry prices'); act(() => root.unmount()); root = createRoot(container);
  await act(async () => done(view())); expect(publish).not.toHaveBeenCalled();
});
test('a lost purchase acknowledgement keeps recovery and cannot trigger another payment from snapshot absence', async () => {
  api.purchaseBillingPlan.mockRejectedValue(new Error('transport_closed'));
  await render(view()); await click('Monthly'); await click('Buy'); await render(view({ sequence: 1 }));
  expect(container.textContent).toContain('Waiting for Google Play'); expect(button('Buy')).toBeUndefined(); api.getBillingSnapshot.mockResolvedValue(busyView()); await click('Check purchase');
  expect(api.purchaseBillingPlan).toHaveBeenCalledTimes(1); expect(api.reconcileBillingPurchase).toHaveBeenCalledTimes(1);
});
test('fast Restore completion publishes actual native IDLE and releases only the local wait', async () => {
  await render(view()); await click('Restore purchases'); expect(container.textContent).toContain('Restore checked'); expect(container.textContent).toContain('No access confirmed'); expect(button('Restore purchases').disabled).toBe(false);
});
test('fast canceled checkout publishes actual native IDLE without claiming purchase success or granting rights', async () => {
  await render(view()); await click('Monthly'); await click('Buy'); expect(container.textContent).toContain('Purchase checked'); expect(container.textContent).toContain('No access confirmed'); expect(button('Buy')).toBeUndefined();
  await click('Back'); expect(button('Monthly')).toBeDefined();
});
test('a matched Play product rejection releases the local wait and explains availability without granting access', async () => {
  api.getBillingSnapshot.mockResolvedValue(busyView());
  await render(view()); await click('Monthly'); await click('Buy');
  await render({ ...busyView(), sequence: 4 });
  await render(view({ sequence: 5, issue: 'product_unavailable' }));
  expect(container.textContent).toContain('Google Play could not offer this plan');
  expect(container.textContent).not.toContain('purchase result is not confirmed');
  expect(button('Monthly')).toBeDefined();
  expect(button('Buy')).toBeUndefined();
  expect(api.purchaseBillingPlan).toHaveBeenCalledTimes(1);
});
test('keypad and touch reuse existing sound feedback without double feedback on key-dispatched clicks', async () => {
  await render(view()); button('Monthly').focus(); await act(async () => ref.current.handleKey('SELECT')); expect(playKeypadTone).toHaveBeenCalledTimes(1);
  await click('Back'); expect(playKeypadTone).toHaveBeenCalledTimes(2);
});
test('explicit native intent rejection permits a deliberate retry without claiming payment completion', async () => {
  api.purchaseBillingPlan.mockRejectedValue(new Error('billing_operation_rejected'));
  await render(view()); await click('Monthly'); await click('Buy'); expect(button('Buy')).toBeDefined(); expect(container.textContent).toContain('Purchase could not be started');
});
test('a stale authoritative read cannot release local admission after a newer native event', async () => {
  let done; api.getBillingSnapshot.mockReturnValue(new Promise(resolve => { done = resolve; }));
  await render(view()); await act(async () => button('Monthly').click()); await act(async () => button('Buy').click());
  await render(view({ sequence: 4 })); await act(async () => done(view({ sequence: 1 })));
  expect(container.textContent).toContain('Waiting for Google Play');
});
test('hung prices cannot block Home, Phone, IME, Android settings or Manage; identical escapes coalesce independently', async () => {
  api.refreshBillingCatalog.mockReturnValue(new Promise(() => {}));
  api.openBillingRecovery.mockImplementation(({ action }) => action === 'home-settings' ? new Promise(() => {}) : Promise.resolve({ opened: true }));
  await render(view()); await click('Retry prices'); await click('Android recovery');
  const home = button('Choose Home app'); await act(async () => { home.click(); home.click(); });
  expect(api.openBillingRecovery.mock.calls.filter(([input]) => input.action === 'home-settings')).toHaveLength(1);
  await click('Phone'); await click('Keyboard settings'); await click('Android settings');
  expect(api.openBillingRecovery).toHaveBeenCalledWith({ action: 'dialer' }); expect(api.openBillingRecovery).toHaveBeenCalledWith({ action: 'ime-settings' }); expect(api.openBillingRecovery).toHaveBeenCalledWith({ action: 'system-settings' });
  await click('Manage subscription'); expect(api.openBillingManagement).toHaveBeenCalledTimes(1); expect(api.refreshBillingCatalog).toHaveBeenCalledTimes(1); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('hung support and Manage requests cannot block independent Android recovery', async () => {
  api.getBillingSupportSummary.mockReturnValue(new Promise(() => {})); api.openBillingManagement.mockReturnValue(new Promise(() => {}));
  await render(view()); await click('Support'); await click('Back'); await click('Manage subscription'); await click('Android recovery'); await click('Phone');
  expect(api.openBillingRecovery).toHaveBeenCalledWith({ action: 'dialer' }); expect(api.openBillingManagement).toHaveBeenCalledTimes(1); expect(api.getBillingSupportSummary).toHaveBeenCalledTimes(1);
});
