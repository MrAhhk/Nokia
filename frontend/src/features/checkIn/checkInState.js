export const CHECK_IN_KEY = "nokia-launcher.week-check-in.v1";
export const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Persist before showing. Unreadable/unwritable storage suppresses the prompt:
// a missed optional invitation is preferable to repeatedly interrupting Home.
export function claimWeekCheckIn(storage, now, eligible = true) {
  if (!storage || !Number.isFinite(now)) return false;
  try {
    const raw = storage.getItem(CHECK_IN_KEY);
    if (raw === null) {
      storage.setItem(CHECK_IN_KEY, JSON.stringify({ startedAt: now, shown: false }));
      return false;
    }
    const state = JSON.parse(raw);
    if (!state || state.shown !== false || !Number.isFinite(state.startedAt) || state.startedAt < 0) return false;
    if (!eligible || now - state.startedAt < ONE_WEEK_MS) return false;
    storage.setItem(CHECK_IN_KEY, JSON.stringify({ ...state, shown: true }));
    return true;
  } catch { return false; }
}
