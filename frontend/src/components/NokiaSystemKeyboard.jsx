import { useState, useEffect, useCallback, useRef } from "react";
import Keypad from "./Keypad";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import { CASE_MODES, resolveNextCaseMode, formatCharForCase } from "@/domain/keyGrammar";
import { pauseAudioEngine, playKeypadTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import "./NokiaLauncher.css";
import "./AgedHardwareTheme.css";
import "./ReferenceHardware.css";
import "./NokiaSystemKeyboard.css";

const BASE_CYCLES = {
  "1": [".", ",", "?", "!", "-", "_", "@", "1"],
  "2": ["a", "b", "c", "2"],
  "3": ["d", "e", "f", "3"],
  "4": ["g", "h", "i", "4"],
  "5": ["j", "k", "l", "5"],
  "6": ["m", "n", "o", "6"],
  "7": ["p", "q", "r", "s", "7"],
  "8": ["t", "u", "v", "8"],
  "9": ["w", "x", "y", "z", "9"],
  "0": [" ", "0", "+", "\n"],
};

const MULTI_TAP_DELAY = 250;

const getIMEBridge = () => {
  return typeof window !== "undefined" && window.NokiaIMEBridge
    ? window.NokiaIMEBridge
    : null;
};

const NokiaSystemKeyboard = () => {
  const [inputMode, setInputMode] = useState(CASE_MODES.LOWER); // "abc" | "Abc" | "ABC" | "123" | "NAV"
  const inputModeRef = useRef(CASE_MODES.LOWER);
  inputModeRef.current = inputMode;
  const lastHashPressRef = useRef(0);
  const wordCapitalizedRef = useRef(false);

  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: BASE_CYCLES,
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

  const handleKeyPress = useCallback((key) => {
    const bridge = getIMEBridge();
    const soundPrefs = loadSoundSettings();
    playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate);

    // The physical keypad speaks the launcher's logical key names. Keep the
    // IME behavior isolated by translating only the two aliases it needs.
    if (key === "GREEN") key = "SEND";
    else if (key === "HASH") key = "#";

    // ─── Mode Cycle via '#' Key ───
    if (key === "#") {
      commitPending();
      const now = Date.now();
      const nextMode = resolveNextCaseMode(
        inputModeRef.current,
        lastHashPressRef.current,
        now,
        600
      );
      lastHashPressRef.current = now;
      setInputMode(nextMode);
      inputModeRef.current = nextMode;
      wordCapitalizedRef.current = false;
      return;
    }

    // ─── D-PAD NAVIGATION MODE ───
    if (inputMode === "NAV") {
      if (bridge) {
        if (key === "2") bridge.sendDpadKey("UP");
        else if (key === "8") bridge.sendDpadKey("DOWN");
        else if (key === "4") bridge.sendDpadKey("LEFT");
        else if (key === "6") bridge.sendDpadKey("RIGHT");
        else if (key === "5" || key === "SELECT") bridge.sendDpadKey("SELECT");
        else if (key === "*") bridge.sendDpadKey("BACK");
        else if (key === "SEND") bridge.sendDpadKey("SELECT");
        else if (key === "END") bridge.hideKeyboard();
      }
      return;
    }

    // ─── DIRECT NUMBER MODE (123) ───
    if (inputMode === "123") {
      if (key >= "0" && key <= "9") {
        if (bridge) bridge.commitText(key);
        return;
      }
      if (key === "*") {
        if (bridge) bridge.deleteSurroundingText(1, 0);
        return;
      }
      if (key === "SEND" || key === "SELECT") {
        if (bridge) bridge.commitText("\n");
        return;
      }
      if (key === "END") {
        if (bridge) bridge.hideKeyboard();
        return;
      }
    }

    // ─── STANDARD TEXT TYPING MODE (abc / Abc / ABC) ───

    // ─── SEND (Green Key) -> Commit enter ───
    if (key === "SEND") {
      commitPending();
      if (bridge) {
        bridge.commitText("\n");
      }
      return;
    }

    // ─── END (Red Key) -> Hide keyboard ───
    if (key === "END") {
      multiTapComposerRef.current?.reset();
      if (bridge) {
        setTimeout(() => {
          bridge.hideKeyboard();
        }, 60);
      }
      return;
    }

    // ─── SELECT (D-pad Center) -> Send enter ───
    if (key === "SELECT") {
      commitPending();
      if (bridge) {
        bridge.commitText("\n");
      }
      return;
    }

    // ─── Space / Zero (0) ───
    if (key === "0") {
      commitPending();
      if (bridge) {
        bridge.commitText(" ");
      }
      if (inputModeRef.current === CASE_MODES.TITLE) {
        setInputMode(CASE_MODES.LOWER);
        inputModeRef.current = CASE_MODES.LOWER;
        wordCapitalizedRef.current = false;
      }
      return;
    }

    // ─── Backspace (*) ───
    if (key === "*") {
      if (!multiTapComposerRef.current?.cancelPending()) {
        if (bridge) {
          bridge.deleteSurroundingText(1, 0);
        }
      }
      return;
    }

    // ─── Multi-tap character keys (1-9) ───
    if (BASE_CYCLES[key]) {
      multiTapComposerRef.current?.press(key);
    }
  }, [commitPending, inputMode]);

  return (
    <div
      className="nokia-launcher nokia-system-keyboard h-full w-full flex flex-col overflow-hidden select-none"
      data-testid="nokia-system-keyboard"
      data-input-mode={inputMode}
    >
      <div className="nokia-wordmark" aria-label="Nokia">
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
