import { isDumbModeBlocked, visibleDumbModeApps, dumbModeSettingLabel } from "./dumbModeVisibility";

const apps = [{ id: "p.game/A", packageName: "p.game" }, { id: "p.game/B", packageName: "p.game" }, { id: "p.tools/A", packageName: "p.tools" }];
const active = { state: "ACTIVE", active: true, blockedIds: ["p.game", "snake"] };
test("all activities of a blocked package disappear; category alone is not guessed", () => {
  expect(visibleDumbModeApps(apps, active)).toEqual([apps[2]]);
  expect(isDumbModeBlocked({ packageName: "com.example.tiktok" }, active)).toBe(false);
});
test("interrupted enforcement retains visibility policy, unlock restores apps", () => {
  expect(visibleDumbModeApps(apps, { ...active, state: "DEGRADED" })).toEqual([apps[2]]);
  expect(visibleDumbModeApps(apps, { ...active, active: false })).toEqual(apps);
  expect(dumbModeSettingLabel({ ...active, state: "DEGRADED" })).toContain("Interrupted");
});
test("pending native load cannot flash installed apps or Snake; builtins remain usable", () => {
  const loading = { state: "LOADING" };
  expect(visibleDumbModeApps(apps, loading)).toEqual([]);
  expect(isDumbModeBlocked({ id: "snake" }, loading)).toBe(true);
  expect(isDumbModeBlocked({ id: "contacts" }, loading)).toBe(false);
});
test("wrapped Home defaults use package identity", () => {
  expect(isDumbModeBlocked({ id: "ai", app: apps[0] }, active)).toBe(true);
});
