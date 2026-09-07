import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Screen from "./Screen";
import Keypad from "./Keypad";
import CameraFeature from "@/features/camera/CameraFeature";
import BrowserFeature from "@/features/browser/BrowserFeature";
import ClockFeature from "@/features/clock/ClockFeature";
import SnakeFeature from "@/features/snake/SnakeFeature";
import SoundFeature from "@/features/sound/SoundFeature";
import ToneSetupPrompt from "@/features/sound/ToneSetupPrompt";
import { pauseAudioEngine, playKeypadTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import {
  TONE_SETUP_STATES,
  buildSystemToneSelections,
  loadToneSetupState,
  saveToneSetupState,
} from "@/features/sound/toneSetupState";
import { BROWSER_START_URL } from "@/features/browser/browserAddress";
import {
  cycleNotificationMode,
  applySystemTone,
  getDeviceStatus,
  getSystemToneAccess,
  launchInstalledApp,
  makePhoneCall,
  openDefaultMaps,
  openDefaultPhone,
  openNotificationAccessSettings,
  openSystemSetting,
  openWebUrl,
  requestSystemToneAccess,
  toggleSirenSound,
  triggerHaptic,
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
import "./AgedHardwareTheme.css";
import "./ReferenceHardware.css";

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
  const browserFeatureRef = useRef(null);
  const clockFeatureRef = useRef(null);
  const snakeFeatureRef = useRef(null);
  const soundFeatureRef = useRef(null);

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
  const nativeToneSetupAvailable = Boolean(window.Capacitor?.Plugins?.LauncherApps);
  const [toneSetupState, setToneSetupState] = useState(() =>
    nativeToneSetupAvailable ? loadToneSetupState() : TONE_SETUP_STATES.SKIPPED
  );
  const [toneSetupBusy, setToneSetupBusy] = useState(false);
  const [toneSetupMessage, setToneSetupMessage] = useState("");

  const toneSetupVisible = nativeToneSetupAvailable
    && toneSetupState !== TONE_SETUP_STATES.APPLIED
    && toneSetupState !== TONE_SETUP_STATES.SKIPPED;

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

  // The LCD only displays hours/minutes. Align updates to minute boundaries so
  // the entire launcher does not re-render every second while idle.
  useEffect(() => {
    let interval = null;
    const delayToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setCurrentTime(new Date());
      interval = setInterval(() => setCurrentTime(new Date()), 60_000);
    }, delayToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval !== null) clearInterval(interval);
    };
  }, []);

  const applyInitialSystemTones = useCallback(async () => {
    setToneSetupBusy(true);
    setToneSetupMessage("Setting phone tones");
    const tones = buildSystemToneSelections(loadSoundSettings());
    try {
      for (const tone of tones) {
        const result = await applySystemTone(tone.toneType, tone.assetPath, tone.title);
        if (!result?.success) throw new Error("tone-apply-failed");
      }
      saveToneSetupState(TONE_SETUP_STATES.APPLIED);
      setToneSetupState(TONE_SETUP_STATES.APPLIED);
    } catch (_error) {
      setToneSetupMessage("Could not set every tone");
    } finally {
      setToneSetupBusy(false);
    }
  }, []);

  const acceptToneSetup = useCallback(async () => {
    if (toneSetupBusy) return;
    setToneSetupBusy(true);
    setToneSetupMessage("Checking Android access");
    try {
      const access = await getSystemToneAccess();
      if (!access?.supported) {
        setToneSetupMessage("Not supported on this phone");
        return;
      }
      if (!access.granted) {
        saveToneSetupState(TONE_SETUP_STATES.AWAITING_ACCESS);
        setToneSetupState(TONE_SETUP_STATES.AWAITING_ACCESS);
        setToneSetupMessage("Allow access, then return");
        await requestSystemToneAccess();
        return;
      }
      await applyInitialSystemTones();
    } catch (_error) {
      setToneSetupMessage("Could not open tone access");
    } finally {
      setToneSetupBusy(false);
    }
  }, [applyInitialSystemTones, toneSetupBusy]);

  const skipToneSetup = useCallback(() => {
    if (toneSetupBusy) return;
    saveToneSetupState(TONE_SETUP_STATES.SKIPPED);
    setToneSetupState(TONE_SETUP_STATES.SKIPPED);
  }, [toneSetupBusy]);

  useEffect(() => {
    if (toneSetupState !== TONE_SETUP_STATES.AWAITING_ACCESS) return undefined;
    const finishAfterGrant = () => {
      if (document.visibilityState !== "visible") return;
      getSystemToneAccess()
        .then((access) => {
          if (access?.granted) return applyInitialSystemTones();
          setToneSetupMessage("Access not granted");
          return null;
        })
        .catch(() => setToneSetupMessage("Could not check tone access"));
    };
    document.addEventListener("visibilitychange", finishAfterGrant);
    finishAfterGrant();
    return () => document.removeEventListener("visibilitychange", finishAfterGrant);
  }, [applyInitialSystemTones, toneSetupState]);

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
    return () => {
      active = false;
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

  const openBuiltInBrowser = useCallback(() => {
    setCurrentView("browser");
  }, []);

  const closeBuiltInBrowser = useCallback(() => {
    setCurrentView("home");
  }, []);

  const restoreHome = useCallback(() => {
    searchActiveRef.current = false;
    setSearchActive(false);
    setCommittedText("");
    clearPending();
    setDialActive(false);
    setDialNumber("");
    setCurrentView("home");
    setSelectedIndex(HOME_FOCUS_TARGETS.indexOf("phone"));
  }, [clearPending]);

  useEffect(() => {
    window.addEventListener("nokia-home-request", restoreHome);
    return () => window.removeEventListener("nokia-home-request", restoreHome);
  }, [restoreHome]);

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

    if (action.type === "internal-feature") {
      setCurrentView(action.view);
      return;
    }

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
      if (target === "clock") {
        setCurrentView("clock");
      } else if (target === "search") {
        openBuiltInBrowser();
      } else {
        handleOpenApp(resolveHomeShortcut(homeShortcuts, target));
      }
    } else if (currentView === "menu" && visibleMenuItems[selectedIndex]) {
      handleOpenApp(visibleMenuItems[selectedIndex]);
    } else if (currentView === "settings" && visibleMenuItems[selectedIndex]) {
      activateSetting(visibleMenuItems[selectedIndex]);
    }
  }, [currentView, selectedIndex, visibleMenuItems, handleOpenApp, homeShortcuts, openBuiltInBrowser, activateSetting]);

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
      // Universal audio + haptic feedback for every keypress
      const soundPrefs = loadSoundSettings();
      playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate);

      if (key === "HOME") {
        if (toneSetupVisible) { skipToneSetup(); return; }
        clearPending();
        setCommittedText("");
        searchActiveRef.current = false;
        setSearchActive(false);
        setDialNumber("");
        setDialActive(false);
        setCurrentView("home");
        return;
      }
      if (key === "TAB") key = "RIGHT";
      if (key === "BACK") {
        if (["camera", "clock", "browser", "snake", "sound"].includes(currentView) || toneSetupVisible) {
          key = "END";
        } else if (dialActive) {
          setDialNumber((value) => value.slice(0, -1));
          if (dialNumber.length <= 1) setDialActive(false);
          return;
        } else {
          handleBack();
          return;
        }
      }

      if (toneSetupVisible) {
        if (key === "END") skipToneSetup();
        if (key === "SEND" || key === "SELECT" || key === "5") acceptToneSetup();
        return;
      }

      if (currentView === "camera") {
        cameraFeatureRef.current?.handleKey(key);
        return;
      }
      if (currentView === "clock") {
        clockFeatureRef.current?.handleKey(key);
        return;
      }
      if (currentView === "browser") {
        browserFeatureRef.current?.handleKey(key);
        return;
      }
      if (currentView === "snake") {
        snakeFeatureRef.current?.handleKey(key);
        return;
      }
      if (currentView === "sound") {
        soundFeatureRef.current?.handleKey(key);
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
      openSettings,
      toneSetupVisible,
      acceptToneSetup,
      skipToneSetup,
    ]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher">
      <div className="nokia-wordmark" aria-label="Nokia">
        <svg viewBox="0 0 300 52" aria-hidden="true">
          <path fill="currentColor" fillRule="evenodd" d="M0 0H13L43 34V0H55V52H42L12 18V52H0ZM75 0H112Q123 0 123 11V41Q123 52 112 52H75Q64 52 64 41V11Q64 0 75 0ZM78 11Q76 11 76 14V38Q76 41 79 41H108Q111 41 111 38V14Q111 11 108 11ZM133 0H145V21L171 0H189L158 25L190 52H172L145 29V52H133ZM198 0H210V52H198ZM244 0H263L300 52H284L277 41H231L224 52H209ZM238 30H269L254 8Z" />
        </svg>
      </div>
      {/* Top Screen - 50% */}
      <div className="nokia-launcher__screen h-1/2 w-full relative flex flex-col">
        {toneSetupVisible ? (
          <ToneSetupPrompt
            busy={toneSetupBusy}
            message={toneSetupMessage}
            onAccept={acceptToneSetup}
            onSkip={skipToneSetup}
          />
        ) : currentView === "camera" ? (
          <CameraFeature
            ref={cameraFeatureRef}
            onExit={() => setCurrentView(cameraReturnView)}
          />
        ) : currentView === "browser" ? (
          <BrowserFeature
            ref={browserFeatureRef}
            initialUrl={BROWSER_START_URL}
            onExit={closeBuiltInBrowser}
          />
        ) : currentView === "clock" ? (
          <ClockFeature
            ref={clockFeatureRef}
            onExit={() => setCurrentView("home")}
          />
        ) : currentView === "snake" ? (
          <SnakeFeature
            ref={snakeFeatureRef}
            currentTime={currentTime}
            deviceStatus={deviceStatus}
            onExit={() => setCurrentView("settings")}
          />
        ) : currentView === "sound" ? (
          <SoundFeature
            ref={soundFeatureRef}
            onExit={() => setCurrentView("settings")}
          />
        ) : <Screen
          currentView={currentView}
          menuItems={visibleMenuItems}
          selectedIndex={selectedIndex}
          selectedHomeTarget={currentView === "home" ? HOME_FOCUS_TARGETS[selectedIndex] : null}
          currentTime={currentTime}
          searchActive={searchActive}
          searchQuery={fullInput}
          onSearchFocus={() => { triggerHaptic(65); openBuiltInBrowser(); }}
          onClockClick={() => { triggerHaptic(65); setCurrentView("clock"); }}
          onAppClick={(app) => { triggerHaptic(65); handleOpenApp(app); }}
          onOpenMenu={() => { triggerHaptic(65); setCurrentView("menu"); }}
          onOpenSettings={() => { triggerHaptic(65); openSettings(currentView); }}
          onSettingClick={(s) => { triggerHaptic(65); handleSettingClick(s); }}
          onListSearchFocus={() => { triggerHaptic(65); activateSearch(); }}
          onBack={() => { triggerHaptic(65); handleBack(); }}
          dialActive={dialActive}
          dialNumber={dialNumber}
          deviceStatus={deviceStatus}
          onNotificationStatusClick={() => { triggerHaptic(65); openNotificationAccessSettings(); }}
          onSirenToggle={() => { triggerHaptic(65); handleSirenToggle(); }}
          onNotificationModeCycle={() => { triggerHaptic(65); handleNotificationModeCycle(); }}
          onStatusIconClick={(type) => { triggerHaptic(65); openSystemSetting(type); }}
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
