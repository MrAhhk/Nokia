const getDisplayName = (item) =>
  item?.displayName || item?.name || item?.label || item?.title || item?.packageName || "";

const getSearchText = (item) =>
  `${getDisplayName(item)} ${item?.packageName || ""}`.toLowerCase();

const HOME_SHORTCUT_DEFINITIONS = [
  { id: "phone", label: "Phone", matches: ["phone", "dialer"] },
  { id: "messages", label: "Messages", matches: ["messages", "messaging", "sms"] },
  { id: "maps", label: "Maps", matches: ["maps", "map"] },
  { id: "camera", label: "Camera", matches: ["camera"], action: "built-in-camera" },
];

export const HOME_FOCUS_TARGETS = Object.freeze([
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
  { id: "display", label: "Display" },
  { id: "sound", label: "Sound" },
  { id: "keyboard", label: "Keyboard" },
  { id: "digital-wellbeing", label: "Digital Wellbeing" },
  { id: "privacy", label: "Privacy" },
]);

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
