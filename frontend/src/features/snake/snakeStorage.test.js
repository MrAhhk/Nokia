import { loadSnakePreferences, saveSnakePreferences } from "./snakeStorage";

test("defaults invalid preferences to level 5 and score 0", () => {
  const storage = { getItem: () => "broken", setItem: jest.fn() };
  expect(loadSnakePreferences(storage)).toEqual({ level: 5, bestScore: 0 });
});

test("clamps stored and written values", () => {
  const storage = {
    getItem: () => JSON.stringify({ level: 99, bestScore: 999999 }),
    setItem: jest.fn(),
  };
  expect(loadSnakePreferences(storage)).toEqual({ level: 9, bestScore: 99999 });
  saveSnakePreferences({ level: -2, bestScore: -5 }, storage);
  expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({ level: 1, bestScore: 0 });
});
