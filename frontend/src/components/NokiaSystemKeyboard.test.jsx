import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import NokiaSystemKeyboard from "./NokiaSystemKeyboard";
import { preloadKeypadAudio, playKeypadTone } from "@/features/sound/nokiaAudioEngine";

global.IS_REACT_ACT_ENVIRONMENT = true;

test('IME refreshes saved keyboard color on each native reset without remount', () => {
  window.NokiaIMEBridge = { getKeyboardColor: jest.fn(() => 'white') };
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));
  expect(container.firstChild.dataset.keyboardColor).toBe('white');
  window.NokiaIMEBridge.getKeyboardColor.mockReturnValue('blue');
  act(() => window.resetNokiaKeyboard());
  expect(container.firstChild.dataset.keyboardColor).toBe('blue');
  window.NokiaIMEBridge.getKeyboardColor.mockReturnValue('invalid');
  act(() => window.resetNokiaKeyboard());
  expect(container.firstChild.dataset.keyboardColor).toBe('black');
  act(() => root.unmount()); delete window.NokiaIMEBridge;
});

jest.mock("@/features/sound/nokiaAudioEngine", () => ({
  pauseAudioEngine: jest.fn(),
  playKeypadTone: jest.fn(),
  preloadKeypadAudio: jest.fn(),
}));

jest.mock("@/features/sound/soundStorage", () => ({
  loadSoundSettings: () => ({ keypadTone: false, volume: 0, vibrate: false }),
  sanitizeSoundSettings: jest.requireActual("@/features/sound/soundStorage").sanitizeSoundSettings,
}));

test("IME uses live shared keyboard sound preferences after launcher toggles Off", () => {
  window.NokiaIMEBridge = { getSoundSettings: jest.fn(() => '{"keypadTone":"off","volume":4,"vibrate":false}'), sendDpadKey: jest.fn() };
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));
  act(() => container.querySelector('button[aria-label="Up"]').click());
  expect(playKeypadTone).toHaveBeenLastCalledWith("UP", "off", 4, false);
  window.NokiaIMEBridge.getSoundSettings.mockReturnValue('{"keypadTone":"dtmf","volume":4,"vibrate":false}');
  act(() => container.querySelector('button[aria-label="Down"]').click());
  expect(playKeypadTone).toHaveBeenLastCalledWith("DOWN", "dtmf", 4, false);
  act(() => root.unmount());
  delete window.NokiaIMEBridge;
});

test("system IME reuses the physical Nokia keypad below the Nokia wordmark", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<NokiaSystemKeyboard />));

  const keyboard = container.querySelector('[data-testid="nokia-system-keyboard"]');
  expect(keyboard).not.toBeNull();
  expect(keyboard.classList.contains("nokia-launcher")).toBe(true);
  expect(keyboard.querySelector(".nokia-shell-rim")).not.toBeNull();
  expect(keyboard.querySelector(".nokia-wordmark")).not.toBeNull();
  expect(keyboard.querySelector(".physical-keypad")).not.toBeNull();
  expect(keyboard.querySelectorAll(".physical-number")).toHaveLength(12);
  expect(keyboard.textContent).not.toContain("PRESS [#] MODE");

  act(() => root.unmount());
  container.remove();
});

test("system IME preloads the same keypad samples as homescreen", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => root.render(<NokiaSystemKeyboard />));

  expect(preloadKeypadAudio).toHaveBeenCalledTimes(1);

  act(() => root.unmount());
  container.remove();
});

test("physical D-pad always dispatches native navigation without a dead NAV mode", () => {
  window.NokiaIMEBridge = { sendDpadKey: jest.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));

  for (const direction of ["Up", "Left", "Select", "Right", "Down"]) {
    act(() => container.querySelector(`button[aria-label="${direction}"]`).click());
  }

  expect(window.NokiaIMEBridge.sendDpadKey.mock.calls).toEqual([
    ["UP"], ["LEFT"], ["SELECT"], ["RIGHT"], ["DOWN"],
  ]);

  act(() => root.unmount());
  container.remove();
  delete window.NokiaIMEBridge;
});

test("system IME applies the current shared default control grammar", () => {
  window.NokiaIMEBridge = {
    deleteSurroundingText: jest.fn(),
    sendDpadKey: jest.fn(),
    performSystemAction: jest.fn(),
  };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));

  act(() => container.querySelector('button[aria-label="Go to or Delete"]').click());
  act(() => container.querySelector('button[aria-label="Settings or Back"]').click());
  act(() => container.querySelector('button[aria-label="Call or Tab"]').click());
  act(() => container.querySelector('button[aria-label="Home"]').click());

  expect(window.NokiaIMEBridge.deleteSurroundingText).toHaveBeenCalledWith(1, 0);
  expect(window.NokiaIMEBridge.sendDpadKey).toHaveBeenCalledWith("BACK");
  expect(window.NokiaIMEBridge.performSystemAction.mock.calls).toEqual([
    ["RECENT_APPS"], ["HOME"],
  ]);

  act(() => root.unmount());
  container.remove();
  delete window.NokiaIMEBridge;
});

test("IME closes its top edge with the exact shared homescreen rim instead of restyling it", () => {
  const css = fs.readFileSync(
    __filename.replace("NokiaSystemKeyboard.test.jsx", "NokiaSystemKeyboard.css"),
    "utf8"
  );
  expect(css).toContain("border-radius: 0 0 10cqw 10cqw");
  expect(css).toContain("width: 29%");
  expect(css).toContain("max-height: 56%");
  expect(css).toContain("inset: 0");
  expect(css).toContain("height: auto");
  expect(css).not.toContain("height: calc(100% / 0.47)");
  const rimRule = css.match(/\.nokia-system-keyboard \.nokia-shell-rim\s*\{([^}]*)\}/)?.[1] || "";
  expect(rimRule).not.toContain("border:");
  expect(rimRule).not.toContain("box-shadow:");
});

test("IME keeps homescreen number legend scale when its short window is classified landscape", () => {
  const css = fs.readFileSync(
    __filename.replace("NokiaSystemKeyboard.test.jsx", "NokiaSystemKeyboard.css"),
    "utf8"
  );
  const homeCss = fs.readFileSync(__filename.replace("NokiaSystemKeyboard.test.jsx", "ReferenceHardware.css"), "utf8");
  for (const legend of ["strong", "small"]) {
    const homeSize = homeCss.match(new RegExp(`\\.physical-number ${legend}\\s*\\{[^}]*font:\\s*\\d+\\s+([\\d.]+cqw)`))?.[1];
    expect(homeSize).toBeTruthy();
    const imeSize = css.match(new RegExp(`@media \\(orientation: landscape\\)[\\s\\S]*\\.nokia-system-keyboard \\.physical-number ${legend}\\s*\\{[^}]*font-size:\\s*([\\d.]+cqw)`))?.[1];
    expect(imeSize).toBe(homeSize);
  }
});

test("swiping down from the Nokia band dismisses the IME without adding a key delay", () => {
  window.NokiaIMEBridge = { hideKeyboard: jest.fn() };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<NokiaSystemKeyboard />));

  const wordmark = container.querySelector(".nokia-wordmark");
  const down = new Event("pointerdown", { bubbles: true });
  Object.defineProperties(down, { clientX: { value: 180 }, clientY: { value: 10 } });
  const up = new Event("pointerup", { bubbles: true });
  Object.defineProperties(up, { clientX: { value: 185 }, clientY: { value: 100 } });
  act(() => {
    wordmark.dispatchEvent(down);
    wordmark.dispatchEvent(up);
  });

  expect(window.NokiaIMEBridge.hideKeyboard).toHaveBeenCalledTimes(1);

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

test("IME call legend uses the reference deck ink for every colorway", () => {
  const css = fs.readFileSync(__filename.replace(".test.jsx", ".css"), "utf8");
  expect(css).toContain('[data-testid="keypad"] button.physical-call');
  expect(css).toContain("color: var(--deck-ink, #d4d5d3)");
});

test("IME shell keeps shared D-pad hit zones visually transparent", () => {
  const css = fs.readFileSync(__filename.replace(".test.jsx", ".css"), "utf8");
  expect(css).toContain('[data-testid="keypad"] button.physical-dpad__hit');
  expect(css).toContain("background: transparent");
});

test("IME uses the homescreen lower-module ratio without approximate sizing", () => {
  const css = fs.readFileSync(__filename.replace(".test.jsx", ".css"), "utf8");
  expect(css).toContain("flex: 0 0 calc(6 / 47 * 100%)");
});

test("IME continues to use the same keypad audio engine as homescreen", () => {
  const keyboardSource = fs.readFileSync(__filename.replace(".test.jsx", ".jsx"), "utf8");
  const launcherSource = fs.readFileSync(__filename.replace("NokiaSystemKeyboard.test.jsx", "NokiaLauncher.jsx"), "utf8");
  expect(keyboardSource).toContain("playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate)");
  expect(launcherSource).toContain("playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate)");
});
