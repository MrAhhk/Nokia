import {
  SETTINGS_ITEMS,
  createHomeShortcuts,
  findMatchingApp,
  orderDrawerApps,
} from "./launcherMenus";

const apps = [
  { id: "calculator", name: "Calculator" },
  { id: "camera", name: "Camera" },
  { id: "music", name: "Music" },
  { id: "maps", name: "Maps" },
  { id: "messages", name: "Messages" },
  { id: "phone", name: "Phone" },
  { id: "calendar", name: "Calendar" },
];

describe("launcher menu models", () => {
  test("orders the reference essentials first without mutating installed apps", () => {
    const original = [...apps];
    const ordered = orderDrawerApps(apps);

    expect(ordered.slice(0, 6).map((app) => app.displayName || app.name)).toEqual([
      "Phone",
      "Messages",
      "Maps",
      "Camera",
      "Music",
      "Calculator",
    ]);
    expect(apps).toEqual(original);
  });

  test("resolves home shortcuts against app names and package names", () => {
    const shortcuts = createHomeShortcuts(apps);

    expect(shortcuts.map((shortcut) => shortcut.label)).toEqual([
      "Phone",
      "Messages",
      "Maps",
      "Camera",
    ]);
    expect(shortcuts.every((shortcut) => shortcut.app)).toBe(true);
  });

  test("finds settings-like apps and keeps the settings model finite", () => {
    expect(findMatchingApp([{ name: "System", packageName: "com.android.settings" }], ["settings"]))
      .toEqual({ name: "System", packageName: "com.android.settings" });
    expect(SETTINGS_ITEMS.map((item) => item.label)).toEqual([
      "Display",
      "Sound",
      "Keyboard",
      "Digital Wellbeing",
      "Privacy",
    ]);
  });
});
