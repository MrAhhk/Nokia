export const CLOCK_MODES = Object.freeze({
  CLOCK: "clock",
  TIMER: "timer",
  STOPWATCH: "stopwatch",
});

export const CLOCK_MODE_ORDER = Object.freeze([
  CLOCK_MODES.CLOCK,
  CLOCK_MODES.TIMER,
  CLOCK_MODES.STOPWATCH,
]);

export const moveClockMode = (currentMode, direction) => {
  const currentIndex = CLOCK_MODE_ORDER.indexOf(currentMode);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const delta = direction === "left" ? -1 : direction === "right" ? 1 : 0;
  return CLOCK_MODE_ORDER[
    (safeIndex + delta + CLOCK_MODE_ORDER.length) % CLOCK_MODE_ORDER.length
  ];
};

const MIN_TIMER_SECONDS = 60;
const MAX_TIMER_SECONDS = 59 * 60 + 59;
export const DEFAULT_TIMER_SECONDS = 5 * 60;

export const adjustTimerSeconds = (currentSeconds, direction) => {
  const delta = direction === "up" ? 60 : direction === "down" ? -60 : 0;
  return Math.min(
    MAX_TIMER_SECONDS,
    Math.max(MIN_TIMER_SECONDS, currentSeconds + delta)
  );
};

export const formatTimerDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const formatStopwatchDuration = (milliseconds) => {
  const totalTenths = Math.max(0, Math.floor(milliseconds / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
};

const finiteOr = (value, fallback) => Number.isFinite(value) ? value : fallback;

export const restoreClockRuntime = (saved = {}, now = Date.now()) => {
  const timerSeconds = Math.min(
    MAX_TIMER_SECONDS,
    Math.max(MIN_TIMER_SECONDS, finiteOr(saved.timerSeconds, DEFAULT_TIMER_SECONDS))
  );
  const timerDeadline = finiteOr(saved.timerDeadline, 0);
  const timerWasRunning = Boolean(saved.timerRunning);
  const timerRunning = timerWasRunning && timerDeadline > now;
  const timerRemaining = timerRunning
    ? timerDeadline - now
    : timerWasRunning
      ? 0
      : Math.max(0, finiteOr(saved.timerRemaining, timerSeconds * 1000));
  const stopwatchStartedAt = finiteOr(saved.stopwatchStartedAt, 0);
  const stopwatchRunning = Boolean(saved.stopwatchRunning && stopwatchStartedAt > 0);
  const stopwatchElapsed = stopwatchRunning
    ? Math.max(0, now - stopwatchStartedAt)
    : Math.max(0, finiteOr(saved.stopwatchElapsed, 0));

  return {
    timerSeconds,
    timerRemaining,
    timerRunning,
    timerDeadline,
    stopwatchElapsed,
    stopwatchRunning,
    stopwatchStartedAt,
  };
};
