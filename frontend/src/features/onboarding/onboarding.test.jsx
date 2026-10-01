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
test("guided selection uses the real picker and saves without launching or sending", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ index: TOUR_STEPS.findIndex(step => step.id === "defaults") }));
  await mount(); await click('.onboarding-coach__action');
  expect(container.querySelector('[data-testid="screen-messages-picker"]')).not.toBeNull();
  await click('[data-testid="keypad-btn-select"]');
  expect(localStorage.getItem('nokia-launcher.default-app.messages')).toBeTruthy();
  expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
  expect(container.querySelector('.onboarding-coach h2').textContent).toBe("Only what you use.");
  expect(native.launchInstalledApp).not.toHaveBeenCalled();
  expect(native.getDeviceConversations).not.toHaveBeenCalled();
});
test("finish persists completion just like skip", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ index: TOUR_STEPS.length - 1 }));
  await mount(); await click('.onboarding-coach__next');
  expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY)).completed).toBe(true);
});

test("Android Home exits the guided picker without letting keys launch apps", async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ index: TOUR_STEPS.findIndex(step => step.id === "defaults") }));
  await mount(); await click('.onboarding-coach__action');
  await act(async () => window.dispatchEvent(new Event('nokia-home-request')));
  await click('[data-testid="keypad-btn-select"]');
  expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
  expect(container.querySelector('.onboarding-coach--choosing')).toBeNull();
  expect(native.launchInstalledApp).not.toHaveBeenCalled();
});
