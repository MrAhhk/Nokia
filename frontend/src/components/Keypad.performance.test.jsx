import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import Keypad from "./Keypad";

global.IS_REACT_ACT_ENVIRONMENT = true;

test("key feedback does not schedule React timers while typing", () => {
  jest.useFakeTimers();
  const onKeypadPress = jest.fn();
  const timeout = jest.spyOn(global, "setTimeout");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad onKeypadPress={onKeypadPress} />));

  act(() => container.querySelector('[data-testid="keypad-btn-2"]').click());
  act(() => container.querySelector('[data-testid="keypad-btn-3"]').click());

  expect(onKeypadPress.mock.calls).toEqual([["2"], ["3"]]);
  expect(timeout).not.toHaveBeenCalled();

  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("system-keyboard keys do not animate every changed CSS property", () => {
  const source = fs.readFileSync(__filename.replace(".performance.test", ""), "utf8");
  expect(source).not.toContain("transition-all");
});

test("physical launcher controls preserve logical keys and twenty rapid alternating inputs", () => {
  const onKeypadPress = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad variant="launcher" onKeypadPress={onKeypadPress} />));
  for (const [label, key] of [["Go to or Delete", "SOFT_LEFT"], ["Settings or Back", "SOFT_RIGHT"], ["Call or Tab", "GREEN"], ["Home", "END"], ["Up", "UP"], ["Left", "LEFT"], ["Select", "SELECT"], ["Right", "RIGHT"], ["Down", "DOWN"]]) {
    act(() => container.querySelector(`button[aria-label="${label}"]`).click());
    expect(onKeypadPress).toHaveBeenLastCalledWith(key);
  }
  onKeypadPress.mockClear();
  for (let i = 0; i < 20; i++) {
    act(() => container.querySelector(`[data-testid="keypad-btn-${i % 2 ? "3" : "2"}"]`).click());
  }
  expect(onKeypadPress.mock.calls.map(([key]) => key).join("")).toBe("23".repeat(10));
  act(() => root.unmount());
  container.remove();
});

test("launcher zero key emits flashlight on long press and zero on short press", () => {
  jest.useFakeTimers();
  const onKeypadPress = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad variant="launcher" onKeypadPress={onKeypadPress} />));
  const zero = container.querySelector('[data-testid="keypad-btn-0"]');

  act(() => zero.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  act(() => jest.advanceTimersByTime(600));
  expect(onKeypadPress).toHaveBeenLastCalledWith("FLASHLIGHT");
  act(() => zero.dispatchEvent(new Event("pointerup", { bubbles: true })));
  act(() => zero.click());
  expect(onKeypadPress).toHaveBeenCalledTimes(1);

  onKeypadPress.mockClear();
  act(() => zero.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  act(() => zero.dispatchEvent(new Event("pointerup", { bubbles: true })));
  act(() => zero.click());
  expect(onKeypadPress).toHaveBeenLastCalledWith("0");

  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("launcher hash and end keys expose deliberate long-press intents", () => {
  jest.useFakeTimers();
  const onKeypadPress = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad variant="launcher" onKeypadPress={onKeypadPress} />));

  const hash = container.querySelector('[data-testid="keypad-btn-hash"]');
  act(() => hash.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  act(() => jest.advanceTimersByTime(600));
  expect(onKeypadPress).toHaveBeenLastCalledWith("NOTIFICATION_MODE");
  act(() => hash.dispatchEvent(new Event("pointerup", { bubbles: true })));
  act(() => hash.click());
  expect(onKeypadPress).toHaveBeenCalledTimes(1);

  const end = container.querySelector('[data-testid="keypad-btn-end"]');
  act(() => end.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  act(() => jest.advanceTimersByTime(600));
  expect(onKeypadPress).toHaveBeenLastCalledWith("LOCK_SCREEN");
  act(() => end.dispatchEvent(new Event("pointerup", { bubbles: true })));
  act(() => end.click());
  expect(onKeypadPress).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("leaving the WebView cancels pending long presses so accessibility actions cannot stick", () => {
  jest.useFakeTimers();
  const onKeypadPress = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad variant="launcher" onKeypadPress={onKeypadPress} />));

  const end = container.querySelector('[data-testid="keypad-btn-end"]');
  act(() => end.dispatchEvent(new Event("pointerdown", { bubbles: true })));
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => jest.advanceTimersByTime(600));

  expect(onKeypadPress).not.toHaveBeenCalledWith("LOCK_SCREEN");

  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

test("supports simultaneous multi-touch pointerdown on multiple keys without losing inputs", () => {
  const onKeypadPress = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Keypad variant="launcher" onKeypadPress={onKeypadPress} />));

  const key2 = container.querySelector('[data-testid="keypad-btn-2"]');
  const key3 = container.querySelector('[data-testid="keypad-btn-3"]');

  // Both fingers land simultaneously (multi-touch)
  act(() => {
    key2.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    key3.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });

  expect(onKeypadPress).toHaveBeenCalledWith("2");
  expect(onKeypadPress).toHaveBeenCalledWith("3");
  expect(onKeypadPress).toHaveBeenCalledTimes(2);

  // Subsequent synthetic click events from browser must be deduplicated
  act(() => {
    key2.dispatchEvent(new Event("pointerup", { bubbles: true }));
    key3.dispatchEvent(new Event("pointerup", { bubbles: true }));
    key2.click();
    key3.click();
  });

  expect(onKeypadPress).toHaveBeenCalledTimes(2);

  act(() => root.unmount());
  container.remove();
});
