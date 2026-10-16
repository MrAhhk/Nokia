export const KEYBOARD_COLOR_KEY = 'nokia-launcher.keyboard-color.v1';
export const KEYBOARD_COLORS = Object.freeze(['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'white', 'black']);
export const sanitizeKeyboardColor = value => KEYBOARD_COLORS.includes(value) ? value : 'black';
export function loadKeyboardColor() {
  try { return sanitizeKeyboardColor(localStorage.getItem(KEYBOARD_COLOR_KEY)); } catch { return 'black'; }
}
export function saveKeyboardColor(value) {
  if (!KEYBOARD_COLORS.includes(value)) return false;
  try { localStorage.setItem(KEYBOARD_COLOR_KEY, value); return true; } catch { return false; }
}
