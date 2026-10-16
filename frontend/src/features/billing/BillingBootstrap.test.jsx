import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BillingBootstrap, { BillingUiBoundary } from './BillingBootstrap';
import App from '@/App';
import * as api from '@/lib/launcherApps';
import { serializeBillingLegacyEvidence } from './billingLegacyEvidence';
import fixture from './__fixtures__/billing-v1.json';
import { ONBOARDING_KEY } from '@/features/onboarding/onboardingState';

jest.mock('@/lib/launcherApps', () => ({ isNativeLauncher: jest.fn(() => true), getDumbModeState: jest.fn(), getDumbModeApps: jest.fn(), getFriendAuthenticatorState: jest.fn(), subscribeToFriendAuthenticatorUpdates: jest.fn(), subscribeToDumbModeUpdates: jest.fn(), subscribeToSystemSettingReturns: jest.fn(() => () => {}), purchaseBillingPlan: jest.fn(), reconcileBillingPurchase: jest.fn(), refreshBillingCatalog: jest.fn(), billingShellReady: jest.fn(), getBillingBootstrapPolicy: jest.fn(), initializeBilling: jest.fn(), getBillingSnapshot: jest.fn(), refreshBilling: jest.fn(), restoreBillingPurchases: jest.fn(), openBillingManagement: jest.fn(), getBillingSupportSummary: jest.fn(), subscribeToBillingUpdates: jest.fn(), openBillingRecovery: jest.fn() }));
jest.mock('./billingLegacyEvidence', () => ({ serializeBillingLegacyEvidence: jest.fn(() => 'original-capture') }));
jest.mock('@/features/sound/nokiaAudioEngine', () => ({ playKeypadTone: jest.fn() }));
jest.mock('@/LauncherApp', () => ({ __esModule: true, default: () => { global.localStorage.setItem('writer', 'mounted'); return <div>HOME</div>; } }));
jest.mock('@/components/NokiaSystemKeyboard', () => ({ __esModule: true, default: () => <div>IME</div> }));
global.IS_REACT_ACT_ENVIRONMENT = true;
test('unknown local seal retains existing friend recovery without onboarding writers or installed-app scan', async () => {
  api.initializeBilling.mockResolvedValue({ ...view(), legacy: { status: 'unknown', persisted: false } });
  api.getDumbModeState.mockResolvedValue({ revision: 1, state: 'OFF', active: false, blockedIds: [], mandatoryIds: [], enforcementAvailable: true });
  api.getFriendAuthenticatorState.mockResolvedValue({ revision: 1, owners: [], holders: [], pending: [] });
  api.subscribeToFriendAuthenticatorUpdates.mockResolvedValue(() => {});
  api.subscribeToDumbModeUpdates.mockResolvedValue(() => {});
  localStorage.clear();
  await mount();
  await act(async () => [...container.querySelectorAll('button')].find(node => node.textContent === 'Recover friend codes').click());
  expect(container.textContent).toContain('Codes for friends');
  expect(api.getDumbModeApps).not.toHaveBeenCalled();
  expect(localStorage.getItem(ONBOARDING_KEY)).toBeNull();
  expect(localStorage.getItem('nokia-launcher.dumb-mode-guide.v2')).toBeNull();
  expect(home()).toBe(false);
  await act(async () => [...container.querySelectorAll('button')].find(node => node.textContent === 'Back').click());
  expect(container.textContent).toContain('Access check');
});
test('shell readiness waits for committed recovery and is signaled only once despite retries', async () => {
  api.getBillingBootstrapPolicy.mockReturnValue(new Promise(() => {}));
  await mount(); expect(api.billingShellReady).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(api.billingShellReady).toHaveBeenCalledTimes(1);
  await act(async () => [...container.querySelectorAll('button')].find(node => node.textContent === 'Retry').click());
  await act(async () => jest.advanceTimersByTime(3000));
  expect(api.billingShellReady).toHaveBeenCalledTimes(1);
  expect(home()).toBe(false);
});

test('support diagnostics are shown only on explicit input and do not change access', async () => {
  api.initializeBilling.mockResolvedValue(view());
  api.getBillingSupportSummary.mockResolvedValue({ text: 'Support ID: unavailable\nVersion: 1.2.6' });
  await mount();
  expect(api.getBillingSupportSummary).not.toHaveBeenCalled();
  const button = [...container.querySelectorAll('button')].find(item => item.textContent === 'Support');
  await act(async () => button.click());
  expect(container.textContent).toContain('Support ID: unavailable');
  expect(container.textContent).toContain('Nothing is sent automatically');
  expect(home()).toBe(false);
});
const view = (full = false, sequence = 0, epoch = 'process-a') => ({ ...fixture, controllerEpoch: epoch, sequence, access: { full, sources: full ? ['legacyDevice'] : [] } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let root, container, listeners, removals;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); localStorage.clear(); window.history.replaceState({}, '', '/');
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));
  api.isNativeLauncher.mockReturnValue(true);
  api.subscribeToSystemSettingReturns.mockImplementation(() => () => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  listeners = []; removals = [];
  api.billingShellReady.mockResolvedValue({ ready: true });
  api.getBillingBootstrapPolicy.mockResolvedValue({ enabled: true });
  api.initializeBilling.mockResolvedValue(view());
  api.getBillingSnapshot.mockResolvedValue(view());
  api.refreshBilling.mockResolvedValue(view(false, 1));
  api.subscribeToBillingUpdates.mockImplementation(callback => {
    const remove = jest.fn(); listeners.push(callback); removals.push(remove); return { ready: Promise.resolve(), remove };
  });
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); jest.restoreAllMocks(); });
const mount = async (element = <App />) => act(async () => root.render(element));
test('sealed new installation sees the complete guide then the real payment frame without mounting Home writers', async () => {
  localStorage.removeItem(ONBOARDING_KEY);
  await mount();
  expect(container.querySelector('[data-testid="onboarding-guide"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
  for (const stepId of ['welcome', 'dumb-mode', 'navigation', 'accessibility', 'setup']) {
    expect(container.querySelector('[data-testid="nokia-launcher"]').dataset.guide).toBe(stepId);
    await act(async () => container.querySelector('.onboarding-coach__next').click());
  }
  expect(container.querySelector('[data-testid="onboarding-guide"]')).toBeNull();
  expect(container.querySelector('.billing-lcd')).not.toBeNull();
  expect(container.textContent).toContain('Monthly'); expect(container.textContent).toContain('Yearly');
  expect(container.textContent).toContain('Lifetime');
  expect(home()).toBe(false); expect(localStorage.getItem('writer')).toBeNull();
  expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
  await emit({ ...view(true, 2), access: { full: true, sources: ['storeLifetime'] } });
  expect(home()).toBe(true); expect(localStorage.getItem('writer')).toBe('mounted');
});
test('failed payment UI keeps independent Android recovery controls available', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const Broken = () => { throw new Error('UI unavailable'); };
  const escape = jest.fn();
  await mount(<BillingUiBoundary fallback={<button onClick={escape}>Choose Home app</button>}><Broken /></BillingUiBoundary>);
  await act(async () => container.querySelector('button').click());
  expect(escape).toHaveBeenCalledTimes(1); expect(home()).toBe(false); log.mockRestore();
});
test('first payment presentation requests missing prices once after SDK readiness without polling', async () => {
  const initial = { ...view(), catalog: view().catalog.map(item => ({ ...item, available: false, priceText: '', periodText: '' })),
    capabilities: { ...view().capabilities, checkout: false } };
  api.initializeBilling.mockResolvedValue(initial);
  api.refreshBillingCatalog.mockResolvedValue(view(false, 1));
  await mount();
  expect(api.refreshBillingCatalog).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('TEST 1.99'); expect(home()).toBe(false);
  await emit(view(false, 2)); await emit(view(false, 3));
  expect(api.refreshBillingCatalog).toHaveBeenCalledTimes(1); expect(api.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('Restore acknowledgement cannot grant access; later verified native state opens Home', async () => {
  const pending = deferred(); api.restoreBillingPurchases.mockReturnValue(pending.promise);
  await mount(); expect(api.restoreBillingPurchases).not.toHaveBeenCalled();
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === 'Restore purchases');
  expect(button).toBeDefined();
  await act(async () => { button.click(); button.click(); });
  expect(api.restoreBillingPurchases).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('writer')).toBeNull();
  const busy = { ...view(false, 1), capabilities: { ...view().capabilities, restore: false, checkout: false },
    operation: { id: 'restore-1', state: 'restoring', plan: null } };
  api.getBillingSnapshot.mockResolvedValue(busy);
  await act(async () => pending.resolve({ operationId: 'restore-1' }));
  expect(home()).toBe(false); expect(api.getBillingSnapshot).toHaveBeenCalledTimes(1);
  const restoring = [...container.querySelectorAll('button')].find(node => node.textContent === 'Restore purchases');
  expect(restoring.disabled).toBe(true); await act(async () => restoring.click());
  expect(api.restoreBillingPurchases).toHaveBeenCalledTimes(1);
  await emit(view(true, 2));
  expect(container.textContent).toContain('HOME');
});
const emit = async value => act(async () => listeners.at(-1)(value));
test('Manage recovery stays reachable without provider state; opened never grants access', async () => {
  api.initializeBilling.mockRejectedValue(new Error('configuration unavailable'));
  const pending = deferred(); api.openBillingManagement.mockReturnValue(pending.promise);
  await mount();
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === 'Manage subscription');
  await act(async () => { button.click(); button.click(); });
  expect(api.openBillingManagement).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ opened: true }));
  expect(localStorage.getItem('writer')).toBeNull();
  expect(api.refreshBilling).not.toHaveBeenCalled();
  expect(api.restoreBillingPurchases).not.toHaveBeenCalled();
});
test('Manage launch failure keeps recovery and shows retryable feedback', async () => {
  api.openBillingManagement.mockRejectedValue(new Error('unavailable'));
  await mount();
  const button = [...container.querySelectorAll('button')].find(node => node.textContent === 'Manage subscription');
  await act(async () => button.click());
  expect(container.textContent).toContain('Google Play subscriptions could not open');
  expect(button.disabled).toBe(false); expect(localStorage.getItem('writer')).toBeNull();
});
const home = () => container.textContent.includes('HOME');

test('does not mount writers until a validated native full-access view', async () => {
  const pending = deferred(); api.initializeBilling.mockReturnValue(pending.promise);
  await mount(); expect(localStorage.getItem('writer')).toBeNull();
  await act(async () => pending.resolve(view(true))); expect(home()).toBe(true);
  await emit(view(false, 1)); expect(home()).toBe(false);
});
test('disabled policy bypasses initialization and listener', async () => {
  api.getBillingBootstrapPolicy.mockResolvedValue({ enabled: false }); await mount();
  expect(home()).toBe(true); expect(api.initializeBilling).not.toHaveBeenCalled(); expect(api.subscribeToBillingUpdates).not.toHaveBeenCalled();
});
test('deadline shows recovery, late valid native success still opens Home', async () => {
  api.initializeBilling.mockReturnValue(new Promise(() => {})); await mount();
  expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
  expect(container.querySelector('.billing-recovery-frame [data-state="loading"]')).not.toBeNull();
  expect(localStorage.getItem('writer')).toBeNull();
  act(() => jest.advanceTimersByTime(3000)); expect(container.textContent).toContain('Access check'); expect(home()).toBe(false);
  expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
  api.getBillingSnapshot.mockResolvedValue(view(true, 2)); await emit(view(true, 2)); expect(home()).toBe(true);
});
test('malformed DTO and unknown or unavailable policy fail closed', async () => {
  api.initializeBilling.mockResolvedValue({ access: { full: true } }); await mount(); expect(home()).toBe(false);
  api.getBillingBootstrapPolicy.mockRejectedValue(new Error('missing'));
  await act(async () => container.querySelector('button').click()); expect(home()).toBe(false);
});
test('Retry retains original evidence rather than scanning after writers', async () => {
  api.initializeBilling.mockRejectedValueOnce(new Error('not_initialized'));
  await mount(); const original = api.initializeBilling.mock.calls[0][0];
  serializeBillingLegacyEvidence.mockReturnValue('changed-after-writer');
  await act(async () => container.querySelector('button').click());
  expect(api.initializeBilling.mock.calls.at(-1)[0]).toEqual(original);
});
test('paid access without a persisted local decision does not mount writers', async () => {
  api.initializeBilling.mockResolvedValue({ ...view(true), legacy: { status: 'needs_recovery', persisted: false }, access: { full: true, sources: ['storeLifetime'] } });
  await mount(); expect(home()).toBe(false); expect(localStorage.getItem('writer')).toBeNull();
  await emit({ ...view(true, 1), legacy: { status: 'needs_recovery', persisted: true }, access: { full: true, sources: ['storeLifetime'] } });
  expect(home()).toBe(true);
});
test('eligible legacy evidence still allows a session when persistence failed', async () => {
  api.initializeBilling.mockResolvedValue({ ...view(true), legacy: { status: 'eligible', persisted: false } });
  await mount(); expect(home()).toBe(true);
});
test('Retry explicitly refreshes an initialized failed fetch, then late verified access opens Home', async () => {
  api.initializeBilling.mockResolvedValue({ ...view(), issue: 'provider' });
  const fetched = deferred(); api.refreshBilling.mockReturnValue(fetched.promise);
  await mount(); expect(home()).toBe(false);
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Android recovery').click());
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Retry access check').click());
  expect(api.initializeBilling).toHaveBeenCalledTimes(1);
  expect(api.refreshBilling).toHaveBeenCalledWith({ reason: 'user' });
  expect(api.subscribeToBillingUpdates.mock.invocationCallOrder.at(-1)).toBeLessThan(api.refreshBilling.mock.invocationCallOrder[0]);
  act(() => jest.advanceTimersByTime(3000)); expect(home()).toBe(false);
  await emit({ ...view(true, 1), access: { full: true, sources: ['storeLifetime'] } });
  expect(home()).toBe(true);
  await act(async () => fetched.resolve(view(false, 0))); expect(home()).toBe(true);
});
test('StrictMode waits for registered listener and cleans up both effect runs', async () => {
  const registered = deferred();
  api.subscribeToBillingUpdates.mockImplementation(callback => {
    const remove = jest.fn(); listeners.push(callback); removals.push(remove); return { ready: registered.promise, remove };
  });
  await mount(<StrictMode><BillingBootstrap><div>HOME</div></BillingBootstrap></StrictMode>);
  expect(api.initializeBilling).not.toHaveBeenCalled(); expect(removals).toHaveLength(1);
  await act(async () => registered.resolve()); expect(api.initializeBilling).toHaveBeenCalledTimes(1);
  act(() => root.unmount()); root = createRoot(container); expect(removals[0]).toHaveBeenCalledTimes(1);
});
test('lower sequence and retired epochs cannot resurrect access', async () => {
  api.initializeBilling.mockResolvedValue(view(true, 5)); await mount();
  await emit(view(false, 6)); await emit(view(true, 5)); expect(home()).toBe(false);
  const snapshot = deferred(); api.getBillingSnapshot.mockReturnValue(snapshot.promise);
  await emit(view(true, 0, 'process-b')); expect(home()).toBe(false);
  await emit(view(true, 7)); expect(home()).toBe(false);
  await act(async () => snapshot.resolve(view(false, 1, 'process-b')));
  await emit(view(true, 8)); expect(home()).toBe(false);
  await emit(view(true, 2, 'process-b')); expect(home()).toBe(true);
});
test('new epoch preserves established Home until the latest authoritative snapshot revokes access', async () => {
  const writer = jest.spyOn(Storage.prototype, 'setItem');
  api.initializeBilling.mockResolvedValue({ ...view(true, 5, 'local-seal'), legacy: { status: 'eligible', persisted: true } });
  await mount(); expect(home()).toBe(true); expect(writer).toHaveBeenCalledTimes(1);
  const confirm = deferred(); api.getBillingSnapshot.mockReturnValue(confirm.promise);
  await emit({ ...view(true, 0, 'core'), legacy: { status: 'eligible', persisted: true } });
  expect(home()).toBe(true); expect(writer).toHaveBeenCalledTimes(1);
  await act(async () => confirm.resolve({ ...view(true, 1, 'core'), legacy: { status: 'eligible', persisted: true } }));
  expect(home()).toBe(true); expect(writer).toHaveBeenCalledTimes(1);
  const revoked = deferred(); api.getBillingSnapshot.mockReturnValue(revoked.promise);
  await emit(view(false, 0, 'replacement')); expect(home()).toBe(true);
  await act(async () => revoked.resolve(view(false, 1, 'replacement'))); expect(home()).toBe(false);
  await emit(view(true, 100, 'local-seal')); expect(home()).toBe(false);
});
test('IME entry makes no billing bridge call or capture', async () => {
  window.history.replaceState({}, '', '/?view=keyboard'); await mount();
  expect(container.textContent).toBe('IME'); expect(api.getBillingBootstrapPolicy).not.toHaveBeenCalled(); expect(serializeBillingLegacyEvidence).not.toHaveBeenCalled();
});
test.each(['/privacy', '/terms', '/about', '/unknown'])('static route %s mounts no launcher writer or bridge', async path => {
  window.history.replaceState({}, '', path); await mount();
  expect(localStorage.getItem('writer')).toBeNull(); expect(api.getBillingBootstrapPolicy).not.toHaveBeenCalled();
});

