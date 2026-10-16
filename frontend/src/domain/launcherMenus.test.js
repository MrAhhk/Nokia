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
  test("automatic AI selection skips Gmail and remains empty when no AI app is installed", () => {
    const gmail = { id: "gmail", name: "Gmail", packageName: "com.google.android.gm" };
    const chatgpt = { id: "chatgpt", name: "ChatGPT", packageName: "com.openai.chatgpt" };
    const noPreference = { getItem: () => null };

    // Gmail contains the substring 'ai', and comes first in the installed list.
    expect(getDefaultApp("ai", [gmail, chatgpt], noPreference)).toBe(chatgpt);
    expect(getDefaultApp("ai", [gmail], noPreference)).toBeNull();
    const shortcuts = createHomeShortcuts([gmail, chatgpt], noPreference);
    expect(resolveHomeShortcut(shortcuts, "ai")).toBe(chatgpt);
    expect(filterAppsByCategory([gmail, chatgpt], "ai")).toEqual([chatgpt]);
  });

  test("short generic category words cannot relabel unrelated drawer apps", () => {
    const unrelated = [
      { id: "roadmap", name: "Roadmap", packageName: "example.roadmap" },
      { id: "headphones", name: "Headphones", packageName: "example.headphones" },
      { id: "audiobooks", name: "Audiobooks", packageName: "example.audiobooks" },
      { id: "calculus", name: "Calculus", packageName: "example.calculus" },
    ];
    const ordered = orderDrawerApps(unrelated);
    expect(ordered.filter((item) => item.packageName)).toEqual(
      [...unrelated].sort((a, b) => a.name.localeCompare(b.name))
    );
    expect(getDefaultApp("maps", unrelated, { getItem: () => null })).toBeNull();
  });

  test("token matching still recognizes package segments and explicit user choices", () => {
    const ai = { id: "assistant", name: "Assistant", packageName: "example.ai.assistant" };
    const maps = { id: "navigation", name: "Navigation", packageName: "example.maps" };
    const gmail = { id: "gmail", name: "Gmail", packageName: "com.google.android.gm" };
    const noPreference = { getItem: () => null };
    expect(getDefaultApp("ai", [gmail, ai], noPreference)).toBe(ai);
    expect(getDefaultApp("maps", [gmail, maps], noPreference)).toBe(maps);
    // A saved choice is intentional; category heuristics must not silently replace it.
    expect(getDefaultApp("ai", [gmail, ai], { getItem: () => "gmail" })).toBe(gmail);
    // Removing a saved target falls back to a currently installed valid app.
    expect(getDefaultApp("ai", [ai], { getItem: () => "gmail" })).toBe(ai);
  });

  test("unavailable preference storage cannot crash Home or default-app selection", () => {
    const unavailable = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("quota exceeded"); },
    };
    expect(() => createHomeShortcuts(apps, unavailable)).not.toThrow();
    expect(() => setDefaultApp("phone", apps[0], unavailable)).not.toThrow();
  });
  test("orders the reference essentials first without mutating installed apps", () => {
    const original = [...apps];
    const ordered = orderDrawerApps(apps);

    expect(ordered.slice(0, 7).map((app) => app.displayName || app.name)).toEqual([
      "Phone",
      "Contacts",
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
    expect(resolveHomeShortcut(shortcuts, "messages")).toMatchObject({ action: "built-in-messages" });
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
      "Customization",
      "Phone name",
      "Font",
      "Snake",
      "Dumb Mode",
      "Default Launcher",
      "Launcher Settings",
      "Display",
      "Sound",
      "Keyboard",
      "Digital Wellbeing",
      "Review on Google Play",
      "Share with a friend",
      "Privacy",
      "About",
    ]);
    const nativeSettings = SETTINGS_ITEMS
      .filter((item) => item.nativeSetting)
      .map((item) => item.nativeSetting);
    expect(nativeSettings).toEqual([
      "default-launcher",
      "launcher-settings",
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

  test("filters installed apps by category and excludes addictive apps", () => {
    const appsWithAddictive = [
      ...apps,
      { id: "tiktok", name: "TikTok Lite", packageName: "com.zhiliaoapp.musically.go" },
      { id: "snapchat", name: "Snapchat", packageName: "com.snapchat.android" },
      { id: "instagram", name: "Instagram", packageName: "com.instagram.android" },
    ];

    const phoneApps = filterAppsByCategory(appsWithAddictive, "phone");
    expect(phoneApps[0].id).toBe("default-phone");
    expect(phoneApps[0].name).toBe("Built-in Phone");
    expect(phoneApps.some((a) => a.id === "phone")).toBe(true);
    expect(phoneApps.some((a) => a.id === "tiktok")).toBe(false);

    const cameraApps = filterAppsByCategory(appsWithAddictive, "camera");
    expect(cameraApps[0].id).toBe("built-in-camera");
    expect(cameraApps[0].name).toBe("Built-in Camera");
    expect(cameraApps.some((a) => a.id === "camera")).toBe(true);
    expect(cameraApps.some((a) => a.id === "instagram")).toBe(false);

    const messageApps = filterAppsByCategory(appsWithAddictive, "messages");
    expect(messageApps[0].id).toBe("built-in-messages");
    expect(messageApps[0].name).toBe("Built-in Messages");
    expect(messageApps.some((a) => a.id === "zalo")).toBe(true);
    expect(messageApps.some((a) => a.id === "gemini")).toBe(false);
    expect(messageApps.some((a) => a.id === "snapchat")).toBe(false);
    expect(messageApps.some((a) => a.id === "tiktok")).toBe(false);

    const aiApps = filterAppsByCategory(appsWithAddictive, "ai");
    expect(aiApps.map((a) => a.id)).toEqual(["gemini"]);

    const mapApps = filterAppsByCategory(appsWithAddictive, "maps");
    expect(mapApps.map((a) => a.id)).toEqual(["maps", "grab"]);
  });

  test("persists and retrieves user-chosen default apps", () => {
    const mockStorage = {
      data: {},
      getItem(k) { return this.data[k] || null; },
      setItem(k, v) { this.data[k] = String(v); },
    };

    // Before any user choice, falls back to built-in for phone, camera, messages, or first match for AI/maps
    expect(getDefaultApp("phone", apps, mockStorage)?.id).toBe("default-phone");
    expect(getDefaultApp("camera", apps, mockStorage)?.id).toBe("built-in-camera");
    expect(getDefaultApp("messages", apps, mockStorage)?.id).toBe("built-in-messages");
    expect(getDefaultApp("ai", apps, mockStorage)?.id).toBe("gemini");
    expect(getDefaultApp("maps", apps, mockStorage)?.id).toBe("maps");

    // User chooses custom app for phone, camera, messages, AI, and maps
    setDefaultApp("phone", { id: "phone", packageName: "com.android.dialer" }, mockStorage);
    setDefaultApp("camera", { id: "camera", packageName: "com.android.camera2" }, mockStorage);
    setDefaultApp("messages", { id: "zalo", packageName: "com.zing.zalo" }, mockStorage);
    setDefaultApp("ai", { id: "gemini", packageName: "com.google.android.apps.bard" }, mockStorage);
    setDefaultApp("maps", { id: "grab", packageName: "com.grabtaxi.passenger" }, mockStorage);

    expect(getDefaultApp("phone", apps, mockStorage)?.id).toBe("phone");
    expect(getDefaultApp("camera", apps, mockStorage)?.id).toBe("camera");
    expect(getDefaultApp("messages", apps, mockStorage)?.id).toBe("zalo");
    expect(getDefaultApp("ai", apps, mockStorage)?.id).toBe("gemini");
    expect(getDefaultApp("maps", apps, mockStorage)?.id).toBe("grab");

    // Home shortcuts reflect the user-chosen default apps
    const shortcuts = createHomeShortcuts(apps, mockStorage);
    expect(shortcuts.find((s) => s.id === "phone")?.app?.id).toBe("phone");
    expect(shortcuts.find((s) => s.id === "camera")?.app?.id).toBe("camera");
    expect(shortcuts.find((s) => s.id === "messages")?.app?.id).toBe("zalo");
    expect(shortcuts.find((s) => s.id === "ai")?.app?.id).toBe("gemini");
    expect(shortcuts.find((s) => s.id === "maps")?.app?.id).toBe("grab");

    // Switching back to built-in
    setDefaultApp("phone", { id: "default-phone", action: "default-phone" }, mockStorage);
    setDefaultApp("camera", { id: "built-in-camera", action: "built-in-camera" }, mockStorage);
    setDefaultApp("messages", { id: "built-in-messages", action: "built-in-messages" }, mockStorage);
    expect(getDefaultApp("phone", apps, mockStorage)?.id).toBe("default-phone");
    expect(getDefaultApp("camera", apps, mockStorage)?.id).toBe("built-in-camera");
    expect(getDefaultApp("messages", apps, mockStorage)?.id).toBe("built-in-messages");
  });
});
