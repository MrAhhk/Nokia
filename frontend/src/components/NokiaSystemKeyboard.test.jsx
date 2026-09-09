import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import NokiaSystemKeyboard from "./NokiaSystemKeyboard";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/features/sound/nokiaAudioEngine", () => ({
  pauseAudioEngine: jest.fn(),
  playKeypadTone: jest.fn(),
}));

jest.mock("@/features/sound/soundStorage", () => ({
  loadSoundSettings: () => ({ keypadTone: false, volume: 0, vibrate: false }),
}));

test("system IME reuses the physical Nokia keypad below the Nokia wordmark", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<NokiaSystemKeyboard />));

  const keyboard = container.querySelector('[data-testid="nokia-system-keyboard"]');
  expect(keyboard).not.toBeNull();
  expect(keyboard.classList.contains("nokia-launcher")).toBe(true);
  expect(keyboard.querySelector(".nokia-wordmark")).not.toBeNull();
  expect(keyboard.querySelector(".physical-keypad")).not.toBeNull();
  expect(keyboard.querySelectorAll(".physical-number")).toHaveLength(12);
  expect(keyboard.textContent).not.toContain("PRESS [#] MODE");

  act(() => root.unmount());
  container.remove();
});

test("physical green key keeps the IME enter behavior", () => {
  window.NokiaIMEBridge = { commitText: jest.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));

  act(() => container.querySelector('button[aria-label="Call or Tab"]').click());

  expect(window.NokiaIMEBridge.commitText).toHaveBeenCalledWith("\n");

  act(() => root.unmount());
  container.remove();
  delete window.NokiaIMEBridge;
});

test("physical hash key keeps the IME case-mode cycle", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));
  const keyboard = container.querySelector('[data-testid="nokia-system-keyboard"]');

  act(() => container.querySelector('[data-testid="keypad-btn-hash"]').click());

  expect(keyboard.dataset.inputMode).toBe("Abc");

  act(() => root.unmount());
  container.remove();
});

test("IME shell preserves the green call legend over shared aged-key styling", () => {
  const css = fs.readFileSync(__filename.replace(".test.jsx", ".css"), "utf8");
  expect(css).toContain('[data-testid="keypad"] button.physical-call');
  expect(css).toContain("color: #35d22c");
});

test("IME shell keeps shared D-pad hit zones visually transparent", () => {
  const css = fs.readFileSync(__filename.replace(".test.jsx", ".css"), "utf8");
  expect(css).toContain('[data-testid="keypad"] button.physical-dpad__hit');
  expect(css).toContain("background: transparent");
});
