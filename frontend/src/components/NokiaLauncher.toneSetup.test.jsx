import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";

global.IS_REACT_ACT_ENVIRONMENT = true;

const createNativePlugin = ({ granted = false } = {}) => ({
  getDeviceStatus: jest.fn().mockResolvedValue({ batteryLevel: 80 }),
  getSystemToneAccess: jest.fn().mockResolvedValue({ supported: true, granted }),
  requestSystemToneAccess: jest.fn().mockResolvedValue({ opened: true, supported: true }),
  applySystemTone: jest.fn().mockResolvedValue({ success: true }),
  vibrate: jest.fn().mockResolvedValue({}),
});

const mountLauncher = async (plugin) => {
  window.Capacitor = { Plugins: { LauncherApps: plugin } };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<NokiaLauncher apps={[]} />));
  return { container, root };
};

describe("first launch system-tone setup", () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => {
    delete window.Capacitor;
    document.body.innerHTML = "";
  });

  test("asks once without opening Android access until the user accepts", async () => {
    const plugin = createNativePlugin();
    const { container, root } = await mountLauncher(plugin);

    expect(container.textContent).toContain("A familiar sound.");
    expect(container.textContent).toContain("Calls");
    expect(container.textContent).toContain("Messages");
    expect(container.textContent).toContain("Alarms");
    expect(plugin.requestSystemToneAccess).not.toHaveBeenCalled();

    await act(async () => container.querySelector('[data-tone-choice="accept"]').click());

    expect(plugin.requestSystemToneAccess).toHaveBeenCalledTimes(1);
    expect(plugin.applySystemTone).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("applies ringtone, notification, and alarm after one existing grant", async () => {
    const plugin = createNativePlugin({ granted: true });
    const { container, root } = await mountLauncher(plugin);

    await act(async () => container.querySelector('[data-tone-choice="accept"]').click());

    expect(plugin.requestSystemToneAccess).not.toHaveBeenCalled();
    expect(plugin.applySystemTone.mock.calls.map(([payload]) => payload.toneType)).toEqual([
      "ringtone",
      "notification",
      "alarm",
    ]);
    expect(container.textContent).not.toContain("A familiar sound.");
    act(() => root.unmount());
  });

  test("Not now is remembered and the setup does not return", async () => {
    const plugin = createNativePlugin();
    const first = await mountLauncher(plugin);
    await act(async () => first.container.querySelector('[data-tone-choice="skip"]').click());
    act(() => first.root.unmount());

    const second = await mountLauncher(plugin);
    expect(second.container.textContent).not.toContain("A familiar sound.");
    expect(plugin.requestSystemToneAccess).not.toHaveBeenCalled();
    act(() => second.root.unmount());
  });
});
