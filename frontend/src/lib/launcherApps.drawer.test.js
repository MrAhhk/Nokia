describe("native drawer recovery", () => {
  const app = { id: "example/Main", name: "Example", packageName: "example", activityName: "Main" };
  let api;
  let query;
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    query = jest.fn();
    window.Capacitor = { isNativePlatform: () => true, Plugins: { LauncherApps: { getInstalledApps: query } } };
    api = require("./launcherApps");
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { delete window.Capacitor; jest.restoreAllMocks(); jest.useRealTimers(); });
  test("a failed query preserves real cached apps and allows the next query to recover", async () => {
    localStorage.setItem("nokia-launcher.installed-apps.v1", JSON.stringify([app]));
    query.mockRejectedValueOnce(new Error("provider_busy")).mockResolvedValueOnce({ apps: [app] });
    expect(await api.getInstalledApps()).toEqual([app]);
    expect(await api.getInstalledApps()).toEqual([app]);
    expect(query).toHaveBeenCalledTimes(2);
  });
  test("an empty native list never becomes unlaunchable demo apps", async () => {
    query.mockResolvedValue({ apps: [] });
    expect(await api.getInstalledApps()).toEqual([]);
    expect(api.getCachedInstalledApps()).toEqual([]);
  });
  test("native startup discards demo and malformed cached rows", () => {
    localStorage.setItem("nokia-launcher.installed-apps.v1", JSON.stringify([null, {}, { id: "youtube" }, app]));
    expect(api.getCachedInstalledApps()).toEqual([app]);
  });
  test("package events refresh immediately without time-based polling", async () => {
    jest.useFakeTimers();
    let changed;
    window.Capacitor.Plugins.LauncherApps.addListener = jest.fn((name, callback) => {
      expect(name).toBe("installedAppsChanged"); changed = callback;
      return { remove: jest.fn() };
    });
    const notify = jest.fn();
    const unsubscribe = api.subscribeToInstalledAppsUpdates(notify);
    query.mockResolvedValueOnce({ apps: [app] }).mockResolvedValueOnce({ apps: [] });
    expect(await api.getInstalledApps()).toEqual([app]);
    expect(await api.getInstalledApps()).toEqual([app]);
    expect(query).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_001);
    expect(await api.getInstalledApps()).toEqual([app]);
    changed({});
    expect(notify).toHaveBeenCalledTimes(1);
    expect(await api.getInstalledApps()).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  test("a package event during a pending query discards its stale result", async () => {
    let changed, finish;
    window.Capacitor.Plugins.LauncherApps.addListener = (_, cb) => { changed = cb; return {remove(){}}; };
    const off = api.subscribeToInstalledAppsUpdates(() => {});
    query.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({apps: []});
    const pending = api.getInstalledApps();
    changed({});
    finish({apps: [app]});
    expect(await pending).toEqual([]);
    expect(await api.getInstalledApps()).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
    off();
  });
});
