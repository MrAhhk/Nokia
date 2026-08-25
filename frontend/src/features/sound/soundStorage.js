import {
  DEFAULT_SOUND_SETTINGS,
  KEYPAD_TONE_TYPES,
  SOUND_SETTINGS_CATALOG,
} from "./soundConfig";

export const SOUND_SETTINGS_STORAGE_KEY = "nokia-launcher-sound-settings.v1";
export const SOUND_SETTINGS_CHANGED_EVENT = "nokia-sound-settings-change";
const SOUND_SETTINGS_SCHEMA_VERSION = 2;

let cachedBrowserSettings = null;

const isBrowserStorage = (storage) =>
  typeof window !== "undefined" && storage === window.localStorage;

const sanitizeSoundSettings = (candidate = {}) => {
  const result = { ...DEFAULT_SOUND_SETTINGS };
  Object.keys(SOUND_SETTINGS_CATALOG).forEach((key) => {
    const allowed = SOUND_SETTINGS_CATALOG[key].map((entry) => entry.id);
    if (allowed.includes(candidate[key])) result[key] = candidate[key];
  });
  return result;
};

export const loadSoundSettings = (storage = typeof window !== "undefined" ? window.localStorage : null) => {
  if (!storage) return { ...DEFAULT_SOUND_SETTINGS };
  if (isBrowserStorage(storage) && cachedBrowserSettings) return { ...cachedBrowserSettings };
  try {
    const raw = storage.getItem(SOUND_SETTINGS_STORAGE_KEY);
    if (!raw) {
      const defaults = { ...DEFAULT_SOUND_SETTINGS };
      if (isBrowserStorage(storage)) cachedBrowserSettings = defaults;
      return defaults;
    }
    const parsed = JSON.parse(raw);
    const settings = sanitizeSoundSettings(parsed);
    if (parsed.schemaVersion !== SOUND_SETTINGS_SCHEMA_VERSION) {
      if (settings.keypadTone === KEYPAD_TONE_TYPES.DTMF) {
        settings.keypadTone = KEYPAD_TONE_TYPES.CLICK;
      }
      storage.setItem(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify({
        ...settings,
        schemaVersion: SOUND_SETTINGS_SCHEMA_VERSION,
      }));
    }
    if (isBrowserStorage(storage)) cachedBrowserSettings = settings;
    return { ...settings };
  } catch (_err) {
    if (isBrowserStorage(storage)) cachedBrowserSettings = { ...DEFAULT_SOUND_SETTINGS };
    return { ...DEFAULT_SOUND_SETTINGS };
  }
};

export const saveSoundSettings = (
  settings,
  storage = typeof window !== "undefined" ? window.localStorage : null
) => {
  if (!storage) return false;
  try {
    const payload = sanitizeSoundSettings(settings);
    storage.setItem(SOUND_SETTINGS_STORAGE_KEY, JSON.stringify({
      ...payload,
      schemaVersion: SOUND_SETTINGS_SCHEMA_VERSION,
    }));
    if (isBrowserStorage(storage)) {
      cachedBrowserSettings = payload;
      window.dispatchEvent(new CustomEvent(SOUND_SETTINGS_CHANGED_EVENT, { detail: payload }));
    }

    return true;
  } catch (_err) {
    return false;
  }
};

export const _resetSoundSettingsCache = () => {
  cachedBrowserSettings = null;
};
