import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Screen from "./Screen";
import Keypad from "./Keypad";
import { launchInstalledApp, makePhoneCall } from "@/lib/launcherApps";

// Multi-tap cycle: letters first, number at the end (classic Nokia)
const MULTI_TAP_CYCLES = {
  "2": ["A", "B", "C", "2"],
  "3": ["D", "E", "F", "3"],
  "4": ["G", "H", "I", "4"],
  "5": ["J", "K", "L", "5"],
  "6": ["M", "N", "O", "6"],
  "7": ["P", "Q", "R", "S", "7"],
  "8": ["T", "U", "V", "8"],
  "9": ["W", "X", "Y", "Z", "9"],
};

// How long (ms) of inactivity before the pending char is auto-committed
const MULTI_TAP_DELAY = 250;

const getAppDisplayName = (app) =>
  app?.name || app?.label || app?.title || app?.packageName || "";

const getAppSearchText = (app) =>
  `${getAppDisplayName(app)} ${app.packageName || ""}`.toLowerCase();

const NokiaLauncher = ({ apps }) => {
  const [currentView, setCurrentView] = useState("home");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [menuItems, setMenuItems] = useState([]);

  // searchActive as both state (for UI re-render) and ref (for sync reads inside callbacks)
  const [searchActive, setSearchActive] = useState(false);
  const searchActiveRef = useRef(false);

  // committedText: fully confirmed characters | pendingChar: character being cycled right now
  const [committedText, setCommittedText] = useState("");
  const [pendingChar, setPendingChar] = useState("");

  // Dialer state for home screen numbers
  const [dialActive, setDialActive] = useState(false);
  const [dialNumber, setDialNumber] = useState("");

  // Multi-tap refs — avoid stale closure bugs by keeping mutable values in refs
  const activeKeyRef = useRef(null);   // key currently being cycled
  const cycleIndexRef = useRef(0);     // position in that key's cycle array
  const commitTimerRef = useRef(null); // auto-commit timeout handle

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // ── Menu items ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (currentView === "home") {
      setMenuItems([
        { id: "menu",     label: "Menu",     action: () => setCurrentView("menu") },
        { id: "contacts", label: "Contacts", action: () => console.log("Contacts") },
        { id: "messages", label: "Messages", action: () => console.log("Messages") },
      ]);
      setSelectedIndex(0);
    } else if (currentView === "menu") {
      setMenuItems(apps);
      setSelectedIndex(0);
    }
  }, [currentView, apps]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Clears pending state WITHOUT committing (used on cancel / deactivate)
  const clearPending = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    activeKeyRef.current = null;
    cycleIndexRef.current = 0;
    setPendingChar("");
  }, []);

  // Commits whatever is currently pending by reading directly from refs (no stale closures)
  const commitPending = useCallback(() => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    if (activeKeyRef.current !== null) {
      const char = MULTI_TAP_CYCLES[activeKeyRef.current]?.[cycleIndexRef.current];
      if (char) setCommittedText((t) => t + char);
    }
    activeKeyRef.current = null;
    cycleIndexRef.current = 0;
    setPendingChar("");
  }, []);

  // Activates search mode — sync both the state and the ref
  const activateSearch = useCallback(() => {
    searchActiveRef.current = true;
    setSearchActive(true);
    setCommittedText("");
    clearPending();
    setSelectedIndex(0);
  }, [clearPending]);

  // ── Visible/filtered menu items ────────────────────────────────────────────
  const fullInput = committedText + pendingChar; // what the user has typed so far

  const visibleMenuItems = useMemo(() => {
    if (currentView !== "menu" || !fullInput) return menuItems;
    return menuItems.filter((app) =>
      getAppSearchText(app).includes(fullInput.toLowerCase())
    );
  }, [currentView, menuItems, fullInput]);

  // Reset selection whenever the filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [fullInput]);

  // Search box display text
  const searchPreviewText = useMemo(() => {
    return fullInput.toUpperCase();
  }, [fullInput]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNavigation = useCallback(
    (direction) => {
      if (searchActive) return;
      setSelectedIndex((prev) => {
        const len = visibleMenuItems.length;
        if (len === 0) return 0;
        if (direction === "up")   return prev > 0       ? prev - 1 : len - 1;
        if (direction === "down") return prev < len - 1 ? prev + 1 : 0;
        return prev;
      });
    },
    [searchActive, visibleMenuItems.length]
  );

  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    launchInstalledApp(app).catch((err) => console.error("Error launching app:", err));
  }, []);

  const handleSelect = useCallback(() => {
    if (currentView === "home" && menuItems[selectedIndex]) {
      menuItems[selectedIndex].action();
    } else if (currentView === "menu" && visibleMenuItems[selectedIndex]) {
      handleOpenApp(visibleMenuItems[selectedIndex]);
    }
  }, [currentView, selectedIndex, menuItems, visibleMenuItems, handleOpenApp]);

  const handleBack = useCallback(() => {
    if (currentView === "menu") {
      if (pendingChar) { clearPending(); return; }
      if (committedText) { setCommittedText(""); return; }
      if (searchActive) {
        searchActiveRef.current = false;
        setSearchActive(false);
        return;
      }
      setCurrentView("home");
    }
  }, [currentView, searchActive, committedText, pendingChar, clearPending]);

  // Deactivate search → reset everything
  useEffect(() => {
    if (!searchActive) {
      setCommittedText("");
      clearPending();
    }
  }, [searchActive, clearPending]);

  // ── Multi-tap handler ──────────────────────────────────────────────────────
  const handleMultiTapInput = useCallback(
    (key) => {
      // Only runs when search is active (checked via ref for sync accuracy)
      if (!searchActiveRef.current) return false;

      const cycle = MULTI_TAP_CYCLES[key];

      // ── Letter/number keys (2–9) ──
      if (cycle) {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);

        if (activeKeyRef.current === key) {
          // Same key → advance cycle
          cycleIndexRef.current = (cycleIndexRef.current + 1) % cycle.length;
        } else {
          // Different key → commit the previous pending char (read from refs, not stale state)
          if (activeKeyRef.current !== null) {
            const prevChar = MULTI_TAP_CYCLES[activeKeyRef.current]?.[cycleIndexRef.current];
            if (prevChar) setCommittedText((t) => t + prevChar);
          }
          activeKeyRef.current = key;
          cycleIndexRef.current = 0;
        }

        const newChar = cycle[cycleIndexRef.current];
        setPendingChar(newChar);

        // Auto-commit after delay
        commitTimerRef.current = setTimeout(commitPending, MULTI_TAP_DELAY);
        return true;
      }

      // ── Backspace (*) ──
      if (key === "*") {
        if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
        if (activeKeyRef.current !== null) {
          // Cancel the current pending char
          activeKeyRef.current = null;
          cycleIndexRef.current = 0;
          setPendingChar("");
        } else {
          // Delete last committed character
          setCommittedText((t) => t.slice(0, -1));
        }
        return true;
      }

      // ── Space (0) ──
      if (key === "0") {
        commitPending();
        setCommittedText((t) => t + " ");
        return true;
      }

      return false;
    },
    [commitPending]
  );

  // ─── Main keypad dispatcher ─────────────────────────────────────────────────
  const handleKeypadPress = useCallback(
    (key) => {
      // ─── Handle Call / Hangup / Select keys globally first ───
      if (key === "SEND") {
        if (dialActive && dialNumber) {
          makePhoneCall(dialNumber);
        } else if (currentView === "menu" && visibleMenuItems[selectedIndex]) {
          handleOpenApp(visibleMenuItems[selectedIndex]);
        }
        return;
      }

      if (key === "END") {
        if (dialActive) {
          setDialNumber("");
          setDialActive(false);
          return;
        }
        if (fullInput) {
          setCommittedText("");
          clearPending();
          return;
        }
        if (searchActive) {
          searchActiveRef.current = false;
          setSearchActive(false);
          return;
        }
        if (currentView === "menu") {
          setCurrentView("home");
          return;
        }
        return;
      }

      if (key === "SELECT") {
        handleSelect();
        return;
      }

      // ─── Direct Dialer mode inputs ───
      if (dialActive) {
        if (key >= "0" && key <= "9") {
          setDialNumber((prev) => prev + key);
          return;
        }
        if (key === "*") {
          setDialNumber((prev) => {
            const next = prev.slice(0, -1);
            if (!next) {
              setDialActive(false);
            }
            return next;
          });
          return;
        }
        if (key === "#") {
          setDialNumber((prev) => prev + "#");
          return;
        }
      }

      // ─── Home Screen Digit input starts Dialing ───
      if (currentView === "home" && key >= "0" && key <= "9") {
        setDialActive(true);
        setDialNumber(key);
        return;
      }

      // ─── Home Screen * opens Menu ───
      if (currentView === "home" && key === "*") {
        setCurrentView("menu");
        return;
      }

      // ─── Auto-activate search in menu when typing letters ───
      if (currentView === "menu" && MULTI_TAP_CYCLES[key] && !searchActiveRef.current) {
        activateSearch();
      }

      // Try multi-tap (fires when searchActive ref is true)
      if (handleMultiTapInput(key)) return;

      // Navigation / action keys (only when not in text-input mode)
      if (key === "1") {
        if (currentView === "menu") activateSearch();
      } else if (key === "2") {
        handleNavigation("up");
      } else if (key === "4") {
        handleNavigation("left");
      } else if (key === "5") {
        handleSelect();
      } else if (key === "6") {
        handleNavigation("right");
      } else if (key === "8") {
        handleNavigation("down");
      } else if (key === "#") {
        handleBack();
      }
    },
    [
      currentView,
      dialActive,
      dialNumber,
      fullInput,
      searchActive,
      selectedIndex,
      visibleMenuItems,
      activateSearch,
      handleMultiTapInput,
      handleNavigation,
      handleSelect,
      handleBack,
      clearPending,
      handleOpenApp
    ]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-[100dvh] w-full flex flex-col overflow-hidden bg-black text-white select-none" data-testid="nokia-launcher">
      {/* Top Screen - 50% */}
      <div className="h-[50dvh] w-full p-4 relative flex flex-col bg-black border-b border-white/20">
        <Screen
          currentView={currentView}
          menuItems={visibleMenuItems}
          selectedIndex={selectedIndex}
          currentTime={currentTime}
          searchActive={searchActive}
          searchQuery={fullInput}
          searchPreviewText={searchPreviewText}
          onSearchFocus={activateSearch}
          onAppClick={handleOpenApp}
          dialActive={dialActive}
          dialNumber={dialNumber}
        />
      </div>

      {/* Bottom Keypad - 50% */}
      <div className="h-[50dvh] w-full px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-6 md:pt-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-[#050505] flex items-center justify-center">
        <Keypad onKeypadPress={handleKeypadPress} />
      </div>
    </div>
  );
};

export default NokiaLauncher;
