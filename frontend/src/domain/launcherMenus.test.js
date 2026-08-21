import {
  HOME_FOCUS_TARGETS,
  SETTINGS_ITEMS,
  createHomeShortcuts,
  findMatchingApp,
  moveHomeFocus,
  orderDrawerApps,
  resolveHomeShortcut,
  rankSearchResults,
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
    expect(shortcuts.find((shortcut) => shortcut.id === "camera")).toMatchObject({
      action: "built-in-camera",
    });
  });

  test("preserves home shortcut actions when selected by D-pad", () => {
    const shortcuts = createHomeShortcuts(apps);

    expect(resolveHomeShortcut(shortcuts, "phone")).toMatchObject({ action: "default-phone" });
    expect(resolveHomeShortcut(shortcuts, "maps")).toMatchObject({ action: "default-maps" });
    expect(resolveHomeShortcut(shortcuts, "camera")).toMatchObject({ action: "built-in-camera" });
    expect(resolveHomeShortcut(shortcuts, "messages")).toEqual(apps.find((app) => app.id === "messages"));
  });

  test("marks the prioritized Camera drawer item as built-in without changing other apps", () => {
    const ordered = orderDrawerApps(apps);
    expect(ordered.find((item) => (item.displayName || item.name) === "Camera")).toMatchObject({
      action: "built-in-camera",
    });
    expect(ordered.find((item) => (item.displayName || item.name) === "Phone").action).toBeUndefined();
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

  test("cycles every D-pad direction through the selectable home targets", () => {
    expect(HOME_FOCUS_TARGETS).toEqual([
      "search",
      "phone",
      "messages",
      "maps",
      "camera",
    ]);
    expect(moveHomeFocus(1, "right")).toBe(2);
    expect(moveHomeFocus(1, "down")).toBe(2);
    expect(moveHomeFocus(1, "left")).toBe(0);
    expect(moveHomeFocus(1, "up")).toBe(0);
    expect(moveHomeFocus(0, "left")).toBe(4);
    expect(moveHomeFocus(4, "right")).toBe(0);
  });

  test("ranks early name-prefix matches ahead of substring and package matches", () => {
    const results = rankSearchResults([
      { name: "My Phone Tools", packageName: "example.tools" },
      { name: "Contacts", packageName: "com.phone.contacts" },
      { name: "Phone", packageName: "com.android.dialer" },
      { name: "Photos", packageName: "com.photos" },
    ], "ph");

    expect(results.map((item) => item.name)).toEqual([
      "Phone",
      "Photos",
      "My Phone Tools",
      "Contacts",
    ]);
  });
});
