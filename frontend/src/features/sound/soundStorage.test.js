import {
  SOUND_SETTINGS_STORAGE_KEY,
  _resetSoundSettingsCache,
  loadSoundSettings,
  saveSoundSettings,
} from "./soundStorage";
import { DEFAULT_SOUND_SETTINGS, KEYPAD_TONE_TYPES, RINGTONE_TYPES } from "./soundConfig";
import { setDefaultTone } from "../../lib/launcherApps";

jest.mock("../../lib/launcherApps", () => ({
  setDefaultTone: jest.fn().mockResolvedValue({ success: true }),
}));

describe("soundStorage", () => {
  let mockStorage;

  beforeEach(() => {
    _resetSoundSettingsCache();
    setDefaultTone.mockClear();
    const store = {};
    mockStorage = {
      getItem: (key) => store[key] || null,
      setItem: (key, val) => {
        store[key] = String(val);
      },
    };
  });

  test("caches browser settings instead of parsing storage on every keypress", () => {
    const getItemSpy = jest.spyOn(Storage.prototype, "getItem").mockReturnValue(null);

    loadSoundSettings(window.localStorage);
    loadSoundSettings(window.localStorage);

    expect(getItemSpy).toHaveBeenCalledTimes(1);
    getItemSpy.mockRestore();
  });

  test("loads default sound settings when storage is empty", () => {
    const settings = loadSoundSettings(mockStorage);
    expect(settings).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  test("saves and loads updated sound settings", () => {
    const updated = {
      ...DEFAULT_SOUND_SETTINGS,
      keypadTone: KEYPAD_TONE_TYPES.CLICK,
      ringtone: RINGTONE_TYPES.RING_RING,
      volume: 5,
    };
    expect(saveSoundSettings(updated, mockStorage)).toBe(true);
    const loaded = loadSoundSettings(mockStorage);
    expect(loaded.keypadTone).toBe(KEYPAD_TONE_TYPES.CLICK);
    expect(loaded.ringtone).toBe(RINGTONE_TYPES.RING_RING);
    expect(loaded.volume).toBe(5);
    expect(setDefaultTone).not.toHaveBeenCalled();
  });

  test("gracefully falls back on corrupt storage JSON", () => {
    mockStorage.setItem(SOUND_SETTINGS_STORAGE_KEY, "invalid-json");
    const settings = loadSoundSettings(mockStorage);
    expect(settings).toEqual(DEFAULT_SOUND_SETTINGS);
  });
});
