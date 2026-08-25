import {
  applySystemTone,
  getSystemToneAccess,
  requestSystemToneAccess,
} from "./launcherApps";

describe("system tone bridge", () => {
  beforeEach(() => {
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          getSystemToneAccess: jest.fn().mockResolvedValue({ supported: true, granted: false }),
          requestSystemToneAccess: jest.fn().mockResolvedValue({ opened: true }),
          applySystemTone: jest.fn().mockResolvedValue({ success: true }),
        },
      },
    };
  });

  afterEach(() => delete window.Capacitor);

  test("forwards the single access request and selected tone", async () => {
    await expect(getSystemToneAccess()).resolves.toEqual({ supported: true, granted: false });
    await requestSystemToneAccess();
    await applySystemTone("ringtone", "./sounds/modern/nokia_tune_series30.mp3", "Nokia 3310 Remaster");

    const plugin = window.Capacitor.Plugins.LauncherApps;
    expect(plugin.requestSystemToneAccess).toHaveBeenCalledWith({});
    expect(plugin.applySystemTone).toHaveBeenCalledWith({
      toneType: "ringtone",
      assetPath: "./sounds/modern/nokia_tune_series30.mp3",
      title: "Nokia 3310 Remaster",
    });
  });
});
