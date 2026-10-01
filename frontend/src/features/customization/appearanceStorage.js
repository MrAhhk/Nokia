export const APPEARANCE_KEY = 'nokia-launcher.appearance.v1';
export const APPEARANCES = Object.freeze(['nokia', 'sidephone']);

export function loadAppearance() {
  try {
    const value = window.localStorage.getItem(APPEARANCE_KEY);
    return APPEARANCES.includes(value) ? value : 'nokia';
  } catch { return 'nokia'; }
}

export function saveAppearance(value) {
  if (!APPEARANCES.includes(value)) return false;
  try { window.localStorage.setItem(APPEARANCE_KEY, value); return true; }
  catch { return false; }
}
