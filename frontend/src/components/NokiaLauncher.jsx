import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Screen from "./Screen";
import Keypad from "./Keypad";
import CameraFeature from "@/features/camera/CameraFeature";
import {
  cycleNotificationMode,
  getDeviceStatus,
  launchInstalledApp,
  makePhoneCall,
  openDefaultMaps,
  openDefaultPhone,
  openNotificationAccessSettings,
  openSystemSetting,
  openWebUrl,
  toggleSirenSound,
} from "@/lib/launcherApps";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import {
  HOME_FOCUS_TARGETS,
  SETTINGS_ITEMS,
  createHomeShortcuts,
  moveHomeFocus,
  moveListSelection,
  orderDrawerApps,
  rankSearchResults,
  resolveHomeShortcut,
  resolveSettingAction,
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

const NokiaLauncher = ({ apps }) => {
  const [currentView, setCurrentView] = useState("home");
  const [selectedIndex, setSelectedIndex] = useState(
    HOME_FOCUS_TARGETS.indexOf("phone")
  );
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settingsReturnView, setSettingsReturnView] = useState("home");
  const [cameraReturnView, setCameraReturnView] = useState("home");
  const cameraFeatureRef = useRef(null);

  // searchActive as both state (for UI re-render) and ref (for sync reads inside callbacks)
  const [searchActive, setSearchActive] = useState(false);
  const searchActiveRef = useRef(false);

  // committedText: fully confirmed characters | pendingChar: character being cycled right now
  const [committedText, setCommittedText] = useState("");
  const [pendingChar, setPendingChar] = useState("");

  // Dialer state for home screen numbers
  const [dialActive, setDialActive] = useState(false);
  const [dialNumber, setDialNumber] = useState("");
  const [deviceStatus, setDeviceStatus] = useState(null);

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

  const refreshDeviceStatus = useCallback(() => {
    getDeviceStatus().then(setDeviceStatus).catch((error) =>
      console.warn("Device status unavailable:", error)
    );
  }, []);

  const handleSirenToggle = useCallback(() => {
    toggleSirenSound().then(refreshDeviceStatus).catch((error) =>
      console.error("Unable to toggle siren sound:", error)
    );
  }, [refreshDeviceStatus]);

  const handleNotificationModeCycle = useCallback(() => {
    cycleNotificationMode().then(refreshDeviceStatus).catch((error) =>
      console.error("Unable to change notification mode:", error)
    );
  }, [refreshDeviceStatus]);

  useEffect(() => {
    let active = true;
    const refresh = () => getDeviceStatus()
      .then((status) => active && setDeviceStatus(status))
      .catch((error) => console.warn("Device status unavailable:", error));
    refresh();
    const timer = setInterval(refresh, 5000);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const homeShortcuts = useMemo(
    () => createHomeShortcuts(apps),
    [apps]
  );

  const drawerApps = useMemo(() => orderDrawerApps(apps), [apps]);

  const menuItems = currentView === "home"
    ? homeShortcuts
    : currentView === "settings"
      ? SETTINGS_ITEMS
      : drawerApps;

  // Reset selection whenever the active screen changes.
  useEffect(() => {
    setSelectedIndex(
      currentView === "home" ? HOME_FOCUS_TARGETS.indexOf("phone") : 0
    );
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

  const openGoogleSearch = useCallback(() => {
    openWebUrl("https://www.google.com").catch((error) =>
      console.error("Error opening Google search:", error)
    );
  }, []);

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
    if (!(["menu", "settings"].includes(currentView)) || !fullInput) return menuItems;
    return rankSearchResults(menuItems, fullInput);
  }, [currentView, menuItems, fullInput]);

  // Reset selection whenever the filtered list changes
  useEffect(() => {
    if (currentView === "menu" || currentView === "settings") {
      setSelectedIndex(0);
    }
  }, [currentView, fullInput]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNavigation = useCallback(
    (direction) => {
      setSelectedIndex((prev) => {
        const len = visibleMenuItems.length;
        if (currentView === "home") {
          return moveHomeFocus(prev, direction);
        }
        return moveListSelection(prev, len, direction);
      });
    },
    [currentView, visibleMenuItems.length]
  );

  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    if (app.action === "default-phone") {
      openDefaultPhone().catch((err) => console.error("Error opening phone:", err));
      return;
    }
    if (app.action === "default-maps") {
      openDefaultMaps().catch((err) => console.error("Error opening maps:", err));
      return;
    }
    if (app.action === "built-in-camera") {
      setCameraReturnView(currentView === "camera" ? "home" : currentView);
      setCurrentView("camera");
      return;
    }
    launchInstalledApp(app).catch((err) => console.error("Error launching app:", err));
  }, [currentView]);

  const activateSetting = useCallback((setting) => {
    const action = resolveSettingAction(setting);
    if (!action) return;

    const request = action.type === "web-url"
      ? openWebUrl(action.url)
      : openSystemSetting(action.setting);

    request.catch((error) =>
      console.error(`Error opening ${setting.id}:`, error)
    );
  }, []);

  const handleSelect = useCallback(() => {
    if (currentView === "home") {
      const target = HOME_FOCUS_TARGETS[selectedIndex];
      if (target === "search") {
        openGoogleSearch();
      } else {
        handleOpenApp(resolveHomeShortcut(homeShortcuts, target));
      }
    } else if (currentView === "menu" && visibleMenuItems[selectedIndex]) {
      handleOpenApp(visibleMenuItems[selectedIndex]);
    } else if (currentView === "settings" && visibleMenuItems[selectedIndex]) {
      activateSetting(visibleMenuItems[selectedIndex]);
    }
  }, [currentView, selectedIndex, visibleMenuItems, handleOpenApp, homeShortcuts, openGoogleSearch, activateSetting]);

  const handleSettingClick = useCallback((setting) => {
    if (!setting) return;
    const index = visibleMenuItems.findIndex((item) => item.id === setting.id);
    if (index >= 0) setSelectedIndex(index);
    activateSetting(setting);
  }, [activateSetting, visibleMenuItems]);

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
      if (pendingChar) { clearPending(); return; }
      if (committedText) { setCommittedText(""); return; }
      if (searchActive) {
        searchActiveRef.current = false;
        setSearchActive(false);
        return;
      }
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
      if (currentView === "camera") {
        cameraFeatureRef.current?.handleKey(key);
        return;
      }
      // ─── Handle Call / Hangup / Select keys globally first ───
      if (key === "SEND") {
        if (dialActive && dialNumber) {
          makePhoneCall(dialNumber);
        } else if (currentView === "home") {
          setCurrentView("menu");
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
        if (currentView === "home") {
          openSettings("home");
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
      if ((currentView === "menu" || currentView === "settings") && MULTI_TAP_CYCLES[key] && !searchActiveRef.current) {
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
      handleOpenApp,
      openSettings
    ]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher">
      {/* Top Screen - 50% */}
      <div className="nokia-launcher__screen h-1/2 w-full relative flex flex-col">
        {currentView === "camera" ? (
          <CameraFeature
            ref={cameraFeatureRef}
            onExit={() => setCurrentView(cameraReturnView)}
          />
        ) : <Screen
          currentView={currentView}
          menuItems={visibleMenuItems}
          selectedIndex={selectedIndex}
          selectedHomeTarget={currentView === "home" ? HOME_FOCUS_TARGETS[selectedIndex] : null}
          currentTime={currentTime}
          searchActive={searchActive}
          searchQuery={fullInput}
          onSearchFocus={openGoogleSearch}
          onAppClick={handleOpenApp}
          onOpenMenu={() => setCurrentView("menu")}
          onOpenSettings={() => openSettings(currentView)}
          onSettingClick={handleSettingClick}
          onListSearchFocus={activateSearch}
          onBack={handleBack}
          dialActive={dialActive}
          dialNumber={dialNumber}
          deviceStatus={deviceStatus}
          onNotificationStatusClick={openNotificationAccessSettings}
          onSirenToggle={handleSirenToggle}
          onNotificationModeCycle={handleNotificationModeCycle}
          onStatusIconClick={openSystemSetting}
        />}
      </div>

      {/* Bottom Keypad - 50% */}
      <div className="nokia-launcher__keypad h-1/2 w-full flex items-center justify-center">
        <Keypad variant="launcher" onKeypadPress={handleKeypadPress} />
      </div>
    </div>
  );
};

export default NokiaLauncher;
