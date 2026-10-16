/**
 * The launcher has one physical grammar. A key produces a semantic token;
 * views only provide handlers for that token. The first registered handler
 * wins, so adding a view never changes the meaning of an existing key.
 */
export const KEY_INTENTS = Object.freeze({
  BACK: "BACK",
  DELETE: "DELETE",
  END: "END",
  FLASHLIGHT: "FLASHLIGHT",
  GOTO: "GOTO",
  HOME: "HOME",
  LEFT: "LEFT",
  RIGHT: "RIGHT",
  SELECT: "SELECT",
  SETTINGS: "SETTINGS",
  TAB: "TAB",
  UP: "UP",
  DOWN: "DOWN",
  SEND: "SEND",
  SOFT_LEFT: "SOFT_LEFT",
  SOFT_RIGHT: "SOFT_RIGHT",
  HASH: "HASH",
  GREEN: "GREEN",
  CAPS_LOCK: "CAPS_LOCK",
  NOTIFICATION_MODE: "NOTIFICATION_MODE",
  LOCK_SCREEN: "LOCK_SCREEN",
  RECENT_APPS: "RECENT_APPS",
  LONG_DELETE: "LONG_DELETE",
});

export const NOKIA_MULTI_TAP_CYCLES = Object.freeze({
  "1": Object.freeze([".", ",", "?", "!", "'", "\"", ":", ";", "-", "(", ")", "@", "/", "1"]),
  "2": Object.freeze(["a", "b", "c", "2"]),
  "3": Object.freeze(["d", "e", "f", "3"]),
  "4": Object.freeze(["g", "h", "i", "4"]),
  "5": Object.freeze(["j", "k", "l", "5"]),
  "6": Object.freeze(["m", "n", "o", "6"]),
  "7": Object.freeze(["p", "q", "r", "s", "7"]),
  "8": Object.freeze(["t", "u", "v", "8"]),
  "9": Object.freeze(["w", "x", "y", "z", "9"]),
});

const CONTEXTUAL_INTENTS = Object.freeze({
  [KEY_INTENTS.SOFT_LEFT]: Object.freeze({
    home: KEY_INTENTS.GOTO,
    dial: KEY_INTENTS.SEND,
    "message-thread": KEY_INTENTS.DELETE,
    "message-compose": KEY_INTENTS.SEND,
    default: KEY_INTENTS.DELETE,
  }),
  [KEY_INTENTS.SOFT_RIGHT]: Object.freeze({
    home: KEY_INTENTS.SETTINGS,
    dial: KEY_INTENTS.DELETE,
    default: KEY_INTENTS.BACK,
  }),
  [KEY_INTENTS.HASH]: Object.freeze({
    home: KEY_INTENTS.HASH,
    dial: KEY_INTENTS.HASH,
    default: KEY_INTENTS.CAPS_LOCK,
  }),
  [KEY_INTENTS.GREEN]: Object.freeze({
    dial: KEY_INTENTS.SEND,
    "recent-calls": KEY_INTENTS.SEND,
    "message-thread": KEY_INTENTS.SEND,
    "message-compose": KEY_INTENTS.SEND,
    browser: KEY_INTENTS.TAB,
    camera: KEY_INTENTS.SEND,
    default: KEY_INTENTS.RECENT_APPS,
  }),
  [KEY_INTENTS.SELECT]: Object.freeze({
    "message-thread": KEY_INTENTS.SEND,
    "message-compose": KEY_INTENTS.DELETE,
    default: KEY_INTENTS.SELECT,
  }),
});

export const resolveContextualIntent = (key, context) =>
  CONTEXTUAL_INTENTS[key]?.[context] ?? CONTEXTUAL_INTENTS[key]?.default ?? key;

export const dispatchKey = (key, ...registries) => {
  const handler = registries
    .map((registry) => registry?.[key])
    .find((candidate) => typeof candidate === "function");
  handler?.();
  return Boolean(handler);
};
export const CASE_MODES = Object.freeze({
  LOWER: "abc",
  TITLE: "Abc",
  UPPER: "ABC",
});

/**
 * Transitions casing mode on '#' key:
 * - 1 press from lower: transitions to TITLE ("Abc" - uppercase one word/character)
 * - 2nd press (double '#'): transitions to UPPER ("ABC" - caps lock)
 * - press from UPPER: transitions back to LOWER ("abc")
 */
export const resolveNextCaseMode = (
  currentMode = CASE_MODES.LOWER,
  lastPressTime = 0,
  now = Date.now(),
  doublePressWindow = 600
) => {
  if (currentMode === CASE_MODES.UPPER) {
    return CASE_MODES.LOWER;
  }
  if (currentMode === CASE_MODES.TITLE) {
    return CASE_MODES.UPPER;
  }
  const isDouble = lastPressTime > 0 && (now - lastPressTime) <= doublePressWindow;
  if (isDouble) {
    return CASE_MODES.UPPER;
  }
  return CASE_MODES.TITLE;
};

export const formatCharForCase = (character, caseMode, isFirstCharOfWord = false) => {
  if (!character) return "";
  if (caseMode === CASE_MODES.UPPER) {
    return character.toUpperCase();
  }
  if (caseMode === CASE_MODES.TITLE) {
    return isFirstCharOfWord ? character.toUpperCase() : character.toLowerCase();
  }
  return character.toLowerCase();
};
