import {
  SOUND_SETTINGS_CATALOG,
  DEFAULT_SOUND_SETTINGS,
} from "./soundConfig";

export const SOUND_MENU_SECTIONS = Object.freeze([
  { id: "ringtone", label: "Ringtone", key: "ringtone" },
  { id: "volume", label: "Ringing volume", key: "volume" },
  { id: "keypadTone", label: "Keypad tones", key: "keypadTone" },
  { id: "messageAlert", label: "Message alert", key: "messageAlert" },
  { id: "alarmTone", label: "Alarm tone", key: "alarmTone" },
  { id: "vibrate", label: "Vibrating alert", key: "vibrate" },
]);

export const getOptionLabel = (settingKey, value) => {
  const options = SOUND_SETTINGS_CATALOG[settingKey];
  if (!options) return String(value);
  const found = options.find((opt) => opt.id === value);
  return found ? found.label : String(value);
};

export const moveSettingValue = (settingKey, currentValue, direction = "next") => {
  const options = SOUND_SETTINGS_CATALOG[settingKey];
  if (!options || options.length === 0) return currentValue;

  const currentIndex = options.findIndex((opt) => opt.id === currentValue);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  if (direction === "next" || direction === "right") {
    const nextIndex = (safeIndex + 1) % options.length;
    return options[nextIndex].id;
  }
  if (direction === "prev" || direction === "left") {
    const prevIndex = (safeIndex - 1 + options.length) % options.length;
    return options[prevIndex].id;
  }
  return currentValue;
};

export const moveSoundMenuIndex = (currentIndex, direction, total = SOUND_MENU_SECTIONS.length) => {
  if (total <= 0) return 0;
  const safeIndex = Math.min(Math.max(currentIndex, 0), total - 1);

  if (direction === "up") {
    return safeIndex > 0 ? safeIndex - 1 : total - 1;
  }
  if (direction === "down") {
    return safeIndex < total - 1 ? safeIndex + 1 : 0;
  }
  return safeIndex;
};
