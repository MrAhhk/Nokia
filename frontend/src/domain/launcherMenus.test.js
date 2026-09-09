import {
  HOME_FOCUS_TARGETS,
  SETTINGS_ITEMS,
  createHomeShortcuts,
  filterAppsByCategory,
  findMatchingApp,
  getDefaultApp,
  moveHomeFocus,
  moveListSelection,
  orderDrawerApps,
  rankSearchResults,
  resolveHomeShortcut,
  resolveSettingAction,
  setDefaultApp,
} from "./launcherMenus";

const apps = [
  { id: "calculator", name: "Calculator" },
  { id: "camera", name: "Camera" },
  { id: "music", name: "Music" },
  { id: "maps", name: "Maps", packageName: "com.google.android.apps.maps" },
  { id: "grab", name: "Grab", packageName: "com.grabtaxi.passenger" },
  { id: "messages", name: "Messages", packageName: "com.android.mms" },
  { id: "zalo", name: "Zalo", packageName: "com.zing.zalo" },
  { id: "whatsapp", name: "WhatsApp", packageName: "com.whatsapp" },
  { id: "phone", name: "Phone" },
  { id: "calendar", name: "Calendar" },
  { id: "gemini", name: "Gemini", packageName: "com.google.android.apps.bard" },
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
      "ChatGPT",
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
      "Snake",
      "Default Launcher",
      "Display",
      "Sound",
      "Keyboard",
      "Digital Wellbeing",
      "Privacy",
      "About",
    ]);
    const nativeSettings = SETTINGS_ITEMS
      .filter((item) => item.nativeSetting)
      .map((item) => item.nativeSetting);
    expect(nativeSettings).toEqual([
      "default-launcher",
      "display",
      "keyboard",
      "digital-wellbeing",
    ]);
    expect(new Set(nativeSettings).size).toBe(nativeSettings.length);
  });

  test("routes Snake and Sound to built-in features", () => {
    const snake = SETTINGS_ITEMS.find((item) => item.id === "snake");
    const sound = SETTINGS_ITEMS.find((item) => item.id === "sound");
    expect(resolveSettingAction(snake)).toEqual({ type: "internal-feature", view: "snake" });
    expect(resolveSettingAction(sound)).toEqual({ type: "internal-feature", view: "sound" });
  });

  test("routes Privacy and About to their published Notion pages", () => {
    const privacy = SETTINGS_ITEMS.find((item) => item.id === "privacy");
    const about = SETTINGS_ITEMS.find((item) => item.id === "about");

    expect(resolveSettingAction(privacy)).toEqual({
      type: "web-url",
      url: "https://fallacious-output-8b6.notion.site/Nokia-Launcher-Privacy-Policy-3c1dbed9c25a819fb2d7cff96ad2d894",
    });
    expect(resolveSettingAction(about)).toEqual({
      type: "web-url",
      url: "https://fallacious-output-8b6.notion.site/Nokia-Launcher-About-33adbed9c25a80098f08c81650ea37f8",
    });
  });

  test("cycles every D-pad direction through the selectable home targets", () => {
    expect(HOME_FOCUS_TARGETS).toEqual([
      "clock",
      "search",
      "phone",
      "messages",
      "ai",
      "maps",
      "camera",
    ]);
    expect(moveHomeFocus(2, "right")).toBe(3);
    expect(moveHomeFocus(2, "down")).toBe(3);
    expect(moveHomeFocus(2, "left")).toBe(1);
    expect(moveHomeFocus(2, "up")).toBe(1);
    expect(moveHomeFocus(0, "left")).toBe(6);
    expect(moveHomeFocus(6, "right")).toBe(0);
  });

  test("recovers list navigation immediately from stale out-of-range selections", () => {
    expect(moveListSelection(4, 2, "up")).toBe(1);
    expect(moveListSelection(4, 2, "down")).toBe(0);
    expect(moveListSelection(0, 2, "up")).toBe(1);
    expect(moveListSelection(1, 2, "down")).toBe(0);
    expect(moveListSelection(3, 0, "down")).toBe(0);
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

  test("filters installed apps by category for messages, ai, and maps", () => {
    const messageApps = filterAppsByCategory(apps, "messages");
    expect(messageApps.map((a) => a.id)).toEqual(["messages", "zalo", "whatsapp"]);

    const aiApps = filterAppsByCategory(apps, "ai");
    expect(aiApps.map((a) => a.id)).toEqual(["gemini"]);

    const mapApps = filterAppsByCategory(apps, "maps");
    expect(mapApps.map((a) => a.id)).toEqual(["maps", "grab"]);
  });

  test("persists and retrieves user-chosen default apps", () => {
    const mockStorage = {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = String(v); },
    };

    // Before any user choice, falls back to first match
    expect(getDefaultApp("messages", apps, mockStorage)?.id).toBe("messages");
    expect(getDefaultApp("ai", apps, mockStorage)?.id).toBe("gemini");
    expect(getDefaultApp("maps", apps, mockStorage)?.id).toBe("maps");

    // User chooses Zalo for messages, Gemini for AI, and Grab for maps
    setDefaultApp("messages", { id: "zalo", packageName: "com.zing.zalo" }, mockStorage);
    setDefaultApp("ai", { id: "gemini", packageName: "com.google.android.apps.bard" }, mockStorage);
    setDefaultApp("maps", { id: "grab", packageName: "com.grabtaxi.passenger" }, mockStorage);

    expect(getDefaultApp("messages", apps, mockStorage)?.id).toBe("zalo");
    expect(getDefaultApp("ai", apps, mockStorage)?.id).toBe("gemini");
    expect(getDefaultApp("maps", apps, mockStorage)?.id).toBe("grab");

    // Home shortcuts reflect the user-chosen default apps
    const shortcuts = createHomeShortcuts(apps, mockStorage);
    expect(shortcuts.find((s) => s.id === "messages")?.app?.id).toBe("zalo");
    expect(shortcuts.find((s) => s.id === "ai")?.app?.id).toBe("gemini");
    expect(shortcuts.find((s) => s.id === "maps")?.app?.id).toBe("grab");
  });
});
