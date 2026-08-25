import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  CLOCK_MODES,
  DEFAULT_TIMER_SECONDS,
  adjustTimerSeconds,
  formatStopwatchDuration,
  formatTimerDuration,
  moveClockMode,
  restoreClockRuntime,
} from "./clockState";
import { playAlarmTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import "./clock.css";

const CLOCK_RUNTIME_KEY = "nokia-launcher-clock-runtime";

const loadRuntime = () => {
  if (typeof window === "undefined") return restoreClockRuntime();
  try {
    return restoreClockRuntime(JSON.parse(window.localStorage.getItem(CLOCK_RUNTIME_KEY) || "{}"));
  } catch {
    return restoreClockRuntime();
  }
};

const ClockFeature = forwardRef(({ onExit }, ref) => {
  const initialRuntimeRef = useRef(null);
  if (initialRuntimeRef.current === null) initialRuntimeRef.current = loadRuntime();
  const initialRuntime = initialRuntimeRef.current;
  const [mode, setMode] = useState(CLOCK_MODES.CLOCK);
  const [now, setNow] = useState(() => new Date());
  const [timerSeconds, setTimerSeconds] = useState(initialRuntime.timerSeconds || DEFAULT_TIMER_SECONDS);
  const [timerRemaining, setTimerRemaining] = useState(initialRuntime.timerRemaining);
  const [timerRunning, setTimerRunning] = useState(initialRuntime.timerRunning);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(initialRuntime.stopwatchElapsed);
  const [stopwatchRunning, setStopwatchRunning] = useState(initialRuntime.stopwatchRunning);
  const timerDeadlineRef = useRef(initialRuntime.timerDeadline);
  const stopwatchStartedRef = useRef(initialRuntime.stopwatchStartedAt);
  const runtimeSnapshotRef = useRef(initialRuntime);

  runtimeSnapshotRef.current = {
    timerSeconds,
    timerRemaining,
    timerRunning,
    timerDeadline: timerDeadlineRef.current,
    stopwatchElapsed,
    stopwatchRunning,
    stopwatchStartedAt: stopwatchStartedRef.current,
  };

  useEffect(() => {
    const persist = () => {
      try {
        window.localStorage.setItem(CLOCK_RUNTIME_KEY, JSON.stringify(runtimeSnapshotRef.current));
      } catch {
        // The clock still works when storage is unavailable.
      }
    };
    const onVisibilityChange = () => document.visibilityState === "hidden" && persist();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      persist();
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const timestamp = Date.now();
      setNow(new Date(timestamp));

      if (timerRunning) {
        const remaining = Math.max(0, timerDeadlineRef.current - timestamp);
        setTimerRemaining(remaining);
        if (remaining === 0) {
          setTimerRunning(false);
          const soundPrefs = loadSoundSettings();
          playAlarmTone(soundPrefs.alarmTone, soundPrefs.volume, false, soundPrefs.vibrate);
        }
      }

      if (stopwatchRunning) {
        setStopwatchElapsed(timestamp - stopwatchStartedRef.current);
      }
    };

    tick();
    const interval = setInterval(tick, timerRunning || stopwatchRunning ? 100 : 1000);
    return () => clearInterval(interval);
  }, [stopwatchRunning, timerRunning]);

  const selectMode = useCallback((nextMode) => setMode(nextMode), []);

  const changeMode = useCallback((direction) => {
    setMode((currentMode) => moveClockMode(currentMode, direction));
  }, []);

  const adjustTimer = useCallback((direction) => {
    if (timerRunning) return;
    setTimerSeconds((currentSeconds) => {
      const nextSeconds = adjustTimerSeconds(currentSeconds, direction);
      setTimerRemaining(nextSeconds * 1000);
      return nextSeconds;
    });
  }, [timerRunning]);

  const toggleTimer = useCallback(() => {
    if (timerRunning) {
      setTimerRemaining(Math.max(0, timerDeadlineRef.current - Date.now()));
      setTimerRunning(false);
      return;
    }

    const nextRemaining = timerRemaining > 0
      ? timerRemaining
      : timerSeconds * 1000;
    timerDeadlineRef.current = Date.now() + nextRemaining;
    setTimerRemaining(nextRemaining);
    setTimerRunning(true);
  }, [timerRemaining, timerRunning, timerSeconds]);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setTimerRemaining(timerSeconds * 1000);
  }, [timerSeconds]);

  const toggleStopwatch = useCallback(() => {
    if (stopwatchRunning) {
      setStopwatchElapsed(Date.now() - stopwatchStartedRef.current);
      setStopwatchRunning(false);
      return;
    }

    stopwatchStartedRef.current = Date.now() - stopwatchElapsed;
    setStopwatchRunning(true);
  }, [stopwatchElapsed, stopwatchRunning]);

  const resetStopwatch = useCallback(() => {
    setStopwatchRunning(false);
    setStopwatchElapsed(0);
  }, []);

  const activatePrimary = useCallback(() => {
    if (mode === CLOCK_MODES.TIMER) toggleTimer();
    if (mode === CLOCK_MODES.STOPWATCH) toggleStopwatch();
  }, [mode, toggleStopwatch, toggleTimer]);

  const resetActiveMode = useCallback(() => {
    if (mode === CLOCK_MODES.TIMER) resetTimer();
    if (mode === CLOCK_MODES.STOPWATCH) resetStopwatch();
  }, [mode, resetStopwatch, resetTimer]);

  const handleKey = useCallback((key) => {
    if (key === "LEFT" || key === "4") {
      changeMode("left");
      return;
    }
    if (key === "RIGHT" || key === "6") {
      changeMode("right");
      return;
    }
    if ((key === "UP" || key === "2") && mode === CLOCK_MODES.TIMER) {
      adjustTimer("up");
      return;
    }
    if ((key === "DOWN" || key === "8") && mode === CLOCK_MODES.TIMER) {
      adjustTimer("down");
      return;
    }
    if (key === "SELECT" || key === "5" || key === "SEND") {
      activatePrimary();
      return;
    }
    if (key === "0") {
      resetActiveMode();
      return;
    }
    if (key === "END" || key === "#") onExit();
  }, [activatePrimary, adjustTimer, changeMode, mode, onExit, resetActiveMode]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  const timeText = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const secondsText = String(now.getSeconds()).padStart(2, "0");
  const dateText = now.toLocaleDateString("en-US", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timerFinished = !timerRunning && timerRemaining === 0;
  const primaryLabel = mode === CLOCK_MODES.TIMER
    ? timerRunning ? "Pause" : timerFinished ? "Again" : "Start"
    : mode === CLOCK_MODES.STOPWATCH
      ? stopwatchRunning ? "Pause" : "Start"
      : "";

  return (
    <div className="lcd-screen clock-screen" data-testid="screen-clock">
      <header className="clock-header">
        <strong>Clock</strong>
        <span>{dateText}</span>
      </header>

      <nav className="clock-modes" aria-label="Clock modes">
        {[
          [CLOCK_MODES.CLOCK, "Clock"],
          [CLOCK_MODES.TIMER, "Timer"],
          [CLOCK_MODES.STOPWATCH, "Stopwatch"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={mode === value ? "is-selected" : ""}
            onClick={() => selectMode(value)}
            aria-current={mode === value ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="clock-readout" aria-live="polite">
        {mode === CLOCK_MODES.CLOCK && (
          <div className="clock-readout__clock">
            <div className="clock-readout__time">{timeText}</div>
            <div className="clock-readout__seconds">:{secondsText}</div>
          </div>
        )}

        {mode === CLOCK_MODES.TIMER && (
          <>
            <div className={`clock-readout__duration ${timerFinished ? "is-finished" : ""}`}>
              {formatTimerDuration(timerRemaining)}
            </div>
            <div className="clock-readout__adjust" aria-label="Adjust timer">
              <button type="button" onClick={() => adjustTimer("down")} disabled={timerRunning}>−1m</button>
              <span>{timerRunning ? "COUNTING" : timerFinished ? "DONE" : "SET MINUTES"}</span>
              <button type="button" onClick={() => adjustTimer("up")} disabled={timerRunning}>+1m</button>
            </div>
          </>
        )}

        {mode === CLOCK_MODES.STOPWATCH && (
          <>
            <div className="clock-readout__duration clock-readout__duration--stopwatch">
              {formatStopwatchDuration(stopwatchElapsed)}
            </div>
            <div className="clock-readout__caption">
              {stopwatchRunning ? "RUNNING" : stopwatchElapsed ? "PAUSED" : "READY"}
            </div>
          </>
        )}
      </section>

      <div className="clock-hint">
        <span>← → mode</span>
        {mode === CLOCK_MODES.TIMER && <span>↑ ↓ minutes</span>}
        {mode === CLOCK_MODES.STOPWATCH && <span>0 reset</span>}
      </div>

      <footer className="clock-softkeys">
        <button type="button" onClick={resetActiveMode} disabled={mode === CLOCK_MODES.CLOCK}>Reset</button>
        <button type="button" onClick={activatePrimary} disabled={mode === CLOCK_MODES.CLOCK}>{primaryLabel}</button>
        <button type="button" onClick={onExit}>Back</button>
      </footer>
    </div>
  );
});

ClockFeature.displayName = "ClockFeature";

export default ClockFeature;
