const getDisplayName = (item) =>
  item?.displayName || item?.name || item?.label || item?.title || item?.packageName || "";

const getSearchText = (item) =>
  `${getDisplayName(item)} ${item?.packageName || ""}`.toLowerCase();

const HOME_SHORTCUT_DEFINITIONS = [
  { id: "phone", label: "Phone", matches: ["phone", "dialer"], action: "default-phone" },
  { id: "messages", label: "Messages", matches: ["messages", "messaging", "sms"] },
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

export const findMatchingApp = (apps, matches) =>
  apps.find((app) => {
    const searchable = getSearchText(app);
    return matches.some((match) => searchable.includes(match));
  });

export const createHomeShortcuts = (apps) =>
  HOME_SHORTCUT_DEFINITIONS.map((shortcut) => ({
    ...shortcut,
    app: findMatchingApp(apps, shortcut.matches),
  }));

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
