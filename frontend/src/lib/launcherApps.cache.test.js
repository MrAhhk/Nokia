import { getCachedInstalledApps } from "./launcherApps";

describe("installed app startup cache", () => {
  afterEach(() => window.localStorage.clear());

  test("restores the last known app list synchronously", () => {
    const apps = [{ id: "phone", packageName: "com.example.phone" }];
    window.localStorage.setItem("nokia-launcher.installed-apps.v1", JSON.stringify(apps));

    expect(getCachedInstalledApps()).toEqual(apps);
  });

  test("ignores corrupt cache data instead of blocking launcher render", () => {
    window.localStorage.setItem("nokia-launcher.installed-apps.v1", "not-json");

    expect(getCachedInstalledApps()).toEqual([]);
  });
});
