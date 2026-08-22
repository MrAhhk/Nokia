import {
  BONUS_DURATION_MS,
  BONUS_EVERY_NORMAL_FOODS,
  GRID_COLUMNS,
  GRID_ROWS,
  clampLevel,
  clampScore,
} from "./snakeConfig";

const VECTORS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});
const OPPOSITE = Object.freeze({ up: "down", down: "up", left: "right", right: "left" });
const sameCell = (a, b) => Boolean(a && b && a.x === b.x && a.y === b.y);
const cellKey = ({ x, y }) => `${x}:${y}`;

const selectCell = (cells, random) => {
  if (!cells.length) return null;
  const sample = Number(random());
  const index = Math.min(cells.length - 1, Math.max(0, Math.floor((Number.isFinite(sample) ? sample : 0) * cells.length)));
  return cells[index];
};

const freeCells = (blocked) => {
  const keys = new Set(blocked.filter(Boolean).map(cellKey));
  const cells = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLUMNS; x += 1) {
      if (!keys.has(`${x}:${y}`)) cells.push({ x, y });
    }
  }
  return cells;
};

const spawnNormalFood = (snake, bonus, random) => selectCell(
  freeCells([...snake, ...(bonus?.cells || [])]),
  random,
);

const spawnBonus = (snake, normalFood, random) => {
  const blocked = new Set([...snake, normalFood].filter(Boolean).map(cellKey));
  const candidates = [];
  for (let y = 0; y < GRID_ROWS - 1; y += 1) {
    for (let x = 0; x < GRID_COLUMNS - 1; x += 1) {
      const cells = [
        { x, y }, { x: x + 1, y }, { x, y: y + 1 }, { x: x + 1, y: y + 1 },
      ];
      if (cells.every((cell) => !blocked.has(cellKey(cell)))) candidates.push({ x, y, cells });
    }
  }
  const selected = selectCell(candidates, random);
  return selected ? { ...selected, elapsedMs: 0 } : null;
};

export const createSnakeGame = ({ level = 5, random = Math.random } = {}) => {
  const snake = [
    { x: 8, y: 9 },
    { x: 7, y: 9 },
    { x: 6, y: 9 },
    { x: 5, y: 9 },
  ];
  return {
    status: "ready",
    level: clampLevel(level),
    snake,
    direction: "right",
    queuedDirection: null,
    directionQueue: [],
    normalFood: spawnNormalFood(snake, null, random),
    bonus: null,
    pendingBonusCount: 0,
    normalFoodCount: 0,
    score: 0,
    endReason: null,
  };
};

export const queueDirection = (state, direction) => {
  if (!VECTORS[direction]) return state;
  const currentQueue = state.directionQueue?.length
    ? state.directionQueue
    : state.queuedDirection
      ? [state.queuedDirection]
      : [];
  if (currentQueue.length >= 2) return state;
  const previousDirection = currentQueue.at(-1) || state.direction;
  if (direction === previousDirection || OPPOSITE[previousDirection] === direction) return state;
  const directionQueue = [...currentQueue, direction];
  return { ...state, directionQueue, queuedDirection: directionQueue[0] };
};

export const getBonusValue = (state) => {
  if (!state.bonus || state.bonus.elapsedMs >= BONUS_DURATION_MS) return 0;
  const multiplier = Math.max(3, 10 - Math.floor(state.bonus.elapsedMs / 1000));
  return multiplier * state.level;
};

export const advanceSnake = (state, elapsedMs = 0, random = Math.random) => {
  if (state.status !== "running") return state;

  let pendingBonusCount = state.pendingBonusCount || 0;
  let bonus = state.bonus
    ? { ...state.bonus, elapsedMs: state.bonus.elapsedMs + Math.max(0, elapsedMs) }
    : null;
  if (bonus && bonus.elapsedMs >= BONUS_DURATION_MS) bonus = null;

  const currentQueue = state.directionQueue?.length
    ? state.directionQueue
    : state.queuedDirection
      ? [state.queuedDirection]
      : [];
  const direction = currentQueue[0] || state.direction;
  const directionQueue = currentQueue.slice(1);
  const vector = VECTORS[direction];
  const head = state.snake[0];
  const nextHead = {
    x: (head.x + vector.x + GRID_COLUMNS) % GRID_COLUMNS,
    y: (head.y + vector.y + GRID_ROWS) % GRID_ROWS,
  };
  const ateNormalFood = sameCell(nextHead, state.normalFood);
  const collisionBody = ateNormalFood ? state.snake : state.snake.slice(0, -1);
  if (collisionBody.some((cell) => sameCell(cell, nextHead))) {
    return {
      ...state,
      status: "game-over",
      direction,
      queuedDirection: directionQueue[0] || null,
      directionQueue,
      bonus,
      endReason: "self-collision",
    };
  }

  const snake = ateNormalFood
    ? [nextHead, ...state.snake]
    : [nextHead, ...state.snake.slice(0, -1)];
  let score = state.score;
  let normalFoodCount = state.normalFoodCount;
  let normalFood = state.normalFood;

  if (bonus?.cells.some((cell) => sameCell(cell, nextHead))) {
    score = clampScore(score + getBonusValue({ ...state, bonus }));
    bonus = null;
  }

  if (ateNormalFood) {
    score = clampScore(score + state.level);
    normalFoodCount += 1;
    if (normalFoodCount % BONUS_EVERY_NORMAL_FOODS === 0) pendingBonusCount += 1;
    normalFood = spawnNormalFood(snake, bonus, random);
    if (!normalFood) {
      return {
        ...state,
        status: "game-over",
        snake,
        direction,
        queuedDirection: directionQueue[0] || null,
        directionQueue,
        score,
        normalFoodCount,
        normalFood: null,
        bonus,
        endReason: "board-complete",
      };
    }
  }

  if (!bonus && pendingBonusCount > 0) {
    const nextBonus = spawnBonus(snake, normalFood, random);
    if (nextBonus) {
      bonus = nextBonus;
      pendingBonusCount -= 1;
    }
  }

  return {
    ...state,
    snake,
    direction,
    queuedDirection: directionQueue[0] || null,
    directionQueue,
    normalFood,
    bonus,
    pendingBonusCount,
    normalFoodCount,
    score,
    endReason: null,
  };
};
