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

  it("shares one lower-case T9 alphabet and a complete punctuation cycle", () => {
    expect(NOKIA_MULTI_TAP_CYCLES[2]).toEqual(["a", "b", "c", "2"]);
    expect(NOKIA_MULTI_TAP_CYCLES[1]).toEqual(expect.arrayContaining([".", ",", "?", "!", "@", "1"]));
  });
});
