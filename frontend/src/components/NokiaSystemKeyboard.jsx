import { useState, useEffect, useCallback, useRef } from "react";
import Keypad from "./Keypad";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import { pauseAudioEngine, playKeypadTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import "./AgedHardwareTheme.css";

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
  const [inputMode, setInputMode] = useState("abc"); // "abc" | "Abc" | "ABC" | "123" | "NAV"
  const inputModeRef = useRef("abc");
  inputModeRef.current = inputMode;

  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: BASE_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: (character) => {
        const bridge = getIMEBridge();
        let char = character;
        const mode = inputModeRef.current;
        if (char && (mode === "ABC" || mode === "Abc")) {
          char = char.toUpperCase();
        }
        if (bridge) {
          bridge.setComposingText(char);
        }
      },
      onCommit: (character) => {
        const bridge = getIMEBridge();
        let char = character;
        const mode = inputModeRef.current;
        if (char && (mode === "ABC" || mode === "Abc")) {
          char = char.toUpperCase();
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

    // ─── Mode Cycle via '#' Key ───
    if (key === "#") {
      commitPending();
      setInputMode((prev) => {
        if (prev === "abc") return "Abc";
        if (prev === "Abc") return "ABC";
        if (prev === "ABC") return "123";
        if (prev === "123") return "NAV";
        return "abc";
      });
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
    <div className="h-full w-full flex flex-col bg-[#050505] p-2 md:p-4 select-none" data-testid="nokia-system-keyboard">
      {/* Mode Status Bar */}
      <div className="flex justify-between items-center text-[10px] md:text-xs font-mono font-bold tracking-widest text-white/50 border-b border-white/10 pb-1.5 mb-2 px-1">
        <span className={
          inputMode === "NAV" ? "text-blue-400" :
          inputMode === "123" ? "text-yellow-400" :
          inputMode === "ABC" ? "text-purple-400" :
          inputMode === "Abc" ? "text-cyan-400" :
          "text-green-400"
        }>
          {inputMode === "NAV" ? "🧭 DPAD NAV" :
           inputMode === "123" ? "🔢 123 NUMBERS" :
           inputMode === "ABC" ? "🔠 ABC (CAPS)" :
           inputMode === "Abc" ? "🔤 Abc (FIRST)" :
           "🔤 abc (TEXT)"}
        </span>
        <span className="text-white/40">PRESS [#] MODE</span>
      </div>

      {/* Keypad Container */}
      <div className="flex-1 flex items-center justify-center">
        <Keypad onKeypadPress={handleKeyPress} />
      </div>
    </div>
  );
};

export default NokiaSystemKeyboard;
