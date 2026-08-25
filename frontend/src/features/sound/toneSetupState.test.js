describe("first-run tone setup state", () => {
  test("persists one finite setup decision and builds all three system-tone choices", () => {
    expect(() => {
      jest.isolateModules(() => {
        const {
          TONE_SETUP_STATES,
          buildSystemToneSelections,
          loadToneSetupState,
          saveToneSetupState,
        } = require("./toneSetupState");
        const storage = window.localStorage;
        storage.clear();

        expect(loadToneSetupState(storage)).toBe(TONE_SETUP_STATES.PENDING);
        expect(saveToneSetupState(TONE_SETUP_STATES.SKIPPED, storage)).toBe(true);
        expect(loadToneSetupState(storage)).toBe(TONE_SETUP_STATES.SKIPPED);
        expect(buildSystemToneSelections({
          ringtone: "nokia_tune_series30",
          messageAlert: "ascending",
          alarmTone: "pulse",
        })).toEqual([
          expect.objectContaining({ toneType: "ringtone" }),
          expect.objectContaining({ toneType: "notification" }),
          expect.objectContaining({ toneType: "alarm" }),
        ]);
      });
    }).not.toThrow();
  });
});
