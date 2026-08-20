import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Screen from "./Screen";
import Keypad from "./Keypad";
import { launchInstalledApp, makePhoneCall, showKeyboardSettings } from "@/lib/launcherApps";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import {
  SETTINGS_ITEMS,
  createHomeShortcuts,
  findMatchingApp,
  orderDrawerApps,
} from "@/domain/launcherMenus";
import "./NokiaLauncher.css";

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
  app?.displayName || app?.name || app?.label || app?.title || app?.packageName || "";

const getAppSearchText = (app) =>
  `${getAppDisplayName(app)} ${app.packageName || ""}`.toLowerCase();

const NokiaLauncher = ({ apps }) => {
  const [currentView, setCurrentView] = useState("home");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settingsReturnView, setSettingsReturnView] = useState("home");

  // searchActive as both state (for UI re-render) and ref (for sync reads inside callbacks)
  const [searchActive, setSearchActive] = useState(false);
  const searchActiveRef = useRef(false);

  // committedText: fully confirmed characters | pendingChar: character being cycled right now
  const [committedText, setCommittedText] = useState("");
  const [pendingChar, setPendingChar] = useState("");

  // Dialer state for home screen numbers
  const [dialActive, setDialActive] = useState(false);
  const [dialNumber, setDialNumber] = useState("");

  // Shared multi-tap module keeps timing/cycling out of the launcher controller.
  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: MULTI_TAP_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: setPendingChar,
      onCommit: (character) => setCommittedText((text) => text + character),
    });
  }

  // ── Clock ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const homeShortcuts = useMemo(
    () => createHomeShortcuts(apps),
    [apps]
  );

  const drawerApps = useMemo(() => orderDrawerApps(apps), [apps]);

  const settingsApp = useMemo(
    () => findMatchingApp(apps, ["settings", "android settings"]),
    [apps]
  );

  const menuItems = currentView === "home"
    ? homeShortcuts
    : currentView === "settings"
      ? SETTINGS_ITEMS
      : drawerApps;

  // Reset selection whenever the active screen changes.
  useEffect(() => {
    setSelectedIndex(0);
  }, [currentView]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Clears pending state WITHOUT committing (used on cancel / deactivate)
  const clearPending = useCallback(() => {
    multiTapComposerRef.current.reset();
  }, []);

  // Commits whatever character is currently pending.
  const commitPending = useCallback(() => {
    multiTapComposerRef.current.commit();
  }, []);

  useEffect(() => () => multiTapComposerRef.current?.dispose(), []);

  // Activates search mode — sync both the state and the ref
  const activateSearch = useCallback(() => {
    searchActiveRef.current = true;
    setSearchActive(true);
    setCommittedText("");
    clearPending();
    setSelectedIndex(0);
  }, [clearPending]);

  const openSearch = useCallback(() => {
    setCurrentView("menu");
    activateSearch();
  }, [activateSearch]);

  const openSettings = useCallback((returnView = currentView) => {
    searchActiveRef.current = false;
    setSearchActive(false);
    setCommittedText("");
    clearPending();
    setSettingsReturnView(returnView === "settings" ? "home" : returnView);
    setCurrentView("settings");
  }, [clearPending, currentView]);

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

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNavigation = useCallback(
    (direction) => {
      setSelectedIndex((prev) => {
        const len = visibleMenuItems.length;
        if (len === 0) return 0;
        if (currentView === "home") {
          if (direction === "left" || direction === "up") {
            return prev > 0 ? prev - 1 : len - 1;
          }
          if (direction === "right" || direction === "down") {
            return prev < len - 1 ? prev + 1 : 0;
          }
          return prev;
        }
        if (direction === "up")   return prev > 0       ? prev - 1 : len - 1;
        if (direction === "down") return prev < len - 1 ? prev + 1 : 0;
        return prev;
      });
    },
    [currentView, visibleMenuItems.length]
  );

  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    launchInstalledApp(app).catch((err) => console.error("Error launching app:", err));
  }, []);

  const handleSelect = useCallback(() => {
    if (currentView === "home" && menuItems[selectedIndex]) {
      handleOpenApp(menuItems[selectedIndex].app);
    } else if (currentView === "menu" && visibleMenuItems[selectedIndex]) {
      handleOpenApp(visibleMenuItems[selectedIndex]);
    } else if (currentView === "settings" && menuItems[selectedIndex]) {
      const setting = menuItems[selectedIndex];
      if (setting.id === "keyboard") {
        showKeyboardSettings().catch((error) =>
          console.error("Error opening keyboard settings:", error)
        );
      } else {
        handleOpenApp(settingsApp);
      }
    }
  }, [currentView, selectedIndex, menuItems, visibleMenuItems, handleOpenApp, settingsApp]);

  const handleSettingClick = useCallback((setting) => {
    if (!setting) return;
    const index = SETTINGS_ITEMS.findIndex((item) => item.id === setting.id);
    if (index >= 0) setSelectedIndex(index);
    if (setting.id === "keyboard") {
      showKeyboardSettings().catch((error) =>
        console.error("Error opening keyboard settings:", error)
      );
    } else {
      handleOpenApp(settingsApp);
    }
  }, [handleOpenApp, settingsApp]);

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
      return;
    }
    if (currentView === "settings") {
      setCurrentView(settingsReturnView);
    }
  }, [currentView, searchActive, committedText, pendingChar, clearPending, settingsReturnView]);

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
        return multiTapComposerRef.current.press(key);
      }

      // ── Backspace (*) ──
      if (key === "*") {
        if (!multiTapComposerRef.current.cancelPending()) {
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
        if (currentView === "settings") {
          setCurrentView(settingsReturnView);
          return;
        }
        return;
      }

      if (key === "SELECT") {
        handleSelect();
        return;
      }

      if (["UP", "DOWN", "LEFT", "RIGHT"].includes(key)) {
        handleNavigation(key.toLowerCase());
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
      settingsReturnView,
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
    <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher">
      {/* Top Screen - 50% */}
      <div className="nokia-launcher__screen h-1/2 w-full relative flex flex-col">
        <Screen
          currentView={currentView}
          menuItems={visibleMenuItems}
          selectedIndex={selectedIndex}
          currentTime={currentTime}
          searchActive={searchActive}
          searchQuery={fullInput}
          onSearchFocus={currentView === "home" ? openSearch : activateSearch}
          onAppClick={handleOpenApp}
          onOpenMenu={() => setCurrentView("menu")}
          onOpenSettings={() => openSettings(currentView)}
          onSettingClick={handleSettingClick}
          onBack={handleBack}
          dialActive={dialActive}
          dialNumber={dialNumber}
        />
      </div>

      {/* Bottom Keypad - 50% */}
      <div className="nokia-launcher__keypad h-1/2 w-full flex items-center justify-center">
        <Keypad variant="launcher" onKeypadPress={handleKeypadPress} />
      </div>
    </div>
  );
};

export default NokiaLauncher;
