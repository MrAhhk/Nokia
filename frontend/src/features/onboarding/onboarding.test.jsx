import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "@/components/NokiaLauncher";
import * as native from "@/lib/launcherApps";
import { ONBOARDING_KEY, TOUR_STEPS } from "./onboardingState";

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => {
  localStorage.clear();
  window.Capacitor = { isNativePlatform: () => true };
  jest.spyOn(native, "getDeviceContacts").mockResolvedValue([]);
  jest.spyOn(native, "getDeviceConversations").mockResolvedValue([]);
  jest.spyOn(native, "getDeviceStatus").mockResolvedValue({});
  jest.spyOn(native, "launchInstalledApp").mockResolvedValue({});
  jest.spyOn(native, "makePhoneCall").mockResolvedValue({});
  jest.spyOn(native, "lockScreen").mockResolvedValue({});
  jest.spyOn(native, "getDumbModeState").mockResolvedValue({ state: "OFF", active: false, revision: 1, blockedIds: [], defaultLauncherAvailable: true });
  jest.spyOn(native, "activateDumbMode").mockResolvedValue({});
  jest.spyOn(native, "openSystemSetting").mockResolvedValue({});
  jest.spyOn(native, "acceptAccessibilityDisclosure").mockResolvedValue({});
  container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete window.Capacitor; jest.restoreAllMocks(); });
const mount = () => act(async () => root.render(<NokiaLauncher apps={[]} />));
const click = selector => act(async () => container.querySelector(selector).click());

test("first launch overlays the real Home and keypad, deferring permission-query work", async () => {
  await mount();
  expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
  expect(container.querySelectorAll('[data-testid="keypad-btn-2"]')).toHaveLength(1);
  expect(container.querySelector('[data-testid="onboarding-guide"]')).not.toBeNull();
  expect(native.getDeviceContacts).not.toHaveBeenCalled();
  expect(native.getDeviceConversations).not.toHaveBeenCalled();
  await click('[data-testid="keypad-btn-2"]');
  expect(container.querySelector('.onboarding-coach').textContent).toContain("dial key");
  expect(container.querySelector('.lcd-dial-number')).toBeNull();
  expect(native.makePhoneCall).not.toHaveBeenCalled();
});
test("skipping persists completion and does not reappear after remount", async () => {
  await mount(); await click('.onboarding-coach__skip');
  expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY)).completed).toBe(true);
  act(() => root.unmount()); root = createRoot(container); await mount();
  expect(container.querySelector('[data-testid="onboarding-guide"]')).toBeNull();
});
test("guide explains accountability, real keys progress and practice stays inert", async () => {
  await mount();
  expect(container.querySelector('.onboarding-coach h2').textContent).toBe("A calmer phone.");
  await click('[data-testid="keypad-btn-select"]');
  expect(container.querySelector('.onboarding-coach').textContent).toContain("No in-app reset");
  expect(container.querySelector('.onboarding-coach').textContent).toContain("eight-digit code");
  await click('.onboarding-coach__next');
  const practice = [...container.querySelectorAll('button')].find(b => b.textContent === 'Try the keys');
  await act(async () => practice.click());
  for (const key of ['2', 'select', '2']) await click(`[data-testid="keypad-btn-${key}"]`);
  expect(container.querySelector('.onboarding-coach h2').textContent).toContain("Your keys.");
  expect(container.querySelector('.lcd-dial-number')).toBeNull();
  expect(native.makePhoneCall).not.toHaveBeenCalled();
  expect(native.launchInstalledApp).not.toHaveBeenCalled();
  expect(native.lockScreen).not.toHaveBeenCalled();
  expect(native.activateDumbMode).not.toHaveBeenCalled();
  expect(native.openSystemSetting).not.toHaveBeenCalled();
});

test("finish goes Home with a dismissible setup card and persists completion", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ schema: 2, stepId: 'setup' }));
  await mount(); await click('.onboarding-coach__next');
  expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY)).completed).toBe(true);
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
  expect(native.activateDumbMode).not.toHaveBeenCalled();
  expect(native.openSystemSetting).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Later').click());
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeNull();
});

test("Home checks require explicit setup; repeated focus does not poll", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ schema: 2, stepId: 'setup' }));
  await mount();
  const initial = native.getDumbModeState.mock.calls.length;
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(native.getDumbModeState).toHaveBeenCalledTimes(initial);
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Set Home app')).click());
  expect(native.openSystemSetting).toHaveBeenCalledWith('default-launcher');
  native.getDumbModeState.mockResolvedValue({ defaultLauncherAvailable: true });
  await act(async () => { window.dispatchEvent(new Event('blur')); window.dispatchEvent(new Event('focus')); });
  expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Start using Nokia Launcher');
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(native.getDumbModeState).toHaveBeenCalledTimes(initial + 1);
});

test("failed Home verification leaves a usable finish and ignores stale reads", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ schema: 2, stepId: 'setup' }));
  await mount();
  native.getDumbModeState.mockRejectedValue(Error('unavailable'));
  const check = () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Check again');
  await act(async () => check().click());
  expect(container.querySelector('.onboarding-coach').textContent).toContain('Couldn’t check Home setup');
  let resolve;
  native.getDumbModeState.mockImplementation(() => new Promise(r => { resolve = r; }));
  await act(async () => check().click());
  await click('.onboarding-coach__footer button');
  await act(async () => resolve({ defaultLauncherAvailable: true }));
  expect(container.querySelector('.onboarding-coach h2').textContent).toBe('Accessibility');
  expect(native.acceptAccessibilityDisclosure).not.toHaveBeenCalled();
  await click('.onboarding-coach__next');
  expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Use for now');
});

test("handoff opens the existing Dumb Mode route only on explicit keypad selection", async () => {
  await mount();
  expect(container.querySelector('[aria-label="Dumb Mode guide"]')).toBeNull();
  await click('.onboarding-coach__skip');
  const action = [...container.querySelectorAll('button')].find(b => b.textContent === 'Set up Dumb Mode');
  expect(action).toBeDefined();
  act(() => action.focus());
  await click('[data-testid="keypad-btn-select"]');
  expect(container.querySelector('[aria-label="Dumb Mode guide"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeNull();
  expect(native.activateDumbMode).not.toHaveBeenCalled();
  expect(native.openSystemSetting).not.toHaveBeenCalled();
});

test("an existing active lock never receives a setup handoff", async () => {
  native.getDumbModeState.mockResolvedValue({ state: 'ACTIVE', active: true, revision: 1, blockedIds: ['snake'] });
  await mount(); await click('.onboarding-coach__skip');
  expect(container.querySelector('[data-testid="onboarding-handoff"]')).toBeNull();
});

test("native setting return verifies once and unsubscribes when the screen exits", async () => {
  let emit; const remove = jest.fn();
  jest.spyOn(native, 'subscribeToSystemSettingReturns').mockImplementation(callback => { emit = callback; return remove; });
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ schema: 2, stepId: 'setup' }));
  await mount();
  const initial = native.getDumbModeState.mock.calls.length;
  await act(async () => emit({ setting: 'default-launcher' }));
  expect(native.getDumbModeState).toHaveBeenCalledTimes(initial);
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('Set Home app')).click());
  native.getDumbModeState.mockResolvedValue({ defaultLauncherAvailable: true });
  await act(async () => { emit({ setting: 'default-launcher' }); emit({ setting: 'default-launcher' }); });
  expect(native.getDumbModeState).toHaveBeenCalledTimes(initial + 1);
  expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Start using Nokia Launcher');
  await click('.onboarding-coach__next');
  expect(remove).toHaveBeenCalledTimes(1);
});

test("finishing defers eligible optional prompts without changing their saved choices", async () => {
  window.Capacitor.Plugins = { LauncherApps: {} };
  const checkIn = { startedAt: Date.now() - 8 * 86400000, shown: false };
  localStorage.setItem('nokia-launcher.week-check-in.v1', JSON.stringify(checkIn));
  await mount(); await click('.onboarding-coach__skip');
  expect(container.querySelector('[data-testid="tone-setup"]')).toBeNull();
  expect(container.querySelector('[data-testid="week-check-in"]')).toBeNull();
  expect(JSON.parse(localStorage.getItem('nokia-launcher.week-check-in.v1'))).toEqual(checkIn);
  expect(localStorage.getItem('nokia-launcher-system-tone-setup.v1')).toBeNull();
});

test("completed users see a default-Home notice only for confirmed false role state", async () => {
  window.Capacitor.Plugins = { LauncherApps: {} };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));
  let emit;
  jest.spyOn(native, 'subscribeToDumbModeUpdates').mockImplementation(callback => { emit = callback; return jest.fn(); });
  const off = { state: 'OFF', active: false, revision: 1, blockedIds: [], mandatoryIds: [] };
  native.getDumbModeState.mockResolvedValue(off);
  await mount();
  expect(container.querySelector('[data-testid="default-launcher-notice"]')).toBeNull();
  await act(async () => emit({ ...off, defaultLauncherAvailable: false }));
  expect(container.querySelector('[data-testid="default-launcher-notice"]')).not.toBeNull();
  await click('[data-testid="keypad-btn-select"]');
  expect(native.openSystemSetting).toHaveBeenCalledWith('default-launcher');
  expect(native.getDumbModeState).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-testid="tone-setup"]')).toBeNull();
  await act(async () => emit({ ...off, defaultLauncherAvailable: true }));
  expect(container.querySelector('[data-testid="default-launcher-notice"]')).toBeNull();
  expect(container.querySelector('[data-testid="tone-setup"]')).toBeNull();
  expect(localStorage.getItem('nokia-launcher-system-tone-setup.v1')).toBeNull();
});

test("Later dismisses the Home notice for this session, including further Home returns", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));
  native.getDumbModeState.mockResolvedValue({ state: 'OFF', active: false, revision: 1, blockedIds: [], defaultLauncherAvailable: false });
  await mount();
  await act(async () => container.querySelector('[data-notice-dismiss]').click());
  await act(async () => window.dispatchEvent(new Event('nokia-home-request')));
  expect(container.querySelector('[data-testid="default-launcher-notice"]')).toBeNull();
  expect(native.getDumbModeState).toHaveBeenCalledTimes(1);
});

test("failed opening remains actionable and red can dismiss the Home notice", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));
  native.getDumbModeState.mockResolvedValue({ state: 'OFF', active: false, revision: 1, blockedIds: [], defaultLauncherAvailable: false });
  native.openSystemSetting.mockRejectedValue(Error('unavailable'));
  await mount(); await click('[data-testid="keypad-btn-select"]');
  expect(container.querySelector('[data-testid="default-launcher-notice"]').textContent).toContain('Couldn’t open settings');
  expect(container.querySelector('[data-testid="default-launcher-notice"] button').disabled).toBe(false);
  await click('[aria-label="Home"]');
  expect(container.querySelector('[data-testid="default-launcher-notice"]')).toBeNull();
});
