import { useState, useEffect, useCallback, useRef } from "react";
import Keypad from "./Keypad";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import {
  CASE_MODES,
  KEY_INTENTS,
  NOKIA_MULTI_TAP_CYCLES,
  dispatchKey,
  formatCharForCase,
  resolveContextualIntent,
  resolveNextCaseMode,
} from "@/domain/keyGrammar";
import { pauseAudioEngine, playKeypadTone, preloadKeypadAudio } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings, sanitizeSoundSettings } from "@/features/sound/soundStorage";
import "./NokiaLauncher.css";
import "./AgedHardwareTheme.css";
import "./ReferenceHardware.css";
import "./NokiaSystemKeyboard.css";
import '@/features/customization/keyboardColors.css';
import { loadKeyboardColor, sanitizeKeyboardColor } from '@/features/customization/keyboardColorStorage';

const readKeyboardColor = () => {
  try { return sanitizeKeyboardColor(getIMEBridge()?.getKeyboardColor?.() ?? loadKeyboardColor()); }
  catch { return 'black'; }
};

const MULTI_TAP_DELAY = 250;

const getIMEBridge = () => {
  return typeof window !== "undefined" && window.NokiaIMEBridge
    ? window.NokiaIMEBridge
    : null;
};

const NokiaSystemKeyboard = () => {
  const [keyboardColor, setKeyboardColor] = useState(readKeyboardColor);
  const [inputMode, setInputMode] = useState(CASE_MODES.LOWER); // "abc" | "Abc" | "ABC" | "123" | "NAV"
  const inputModeRef = useRef(CASE_MODES.LOWER);
  inputModeRef.current = inputMode;
  const lastHashPressRef = useRef(0);
  const wordCapitalizedRef = useRef(false);
  const dismissGestureRef = useRef(null);

  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: NOKIA_MULTI_TAP_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: (character) => {
        const bridge = getIMEBridge();
        let char = character;
        const mode = inputModeRef.current;
        if (char) {
          const isFirstChar = !wordCapitalizedRef.current;
          char = formatCharForCase(char, mode, isFirstChar);
        }
        if (bridge) {
          bridge.setComposingText(char);
        }
      },
      onCommit: (character) => {
        const bridge = getIMEBridge();
        let char = character;
        const mode = inputModeRef.current;
        if (char) {
          const isFirstChar = !wordCapitalizedRef.current;
          char = formatCharForCase(char, mode, isFirstChar);
          if (mode === CASE_MODES.TITLE) {
            wordCapitalizedRef.current = true;
          }
        }
        if (bridge) {
          bridge.commitText(char);
        }
      },
    });
  }

  // Safe global reset function callable from native Java code (NokiaIME.java)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.resetNokiaKeyboard = () => {
        multiTapComposerRef.current?.reset();
        setKeyboardColor(readKeyboardColor());
      };
    }
    return () => {
      multiTapComposerRef.current?.dispose();
      if (typeof window !== "undefined") {
        window.resetNokiaKeyboard = null;
      }
    };
  }, []);

  useEffect(() => {
    preloadKeypadAudio();
    const pauseWhenHidden = () => {
      if (document.visibilityState === "hidden") pauseAudioEngine();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      pauseAudioEngine();
    };
  }, []);

  const commitPending = useCallback(() => {
    multiTapComposerRef.current?.commit();
  }, []);

  const beginDismissGesture = useCallback((event) => {
    dismissGestureRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, []);

  const finishDismissGesture = useCallback((event) => {
    const start = dismissGestureRef.current;
    dismissGestureRef.current = null;
    if (!start) return;
    const deltaX = Math.abs(event.clientX - start.x);
    const deltaY = event.clientY - start.y;
    if (deltaY >= 56 && deltaY > deltaX * 1.25) {
      commitPending();
      getIMEBridge()?.hideKeyboard?.();
    }
  }, [commitPending]);

  const handleKeyPress = useCallback((key) => {
    const bridge = getIMEBridge();
    let soundPrefs = loadSoundSettings();
    if (bridge?.getSoundSettings) {
      try { soundPrefs = sanitizeSoundSettings(JSON.parse(bridge.getSoundSettings())); }
      catch (_err) { soundPrefs = { ...soundPrefs, keypadTone: "off" }; }
    }
    playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate);
    const semanticKey = resolveContextualIntent(key, "default");

    const deleteCharacter = () => {
      if (!multiTapComposerRef.current?.cancelPending()) {
        bridge?.deleteSurroundingText?.(1, 0);
      }
    };

    const navigationHandlers = Object.fromEntries(
      [KEY_INTENTS.UP, KEY_INTENTS.DOWN, KEY_INTENTS.LEFT, KEY_INTENTS.RIGHT, KEY_INTENTS.SELECT]
        .map((intent) => [intent, () => bridge?.sendDpadKey?.(intent)])
    );
    if (dispatchKey(semanticKey, navigationHandlers)) {
      return;
    }

    const controlHandlers = {
      [KEY_INTENTS.DELETE]: deleteCharacter,
      [KEY_INTENTS.BACK]: () => bridge?.sendDpadKey?.(KEY_INTENTS.BACK),
      [KEY_INTENTS.RECENT_APPS]: () => bridge?.performSystemAction?.(KEY_INTENTS.RECENT_APPS),
      [KEY_INTENTS.HOME]: () => bridge?.performSystemAction?.(KEY_INTENTS.HOME),
      [KEY_INTENTS.END]: () => bridge?.performSystemAction?.(KEY_INTENTS.HOME),
      [KEY_INTENTS.LOCK_SCREEN]: () => bridge?.performSystemAction?.(KEY_INTENTS.LOCK_SCREEN),
      [KEY_INTENTS.CAPS_LOCK]: () => {
        commitPending();
        const now = Date.now();
        const nextMode = resolveNextCaseMode(inputModeRef.current, lastHashPressRef.current, now, 600);
        lastHashPressRef.current = now;
        setInputMode(nextMode);
        inputModeRef.current = nextMode;
        wordCapitalizedRef.current = false;
      },
    };
    if (dispatchKey(semanticKey, controlHandlers)) {
      return;
    }

    if (semanticKey === "0") {
      commitPending();
      bridge?.commitText?.(" ");
      if (inputModeRef.current === CASE_MODES.TITLE) {
        setInputMode(CASE_MODES.LOWER);
        inputModeRef.current = CASE_MODES.LOWER;
        wordCapitalizedRef.current = false;
      }
      return;
    }

    if (semanticKey === "*") {
      deleteCharacter();
      return;
    }

    if (NOKIA_MULTI_TAP_CYCLES[semanticKey]) {
      multiTapComposerRef.current?.press(semanticKey);
    }
  }, [commitPending]);

  return (
    <div
      className="nokia-launcher nokia-system-keyboard h-full w-full flex flex-col overflow-hidden select-none"
      data-testid="nokia-system-keyboard"
      data-keyboard-color={keyboardColor}
      data-input-mode={inputMode}
    >
      <div className="nokia-shell-rim" aria-hidden="true" />
      <div
        className="nokia-wordmark"
        aria-label="Nokia"
        onPointerDown={beginDismissGesture}
        onPointerUp={finishDismissGesture}
        onPointerCancel={() => { dismissGestureRef.current = null; }}
      >
        <svg viewBox="0 0 300 52" aria-hidden="true">
          <path fill="currentColor" fillRule="evenodd" d="M0 0H13L43 34V0H55V52H42L12 18V52H0ZM75 0H112Q123 0 123 11V41Q123 52 112 52H75Q64 52 64 41V11Q64 0 75 0ZM78 11Q76 11 76 14V38Q76 41 79 41H108Q111 41 111 38V14Q111 11 108 11ZM133 0H145V21L171 0H189L158 25L190 52H172L145 29V52H133ZM198 0H210V52H198ZM244 0H263L300 52H284L277 41H231L224 52H209ZM238 30H269L254 8Z" />
        </svg>
      </div>
      <div className="nokia-launcher__keypad w-full flex items-center justify-center">
        <Keypad variant="launcher" onKeypadPress={handleKeyPress} />
      </div>
    </div>
  );
};

export default NokiaSystemKeyboard;
