const getDisplayName = (item) =>
  item?.displayName || item?.name || item?.label || item?.title || item?.packageName || "";

const getSearchText = (item) =>
  `${getDisplayName(item)} ${item?.packageName || ""}`.toLowerCase();

const HOME_SHORTCUT_DEFINITIONS = [
  { id: "phone", label: "Phone", matches: ["phone", "dialer"], action: "default-phone" },
  { id: "messages", label: "Messages", matches: ["messages", "messaging", "sms"] },
  { id: "ai", label: "ChatGPT", matches: ["chatgpt", "openai", "copilot", "gemini", "claude", "ai"] },
  { id: "maps", label: "Maps", matches: ["maps", "map"], action: "default-maps" },
  { id: "camera", label: "Camera", matches: ["camera"], action: "built-in-camera" },
];

export const HOME_FOCUS_TARGETS = Object.freeze([
  "clock",
  "search",
  ...HOME_SHORTCUT_DEFINITIONS.map(({ id }) => id),
]);

export const moveHomeFocus = (currentIndex, direction) => {
  const lastIndex = HOME_FOCUS_TARGETS.length - 1;
  const normalizedIndex = Math.min(Math.max(currentIndex, 0), lastIndex);

  if (direction === "left" || direction === "up") {
    return normalizedIndex > 0 ? normalizedIndex - 1 : lastIndex;
  }
  if (direction === "right" || direction === "down") {
    return normalizedIndex < lastIndex ? normalizedIndex + 1 : 0;
  }
  return normalizedIndex;
};

const DRAWER_PRIORITY = [
  { label: "Phone", matches: ["phone", "dialer"] },
  { label: "Messages", matches: ["messages", "messaging", "sms"] },
  { label: "Maps", matches: ["maps", "map"] },
  { label: "Camera", matches: ["camera"], action: "built-in-camera" },
  { label: "Music", matches: ["music", "spotify", "audio"] },
  { label: "Calculator", matches: ["calculator", "calc"] },
];

export const SETTINGS_ITEMS = Object.freeze([
  { id: "snake", label: "Snake", internalView: "snake" },
  { id: "default-launcher", label: "Default Launcher", nativeSetting: "default-launcher" },
  { id: "display", label: "Display", nativeSetting: "display" },
  { id: "sound", label: "Sound", internalView: "sound" },
  { id: "keyboard", label: "Keyboard", nativeSetting: "keyboard" },
  { id: "digital-wellbeing", label: "Digital Wellbeing", nativeSetting: "digital-wellbeing" },
  {
    id: "privacy",
    label: "Privacy",
    url: "https://fallacious-output-8b6.notion.site/Nokia-Launcher-Privacy-Policy-3c1dbed9c25a819fb2d7cff96ad2d894",
  },
  {
    id: "about",
    label: "About",
    url: "https://fallacious-output-8b6.notion.site/Nokia-Launcher-About-33adbed9c25a80098f08c81650ea37f8",
  },
]);

export const resolveSettingAction = (setting) => {
  if (!setting) return null;
  if (setting.internalView) return { type: "internal-feature", view: setting.internalView };
  if (setting.url) return { type: "web-url", url: setting.url };
  if (setting.nativeSetting) {
    return { type: "system-setting", setting: setting.nativeSetting };
  }
  return null;
};

export const DEFAULT_MESSAGES_APP_KEY = "nokia-launcher.default-app.messages";
export const DEFAULT_AI_APP_KEY = "nokia-launcher.default-app.ai";
export const DEFAULT_MAPS_APP_KEY = "nokia-launcher.default-app.maps";

export const MESSAGE_APP_KEYWORDS = [
  "message", "messaging", "sms", "mms",
  "chat", "messenger", "zalo", "telegram",
  "whatsapp", "viber", "discord", "signal",
  "wechat", "line", "skype", "tin nhắn"
];

export const AI_APP_KEYWORDS = [
  "chatgpt", "openai", "claude", "copilot", "gemini",
  "poe", "perplexity", "monica", "deepseek", "qwen",
  "grok", "character.ai", "ai"
];

export const MAPS_APP_KEYWORDS = [
  "map", "maps", "navigation", "bản đồ",
  "gps", "waze", "grab", "here wego", "transit"
];

export const filterAppsByCategory = (apps, category) => {
  if (!Array.isArray(apps)) return [];
  const keywords = category === "maps"
    ? MAPS_APP_KEYWORDS
    : category === "ai"
      ? AI_APP_KEYWORDS
      : MESSAGE_APP_KEYWORDS;
  const filtered = apps.filter((app) => {
    const text = `${app.name || ""} ${app.displayName || ""} ${app.packageName || ""}`.toLowerCase();
    return keywords.some((k) => text.includes(k));
  });
  return filtered.length > 0 ? filtered : apps;
};

export const getDefaultApp = (category, apps, storage = typeof window !== "undefined" ? window.localStorage : null) => {
  if (!Array.isArray(apps) || apps.length === 0) return null;
  const key = category === "maps"
    ? DEFAULT_MAPS_APP_KEY
    : category === "ai"
      ? DEFAULT_AI_APP_KEY
      : DEFAULT_MESSAGES_APP_KEY;
  const savedId = storage ? storage.getItem(key) : null;
  if (savedId) {
    const matched = apps.find((app) => app.id === savedId || app.packageName === savedId);
    if (matched) return matched;
  }
  const matches = category === "maps"
    ? ["maps", "map"]
    : category === "ai"
      ? ["chatgpt", "openai", "copilot", "gemini", "claude", "ai"]
      : ["messages", "messaging", "sms"];
  return findMatchingApp(apps, matches) || null;
};

export const setDefaultApp = (category, app, storage = typeof window !== "undefined" ? window.localStorage : null) => {
  if (!storage || !app) return;
  const key = category === "maps"
    ? DEFAULT_MAPS_APP_KEY
    : category === "ai"
      ? DEFAULT_AI_APP_KEY
      : DEFAULT_MESSAGES_APP_KEY;
  storage.setItem(key, app.id || app.packageName);
};

export const findMatchingApp = (apps, matches) =>
  apps.find((app) => {
    const searchable = getSearchText(app);
    return matches.some((match) => searchable.includes(match));
  });

export const createHomeShortcuts = (apps, storage = typeof window !== "undefined" ? window.localStorage : null) =>
  HOME_SHORTCUT_DEFINITIONS.map((shortcut) => {
    if (shortcut.id === "messages") {
      return {
        ...shortcut,
        app: getDefaultApp("messages", apps, storage),
      };
    }
    if (shortcut.id === "ai") {
      return {
        ...shortcut,
        app: getDefaultApp("ai", apps, storage),
      };
    }
    if (shortcut.id === "maps") {
      return {
        ...shortcut,
        app: getDefaultApp("maps", apps, storage),
      };
    }
    return {
      ...shortcut,
      app: findMatchingApp(apps, shortcut.matches),
    };
  });

export const resolveHomeShortcut = (shortcuts, targetId) => {
  const shortcut = shortcuts.find((item) => item.id === targetId);
  if (!shortcut) return null;
  return shortcut.action ? shortcut : shortcut.app;
};

export const moveListSelection = (currentIndex, itemCount, direction) => {
  if (itemCount <= 0) return 0;
  if (currentIndex < 0 || currentIndex >= itemCount) {
    return direction === "up" ? itemCount - 1 : 0;
  }
  if (direction === "up") return currentIndex > 0 ? currentIndex - 1 : itemCount - 1;
  if (direction === "down") return currentIndex < itemCount - 1 ? currentIndex + 1 : 0;
  return currentIndex;
};

export const rankSearchResults = (items, query) => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return items;

  return items
    .map((item, index) => {
      const name = getDisplayName(item).toLowerCase();
      const packageName = (item?.packageName || "").toLowerCase();
      let rank = Number.POSITIVE_INFINITY;
      if (name.startsWith(normalizedQuery)) rank = 0;
      else if (name.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) rank = 1;
      else if (name.includes(normalizedQuery)) rank = 2;
      else if (packageName.includes(normalizedQuery)) rank = 3;
      return { item, index, rank };
    })
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ item }) => item);
};

export const orderDrawerApps = (apps) => {
  const remaining = [...apps];
  const prioritized = [];

  DRAWER_PRIORITY.forEach(({ label, matches, action }) => {
    const matchIndex = remaining.findIndex((app) => {
      const searchable = getSearchText(app);
      return matches.some((match) => searchable.includes(match));
    });

    if (matchIndex >= 0) {
      prioritized.push({
        ...remaining.splice(matchIndex, 1)[0],
        displayName: label,
        ...(action ? { action } : {}),
      });
    }
  });

  remaining.sort((left, right) =>
    getDisplayName(left).localeCompare(getDisplayName(right), undefined, {
      sensitivity: "base",
    })
  );

  return [...prioritized, ...remaining];
};
