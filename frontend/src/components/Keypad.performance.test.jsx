import { act } from "react";
import { createRoot } from "react-dom/client";
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
