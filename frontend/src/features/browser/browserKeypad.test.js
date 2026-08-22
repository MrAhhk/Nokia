import { createBrowserKeypadController } from "./browserKeypad";

describe("browser Nokia keypad", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("cycles letters into the focused browser field and commits after the delay", () => {
    const send = jest.fn();
    const keypad = createBrowserKeypadController({ send, delay: 500 });

    keypad.handleKey("2");
    keypad.handleKey("2");
    expect(send).toHaveBeenLastCalledWith("input-preview", { text: "B" });

    jest.advanceTimersByTime(500);
    expect(send).toHaveBeenLastCalledWith("input-commit", { text: "B" });
    keypad.dispose();
  });

  test("uses zero as space, star as backspace, hash for tabs, and End for exit", () => {
    const send = jest.fn();
    const onExit = jest.fn();
    const keypad = createBrowserKeypadController({ send, onExit, delay: 500 });

    keypad.handleKey("0");
    keypad.handleKey("*");
    keypad.handleKey("#");
    keypad.handleKey("END");

    expect(send.mock.calls).toEqual([
      ["input-text", { text: " " }],
      ["backspace", {}],
      ["tabs", {}],
    ]);
    expect(onExit).toHaveBeenCalledTimes(1);
    keypad.dispose();
  });
});
