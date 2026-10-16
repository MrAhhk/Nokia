import { openAppRemovalSettings } from "./launcherApps";

afterEach(() => { delete window.Capacitor; });

test("app removal opens native app settings for the exact package", async () => {
  const open = jest.fn().mockResolvedValue({ opened: true });
  window.Capacitor = { Plugins: { LauncherApps: { openAppRemovalSettings: open } } };
  await expect(openAppRemovalSettings({ id: "display-id", packageName: "org.example.target" })).resolves.toEqual({ opened: true });
  expect(open).toHaveBeenCalledWith({ packageName: "org.example.target" });
});

test("app removal rejects when the native method is missing", async () => {
  window.Capacitor = { Plugins: { LauncherApps: {} } };
  await expect(openAppRemovalSettings({ packageName: "org.example.target" })).rejects.toThrow("app_removal_unavailable");
});

test("app removal rejects a missing package without invoking native settings", async () => {
  const open = jest.fn();
  window.Capacitor = { Plugins: { LauncherApps: { openAppRemovalSettings: open } } };
  await expect(openAppRemovalSettings({ id: "display-id" })).rejects.toThrow("app_removal_unavailable");
  expect(open).not.toHaveBeenCalled();
});
