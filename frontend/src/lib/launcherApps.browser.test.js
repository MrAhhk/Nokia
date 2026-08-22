import {
  addBrowserStateListener,
  controlBuiltInBrowser,
  navigateBuiltInBrowser,
  startBuiltInBrowser,
  stopBuiltInBrowser,
  updateBrowserSurfaceBounds,
} from "./launcherApps";

describe("built-in browser bridge", () => {
  beforeEach(() => {
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          startBrowser: jest.fn().mockResolvedValue({ started: true }),
          navigateBrowser: jest.fn().mockResolvedValue({ url: "https://example.com" }),
          controlBrowser: jest.fn().mockResolvedValue({ handled: true }),
          updateBrowserSurfaceBounds: jest.fn().mockResolvedValue({ updated: true }),
          stopBrowser: jest.fn().mockResolvedValue({ stopped: true }),
          addListener: jest.fn().mockResolvedValue({ remove: jest.fn() }),
        },
      },
    };
  });

  afterEach(() => delete window.Capacitor);

  test("forwards browser lifecycle and navigation through LauncherApps", async () => {
    await startBuiltInBrowser({ url: "https://example.com", x: 1, y: 2, width: 3, height: 4 });
    await navigateBuiltInBrowser("https://example.com");
    await controlBuiltInBrowser("back");
    await updateBrowserSurfaceBounds({ x: 5, y: 6, width: 7, height: 8 });
    await stopBuiltInBrowser();

    const plugin = window.Capacitor.Plugins.LauncherApps;
    expect(plugin.startBrowser).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com" }));
    expect(plugin.navigateBrowser).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(plugin.controlBrowser).toHaveBeenCalledWith({ command: "back" });
    expect(plugin.updateBrowserSurfaceBounds).toHaveBeenCalledWith({ x: 5, y: 6, width: 7, height: 8 });
    expect(plugin.stopBrowser).toHaveBeenCalledWith({});
  });

  test("subscribes to browser state with a removable web fallback", async () => {
    const handler = jest.fn();
    const handle = await addBrowserStateListener(handler);
    expect(window.Capacitor.Plugins.LauncherApps.addListener).toHaveBeenCalledWith("browserState", handler);
    expect(handle.remove).toEqual(expect.any(Function));

    delete window.Capacitor;
    const fallback = await addBrowserStateListener(handler);
    await expect(fallback.remove()).resolves.toBeUndefined();
  });
});
