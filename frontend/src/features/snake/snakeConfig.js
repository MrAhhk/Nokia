export const GRID_COLUMNS = 28;
export const GRID_ROWS = 18;
export const SCORE_CAP = 99999;
export const BONUS_DURATION_MS = 8000;
export const BONUS_EVERY_NORMAL_FOODS = 6;
export const LEVEL_TICK_MS = Object.freeze({
  1: 500,
  2: 420,
  3: 350,
  4: 290,
  5: 240,
  6: 200,
  7: 165,
  8: 135,
  9: 110,
});

export const clampLevel = (value) => {
  const number = Number(value);
  return Math.min(9, Math.max(1, Number.isFinite(number) ? Math.trunc(number) : 5));
};

export const clampScore = (value) => {
  const number = Number(value);
  return Math.min(SCORE_CAP, Math.max(0, Number.isFinite(number) ? Math.trunc(number) : 0));
};
