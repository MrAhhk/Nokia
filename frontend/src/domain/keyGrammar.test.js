import {
  dispatchKey,
  KEY_INTENTS,
  NOKIA_MULTI_TAP_CYCLES,
  resolveContextualIntent,
  CASE_MODES,
  resolveNextCaseMode,
  formatCharForCase,
} from "./keyGrammar";

describe("unified Nokia key grammar", () => {
  it("dispatches semantic intents by stable priority", () => {
    const calls = [];
    const handled = dispatchKey(
      KEY_INTENTS.BACK,
      { [KEY_INTENTS.BACK]: () => calls.push("universal") },
      { [KEY_INTENTS.BACK]: () => calls.push("view") }
    );

    expect(handled).toBe(true);
    expect(calls).toEqual(["universal"]);
  });

  it("returns false for an unregistered key", () => {
    expect(dispatchKey("2", {})).toBe(false);
  });

  it("keeps contextual soft keys in one grammar table", () => {
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_LEFT, "home")).toBe(KEY_INTENTS.GOTO);
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_LEFT, "dial")).toBe(KEY_INTENTS.SEND);
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_LEFT, "default")).toBe(KEY_INTENTS.DELETE);
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_RIGHT, "home")).toBe(KEY_INTENTS.SETTINGS);
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_RIGHT, "dial")).toBe(KEY_INTENTS.DELETE);
    expect(resolveContextualIntent(KEY_INTENTS.SOFT_RIGHT, "default")).toBe(KEY_INTENTS.BACK);
    expect(resolveContextualIntent(KEY_INTENTS.HASH, "home")).toBe(KEY_INTENTS.HASH);
    expect(resolveContextualIntent(KEY_INTENTS.HASH, "dial")).toBe(KEY_INTENTS.HASH);
    expect(resolveContextualIntent(KEY_INTENTS.HASH, "default")).toBe("CAPS_LOCK");
    expect(resolveContextualIntent(KEY_INTENTS.GREEN, "dial")).toBe(KEY_INTENTS.SEND);
    expect(resolveContextualIntent(KEY_INTENTS.GREEN, "browser")).toBe(KEY_INTENTS.TAB);
    expect(resolveContextualIntent(KEY_INTENTS.GREEN, "default")).toBe(KEY_INTENTS.RECENT_APPS);
  });

  it("preserves the accepted launcher grammar for every existing context", () => {
    const expected = {
      home: { SOFT_LEFT: "GOTO", GREEN: "RECENT_APPS", SOFT_RIGHT: "SETTINGS" },
      dial: { SOFT_LEFT: "SEND", GREEN: "SEND", SOFT_RIGHT: "DELETE" },
      browser: { SOFT_LEFT: "DELETE", GREEN: "TAB", SOFT_RIGHT: "BACK" },
      menu: { SOFT_LEFT: "DELETE", GREEN: "RECENT_APPS", SOFT_RIGHT: "BACK" },
      settings: { SOFT_LEFT: "DELETE", GREEN: "RECENT_APPS", SOFT_RIGHT: "BACK" },
      messages: { SOFT_LEFT: "DELETE", GREEN: "RECENT_APPS", SOFT_RIGHT: "BACK", SELECT: "SELECT" },
      "message-thread": { SOFT_LEFT: "DELETE", GREEN: "SEND", SOFT_RIGHT: "BACK", SELECT: "SEND" },
      "message-compose": { SOFT_LEFT: "SEND", GREEN: "SEND", SOFT_RIGHT: "BACK", SELECT: "DELETE" },
    };

    Object.entries(expected).forEach(([context, mappings]) => {
      Object.entries(mappings).forEach(([key, intent]) => {
        expect(resolveContextualIntent(KEY_INTENTS[key], context)).toBe(KEY_INTENTS[intent]);
      });
    });
    expect(KEY_INTENTS.END).toBe("END");
  });

  it("shares one lower-case T9 alphabet and a complete punctuation cycle", () => {
    expect(NOKIA_MULTI_TAP_CYCLES[2]).toEqual(["a", "b", "c", "2"]);
    expect(NOKIA_MULTI_TAP_CYCLES[1]).toEqual(expect.arrayContaining([".", ",", "?", "!", "@", "1"]));
  });

  describe("casing transitions (# key)", () => {
    it("transitions from lower to title on 1 press, and to upper (caps lock) on double press", () => {
      // 1 press from lower -> Title (Abc: uppercase one word)
      const t1 = 1000;
      const mode1 = resolveNextCaseMode(CASE_MODES.LOWER, 0, t1);
      expect(mode1).toBe(CASE_MODES.TITLE);

      // Double press within 600ms -> Upper (ABC: caps lock)
      const t2 = 1300;
      const mode2 = resolveNextCaseMode(mode1, t1, t2, 600);
      expect(mode2).toBe(CASE_MODES.UPPER);

      // Press from upper -> Lower (abc)
      const t3 = 1800;
      const mode3 = resolveNextCaseMode(mode2, t2, t3, 600);
      expect(mode3).toBe(CASE_MODES.LOWER);
    });

    it("transitions title mode to upper (caps lock) on second # press", () => {
      const t1 = 1000;
      const mode1 = resolveNextCaseMode(CASE_MODES.LOWER, 0, t1);
      expect(mode1).toBe(CASE_MODES.TITLE);

      // Press # again (double #) -> transitions to UPPER (caps lock)
      const t2 = 1850;
      const mode2 = resolveNextCaseMode(mode1, t1, t2, 600);
      expect(mode2).toBe(CASE_MODES.UPPER);

      // Press # again -> transitions to LOWER (abc)
      const t3 = 2500;
      const mode3 = resolveNextCaseMode(mode2, t2, t3, 600);
      expect(mode3).toBe(CASE_MODES.LOWER);
    });

    it("formats characters correctly per case mode", () => {
      // LOWER
      expect(formatCharForCase("a", CASE_MODES.LOWER, true)).toBe("a");
      expect(formatCharForCase("b", CASE_MODES.LOWER, false)).toBe("b");

      // UPPER (Caps Lock)
      expect(formatCharForCase("a", CASE_MODES.UPPER, true)).toBe("A");
      expect(formatCharForCase("b", CASE_MODES.UPPER, false)).toBe("B");

      // TITLE (Abc: uppercase one word)
      expect(formatCharForCase("a", CASE_MODES.TITLE, true)).toBe("A");
      expect(formatCharForCase("b", CASE_MODES.TITLE, false)).toBe("b");
    });
  });
});
