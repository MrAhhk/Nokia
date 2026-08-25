import { triggerHaptic } from "./launcherApps";

describe("triggerHaptic", () => {
  const originalVibrate = navigator.vibrate;

  afterEach(() => {
    delete window.Capacitor;
    delete window.NokiaIMEBridge;
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: originalVibrate,
    });
  });

  test("uses exactly one available vibration path", async () => {
    const browserVibrate = jest.fn();
    const imeVibrate = jest.fn();
    const pluginVibrate = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: browserVibrate,
    });
    window.NokiaIMEBridge = { triggerHaptic: imeVibrate };
    window.Capacitor = { Plugins: { LauncherApps: { vibrate: pluginVibrate } } };

    await triggerHaptic(65);

    expect(browserVibrate).toHaveBeenCalledWith(65);
    expect(imeVibrate).not.toHaveBeenCalled();
    expect(pluginVibrate).not.toHaveBeenCalled();
  });

  test("caps malformed or excessive patterns before vibration", async () => {
    const browserVibrate = jest.fn();
    Object.defineProperty(navigator, "vibrate", {
      configurable: true,
      value: browserVibrate,
    });

    await triggerHaptic([-5, 50_000, Number.NaN, 20]);

    expect(browserVibrate).toHaveBeenCalledWith([0, 1000, 0, 20]);
  });
});
