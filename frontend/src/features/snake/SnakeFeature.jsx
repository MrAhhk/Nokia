import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import SnakeBoard from "./SnakeBoard";
import { LEVEL_TICK_MS, clampLevel } from "./snakeConfig";
import { advanceSnake, createSnakeGame, getBonusValue, queueDirection } from "./snakeEngine";
import { loadSnakePreferences, saveSnakePreferences } from "./snakeStorage";
import "./snake.css";

const DIRECTIONS = Object.freeze({
  UP: "up", "2": "up",
  DOWN: "down", "8": "down",
  LEFT: "left", "4": "left",
  RIGHT: "right", "6": "right",
});

const SnakeFeature = forwardRef(({ currentTime, deviceStatus, onExit }, ref) => {
  const initialPreferences = useRef(loadSnakePreferences()).current;
  const [level, setLevel] = useState(initialPreferences.level);
  const [bestScore, setBestScore] = useState(initialPreferences.bestScore);
  const [game, setGame] = useState(() => createSnakeGame({ level: initialPreferences.level }));
  const [mode, setMode] = useState("level-select");
  const lastTickRef = useRef(Date.now());

  const persist = useCallback((nextLevel, nextBestScore) => {
    saveSnakePreferences({ level: nextLevel, bestScore: nextBestScore });
  }, []);

  const startRun = useCallback(() => {
    const next = { ...createSnakeGame({ level }), status: "running" };
    lastTickRef.current = Date.now();
    setGame(next);
    setMode("running");
    persist(level, bestScore);
  }, [bestScore, level, persist]);

  const togglePause = useCallback(() => {
    if (mode === "level-select" || mode === "game-over") {
      startRun();
      return;
    }
    if (mode === "running") {
      setMode("paused");
      setGame((current) => ({ ...current, status: "paused" }));
      return;
    }
    if (mode === "paused" || mode === "ready") {
      lastTickRef.current = Date.now();
      setMode("running");
      setGame((current) => ({ ...current, status: "running" }));
    }
  }, [mode, startRun]);

  const changeLevel = useCallback((amount) => {
    if (mode !== "level-select") return;
    setLevel((current) => {
      const next = clampLevel(current + amount);
      setGame(createSnakeGame({ level: next }));
      return next;
    });
  }, [mode]);

  const handleKey = useCallback((key) => {
    if (key === "BACK" || key === "END" || key === "#") {
      onExit?.();
      return;
    }
    if (mode === "level-select" && (key === "UP" || key === "2" || key === "RIGHT" || key === "6")) {
      changeLevel(1);
      return;
    }
    if (mode === "level-select" && (key === "DOWN" || key === "8" || key === "LEFT" || key === "4")) {
      changeLevel(-1);
      return;
    }
    if (key === "SELECT" || key === "5" || key === "SEND") {
      togglePause();
      return;
    }
    if (mode === "running" && DIRECTIONS[key]) {
      setGame((current) => queueDirection(current, DIRECTIONS[key]));
    }
  }, [changeLevel, mode, onExit, togglePause]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  useEffect(() => {
    if (mode !== "running") return undefined;
    const timeout = setTimeout(() => {
      const now = Date.now();
      const elapsedMs = Math.max(0, now - lastTickRef.current);
      lastTickRef.current = now;
      setGame((current) => advanceSnake(current, elapsedMs));
    }, LEVEL_TICK_MS[level]);
    return () => clearTimeout(timeout);
  }, [game, level, mode]);

  useEffect(() => {
    if (game.status !== "game-over" || mode === "game-over") return;
    const nextBest = Math.max(bestScore, game.score);
    setBestScore(nextBest);
    setMode("game-over");
    persist(level, nextBest);
  }, [bestScore, game.score, game.status, level, mode, persist]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      setMode((currentMode) => {
        if (currentMode !== "running") return currentMode;
        setGame((current) => ({ ...current, status: "paused" }));
        return "paused";
      });
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const time = currentTime instanceof Date ? currentTime : new Date();
  const timeText = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const scoreText = String(game.score).padStart(5, "0");
  const bonusSeconds = game.bonus ? Math.max(0, Math.ceil((8000 - game.bonus.elapsedMs) / 1000)) : 0;
  const statusText = mode === "level-select" ? "CHOOSE LEVEL" : mode.replace("-", " ").toUpperCase();

  return (
    <div className="lcd-screen snake-feature" data-testid="screen-snake">
      <header className="snake-status">
        <span className="snake-signal" aria-hidden="true">▂▄▆█</span>
        <time>{timeText}</time>
        <span className="snake-battery" aria-label={`Battery ${deviceStatus?.batteryLevel ?? 100} percent`} />
      </header>

      <div className="snake-heading">
        <strong>Snake</strong>
        <span>Score: {scoreText}</span>
      </div>

      <div className="snake-board-wrap">
        <SnakeBoard game={game} />
        {mode === "level-select" && (
          <div className="snake-overlay">
            <strong>Level {level}</strong>
            <span>↑ ↓ choose · 5 start</span>
          </div>
        )}
        {mode === "paused" && <div className="snake-overlay"><strong>PAUSED</strong><span>5 resume</span></div>}
        {mode === "game-over" && (
          <div className="snake-overlay">
            <strong>GAME OVER</strong>
            <span>Best {String(bestScore).padStart(5, "0")} · 5 replay</span>
          </div>
        )}
      </div>

      <div className="snake-readout" aria-live="polite">
        <span>{statusText}</span>
        <span>{game.bonus ? `BONUS ${bonusSeconds}s · ${getBonusValue(game)} pts` : `Level ${level}`}</span>
      </div>

      <footer className="snake-softkeys">
        <button type="button" onClick={togglePause}>{mode === "running" ? "Pause" : mode === "paused" ? "Resume" : "Start"}</button>
        <button type="button" onClick={onExit}>Back</button>
      </footer>
    </div>
  );
});

SnakeFeature.displayName = "SnakeFeature";

export default SnakeFeature;
