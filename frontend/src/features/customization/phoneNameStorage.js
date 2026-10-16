export const PHONE_NAME_KEY = 'nokia-launcher.phone-name.v1';
export const DEFAULT_PHONE_NAME = 'Nokia';
export const PHONE_NAME_LIMIT = 20;
export const normalizePhoneName = value => Array.from(String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, PHONE_NAME_LIMIT).join('') || DEFAULT_PHONE_NAME;
export function loadPhoneName() {
  try { return normalizePhoneName(window.localStorage.getItem(PHONE_NAME_KEY)); }
  catch { return DEFAULT_PHONE_NAME; }
}
export function savePhoneName(value) {
  try { window.localStorage.setItem(PHONE_NAME_KEY, normalizePhoneName(value)); return true; }
  catch { return false; }
}
