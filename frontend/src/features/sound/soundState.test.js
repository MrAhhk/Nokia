import {
  SOUND_MENU_SECTIONS,
  getOptionLabel,
  moveSettingValue,
  moveSoundMenuIndex,
} from "./soundState";
import {
  KEYPAD_TONE_TYPES,
  RINGTONE_TYPES,
  MESSAGE_ALERT_TYPES,
} from "./soundConfig";

describe("soundState", () => {
  test("returns human readable label for setting options", () => {
    expect(getOptionLabel("ringtone", RINGTONE_TYPES.NOKIA_TUNE_SERIES30)).toBe("Nokia 3310 Remaster");
    expect(getOptionLabel("keypadTone", KEYPAD_TONE_TYPES.DTMF)).toBe("DTMF tone");
    expect(getOptionLabel("messageAlert", MESSAGE_ALERT_TYPES.ASCENDING)).toBe("Ascending");
    expect(getOptionLabel("vibrate", true)).toBe("On");
  });

  test("cycles setting values forward and backward with wraparound", () => {
    // Ringtone next from Nokia 3310 Remaster -> Nokia tune
    expect(moveSettingValue("ringtone", RINGTONE_TYPES.NOKIA_TUNE_SERIES30, "next")).toBe(
      RINGTONE_TYPES.NOKIA_TUNE
    );
    // Ringtone prev from Nokia 3310 Remaster -> Off (wraparound)
    expect(moveSettingValue("ringtone", RINGTONE_TYPES.NOKIA_TUNE_SERIES30, "prev")).toBe(
      RINGTONE_TYPES.OFF
    );

    // Volume level 1 prev -> Level 5 (wraparound)
    expect(moveSettingValue("volume", 1, "prev")).toBe(5);
  });

  test("moves menu index up and down with wraparound", () => {
    const total = SOUND_MENU_SECTIONS.length;
    expect(moveSoundMenuIndex(0, "up", total)).toBe(total - 1);
    expect(moveSoundMenuIndex(0, "down", total)).toBe(1);
    expect(moveSoundMenuIndex(total - 1, "down", total)).toBe(0);
  });
});
