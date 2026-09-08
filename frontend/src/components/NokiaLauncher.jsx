import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Screen from "./Screen";
import Keypad from "./Keypad";
import CameraFeature from "@/features/camera/CameraFeature";
import BrowserFeature from "@/features/browser/BrowserFeature";
import ClockFeature from "@/features/clock/ClockFeature";
import SnakeFeature from "@/features/snake/SnakeFeature";
import SoundFeature from "@/features/sound/SoundFeature";
import ToneSetupPrompt from "@/features/sound/ToneSetupPrompt";
import { pauseAudioEngine, playKeypadTone, preloadKeypadAudio } from "@/features/sound/nokiaAudioEngine";
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
  toggleFlashlight,
  lockScreen,
  openRecentApps,
  triggerHaptic,
} from "@/lib/launcherApps";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import {
  KEY_INTENTS,
  NOKIA_MULTI_TAP_CYCLES,
  dispatchKey,
  resolveContextualIntent,
} from "@/domain/keyGrammar";
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

// How long (ms) of inactivity before the pending char is auto-committed
const MULTI_TAP_DELAY = 250;
const HOME_APP_TARGETS = HOME_FOCUS_TARGETS.filter((target) => !["clock", "search"].includes(target));

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
  const [capsLock, setCapsLock] = useState(false);
  const capsLockRef = useRef(capsLock);
  capsLockRef.current = capsLock;

  // Dialer state for home screen numbers
  const [dialActive, setDialActive] = useState(false);
  const dialActiveRef = useRef(false);
  dialActiveRef.current = dialActive;
  const [dialNumber, setDialNumber] = useState("");
  const [isCalling, setIsCalling] = useState(false);
  const [openBrowserTabs, setOpenBrowserTabs] = useState(false);
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
      cycles: NOKIA_MULTI_TAP_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: (character) => setPendingChar(capsLockRef.current ? character.toUpperCase() : character),
      onCommit: (character) => setCommittedText((text) => text + (capsLockRef.current ? character.toUpperCase() : character)),
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
    setCapsLock(false);
    setCommittedText("");
    clearPending();
    setSelectedIndex(0);
  }, [clearPending]);

  const openBuiltInBrowser = useCallback(() => {
    setOpenBrowserTabs(false);
    setCurrentView("browser");
  }, []);

  const openBuiltInTabs = useCallback(() => {
    setOpenBrowserTabs(true);
    setCurrentView("browser");
  }, []);

  const closeBuiltInBrowser = useCallback(() => {
    setOpenBrowserTabs(false);
    setCurrentView("home");
  }, []);

  const restoreHome = useCallback(() => {
    searchActiveRef.current = false;
    setSearchActive(false);
    setCommittedText("");
    clearPending();
    dialActiveRef.current = false;
    setDialActive(false);
    setDialNumber("");
    setIsCalling(false);
    setOpenBrowserTabs(false);
    setCapsLock(false);
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

  const handleHomeCursor = useCallback((direction) => {
    setSelectedIndex((previous) => {
      const currentTarget = HOME_FOCUS_TARGETS[previous];
      const currentAppIndex = Math.max(0, HOME_APP_TARGETS.indexOf(currentTarget));
      const nextAppIndex = direction === "left"
        ? (currentAppIndex > 0 ? currentAppIndex - 1 : HOME_APP_TARGETS.length - 1)
        : (currentAppIndex < HOME_APP_TARGETS.length - 1 ? currentAppIndex + 1 : 0);
      return HOME_FOCUS_TARGETS.indexOf(HOME_APP_TARGETS[nextAppIndex]);
    });
  }, []);

  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    if (app.action === "default-phone") {
      dialActiveRef.current = true;
      setDialActive(true);
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

  const handleMultiTapInput = useCallback(
    (key) => {
      if (!searchActiveRef.current) return false;
      const cycle = NOKIA_MULTI_TAP_CYCLES[key];
      if (cycle) return multiTapComposerRef.current.press(key);
      if (key === "*") {
        commitPending();
        setCommittedText((text) => text + "*");
        return true;
      }
      if (key === "0") {
        commitPending();
        setCommittedText((text) => text + " ");
        return true;
      }
      return false;
    },
    [commitPending]
  );

  const handleMultiTapDelete = useCallback(() => {
    if (!searchActiveRef.current) return false;
    if (!multiTapComposerRef.current.cancelPending()) {
      setCommittedText((text) => text.slice(0, -1));
    }
    return true;
  }, []);

  const featureRefsByView = useMemo(() => ({
    camera: cameraFeatureRef,
    clock: clockFeatureRef,
    browser: browserFeatureRef,
    snake: snakeFeatureRef,
    sound: soundFeatureRef,
  }), []);

  const returnHome = useCallback(() => {
    if (toneSetupVisible) {
      skipToneSetup();
      return;
    }
    restoreHome();
  }, [restoreHome, skipToneSetup, toneSetupVisible]);

  const handleUniversalDelete = useCallback(() => {
    if (dialActive || dialActiveRef.current || dialNumber) {
      setIsCalling(false);
      setDialNumber((prev) => (prev ? prev.slice(0, -1) : ""));
      return;
    }
    if (handleMultiTapDelete()) return;
    featureRefsByView[currentView]?.current?.handleKey(KEY_INTENTS.DELETE);
  }, [currentView, dialActive, dialNumber, featureRefsByView, handleMultiTapDelete]);

  const handleUniversalBack = useCallback(() => {
    if (toneSetupVisible) {
      skipToneSetup();
      return;
    }
    if (dialActive || dialActiveRef.current) {
      handleUniversalDelete();
      return;
    }
    const featureRef = featureRefsByView[currentView];
    if (featureRef) {
      featureRef.current?.handleKey(KEY_INTENTS.BACK);
      return;
    }
    handleBack();
  }, [currentView, dialActive, featureRefsByView, handleBack, handleUniversalDelete, skipToneSetup, toneSetupVisible]);

  const handleUniversalRecentApps = useCallback(() => {
    triggerHaptic([0, 30, 20, 30]);
    openRecentApps().catch((err) => console.error("Error opening recent apps:", err));
  }, []);

  const handleUniversalSelect = useCallback(() => {
    if (toneSetupVisible) {
      acceptToneSetup();
      return;
    }
    const featureRef = featureRefsByView[currentView];
    if (featureRef) {
      featureRef.current?.handleKey("SELECT");
      return;
    }
    if (dialActive || dialActiveRef.current) {
      if (dialNumber) {
        setIsCalling(true);
        makePhoneCall(dialNumber).catch((err) => {
          console.error("Error making direct phone call:", err);
          setIsCalling(false);
        });
      }
      return;
    }
    handleSelect();
  }, [acceptToneSetup, currentView, dialActive, dialNumber, featureRefsByView, handleSelect, toneSetupVisible]);

  const handleUniversalDirection = useCallback((key) => {
    const featureRef = featureRefsByView[currentView];
    if (featureRef) {
      featureRef.current?.handleKey(key);
      return;
    }
    if (dialActive || dialActiveRef.current) {
      return;
    }
    if (currentView === "home") {
      const homeDirection = {
        UP: () => setCurrentView("menu"),
        LEFT: () => handleHomeCursor("left"),
        RIGHT: () => handleHomeCursor("right"),
        DOWN: () => handleHomeCursor("right"),
      }[key];
      homeDirection?.();
      return;
    }
    handleNavigation(key.toLowerCase());
  }, [currentView, dialActive, featureRefsByView, handleHomeCursor, handleNavigation]);

  const handleUniversalTab = useCallback(() => {
    if (currentView === "browser") {
      browserFeatureRef.current?.handleKey("TAB");
      return;
    }
    handleUniversalRecentApps();
  }, [currentView, handleUniversalRecentApps]);

  const handleUniversalSend = useCallback(() => {
    const featureRef = featureRefsByView[currentView];
    if (featureRef) {
      featureRef.current?.handleKey("SEND");
      return;
    }
    if (dialActive || dialActiveRef.current) {
      if (dialNumber) {
        setIsCalling(true);
        makePhoneCall(dialNumber).catch((err) => {
          console.error("Error making direct phone call:", err);
          setIsCalling(false);
        });
      }
      return;
    }
    const sendAction = {
      home: () => setCurrentView("menu"),
      menu: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
    }[currentView];
    sendAction?.();
  }, [currentView, dialActive, dialNumber, featureRefsByView, handleOpenApp, selectedIndex, visibleMenuItems]);

  const handleSettingClick = useCallback((setting) => {
    if (!setting) return;
    const index = visibleMenuItems.findIndex((item) => item.id === setting.id);
    if (index >= 0) setSelectedIndex(index);
    activateSetting(setting);
  }, [activateSetting, visibleMenuItems]);

  // Deactivate search → reset everything
  useEffect(() => {
    if (!searchActive) {
      setCommittedText("");
      clearPending();
    }
  }, [searchActive, clearPending]);

  // ─── Main keypad dispatcher ─────────────────────────────────────────────────
  const handleKeypadPress = useCallback(
    (key) => {
      // Universal audio + haptic feedback for every keypress
      const soundPrefs = loadSoundSettings();
      playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate);

      const isDialing = Boolean(dialActive || dialActiveRef.current || dialNumber);
      const keyContext = isDialing
        ? "dial"
        : currentView === "home"
          ? "home"
          : currentView;
      const semanticKey = resolveContextualIntent(key, keyContext);

      const universalHandlers = {
        [KEY_INTENTS.HOME]: returnHome,
        [KEY_INTENTS.END]: returnHome,
        [KEY_INTENTS.BACK]: handleUniversalBack,
        [KEY_INTENTS.DELETE]: handleUniversalDelete,
        [KEY_INTENTS.SELECT]: handleUniversalSelect,
        [KEY_INTENTS.SEND]: handleUniversalSend,
        [KEY_INTENTS.TAB]: handleUniversalTab,
        [KEY_INTENTS.RECENT_APPS]: handleUniversalRecentApps,
        [KEY_INTENTS.UP]: () => handleUniversalDirection(KEY_INTENTS.UP),
        [KEY_INTENTS.DOWN]: () => handleUniversalDirection(KEY_INTENTS.DOWN),
        [KEY_INTENTS.LEFT]: () => handleUniversalDirection(KEY_INTENTS.LEFT),
        [KEY_INTENTS.RIGHT]: () => handleUniversalDirection(KEY_INTENTS.RIGHT),
        [KEY_INTENTS.GOTO]: openBuiltInBrowser,
        [KEY_INTENTS.SETTINGS]: () => openSettings(currentView),
        [KEY_INTENTS.FLASHLIGHT]: () => toggleFlashlight().catch((error) => console.error("Unable to toggle flashlight:", error)),
        [KEY_INTENTS.NOTIFICATION_MODE]: handleNotificationModeCycle,
        [KEY_INTENTS.LOCK_SCREEN]: () => {
          triggerHaptic([0, 50, 20, 50]);
          lockScreen().catch((error) => console.error("Unable to lock screen:", error));
        },
      };
      if (dispatchKey(semanticKey, universalHandlers)) {
        return;
      }

      if (toneSetupVisible) {
        return;
      }

      const featureRef = featureRefsByView[currentView];
      if (dispatchKey(semanticKey, featureRef && {
        [semanticKey]: () => featureRef.current?.handleKey(semanticKey),
      })) {
        return;
      }

      const dialHandlers = isDialing ? {
        ...Object.fromEntries("0123456789".split("").map((digit) => [
          digit,
          () => setDialNumber((prev) => prev + digit),
        ])),
        "*": () => setDialNumber((prev) => prev + "*"),
        [KEY_INTENTS.HASH]: () => setDialNumber((prev) => prev + "#"),
      } : null;
      if (dispatchKey(semanticKey, dialHandlers)) {
        return;
      }
      if (isDialing) {
        return;
      }

      const homeDialHandlers = currentView === "home" ? {
        ...Object.fromEntries("0123456789*".split("").map((dialKey) => [
          dialKey,
          () => {
            dialActiveRef.current = true;
            setDialActive(true);
            setDialNumber((prev) => (prev ? prev + dialKey : dialKey));
          },
        ])),
        [KEY_INTENTS.HASH]: () => {
          dialActiveRef.current = true;
          setDialActive(true);
          setDialNumber((prev) => (prev ? prev + "#" : "#"));
        },
      } : null;
      if (dispatchKey(semanticKey, homeDialHandlers)) {
        return;
      }

      const textHandlers = ["menu", "settings"].includes(currentView)
        ? {
          [KEY_INTENTS.CAPS_LOCK]: () => {
            commitPending();
            setCapsLock((enabled) => !enabled);
          },
          ...Object.fromEntries([...Object.keys(NOKIA_MULTI_TAP_CYCLES), "0", "*"].map((textKey) => [
            textKey,
            () => {
              if (!searchActiveRef.current) activateSearch();
              handleMultiTapInput(textKey);
            },
          ])),
        }
        : null;
      if (dispatchKey(semanticKey, textHandlers)) {
        return;
      }

      const navigationHandlers = {
        "2": () => handleNavigation("up"),
        "4": () => handleNavigation("left"),
        "5": handleSelect,
        "6": () => handleNavigation("right"),
        "8": () => handleNavigation("down"),
      };
      dispatchKey(semanticKey, navigationHandlers);
    },
    [
      currentView,
      dialActive,
      dialNumber,
      activateSearch,
      handleMultiTapInput,
      commitPending,
      handleNavigation,
      handleSelect,
      openSettings,
      toneSetupVisible,
      openBuiltInBrowser,
      featureRefsByView,
      handleUniversalBack,
      handleUniversalDelete,
      handleUniversalDirection,
      handleUniversalSelect,
      handleUniversalSend,
      handleUniversalTab,
      handleUniversalRecentApps,
      handleNotificationModeCycle,
      returnHome,
    ]
  );

  const handleKeypadPressRef = useRef(handleKeypadPress);
  handleKeypadPressRef.current = handleKeypadPress;

  const stableKeypadPress = useCallback((key) => {
    handleKeypadPressRef.current?.(key);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher">
      <div className="nokia-shell-rim" aria-hidden="true" />
      {/* LCD and the brand band share a continuous dark surround. */}
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
            openTabs={openBrowserTabs}
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
          isCalling={isCalling}
          onCall={(num) => { handleUniversalSend(); triggerHaptic(65); }}
          onDelete={() => { handleUniversalDelete(); triggerHaptic(65); }}
          deviceStatus={deviceStatus}
          onNotificationStatusClick={() => { triggerHaptic(65); openNotificationAccessSettings(); }}
          onSirenToggle={() => { triggerHaptic(65); handleSirenToggle(); }}
          onNotificationModeCycle={() => { triggerHaptic(65); handleNotificationModeCycle(); }}
          onStatusIconClick={(type) => { triggerHaptic(65); openSystemSetting(type); }}
        />}
      </div>

      <div className="nokia-wordmark" aria-label="Nokia">
        <svg viewBox="0 0 300 52" aria-hidden="true">
          <path fill="currentColor" fillRule="evenodd" d="M0 0H13L43 34V0H55V52H42L12 18V52H0ZM75 0H112Q123 0 123 11V41Q123 52 112 52H75Q64 52 64 41V11Q64 0 75 0ZM78 11Q76 11 76 14V38Q76 41 79 41H108Q111 41 111 38V14Q111 11 108 11ZM133 0H145V21L171 0H189L158 25L190 52H172L145 29V52H133ZM198 0H210V52H198ZM244 0H263L300 52H284L277 41H231L224 52H209ZM238 30H269L254 8Z" />
        </svg>
      </div>
      {/* Physical tray retains the shared logical keypad interface. */}
      <div className="nokia-launcher__keypad h-1/2 w-full flex items-center justify-center">
        <Keypad variant="launcher" onKeypadPress={stableKeypadPress} />
      </div>
    </div>
  );
};

export default NokiaLauncher;
