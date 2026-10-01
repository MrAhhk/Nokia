const getDisplayName = (item) =>
  item?.displayName || item?.name || item?.label || item?.title || item?.packageName || "";

const getSearchText = (item) =>
  `${getDisplayName(item)} ${item?.packageName || ""}`.toLowerCase();

const HOME_SHORTCUT_DEFINITIONS = [
  { id: "phone", label: "Phone", matches: ["phone", "dialer"], action: "default-phone" },
  { id: "messages", label: "Messages", matches: ["messages", "messaging", "sms"], action: "built-in-messages" },
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
  { label: "Contacts", matches: ["contacts", "danh bạ"], action: "contacts" },
  { label: "Messages", matches: ["messages", "messaging", "sms"] },
  { label: "Maps", matches: ["maps", "map"] },
  { label: "Camera", matches: ["camera"], action: "built-in-camera" },
  { label: "Music", matches: ["music", "spotify", "audio"] },
  { label: "Calculator", matches: ["calculator", "calc"] },
];

export const SETTINGS_ITEMS = Object.freeze([
  { id: "customization", label: "Customization", internalView: "customization" },
  { id: "snake", label: "Snake", internalView: "snake" },
  { id: "dumb-mode", label: "Dumb Mode", internalView: "dumb-mode" },
  { id: "default-launcher", label: "Default Launcher", nativeSetting: "default-launcher" },
  { id: "launcher-settings", label: "Launcher Settings", nativeSetting: "launcher-settings" },
  { id: "display", label: "Display", nativeSetting: "display" },
  { id: "sound", label: "Sound", internalView: "sound" },
  { id: "keyboard", label: "Keyboard", nativeSetting: "keyboard" },
  { id: "digital-wellbeing", label: "Digital Wellbeing", nativeSetting: "digital-wellbeing" },
  { id: "review-app", label: "Review on Google Play", appAction: "review" },
  { id: "share-app", label: "Share with a friend", appAction: "share" },
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
  if (setting.appAction === "review" || setting.appAction === "share") return { type: "app-action", action: setting.appAction };
  if (setting.internalView) return { type: "internal-feature", view: setting.internalView };
  if (setting.url) return { type: "web-url", url: setting.url };
  if (setting.nativeSetting) {
    return { type: "system-setting", setting: setting.nativeSetting };
  }
  return null;
};

export const DEFAULT_PHONE_APP_KEY = "nokia-launcher.default-app.phone";
export const DEFAULT_MESSAGES_APP_KEY = "nokia-launcher.default-app.messages";
export const DEFAULT_AI_APP_KEY = "nokia-launcher.default-app.ai";
export const DEFAULT_MAPS_APP_KEY = "nokia-launcher.default-app.maps";
export const DEFAULT_CAMERA_APP_KEY = "nokia-launcher.default-app.camera";

export const BUILTIN_PHONE_APP = Object.freeze({
  id: "default-phone",
  name: "Built-in Phone",
  action: "default-phone",
});

export const BUILTIN_RECENT_CALLS_APP = Object.freeze({
  id: "recent-calls",
  name: "Recent Calls",
  action: "recent-calls",
});

export const BUILTIN_CONTACTS_APP = Object.freeze({
  id: "contacts",
  name: "Contacts",
  action: "contacts",
});

export const BUILTIN_MESSAGES_APP = Object.freeze({
  id: "built-in-messages",
  name: "Built-in Messages",
  action: "built-in-messages",
});

export const BUILTIN_CAMERA_APP = Object.freeze({
  id: "built-in-camera",
  name: "Built-in Camera",
  action: "built-in-camera",
});

export const ADDICTIVE_APP_KEYWORDS = [
  "tiktok", "musically", "instagram", "snapchat", "threads",
  "likee", "kwai", "bereal", "pinterest", "douyin", "trill"
];

export const isAddictiveApp = (app) => {
  if (!app) return false;
  const name = (app.name || "").toLowerCase();
  const displayName = (app.displayName || "").toLowerCase();
  const pkg = (app.packageName || "").toLowerCase();
  return ADDICTIVE_APP_KEYWORDS.some(
    (k) => name.includes(k) || displayName.includes(k) || pkg.includes(k)
  );
};

export const matchesKeyword = (text, keyword) => {
  if (keyword === "call") {
    return /\bcall/i.test(text) || /truedialer|truecaller/i.test(text);
  }
  if (keyword === "chat") {
    return /\bchat\b/i.test(text) || /wechat/i.test(text);
  }
  return text.includes(keyword);
};

export const PHONE_APP_KEYWORDS = [
  "phone", "dialer", "call", "điện thoại", "cuộc gọi", "truedialer"
];

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

export const CAMERA_APP_KEYWORDS = [
  "camera", "máy ảnh", "cam", "chụp ảnh", "photocamera"
];

export const filterAppsByCategory = (apps, category) => {
  if (category === "phone") {
    const list = Array.isArray(apps) ? apps.filter((app) => {
      if (isAddictiveApp(app)) return false;
      const text = `${app.name || ""} ${app.displayName || ""} ${app.packageName || ""}`.toLowerCase();
      return PHONE_APP_KEYWORDS.some((k) => matchesKeyword(text, k));
    }) : [];
    return [BUILTIN_PHONE_APP, ...list];
  }

  if (category === "messages") {
    const list = Array.isArray(apps) ? apps.filter((app) => {
      if (isAddictiveApp(app)) return false;
      const text = `${app.name || ""} ${app.displayName || ""} ${app.packageName || ""}`.toLowerCase();
      // Exclude AI platform apps from messages category
      const isAi = AI_APP_KEYWORDS.some((k) => matchesKeyword(text, k));
      if (isAi && !text.includes("sms") && !text.includes("tin nhắn")) {
        return false;
      }
      return MESSAGE_APP_KEYWORDS.some((k) => matchesKeyword(text, k));
    }) : [];
    return [BUILTIN_MESSAGES_APP, ...list];
  }

  if (category === "camera") {
    const list = Array.isArray(apps) ? apps.filter((app) => {
      if (isAddictiveApp(app)) return false;
      const text = `${app.name || ""} ${app.displayName || ""} ${app.packageName || ""}`.toLowerCase();
      return CAMERA_APP_KEYWORDS.some((k) => matchesKeyword(text, k));
    }) : [];
    return [BUILTIN_CAMERA_APP, ...list];
  }

  if (!Array.isArray(apps)) return [];
  const keywords = category === "maps"
    ? MAPS_APP_KEYWORDS
    : AI_APP_KEYWORDS;
  const filtered = apps.filter((app) => {
    if (isAddictiveApp(app)) return false;
    const text = `${app.name || ""} ${app.displayName || ""} ${app.packageName || ""}`.toLowerCase();
    return keywords.some((k) => matchesKeyword(text, k));
  });
  return filtered.length > 0 ? filtered : apps.filter((app) => !isAddictiveApp(app));
};

const defaultAppStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; }
  catch (_) { return null; }
};
const readDefaultApp = (storage, key) => {
  try { return storage?.getItem(key) ?? null; }
  catch (_) { return null; }
};

export const getDefaultApp = (category, apps, storage = defaultAppStorage()) => {
  if (category === "phone") {
    const savedId = readDefaultApp(storage, DEFAULT_PHONE_APP_KEY);
    if (!savedId || savedId === "default-phone") {
      return BUILTIN_PHONE_APP;
    }
    if (Array.isArray(apps)) {
      const matched = apps.find((app) => app.id === savedId || app.packageName === savedId);
      if (matched) return matched;
    }
    return BUILTIN_PHONE_APP;
  }

  if (category === "messages") {
    const savedId = readDefaultApp(storage, DEFAULT_MESSAGES_APP_KEY);
    if (!savedId || savedId === "built-in-messages" || savedId === "messages") {
      return BUILTIN_MESSAGES_APP;
    }
    if (Array.isArray(apps)) {
      const matched = apps.find((app) => app.id === savedId || app.packageName === savedId);
      if (matched) return matched;
    }
    return BUILTIN_MESSAGES_APP;
  }

  if (category === "camera") {
    const savedId = readDefaultApp(storage, DEFAULT_CAMERA_APP_KEY);
    if (!savedId || savedId === "built-in-camera") {
      return BUILTIN_CAMERA_APP;
    }
    if (Array.isArray(apps)) {
      const matched = apps.find((app) => app.id === savedId || app.packageName === savedId);
      if (matched) return matched;
    }
    return BUILTIN_CAMERA_APP;
  }

  if (!Array.isArray(apps) || apps.length === 0) return null;
  const key = category === "maps"
    ? DEFAULT_MAPS_APP_KEY
    : DEFAULT_AI_APP_KEY;
  const savedId = readDefaultApp(storage, key);
  if (savedId) {
    const matched = apps.find((app) => app.id === savedId || app.packageName === savedId);
    if (matched) return matched;
  }
  const matches = category === "maps"
    ? ["maps", "map"]
    : ["chatgpt", "openai", "copilot", "gemini", "claude", "ai"];
  return findMatchingApp(apps, matches) || null;
};

export const setDefaultApp = (category, app, storage = defaultAppStorage()) => {
  if (!storage || !app) return;
  const key = category === "phone"
    ? DEFAULT_PHONE_APP_KEY
    : category === "camera"
      ? DEFAULT_CAMERA_APP_KEY
      : category === "messages"
        ? DEFAULT_MESSAGES_APP_KEY
        : category === "maps"
          ? DEFAULT_MAPS_APP_KEY
          : DEFAULT_AI_APP_KEY;
  const val = app.action === "default-phone" || app.id === "default-phone"
    ? "default-phone"
    : app.action === "built-in-camera" || app.id === "built-in-camera"
      ? "built-in-camera"
      : app.action === "built-in-messages" || app.id === "built-in-messages"
        ? "built-in-messages"
        : (app.id || app.packageName);
  try { storage.setItem(key, val); } catch (_) { /* Keep the current interaction usable. */ }
};

export const findMatchingApp = (apps, matches) =>
  apps.find((app) => {
    const searchable = getSearchText(app);
    return matches.some((match) => searchable.includes(match));
  });

export const createHomeShortcuts = (apps, storage = defaultAppStorage()) =>
  HOME_SHORTCUT_DEFINITIONS.map((shortcut) => ({
    ...shortcut,
    app: getDefaultApp(shortcut.id, apps, storage),
  }));

export const resolveHomeShortcut = (shortcuts, targetId) => {
  const shortcut = shortcuts.find((item) => item.id === targetId);
  if (!shortcut) return null;
  return shortcut.action ? shortcut : (shortcut.app || null);
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
    } else if (label === "Contacts") {
      // Keep built-in contacts reachable without a standalone Android app.
      prioritized.push(BUILTIN_CONTACTS_APP);
    }
  });

  remaining.sort((left, right) =>
    getDisplayName(left).localeCompare(getDisplayName(right), undefined, {
      sensitivity: "base",
    })
  );

  return [...prioritized, ...remaining];
};
