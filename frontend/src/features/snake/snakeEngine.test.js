import {
  advanceSnake,
  createSnakeGame,
  getBonusValue,
  queueDirection,
} from "./snakeEngine";

const running = (overrides = {}) => ({
  ...createSnakeGame({ level: 6, random: () => 0 }),
  status: "running",
  normalFood: { x: 20, y: 10 },
  ...overrides,
});

test("wraps at board edges and rejects an immediate reversal", () => {
  const state = running({ snake: [{ x: 27, y: 4 }], direction: "right" });
  expect(advanceSnake(state, 110, () => 0).snake[0]).toEqual({ x: 0, y: 4 });
  expect(queueDirection(state, "left").queuedDirection).toBeNull();
});

test("buffers two rapid valid turns across consecutive movement ticks", () => {
  const state = running({
    snake: [{ x: 8, y: 8 }, { x: 7, y: 8 }, { x: 6, y: 8 }],
    direction: "right",
  });
  const withUp = queueDirection(state, "up");
  const withUpThenLeft = queueDirection(withUp, "left");

  const afterUp = advanceSnake(withUpThenLeft, 110, () => 0);
  expect(afterUp.snake[0]).toEqual({ x: 8, y: 7 });
  const afterLeft = advanceSnake(afterUp, 110, () => 0);
  expect(afterLeft.snake[0]).toEqual({ x: 7, y: 7 });
});

test("ends a run when the head enters the body", () => {
  const state = running({
    snake: [{ x: 5, y: 5 }, { x: 5, y: 6 }, { x: 4, y: 6 }, { x: 4, y: 5 }],
    direction: "down",
  });
  expect(advanceSnake(state, 110, () => 0)).toMatchObject({
    status: "game-over",
    endReason: "self-collision",
  });
});

test("normal food grows one segment, awards the level, and caps the score", () => {
  const state = running({
    snake: [{ x: 4, y: 4 }, { x: 3, y: 4 }],
    direction: "right",
    normalFood: { x: 5, y: 4 },
    score: 99998,
  });
  const next = advanceSnake(state, 110, () => 0);
  expect(next.snake).toHaveLength(3);
  expect(next.score).toBe(99999);
  expect(next.normalFood).not.toEqual({ x: 5, y: 4 });
});

test("every sixth normal food spawns one timed 2x2 bonus", () => {
  const state = running({
    snake: [{ x: 4, y: 4 }, { x: 3, y: 4 }],
    direction: "right",
    normalFood: { x: 5, y: 4 },
    normalFoodCount: 5,
  });
  const afterSix = advanceSnake(state, 110, () => 0.5);
  expect(afterSix.normalFoodCount).toBe(6);
  expect(afterSix.bonus).toMatchObject({ elapsedMs: 0 });
  expect(afterSix.bonus.cells).toHaveLength(4);
  expect(getBonusValue({
    ...afterSix,
    bonus: { ...afterSix.bonus, elapsedMs: 2100 },
  })).toBe(48);
});

test("bonus capture awards its countdown value without growing", () => {
  const bonus = {
    x: 5,
    y: 4,
    elapsedMs: 2100,
    cells: [{ x: 5, y: 4 }, { x: 6, y: 4 }, { x: 5, y: 5 }, { x: 6, y: 5 }],
  };
  const state = running({
    snake: [{ x: 4, y: 4 }, { x: 3, y: 4 }],
    direction: "right",
    score: 12,
    bonus,
  });
  const next = advanceSnake(state, 0, () => 0);
  expect(next.snake).toHaveLength(2);
  expect(next.score).toBe(60);
  expect(next.bonus).toBeNull();
});

test("bonus expires at eight seconds and queues only one visible bonus", () => {
  const bonus = {
    x: 10,
    y: 10,
    elapsedMs: 0,
    cells: [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }, { x: 11, y: 11 }],
  };
  const next = advanceSnake(running({ bonus }), 8000, () => 0);
  expect(next.bonus).toBeNull();
});
