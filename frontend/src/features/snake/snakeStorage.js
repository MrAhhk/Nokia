import { clampLevel, clampScore } from "./snakeConfig";

const STORAGE_KEY = "nokia-launcher.snake.preferences.v1";
const DEFAULTS = Object.freeze({ level: 5, bestScore: 0 });

const availableStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadSnakePreferences = (storage = availableStorage()) => {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY));
    if (!parsed || typeof parsed !== "object") return { ...DEFAULTS };
    return { level: clampLevel(parsed.level), bestScore: clampScore(parsed.bestScore) };
  } catch {
    return { ...DEFAULTS };
  }
};

export const saveSnakePreferences = (preferences, storage = availableStorage()) => {
  const safe = {
    level: clampLevel(preferences?.level),
    bestScore: clampScore(preferences?.bestScore),
  };
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Settings remain usable when storage is unavailable or restricted.
  }
  return safe;
};
