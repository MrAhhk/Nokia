import {
  dispatchKey,
  KEY_INTENTS,
  NOKIA_MULTI_TAP_CYCLES,
  resolveContextualIntent,
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
});
