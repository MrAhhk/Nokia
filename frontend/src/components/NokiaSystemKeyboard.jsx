import { useState, useEffect, useCallback, useRef } from "react";
import Keypad from "./Keypad";

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

const NokiaSystemKeyboard = () => {
  const [isNavMode, setIsNavMode] = useState(false);
  const activeKeyRef = useRef(null);
  const cycleIndexRef = useRef(0);
  const commitTimerRef = useRef(null);
  const pendingCharRef = useRef("");

  // Helper to check if native bridge exists
  const getIMEBridge = () => {
    return typeof window !== "undefined" && window.NokiaIMEBridge ? window.NokiaIMEBridge : null;
  };

  // Safe global reset function callable from native Java code (NokiaIME.java)
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.resetNokiaKeyboard = () => {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        activeKeyRef.current = null;
        cycleIndexRef.current = 0;
        pendingCharRef.current = "";
      };
    }
    return () => {
      if (typeof window !== "undefined") {
        window.resetNokiaKeyboard = null;
      }
    };
  }, []);

  const commitPending = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    
    const bridge = getIMEBridge();
    const finalChar = pendingCharRef.current;
    
    if (finalChar) {
      if (bridge) {
        bridge.commitText(finalChar);
      } else {
        console.log(`IME mock commitText: "${finalChar}"`);
      }
    }
    
    activeKeyRef.current = null;
    cycleIndexRef.current = 0;
    pendingCharRef.current = "";
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
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      activeKeyRef.current = null;
      cycleIndexRef.current = 0;
      pendingCharRef.current = "";
      
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
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      
      if (activeKeyRef.current !== null) {
        // Cancel the current pending composition
        activeKeyRef.current = null;
        cycleIndexRef.current = 0;
        pendingCharRef.current = "";
        
        if (bridge) {
          bridge.setComposingText("");
        } else {
          console.log("IME mock cancel composition");
        }
      } else {
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
    const cycle = MULTI_TAP_CYCLES[key];
    if (cycle) {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);

      if (activeKeyRef.current === key) {
        // Cycle active key characters
        cycleIndexRef.current = (cycleIndexRef.current + 1) % cycle.length;
      } else {
        // Commit previous pending composition
        if (activeKeyRef.current !== null && pendingCharRef.current) {
          if (bridge) {
            bridge.commitText(pendingCharRef.current);
          }
        }
        activeKeyRef.current = key;
        cycleIndexRef.current = 0;
      }

      const nextChar = cycle[cycleIndexRef.current];
      pendingCharRef.current = nextChar;

      // Show the composing character underlined in text field
      if (bridge) {
        bridge.setComposingText(nextChar);
      } else {
        console.log(`IME mock composingText: "${nextChar}"`);
      }

      // Automatically commit character after 250ms of inactivity
      commitTimerRef.current = setTimeout(commitPending, MULTI_TAP_DELAY);
    }
  }, [commitPending, isNavMode]);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#050505] p-2 md:p-4 select-none" data-testid="nokia-system-keyboard">
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
