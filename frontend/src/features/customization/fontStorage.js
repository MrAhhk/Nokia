export const FONT_KEY = 'nokia-launcher.font.v1';
export const FONTS = Object.freeze(['vt323', 'classic']);
export function loadFont() {
  try { const value = window.localStorage.getItem(FONT_KEY); return FONTS.includes(value) ? value : 'vt323'; }
  catch { return 'vt323'; }
}
export function saveFont(value) {
  if (!FONTS.includes(value)) return false;
  try { window.localStorage.setItem(FONT_KEY, value); return true; } catch { return false; }
}
