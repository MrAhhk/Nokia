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

    // ─── END (Red Key) -> Hide keyboard ───
    if (key === "END") {
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      activeKeyRef.current = null;
      cycleIndexRef.current = 0;
      pendingCharRef.current = "";
      
      if (bridge) {
        bridge.hideKeyboard();
      } else {
        console.log("IME mock hide keyboard");
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

    // ─── Keypad navigation keys when not text-input (1, 2, 4, 5, 6, 8, #) ───
    // For standard system typing, we can treat them as their literal values or symbols
    if (key === "1") {
      commitPending();
      if (bridge) bridge.commitText(".");
      return;
    }
    if (key === "#") {
      commitPending();
      if (bridge) bridge.commitText("#");
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
  }, [commitPending]);

  return (
    <div className="h-[100dvh] w-full p-4 bg-[#050505] flex items-center justify-center select-none" data-testid="nokia-system-keyboard">
      <Keypad onKeypadPress={handleKeyPress} />
    </div>
  );
};

export default NokiaSystemKeyboard;
