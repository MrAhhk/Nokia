import { createBrowserKeypadController } from "./browserKeypad";

describe("browser Nokia keypad", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("cycles letters into the focused browser field and commits after the delay", () => {
    const send = jest.fn();
    const keypad = createBrowserKeypadController({ send, delay: 500 });

    keypad.handleKey("2");
    keypad.handleKey("2");
    expect(send).toHaveBeenLastCalledWith("input-preview", { text: "b" });

    jest.advanceTimersByTime(500);
    expect(send).toHaveBeenLastCalledWith("input-commit", { text: "b" });
    keypad.dispose();
  });

  test("uses star as text, zero as space, Delete as backspace, caps lock, Back, Tab, and End semantically", () => {
    const send = jest.fn();
    const onExit = jest.fn();
    let capsLock = false;
    const keypad = createBrowserKeypadController({
      send,
      onExit,
      delay: 500,
      getCapsLock: () => capsLock,
      onCapsLockToggle: () => { capsLock = !capsLock; },
    });

    keypad.handleKey("*");
    keypad.handleKey("0");
    keypad.handleKey("DELETE");
    keypad.handleKey("CAPS_LOCK");
    keypad.handleKey("2");
    keypad.handleKey("BACK");
    keypad.handleKey("TAB");
    keypad.handleKey("END");

    expect(send.mock.calls).toEqual([
      ["input-text", { text: "*" }],
      ["input-text", { text: " " }],
      ["backspace", {}],
      ["input-preview", { text: "A" }],
      ["input-commit", { text: "A" }],
      ["back", {}],
      ["tabs", {}],
    ]);
    expect(onExit).toHaveBeenCalledTimes(1);
    keypad.dispose();
  });
});
