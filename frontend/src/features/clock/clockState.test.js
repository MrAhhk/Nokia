import {
  CLOCK_MODES,
  adjustTimerSeconds,
  formatStopwatchDuration,
  formatTimerDuration,
  moveClockMode,
  restoreClockRuntime,
} from "./clockState";

test("moves through the finite clock modes and wraps at both ends", () => {
  expect(moveClockMode(CLOCK_MODES.CLOCK, "right")).toBe(CLOCK_MODES.TIMER);
  expect(moveClockMode(CLOCK_MODES.TIMER, "right")).toBe(CLOCK_MODES.STOPWATCH);
  expect(moveClockMode(CLOCK_MODES.STOPWATCH, "right")).toBe(CLOCK_MODES.CLOCK);
  expect(moveClockMode(CLOCK_MODES.CLOCK, "left")).toBe(CLOCK_MODES.STOPWATCH);
});

test("formats stopwatch elapsed time with one useful decimal place", () => {
  expect(formatStopwatchDuration(0)).toBe("00:00.0");
  expect(formatStopwatchDuration(65_430)).toBe("01:05.4");
});

test("adjusts a stopped timer in one-minute steps within calm finite limits", () => {
  expect(adjustTimerSeconds(300, "up")).toBe(360);
  expect(adjustTimerSeconds(300, "down")).toBe(240);
  expect(adjustTimerSeconds(60, "down")).toBe(60);
  expect(adjustTimerSeconds(3599, "up")).toBe(3599);
  expect(formatTimerDuration(65_000)).toBe("01:05");
});

test("restores running tools from timestamps after leaving the clock screen", () => {
  expect(restoreClockRuntime({
    timerSeconds: 300,
    timerRemaining: 200_000,
    timerRunning: true,
    timerDeadline: 110_000,
    stopwatchElapsed: 2_000,
    stopwatchRunning: true,
    stopwatchStartedAt: 95_000,
  }, 100_000)).toMatchObject({
    timerRemaining: 10_000,
    timerRunning: true,
    stopwatchElapsed: 5_000,
    stopwatchRunning: true,
  });

  expect(restoreClockRuntime({
    timerSeconds: 300,
    timerRunning: true,
    timerDeadline: 90_000,
  }, 100_000)).toMatchObject({
    timerRemaining: 0,
    timerRunning: false,
  });
});
