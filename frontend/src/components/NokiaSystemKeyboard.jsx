import { useState, useEffect, useCallback, useRef } from "react";
import Keypad from "./Keypad";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import "./AgedHardwareTheme.css";

const MULTI_TAP_CYCLES = {
  "2": ["a", "b", "c", "2"],
  "3": ["d", "e", "f", "3"],
  "4": ["g", "h", "i", "4"],
  "5": ["j", "k", "l", "5"],
  "6": ["m", "n", "o", "6"],
  "7": ["p", "q", "r", "s", "7"],
  "8": ["t", "u", "v", "8"],
  "9": ["w", "x", "y", "z", "9"],
};

const MULTI_TAP_DELAY = 250;

const getIMEBridge = () => {
  return typeof window !== "undefined" && window.NokiaIMEBridge
    ? window.NokiaIMEBridge
    : null;
};

const NokiaSystemKeyboard = () => {
  const [isNavMode, setIsNavMode] = useState(false);
  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: MULTI_TAP_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: (character) => {
        const bridge = getIMEBridge();
        if (bridge) {
          bridge.setComposingText(character);
        } else if (character) {
          console.log(`IME mock composingText: "${character}"`);
        }
      },
      onCommit: (character) => {
        const bridge = getIMEBridge();
        if (bridge) {
          bridge.commitText(character);
        } else {
          console.log(`IME mock commitText: "${character}"`);
        }
      },
    });
  }

  // Safe global reset function callable from native Java code (NokiaIME.java)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.resetNokiaKeyboard = () => {
        multiTapComposerRef.current.reset();
      };
    }
    return () => {
      multiTapComposerRef.current?.dispose();
      if (typeof window !== "undefined") {
        window.resetNokiaKeyboard = null;
      }
    };
  }, []);

  const commitPending = useCallback(() => {
    multiTapComposerRef.current.commit();
  }, []);

  const handleKeyPress = useCallback((key) => {
    const bridge = getIMEBridge();

    // ─── Mode Toggle via '#' Key ───
    if (key === "#") {
      commitPending();
      setIsNavMode((prev) => !prev);
      return;
    }

    // ─── D-PAD NAVIGATION MODE ───
    if (isNavMode) {
      if (bridge) {
        if (key === "2") bridge.sendDpadKey("UP");
        else if (key === "8") bridge.sendDpadKey("DOWN");
        else if (key === "4") bridge.sendDpadKey("LEFT");
        else if (key === "6") bridge.sendDpadKey("RIGHT");
        else if (key === "5" || key === "SELECT") bridge.sendDpadKey("SELECT");
        else if (key === "*") bridge.sendDpadKey("BACK");
        else if (key === "SEND") bridge.sendDpadKey("SELECT");
        else if (key === "END") bridge.hideKeyboard();
      } else {
        console.log(`IME mock Nav key: ${key}`);
      }
      return;
    }

    // ─── STANDARD TEXT TYPING MODE ───

    // ─── SEND (Green Key) -> Commit enter ───
    if (key === "SEND") {
      commitPending();
      if (bridge) {
        bridge.commitText("\n");
      } else {
        console.log("IME mock enter (SEND)");
      }
      return;
    }

    // ─── END (Red Key) -> Send Back event (like classic Nokia exit) ───
    if (key === "END") {
      multiTapComposerRef.current.reset();
      
      if (bridge) {
        bridge.sendDpadKey("BACK");
      } else {
        console.log("IME mock send BACK");
      }
      return;
    }

    // ─── SELECT (D-pad Center) -> Send enter ───
    if (key === "SELECT") {
      commitPending();
      if (bridge) {
        bridge.commitText("\n");
      } else {
        console.log("IME mock select/enter");
      }
      return;
    }

    // ─── Space (0) ───
    if (key === "0") {
      commitPending();
      if (bridge) {
        bridge.commitText(" ");
      } else {
        console.log('IME mock space (" ")');
      }
      return;
    }

    // ─── Backspace (*) ───
    if (key === "*") {
      if (!multiTapComposerRef.current.cancelPending()) {
        // Delete last character
        if (bridge) {
          bridge.deleteSurroundingText(1, 0);
        } else {
          console.log("IME mock backspace");
        }
      }
      return;
    }

    // ─── Litereal punctuation keys (1) ───
    if (key === "1") {
      commitPending();
      if (bridge) bridge.commitText(".");
      return;
    }

    // ─── Multi-tap character keys (2-9) ───
    multiTapComposerRef.current.press(key);
  }, [commitPending, isNavMode]);

  return (
    <div className="h-full w-full flex flex-col bg-[#050505] p-2 md:p-4 select-none" data-testid="nokia-system-keyboard">
      {/* Mode Status Bar */}
      <div className="flex justify-between items-center text-[10px] md:text-xs font-mono font-bold tracking-widest text-white/50 border-b border-white/10 pb-1.5 mb-2 px-1">
        <span className={isNavMode ? "text-blue-400" : "text-green-400"}>
          {isNavMode ? "🧭 DPAD NAV MODE" : "🔤 T9 TEXT MODE"}
        </span>
        <span className="text-white/30">PRESS [#] TO TOGGLE</span>
      </div>

      {/* Keypad Container */}
      <div className="flex-1 flex items-center justify-center">
        <Keypad onKeypadPress={handleKeyPress} />
      </div>
    </div>
  );
};

export default NokiaSystemKeyboard;
