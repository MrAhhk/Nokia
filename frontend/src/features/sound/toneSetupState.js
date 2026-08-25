import { SOUND_ASSET_PATHS } from "./soundConfig";
import { getOptionLabel } from "./soundState";

export const TONE_SETUP_STORAGE_KEY = "nokia-launcher-system-tone-setup.v1";

export const TONE_SETUP_STATES = Object.freeze({
  PENDING: "pending",
  AWAITING_ACCESS: "awaiting-access",
  APPLIED: "applied",
  SKIPPED: "skipped",
});

const SAVED_STATES = new Set([
  TONE_SETUP_STATES.AWAITING_ACCESS,
  TONE_SETUP_STATES.APPLIED,
  TONE_SETUP_STATES.SKIPPED,
]);

export const loadToneSetupState = (
  storage = typeof window !== "undefined" ? window.localStorage : null,
) => {
  if (!storage) return TONE_SETUP_STATES.PENDING;
  try {
    const value = storage.getItem(TONE_SETUP_STORAGE_KEY);
    return SAVED_STATES.has(value) ? value : TONE_SETUP_STATES.PENDING;
  } catch (_error) {
    return TONE_SETUP_STATES.PENDING;
  }
};

export const saveToneSetupState = (
  state,
  storage = typeof window !== "undefined" ? window.localStorage : null,
) => {
  if (!storage || !SAVED_STATES.has(state)) return false;
  try {
    storage.setItem(TONE_SETUP_STORAGE_KEY, state);
    return true;
  } catch (_error) {
    return false;
  }
};

export const buildSystemToneSelections = (settings) => [
  {
    toneType: "ringtone",
    assetPath: SOUND_ASSET_PATHS[settings.ringtone],
    title: getOptionLabel("ringtone", settings.ringtone),
  },
  {
    toneType: "notification",
    assetPath: SOUND_ASSET_PATHS[`sms_${settings.messageAlert}`],
    title: getOptionLabel("messageAlert", settings.messageAlert),
  },
  {
    toneType: "alarm",
    assetPath: SOUND_ASSET_PATHS[settings.alarmTone],
    title: getOptionLabel("alarmTone", settings.alarmTone),
  },
].filter((tone) => Boolean(tone.assetPath));
