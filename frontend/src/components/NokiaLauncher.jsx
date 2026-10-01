import { sendOutgoingMessage } from "@/features/messages/outgoingMessage";
import { lazy, Suspense, useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import useWeekCheckIn from "@/features/checkIn/useWeekCheckIn";
import Screen from "./Screen";
import useDumbMode from "@/features/dumbMode/useDumbMode";
import { isDumbModeBlocked, visibleDumbModeApps, dumbModeSettingLabel } from "@/features/dumbMode/dumbModeVisibility";
import Keypad from "./Keypad";
import CustomizationFeature from "@/features/customization/CustomizationFeature";
import { SidephoneShell } from "@/features/customization/SidephoneHardware";
import { loadAppearance, saveAppearance } from "@/features/customization/appearanceStorage";
import CameraFeature from "@/features/camera/CameraFeature";
import BrowserFeature from "@/features/browser/BrowserFeature";
import ClockFeature from "@/features/clock/ClockFeature";
import SnakeFeature from "@/features/snake/SnakeFeature";
import SoundFeature from "@/features/sound/SoundFeature";
import ToneSetupPrompt from "@/features/sound/ToneSetupPrompt";
import OnboardingGuide from "@/features/onboarding/OnboardingGuide";
import useOnboarding from "@/features/onboarding/useOnboarding";
import { pauseAudioEngine, playKeypadTone, preloadKeypadAudio, playNotificationTone } from "@/features/sound/nokiaAudioEngine";
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
  getDeviceContacts,
  getDeviceRecentCalls,
  STATIC_FALLBACK_RECENT_CALLS,
  subscribeToRecentCallsUpdates,
  deleteDeviceRecentCall,
  getDeviceConversations,
  getDeviceThread,
  sendDeviceSms,
  deleteDeviceConversation,
  deleteDeviceMessage,
  markDeviceConversationRead,
  subscribeToSmsUpdates,
  getDeviceNotificationConversations,
  replyDeviceNotification,
  subscribeToNotificationMessages,
  subscribeToNotificationCounts,
  checkNotificationAccess,
  getDeviceStatus,
  getSystemToneAccess,
  launchInstalledApp,
  makePhoneCall,
  openDefaultMaps,
  openDefaultPhone,
  openNotificationAccessSettings,
  openSystemSetting,
  openWebUrl,
  openAppReview,
  shareLauncherApp,
  requestSystemToneAccess,
  toggleSirenSound,
  toggleFlashlight,
  lockScreen,
  openRecentApps,
  selectDefaultApp,
  triggerHaptic,
} from "@/lib/launcherApps";
import { getReadMap, markAddressAsRead, isConversationUnread } from "@/lib/smsReadStatus";
import { createMultiTapComposer } from "@/domain/multiTapComposer";
import {
  KEY_INTENTS,
  NOKIA_MULTI_TAP_CYCLES,
  CASE_MODES,
  resolveNextCaseMode,
  formatCharForCase,
  dispatchKey,
  resolveContextualIntent,
} from "@/domain/keyGrammar";
import {
  HOME_FOCUS_TARGETS,
  SETTINGS_ITEMS,
  createHomeShortcuts,
  filterAppsByCategory,
  getDefaultApp,
  setDefaultApp,
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
import "@/features/customization/customization.css";
import "@/features/customization/sidephone.css";

// How long (ms) of inactivity before the pending char is auto-committed
const MULTI_TAP_DELAY = 250;
const WeekCheckIn = lazy(() => import("@/features/checkIn/WeekCheckIn"));
let dumbModeFeatureModule;
const loadDumbModeFeature = () => {
  dumbModeFeatureModule ||= import("@/features/dumbMode/DumbModeFeature").catch((error) => {
    dumbModeFeatureModule = null;
    throw error;
  });
  return dumbModeFeatureModule;
};
const HOME_APP_TARGETS = HOME_FOCUS_TARGETS.filter((target) => !["clock", "search"].includes(target));

const NokiaLauncher = ({ apps: installedApps, onDrawerOpen }) => {
  const [appearance, setAppearance] = useState(loadAppearance);
  const customizationFeatureRef = useRef(null);
  const changeAppearance = useCallback((value) => {
    const persisted = saveAppearance(value);
    setAppearance(value);
    return persisted;
  }, []);
  const { snapshot: dumbMode, acceptSnapshot: acceptDumbMode } = useDumbMode();
  const apps = useMemo(() => visibleDumbModeApps(installedApps, dumbMode), [installedApps, dumbMode]);
  const dumbModeFeatureRef = useRef(null);
  const settingsItems = useMemo(() => SETTINGS_ITEMS
    .filter((item) => !isDumbModeBlocked(item, dumbMode))
    .map((item) => item.id === "dumb-mode" ? { ...item, label: "Dumb Mode", switchOn: Boolean(dumbMode.active), switchLabel: dumbModeSettingLabel(dumbMode) } : item), [dumbMode]);
  const onboarding = useOnboarding();
  const {
    active: onboardingActive,
    choosing: onboardingChoosing,
    next: nextOnboardingStep,
    setChoosing: setOnboardingChoosing,
    setKeyHint: setOnboardingKeyHint,
  } = onboarding;
  const [currentView, setCurrentView] = useState("home");
  const [DumbModeComponent, setDumbModeComponent] = useState(null);
  useEffect(() => {
    if (currentView === "menu") onDrawerOpen?.();
  }, [currentView, onDrawerOpen]);
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const openDumbMode = useCallback(() => {
    const origin = currentViewRef.current;
    loadDumbModeFeature().then(({ default: Component }) => {
      // Keep the current LCD screen visible until the chunk is ready. Avoid
      // committing a Suspense fallback frame or reviving an abandoned route.
      if (currentViewRef.current !== origin) return;
      setDumbModeComponent(() => Component);
      setCurrentView("dumb-mode");
    }).catch((error) => console.error("Unable to open Dumb Mode:", error));
  }, []);
  const [selectedIndex, setSelectedIndex] = useState(
    HOME_FOCUS_TARGETS.indexOf("phone")
  );
  const selectedIndexRef = useRef(selectedIndex);
  selectedIndexRef.current = selectedIndex;
  const lastNotificationToneTimeRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settingsReturnView, setSettingsReturnView] = useState("home");
  const [cameraReturnView, setCameraReturnView] = useState("home");
  const [defaultAppsVersion, setDefaultAppsVersion] = useState(0);
  const lastViewChangeTimeRef = useRef(Date.now());
  const lastOpenConvTimeRef = useRef(0);

  // Hard outer window lock: absolute zero scroll offset on outer viewport
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY !== 0 || window.scrollX !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    lastViewChangeTimeRef.current = Date.now();
  }, [currentView]);
  const cameraFeatureRef = useRef(null);
  const browserFeatureRef = useRef(null);
  const clockFeatureRef = useRef(null);
  const snakeFeatureRef = useRef(null);
  const soundFeatureRef = useRef(null);
  const [deviceContacts, setDeviceContacts] = useState([]);

  useEffect(() => {
    if (onboarding.active || currentView !== "contacts") return;
    let active = true;
    const refreshContacts = () => getDeviceContacts(true).then((loaded) => {
      if (!active) return;
      if (Array.isArray(loaded)) {
        setDeviceContacts(loaded);
      }
    }).catch((err) => console.warn("Failed to load device contacts:", err));
    refreshContacts();
    window.addEventListener("focus", refreshContacts);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshContacts);
    };
  }, [onboarding.active, currentView]);

  const [recentCalls, setRecentCalls] = useState(() => window.Capacitor?.Plugins?.LauncherApps ? [] : STATIC_FALLBACK_RECENT_CALLS);

  const refreshRecentCalls = useCallback(async (force = false) => {
    try {
      const loaded = await getDeviceRecentCalls(force);
      if (Array.isArray(loaded)) {
        setRecentCalls(loaded);
      }
    } catch (err) {
      console.warn("Failed to load recent calls:", err);
    }
  }, []);

  const [conversations, setConversations] = useState([]);
  const [activeThread, setActiveThread] = useState(null);
  const activeThreadRef = useRef(activeThread);
  activeThreadRef.current = activeThread;
  const resumeRefreshHandledRef = useRef(true);
  const savedMessagesIndexRef = useRef(1);
  const [threadMessages, setThreadMessages] = useState([]);
  const threadMessagesRef = useRef(threadMessages);
  threadMessagesRef.current = threadMessages;
  const prevViewRef = useRef(currentView);
  const [composeRecipient, setComposeRecipient] = useState("");
  const [composeRecipientNumber, setComposeRecipientNumber] = useState("");
  const [composeField, setComposeField] = useState("recipient"); // "recipient" | "body"
  const composeFieldRef = useRef(composeField);
  composeFieldRef.current = composeField;
  const [recipientInputMode, setRecipientInputMode] = useState("digits"); // "digits" | "multi-tap"
  const recipientInputModeRef = useRef(recipientInputMode);
  recipientInputModeRef.current = recipientInputMode;
  const [notificationAccessGranted, setNotificationAccessGranted] = useState(true);
  const isSendingRef = useRef(false);
  const lastRefreshTimeRef = useRef(0);
  const soundPrefsRef = useRef(loadSoundSettings());

  useEffect(() => {
    const handleStorage = () => {
      soundPrefsRef.current = loadSoundSettings();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const refreshConversations = useCallback(async (forceRefresh = false) => {
    const now = Date.now();
    if (forceRefresh && now - lastRefreshTimeRef.current < 2000) {
      return;
    }
    lastRefreshTimeRef.current = now;
    try {
      checkNotificationAccess()
        .then((has) => {
          if (has) setNotificationAccessGranted(true);
        })
        .catch(() => {});
      const smsRequest = getDeviceConversations(forceRefresh).catch(() => []);
      // Phone messages do not depend on the notification listener being ready.
      smsRequest.then((sms) => {
        if (!Array.isArray(sms)) return;
        const readMap = getReadMap();
        const updated = sms.map(c => ({ ...c, source: "sms", unread: isConversationUnread(c, readMap) }));
        setConversations(previous => [...updated, ...previous.filter(c => c.source === "notification")]
          .sort((a, b) => (b.date || 0) - (a.date || 0)));
      });
      const [loadedSms, loadedNotifs] = await Promise.all([
        smsRequest,
        getDeviceNotificationConversations().catch(() => []),
      ]);

      const smsArray = Array.isArray(loadedSms) ? loadedSms : [];
      const notifArray = Array.isArray(loadedNotifs) ? loadedNotifs : [];
      const readMap = getReadMap();

      const updatedSms = smsArray.map((c) => ({
        ...c,
        source: "sms",
        unread: isConversationUnread(c, readMap),
      }));

      const updatedNotifs = notifArray.map((n) => ({
        ...n,
        source: "notification",
        unread: n.unread && isConversationUnread(n, readMap),
      }));

      setConversations((prev) => {
        const combined = [...updatedNotifs, ...updatedSms];
        if (prev && prev.length > 0) {
          prev.forEach((p) => {
            if (p.unread && isConversationUnread(p, readMap)) {
              const pClean = (p.address || "").replace(/[^0-9+]/g, "");
              const exists = combined.some((m) => {
                if (m.threadId && p.threadId && m.threadId === p.threadId) return true;
                const mClean = (m.address || "").replace(/[^0-9+]/g, "");
                return (pClean && mClean && (pClean.includes(mClean) || mClean.includes(pClean))) || m.address === p.address;
              });
              if (!exists) {
                combined.unshift(p);
              }
            }
          });
        }
        return combined.sort((a, b) => (b.date || 0) - (a.date || 0));
      });
    } catch (err) {
      console.warn("Failed to load device conversations:", err);
    }
  }, []);

  useEffect(() => {
    if (onboarding.active) return;
    let active = true;
    refreshConversations();

    const unsubscribeRecentCalls = subscribeToRecentCallsUpdates(async () => {
      // The facade invalidates the snapshot; hidden history refreshes on entry.
      if (!active || currentViewRef.current !== "recent-calls" || document.hidden) return;
      refreshRecentCalls(true);
    });

    const unsubscribeSms = subscribeToSmsUpdates(async (event) => {
      if (!active || !event || !event.body || !event.address) return;
      const cleanAddr = (event.address || "").replace(/[^0-9+]/g, "");
      const isCurrentlyInThisThread = activeThreadRef.current && (
        ((activeThreadRef.current.address || "").replace(/[^0-9+]/g, "") === cleanAddr) ||
        activeThreadRef.current.address === event.address
      );

      if (isCurrentlyInThisThread) {
        markAddressAsRead(event.address, activeThreadRef.current?.threadId);
        markDeviceConversationRead(activeThreadRef.current?.threadId, event.address);
      }

      // Optimistically update conversation list with 0ms delay
      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => {
          const cClean = (c.address || "").replace(/[^0-9+]/g, "");
          return (cleanAddr && cClean && (cleanAddr.includes(cClean) || cClean.includes(cleanAddr))) || c.address === event.address;
        });
        const currentItem = existingIdx >= 0 ? prev[existingIdx] : null;
        const updatedItem = currentItem
          ? {
              ...currentItem,
              snippet: event.body,
              date: event.date || Date.now(),
              unread: !isCurrentlyInThisThread,
            }
          : {
              threadId: `temp_${Date.now()}`,
              address: event.address,
              contactName: event.address,
              snippet: event.body,
              date: event.date || Date.now(),
              msgCount: 1,
              unread: !isCurrentlyInThisThread,
              source: "sms",
            };
        const filtered = existingIdx >= 0 ? prev.filter((_, idx) => idx !== existingIdx) : prev;
        return [updatedItem, ...filtered];
      });

      // Optimistically update active thread with 0ms delay
      if (isCurrentlyInThisThread) {
        setThreadMessages((prev) => {
          const exists = prev.some(
            (m) => m.body === event.body && Math.abs((m.date || 0) - (event.date || 0)) < 3000
          );
          if (exists) return prev;
          const wasAtBottom = selectedIndexRef.current >= prev.length - 2;
          const next = [
            ...prev,
            {
              id: `incoming_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              address: event.address,
              body: event.body,
              date: event.date || Date.now(),
              type: 1,
              unread: false,
            },
          ];
          const bounded = next.length > 120 ? next.slice(next.length - 120) : next;
          if (wasAtBottom) {
            setSelectedIndex(bounded.length - 1);
          }
          return bounded;
        });
      }

      // Throttle notification tone so spam bursts do not overload the audio thread
      const now = Date.now();
      if (now - lastNotificationToneTimeRef.current > 1200) {
        lastNotificationToneTimeRef.current = now;
        try {
          const soundPrefs = soundPrefsRef.current || loadSoundSettings();
          playNotificationTone(soundPrefs.messageTone, soundPrefs.volume, soundPrefs.vibrate);
        } catch (_err) {}
      }
    });

    const unsubscribeNotifs = subscribeToNotificationMessages(async (event) => {
      if (event?.imageOnly) {
        if (!active) return;
        setConversations((items) => items.map((item) => item.id === event.id ? { ...item, imageUrl: event.imageUrl } : item));
        setThreadMessages((items) => items.map((item) => item.id === event.id ? { ...item, imageUrl: event.imageUrl } : item));
        return;
      }
      if (!active) return;
      if (event && event.body && event.address) {
        const isCurrentlyInThisThread = activeThreadRef.current && (
          activeThreadRef.current.id === event.id ||
          activeThreadRef.current.threadId === event.threadId ||
          activeThreadRef.current.notificationKey === event.notificationKey ||
          (activeThreadRef.current.address === event.address && activeThreadRef.current.source === "notification")
        );

        if (isCurrentlyInThisThread) {
          markAddressAsRead(event.address, event.threadId);
        }

        setConversations((prev) => {
          const notifItem = {
            id: event.id || `notif_${Date.now()}`,
            threadId: event.threadId,
            address: event.address,
            contactName: event.contactName || event.address,
            appTag: event.appTag || "[MSG]",
            appName: event.appName || "Message",
            packageName: event.packageName,
            notificationKey: event.notificationKey,
            snippet: event.body,
            imageUrl: event.imageUrl,
            date: event.date || Date.now(),
            msgCount: 1,
            unread: !isCurrentlyInThisThread,
            canReply: event.canReply !== false,
            source: "notification",
          };
          const filtered = (prev || []).filter((c) => c.threadId !== event.threadId && c.id !== event.id);
          return [notifItem, ...filtered];
        });

        if (isCurrentlyInThisThread) {
          setThreadMessages((prev) => {
            const alreadyHas = prev.some(
              (m) => m.body === event.body && Math.abs((m.date || 0) - (event.date || 0)) < 4000
            );
            if (alreadyHas) return prev;
            const wasAtBottom = selectedIndexRef.current >= prev.length - 2;
            const next = [
              ...prev,
              {
                id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                address: event.address,
                body: event.body,
                imageUrl: event.imageUrl,
                date: event.date || Date.now(),
                type: 1,
                unread: false,
              },
            ];
            const bounded = next.length > 120 ? next.slice(next.length - 120) : next;
            if (wasAtBottom) {
              setSelectedIndex(bounded.length - 1);
            }
            return bounded;
          });
        }

        // Throttle notification tone so spam bursts do not overload the audio thread
        const now = Date.now();
        if (now - lastNotificationToneTimeRef.current > 1200) {
          lastNotificationToneTimeRef.current = now;
          try {
            const soundPrefs = soundPrefsRef.current || loadSoundSettings();
            playNotificationTone(soundPrefs.messageTone, soundPrefs.volume, soundPrefs.vibrate);
          } catch (_err) {}
        }
      }
    });

    const refreshVisibleProvider = () => {
      if (!active || document.visibilityState === "hidden") return;

      const visibleView = currentViewRef.current;
      if (visibleView === "recent-calls") {
        refreshRecentCalls(true);
        return;
      }
      if (visibleView !== "messages" && visibleView !== "message-thread") return;

      refreshConversations(true);
      const thread = activeThreadRef.current;
      if (visibleView === "message-thread" && thread && thread.source !== "notification") {
        getDeviceThread(thread.threadId, thread.address, true)
          .then((msgs) => {
            const currentThread = activeThreadRef.current;
            const isSameThread = currentThread &&
              currentViewRef.current === "message-thread" &&
              currentThread.threadId === thread.threadId &&
              currentThread.address === thread.address;
            if (active && isSameThread && Array.isArray(msgs)) setThreadMessages(msgs);
          })
          .catch(() => {});
      }
    };

    const handleResumeOrFocus = () => {
      if (!active || document.visibilityState === "hidden" || resumeRefreshHandledRef.current) return;
      resumeRefreshHandledRef.current = true;
      refreshVisibleProvider();
    };

    const handleBlur = () => {
      resumeRefreshHandledRef.current = false;
    };

    window.addEventListener("focus", handleResumeOrFocus);
    window.addEventListener("blur", handleBlur);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleResumeOrFocus();
      } else {
        resumeRefreshHandledRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      unsubscribeRecentCalls();
      unsubscribeSms();
      unsubscribeNotifs();
      window.removeEventListener("focus", handleResumeOrFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [onboarding.active, refreshConversations, refreshRecentCalls]);

  // searchActive as both state (for UI re-render) and ref (for sync reads inside callbacks)
  const [searchActive, setSearchActive] = useState(false);
  const searchActiveRef = useRef(false);

  // committedText: fully confirmed characters | pendingChar: character being cycled right now
  const [committedText, setCommittedText] = useState("");
  const [pendingChar, setPendingChar] = useState("");
  const [caseMode, setCaseMode] = useState(CASE_MODES.LOWER); // "abc" | "Abc" | "ABC"
  const caseModeRef = useRef(caseMode);
  caseModeRef.current = caseMode;
  const lastHashPressRef = useRef(0);
  const wordCapitalizedRef = useRef(false);

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
    && !onboarding.active
    && toneSetupState !== TONE_SETUP_STATES.APPLIED
    && toneSetupState !== TONE_SETUP_STATES.SKIPPED;

  const { visible: weekCheckInVisible, dismiss: dismissWeekCheckIn } = useWeekCheckIn(currentView === "home" && !onboarding.active && !toneSetupVisible && !dialActive && !dialNumber && !searchActive);
  const checkInRef = useRef(null);

  // Shared multi-tap module keeps timing/cycling out of the launcher controller.
  const multiTapComposerRef = useRef(null);
  if (multiTapComposerRef.current === null) {
    multiTapComposerRef.current = createMultiTapComposer({
      cycles: NOKIA_MULTI_TAP_CYCLES,
      delay: MULTI_TAP_DELAY,
      onPreview: (character) => {
        const isFirstChar = !wordCapitalizedRef.current;
        setPendingChar(formatCharForCase(character, caseModeRef.current, isFirstChar));
      },
      onCommit: (character) => {
        const isFirstChar = !wordCapitalizedRef.current;
        const formatted = formatCharForCase(character, caseModeRef.current, isFirstChar);
        setCommittedText((text) => text + formatted);
        if (caseModeRef.current === CASE_MODES.TITLE) {
          wordCapitalizedRef.current = true;
        }
      },
    });
  }

  // The LCD only displays hours/minutes. Align updates to minute boundaries so
  // the entire launcher does not re-render every second while idle.
  useEffect(() => {
    let interval = null;
    let timeout = null;
    const scheduleClock = () => {
      clearTimeout(timeout);
      clearInterval(interval);
      if (document.visibilityState === "hidden") return;
      setCurrentTime(new Date());
      timeout = setTimeout(() => {
        setCurrentTime(new Date());
        interval = setInterval(() => setCurrentTime(new Date()), 60_000);
      }, 60_000 - (Date.now() % 60_000));
    };
    scheduleClock();
    document.addEventListener("visibilitychange", scheduleClock);
    return () => {
      clearTimeout(timeout);
      if (interval !== null) clearInterval(interval);
      document.removeEventListener("visibilitychange", scheduleClock);
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
    const unsubscribeCounts = subscribeToNotificationCounts((event) => {
      if (!active || !event) return;
      setDeviceStatus((prev) => {
        if (!prev) return prev;
        const nextTotal = typeof event.totalCount === "number" ? event.totalCount : prev.notificationCount;
        const nextPkg = event.packageNotificationCounts || prev.packageNotificationCounts || {};
        const prevPkg = prev.packageNotificationCounts || {};
        if (prev.notificationCount === nextTotal) {
          const prevKeys = Object.keys(prevPkg);
          const nextKeys = Object.keys(nextPkg);
          if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prevPkg[k] === nextPkg[k])) {
            return prev;
          }
        }
        return {
          ...prev,
          notificationCount: nextTotal,
          packageNotificationCounts: nextPkg,
        };
      });
    });
    return () => {
      active = false;
      unsubscribeCounts();
    };
  }, []);

  const unreadSmsCount = useMemo(() => {
    return (conversations || []).filter(
      (c) => (c.source === "sms" || !c.packageName) && c.unread
    ).length;
  }, [conversations]);

  const homeShortcuts = useMemo(
    () => {
      void defaultAppsVersion;
      const originalShortcuts = createHomeShortcuts(installedApps);
      const rawShortcuts = createHomeShortcuts(apps).filter((shortcut) => {
        const original = originalShortcuts.find((item) => item.id === shortcut.id);
        return !isDumbModeBlocked(original, dumbMode);
      });
      const pkgCounts = deviceStatus?.packageNotificationCounts || {};

      return rawShortcuts.map((shortcut) => {
        // Camera is strictly excluded
        if (shortcut.id === "camera") {
          return { ...shortcut, badgeCount: 0 };
        }

        const currentApp = shortcut.app;

        if (shortcut.id === "messages") {
          const isBuiltIn = !currentApp || currentApp.id === "built-in-messages" || currentApp.action === "built-in-messages";
          if (isBuiltIn) {
            return { ...shortcut, badgeCount: unreadSmsCount };
          }
          const pkg = currentApp.packageName || currentApp.id;
          const count = pkg && pkgCounts[pkg] ? pkgCounts[pkg] : 0;
          return { ...shortcut, badgeCount: count };
        }

        if (shortcut.id === "phone") {
          const isBuiltIn = !currentApp || currentApp.action === "default-phone" || currentApp.id === "default-phone";
          if (isBuiltIn) {
            const phoneApp = filterAppsByCategory(apps, "phone").find((a) => a.packageName);
            const pkg = phoneApp?.packageName;
            const count = (pkg && pkgCounts[pkg])
              || pkgCounts["com.android.contacts"]
              || pkgCounts["com.google.android.dialer"]
              || pkgCounts["com.android.server.telecom"]
              || pkgCounts["com.android.phone"]
              || 0;
            return { ...shortcut, badgeCount: count };
          }
          const pkg = currentApp.packageName || currentApp.id;
          const count = pkg && pkgCounts[pkg] ? pkgCounts[pkg] : 0;
          return { ...shortcut, badgeCount: count };
        }

        // AI and Maps
        const pkg = currentApp?.packageName || currentApp?.id;
        const count = pkg && pkgCounts[pkg] ? pkgCounts[pkg] : 0;
        return { ...shortcut, badgeCount: count };
      });
    },
    [apps, installedApps, dumbMode, defaultAppsVersion, deviceStatus?.packageNotificationCounts, unreadSmsCount]
  );

  const drawerApps = useMemo(() => orderDrawerApps(apps), [apps]);

  const categoryFilteredApps = useMemo(() => {
    void defaultAppsVersion;
    if (currentView === "phone") {
      const currentDefault = getDefaultApp("phone", apps);
      const list = filterAppsByCategory(apps, "phone");
      if (!currentDefault) return list;
      const isMatch = (app) =>
        (app.id && app.id === currentDefault.id) ||
        (app.action && app.action === currentDefault.action) ||
        (app.packageName && app.packageName === currentDefault.packageName);
      const defaultItem = list.find(isMatch);
      const otherItems = list.filter((app) => !isMatch(app));
      const sorted = defaultItem ? [defaultItem, ...otherItems] : list;
      return sorted.map((app) =>
        isMatch(app) ? { ...app, name: `${app.name} [Default]` } : app
      );
    }
    if (currentView === "cameras") {
      const currentDefault = getDefaultApp("camera", apps);
      const list = filterAppsByCategory(apps, "camera");
      if (!currentDefault) return list;
      const isMatch = (app) =>
        (app.id && app.id === currentDefault.id) ||
        (app.action && app.action === currentDefault.action) ||
        (app.packageName && app.packageName === currentDefault.packageName);
      const defaultItem = list.find(isMatch);
      const otherItems = list.filter((app) => !isMatch(app));
      const sorted = defaultItem ? [defaultItem, ...otherItems] : list;
      return sorted.map((app) =>
        isMatch(app) ? { ...app, name: `${app.name} [Default]` } : app
      );
    }
    if (currentView === "messages-picker") {
      const currentDefault = getDefaultApp("messages", apps);
      const list = filterAppsByCategory(apps, "messages");
      if (!currentDefault) return list;
      const isMatch = (app) =>
        (app.id && app.id === currentDefault.id) ||
        (app.action && app.action === currentDefault.action) ||
        (app.packageName && app.packageName === currentDefault.packageName);
      const defaultItem = list.find(isMatch);
      const otherItems = list.filter((app) => !isMatch(app));
      const sorted = defaultItem ? [defaultItem, ...otherItems] : list;
      return sorted.map((app) =>
        isMatch(app) ? { ...app, name: `${app.name} [Default]` } : app
      );
    }
    if (currentView === "ai") {
      const currentDefault = getDefaultApp("ai", apps);
      const list = filterAppsByCategory(apps, "ai");
      if (!currentDefault) return list;
      const defaultItem = list.find((app) => app.id === currentDefault.id || app.packageName === currentDefault.packageName);
      const otherItems = list.filter((app) => app.id !== currentDefault.id && app.packageName !== currentDefault.packageName);
      const sorted = defaultItem ? [defaultItem, ...otherItems] : list;
      return sorted.map((app) =>
        app.id === currentDefault.id || app.packageName === currentDefault.packageName
          ? { ...app, name: `${app.name} [Default]` }
          : app
      );
    }
    if (currentView === "maps") {
      const currentDefault = getDefaultApp("maps", apps);
      const list = filterAppsByCategory(apps, "maps");
      if (!currentDefault) return list;
      const defaultItem = list.find((app) => app.id === currentDefault.id || app.packageName === currentDefault.packageName);
      const otherItems = list.filter((app) => app.id !== currentDefault.id && app.packageName !== currentDefault.packageName);
      const sorted = defaultItem ? [defaultItem, ...otherItems] : list;
      return sorted.map((app) =>
        app.id === currentDefault.id || app.packageName === currentDefault.packageName
          ? { ...app, name: `${app.name} [Default]` }
          : app
      );
    }
    return null;
  }, [currentView, apps, defaultAppsVersion]);

  const messageMenuItems = useMemo(() => {
    const items = [{ id: "new_message", isNewMessage: true }];
    if (!notificationAccessGranted) {
      items.push({ id: "enable_notification_access", isNotificationAccessPrompt: true });
    }
    return [...items, ...(conversations || [])];
  }, [conversations, notificationAccessGranted]);

  const menuItems = useMemo(() => {
    return currentView === "home"
      ? homeShortcuts
      : currentView === "settings"
        ? settingsItems
        : currentView === "contacts"
          ? deviceContacts
          : currentView === "recent-calls"
            ? recentCalls
            : currentView === "messages"
              ? messageMenuItems
              : currentView === "ai" || currentView === "maps" || currentView === "phone" || currentView === "cameras" || currentView === "messages-picker"
                ? (categoryFilteredApps || [])
                : drawerApps;
  }, [currentView, homeShortcuts, settingsItems, deviceContacts, recentCalls, messageMenuItems, categoryFilteredApps, drawerApps]);

  // Reset selection before the new LCD view is painted. A passive effect lets
  // Home/Menu/Settings show the previous view's selected row for one frame.
  useLayoutEffect(() => {
    if (prevViewRef.current === currentView) return;
    const prev = prevViewRef.current;
    prevViewRef.current = currentView;

    if (currentView === "home") {
      setSelectedIndex(HOME_FOCUS_TARGETS.indexOf("phone"));
      return;
    }

    if (currentView === "recent-calls") {
      setSelectedIndex(0);
      refreshRecentCalls(true);
      return;
    }

    if (currentView === "messages") {
      if (prev === "message-thread" || prev === "message-compose") {
        const restoreIdx = savedMessagesIndexRef.current;
        if (restoreIdx != null && restoreIdx >= 0) {
          setSelectedIndex(restoreIdx);
          return;
        }
      }
      setSelectedIndex(conversations.length > 0 ? 1 : 0);
      return;
    }

    if (currentView === "message-thread") {
      const len = threadMessagesRef.current?.length || 0;
      setSelectedIndex(len > 0 ? len - 1 : 0);
      return;
    }

    if (currentView === "message-compose") {
      return;
    }

    setSelectedIndex(0);
  }, [currentView, refreshRecentCalls, conversations.length]);


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
    setOnboardingChoosing(false);
    searchActiveRef.current = false;
    setSearchActive(false);
    setCommittedText("");
    clearPending();
    dialActiveRef.current = false;
    setDialActive(false);
    setDialNumber("");
    setIsCalling(false);
    setOpenBrowserTabs(false);
    setCaseMode(CASE_MODES.LOWER);
    caseModeRef.current = CASE_MODES.LOWER;
    wordCapitalizedRef.current = false;
    setCurrentView("home");
    setSelectedIndex(HOME_FOCUS_TARGETS.indexOf("phone"));
  }, [clearPending, setOnboardingChoosing]);

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
    if (!["menu", "settings", "contacts", "recent-calls", "messages", "ai", "maps", "phone", "cameras", "messages-picker"].includes(currentView) || !fullInput) return menuItems;
    if (currentView === "messages") {
      const q = fullInput.trim().toLowerCase();
      return menuItems.filter((c) => {
        if (c.id === "new_message") return true;
        const text = `${c.contactName || ""} ${c.address || ""} ${c.snippet || ""}`.toLowerCase();
        return text.includes(q);
      });
    }
    if (currentView === "recent-calls") {
      const q = fullInput.trim().toLowerCase();
      const normalize = (str) =>
        (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const normQ = normalize(q);

      return menuItems
        .map((c, index) => {
          const name = (c.name || "").toLowerCase();
          const normName = normalize(c.name);
          const rawNum = (c.number || "").toLowerCase();
          const cleanNum = rawNum.replace(/[^0-9+]/g, "");
          const cleanQ = q.replace(/[^0-9+]/g, "");
          const type = (c.type || "").toLowerCase();
          let rank = Number.POSITIVE_INFINITY;
          if (name.startsWith(q) || normName.startsWith(normQ)) rank = 0;
          else if (name.split(/\s+/).some((w) => w.startsWith(q)) || normName.split(/\s+/).some((w) => w.startsWith(normQ))) rank = 1;
          else if (name.includes(q) || normName.includes(normQ)) rank = 2;
          else if (rawNum.includes(q) || (cleanQ && cleanNum.includes(cleanQ))) rank = 3;
          else if (type.includes(q)) rank = 4;
          return { item: c, index, rank };
        })
        .filter(({ rank }) => Number.isFinite(rank))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item);
    }
    if (currentView === "contacts") {
      const q = fullInput.trim().toLowerCase();
      const normalize = (str) =>
        (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const normQ = normalize(q);

      return menuItems
        .map((c, index) => {
          const name = (c.name || "").toLowerCase();
          const normName = normalize(c.name);
          const num = (c.number || "").replace(/[^0-9+]/g, "");
          let rank = Number.POSITIVE_INFINITY;
          if (name.startsWith(q) || normName.startsWith(normQ)) rank = 0;
          else if (name.split(/\s+/).some((w) => w.startsWith(q)) || normName.split(/\s+/).some((w) => w.startsWith(normQ))) rank = 1;
          else if (name.includes(q) || normName.includes(normQ)) rank = 2;
          else if (num.includes(q)) rank = 3;
          return { item: c, index, rank };
        })
        .filter(({ rank }) => Number.isFinite(rank))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item);
    }
    return rankSearchResults(menuItems, fullInput);
  }, [currentView, menuItems, fullInput]);

  useEffect(() => {
    if (currentView === "settings" && visibleMenuItems[selectedIndex]?.id === "dumb-mode") {
      loadDumbModeFeature();
    }
  }, [currentView, selectedIndex, visibleMenuItems]);

  // Reset selection to first item ONLY when typing an active search query in a list view
  useLayoutEffect(() => {
    if (fullInput && searchActive && currentView !== "message-thread" && currentView !== "message-compose") {
      setSelectedIndex(0);
    }
  }, [fullInput, searchActive, currentView]);

  // Ensure selectedIndex is safely clamped within visible menu bounds
  useLayoutEffect(() => {
    if (["home", "camera", "browser", "clock", "snake", "sound", "dumb-mode", "message-compose"].includes(currentView)) return;
    const maxLen = currentView === "message-thread"
      ? (threadMessages?.length || 0)
      : visibleMenuItems.length;
    if (maxLen > 0 && selectedIndex >= maxLen) {
      setSelectedIndex(maxLen - 1);
    }
  }, [currentView, visibleMenuItems.length, threadMessages?.length, selectedIndex]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleNavigation = useCallback(
    (direction) => {
      setSelectedIndex((prev) => {
        const len = currentView === "message-thread" ? (threadMessagesRef.current?.length || 0) : visibleMenuItems.length;
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
      const targets = HOME_APP_TARGETS.filter((id) => homeShortcuts.some((item) => item.id === id));
      if (!targets.length) return HOME_FOCUS_TARGETS.indexOf("clock");
      const currentTarget = HOME_FOCUS_TARGETS[previous];
      const currentAppIndex = Math.max(0, targets.indexOf(currentTarget));
      const nextAppIndex = direction === "left"
        ? (currentAppIndex > 0 ? currentAppIndex - 1 : targets.length - 1)
        : (currentAppIndex < targets.length - 1 ? currentAppIndex + 1 : 0);
      return HOME_FOCUS_TARGETS.indexOf(targets[nextAppIndex]);
    });
  }, [homeShortcuts]);

  const lastOpenAppTimeRef = useRef(0);
  const handleOpenApp = useCallback((app) => {
    if (!app) return;
    if (isDumbModeBlocked(app, dumbMode)) { openDumbMode(); return; }
    if (onboardingActive && onboardingChoosing && currentView === "messages-picker") {
      setDefaultApp("messages", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      nextOnboardingStep();
      return;
    }
    const now = Date.now();
    if (now - lastOpenAppTimeRef.current < 150) {
      return;
    }
    lastOpenAppTimeRef.current = now;
    if (currentView === "phone") {
      setDefaultApp("phone", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      if (app.action === "default-phone" || app.id === "default-phone") {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(0);
        setCurrentView("contacts");
      } else {
        launchInstalledApp(app).catch((err) => console.error("Error launching phone app:", err));
      }
      return;
    }
    if (currentView === "messages-picker") {
      setDefaultApp("messages", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      if (app.action === "built-in-messages" || app.id === "built-in-messages" || app.id === "messages") {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(conversations.length > 0 ? 1 : 0);
        setCurrentView("messages");
        refreshConversations();
      } else {
        launchInstalledApp(app).catch((err) => console.error("Error launching message app:", err));
      }
      return;
    }
    if (currentView === "cameras") {
      setDefaultApp("camera", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      if (app.action === "built-in-camera" || app.id === "built-in-camera") {
        setCameraReturnView("home");
        setCurrentView("camera");
      } else {
        launchInstalledApp(app).catch((err) => console.error("Error launching camera app:", err));
      }
      return;
    }
    if (currentView === "ai") {
      setDefaultApp("ai", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      launchInstalledApp(app).catch((err) => console.error("Error launching AI app:", err));
      return;
    }
    if (currentView === "maps") {
      setDefaultApp("maps", app);
      setDefaultAppsVersion((v) => v + 1);
      setCurrentView("home");
      launchInstalledApp(app).catch((err) => console.error("Error launching maps app:", err));
      return;
    }
    if (app.id === "messages" || app.action === "built-in-messages") {
      const defaultMsgApp = getDefaultApp("messages", apps);
      if (!defaultMsgApp || defaultMsgApp.action === "built-in-messages" || defaultMsgApp.id === "built-in-messages") {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(conversations.length > 0 ? 1 : 0);
        setCurrentView("messages");
        refreshConversations();
      } else {
        launchInstalledApp(defaultMsgApp).catch((err) => console.error("Error launching message app:", err));
      }
      return;
    }
    if (app.id === "ai") {
      const defaultAiApp = getDefaultApp("ai", apps);
      if (defaultAiApp) {
        launchInstalledApp(defaultAiApp).catch((err) => console.error("Error opening AI:", err));
      } else {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(0);
        setCurrentView("ai");
      }
      return;
    }
    if (app.id === "recent-calls" || app.action === "recent-calls" || app.name?.toLowerCase() === "recent calls" || app.name?.toLowerCase() === "call log" || app.name?.toLowerCase() === "cuộc gọi gần đây" || app.name?.toLowerCase() === "nhật ký cuộc gọi") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("recent-calls");
      return;
    }
    if (app.id === "contacts" || app.action === "contacts" || app.name?.toLowerCase() === "contacts" || app.name?.toLowerCase() === "danh bạ") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("contacts");
      return;
    }
    if (app.action === "default-phone" || app.id === "phone" || app.id === "default-phone") {
      const defaultPhoneApp = getDefaultApp("phone", apps);
      if (!defaultPhoneApp || defaultPhoneApp.action === "default-phone" || defaultPhoneApp.id === "default-phone") {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(0);
        setCurrentView("contacts");
      } else {
        launchInstalledApp(defaultPhoneApp).catch((err) => console.error("Error opening phone:", err));
      }
      return;
    }
    if (app.action === "default-maps" || app.id === "maps") {
      const defaultMapsApp = getDefaultApp("maps", apps);
      if (defaultMapsApp) {
        launchInstalledApp(defaultMapsApp).catch((err) => console.error("Error opening maps:", err));
      } else {
        setSearchActive(false);
        setCommittedText("");
        clearPending();
        setSelectedIndex(0);
        setCurrentView("maps");
      }
      return;
    }
    if (app.action === "built-in-camera" || app.id === "camera") {
      const defaultCameraApp = getDefaultApp("camera", apps);
      if (!defaultCameraApp || defaultCameraApp.action === "built-in-camera" || defaultCameraApp.id === "built-in-camera") {
        setCameraReturnView(currentView === "camera" ? "home" : currentView);
        setCurrentView("camera");
      } else {
        launchInstalledApp(defaultCameraApp).catch((err) => console.error("Error launching camera:", err));
      }
      return;
    }
    launchInstalledApp(app).catch((err) => console.error("Error launching app:", err));
  }, [currentView, apps, dumbMode, openDumbMode, clearPending, refreshConversations, conversations.length, onboardingActive, onboardingChoosing, nextOnboardingStep]);

  const handleAppLongPress = useCallback((item) => {
    if (!item) return;
    triggerHaptic(65);
    if (item.id === "phone") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("phone");
      return;
    }
    if (item.id === "camera") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("cameras");
      return;
    }
    if (item.id === "messages") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("messages-picker");
      return;
    }
    if (item.id === "ai") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("ai");
      return;
    }
    if (item.id === "maps") {
      setSearchActive(false);
      setCommittedText("");
      clearPending();
      setSelectedIndex(0);
      setCurrentView("maps");
      return;
    }
  }, [clearPending]);

  const handleStartCompose = useCallback((recipient = "", number = "") => {
    setSearchActive(false);
    searchActiveRef.current = false;
    setComposeRecipient(recipient);
    setComposeRecipientNumber(number || recipient);
    setComposeField(recipient ? "body" : "recipient");
    setRecipientInputMode("digits");
    setCommittedText("");
    clearPending();
    setCurrentView("message-compose");
  }, [clearPending]);

  const handleOpenConversation = useCallback(async (conv) => {
    if (!conv) return;
    const now = Date.now();
    if (now - lastOpenConvTimeRef.current < 200) {
      return;
    }
    lastOpenConvTimeRef.current = now;
    if (conv.id === "new_message") {
      handleStartCompose();
      return;
    }
    if (conv.id === "enable_notification_access" || conv.isNotificationAccessPrompt) {
      openNotificationListenerSettings();
      return;
    }
    const currentConvIdx = visibleMenuItems.findIndex(
      (item) => item.id === conv.id || item.threadId === conv.threadId || item.address === conv.address
    );
    savedMessagesIndexRef.current = currentConvIdx >= 0 ? currentConvIdx : (selectedIndex >= 0 ? selectedIndex : 1);

    // Immediately mark conversation as read (remove unread black dot)
    setConversations((prev) =>
      prev.map((c) => {
        const cleanAddr = (conv.address || "").replace(/[^0-9+]/g, "");
        const cClean = (c.address || "").replace(/[^0-9+]/g, "");
        const isMatch = (conv.threadId && c.threadId === conv.threadId) ||
          (cleanAddr && cClean && (cleanAddr.includes(cClean) || cClean.includes(cleanAddr))) ||
          c.address === conv.address;
        return isMatch ? { ...c, unread: false } : c;
      })
    );
    markAddressAsRead(conv.address, conv.threadId);
    markDeviceConversationRead(conv.threadId, conv.address);

    setSearchActive(false);
    searchActiveRef.current = false;
    setActiveThread(conv);
    setCommittedText("");
    clearPending();
    setCurrentView("message-thread");

    if (conv.source === "notification") {
      setThreadMessages([
        {
          id: conv.id || `notif_${conv.date}`,
          address: conv.address,
          body: conv.snippet || "",
          imageUrl: conv.imageUrl,
          date: conv.date || Date.now(),
          type: 1,
          unread: false,
        },
      ]);
      setSelectedIndex(0);
      return;
    }

    try {
      const msgs = await getDeviceThread(conv.threadId, conv.address);
      setThreadMessages(msgs || []);
      if (msgs && msgs.length > 0) {
        setSelectedIndex(msgs.length - 1);
      } else {
        setSelectedIndex(0);
      }
    } catch (err) {
      console.error("Error loading thread messages:", err);
      setThreadMessages([]);
      setSelectedIndex(0);
    }
  }, [handleStartCompose, visibleMenuItems, selectedIndex, clearPending]);

  const handleDeleteConversation = useCallback(async (conv) => {
    if (!conv || conv.id === "new_message" || conv.isNotificationAccessPrompt) return;
    triggerHaptic([0, 40, 20, 40]);
    try {
      await deleteDeviceConversation({
        threadId: conv.threadId,
        address: conv.address,
        notificationKey: conv.notificationKey || conv.id,
        source: conv.source,
      });
    } catch (e) {
      console.error("Error deleting conversation:", e);
    }
    setConversations((prev) =>
      (prev || []).filter((c) => {
        if (conv.id && c.id === conv.id) return false;
        if (conv.threadId && c.threadId === conv.threadId) return false;
        if (conv.address && c.address === conv.address) return false;
        return true;
      })
    );
    if (activeThreadRef.current && (
      activeThreadRef.current.id === conv.id ||
      activeThreadRef.current.threadId === conv.threadId ||
      activeThreadRef.current.address === conv.address
    )) {
      setActiveThread(null);
      setThreadMessages([]);
      setCurrentView("messages");
      setSelectedIndex(1);
    }
    refreshConversations(true);
  }, [refreshConversations]);

  const handleDeleteMessage = useCallback(async (msg) => {
    if (!msg) return;
    triggerHaptic([0, 40, 20, 40]);
    try {
      await deleteDeviceMessage({
        id: msg.id,
        notificationKey: msg.notificationKey || (typeof msg.id === "string" && msg.id.startsWith("notif_") ? msg.id : null),
      });
    } catch (e) {
      console.error("Error deleting individual message:", e);
    }

    setThreadMessages((prev) => {
      const next = (prev || []).filter((m) => {
        if (msg.id && m.id === msg.id) return false;
        if (msg.date && m.date === msg.date && msg.body === m.body) return false;
        return true;
      });

      if (next.length === 0) {
        setActiveThread(null);
        setThreadMessages([]);
        setCurrentView("messages");
        setSelectedIndex(1);
        setConversations((convs) =>
          (convs || []).filter((c) => {
            if (activeThreadRef.current?.id && c.id === activeThreadRef.current.id) return false;
            if (activeThreadRef.current?.threadId && c.threadId === activeThreadRef.current.threadId) return false;
            if (activeThreadRef.current?.address && c.address === activeThreadRef.current.address) return false;
            return true;
          })
        );
      } else {
        setSelectedIndex((idx) => Math.min(idx, next.length - 1));
        const latestMsg = next[next.length - 1];
        setConversations((convs) =>
          (convs || []).map((c) => {
            const isMatch = (activeThreadRef.current?.id && c.id === activeThreadRef.current.id) ||
              (activeThreadRef.current?.threadId && c.threadId === activeThreadRef.current.threadId) ||
              (activeThreadRef.current?.address && c.address === activeThreadRef.current.address);
            if (isMatch) {
              return {
                ...c,
                snippet: latestMsg.body,
                date: latestMsg.date,
              };
            }
            return c;
          })
        );
      }
      return next;
    });
    refreshConversations(true);
  }, [refreshConversations]);

  const handleReplyThread = useCallback(() => {
    const name = activeThread?.contactName || activeThread?.address || "";
    const number = activeThread?.source === "notification" ? "" : (activeThread?.address || "");
    handleStartCompose(name, number);
  }, [activeThread, handleStartCompose]);

  const [messageSendStatus, setMessageSendStatus] = useState("");
  const messageDraftRef = useRef("");
  messageDraftRef.current = (committedText + pendingChar).trim();
  const handleSendSms = useCallback(async () => {
    if (isSendingRef.current) return;
    const body = (committedText + pendingChar).trim();
    const address = (composeRecipientNumber || composeRecipient || activeThread?.address || "").trim();
    if (!address) { setComposeField("recipient"); return; }
    if (!body) { setComposeField("body"); return; }
    isSendingRef.current = true;
    commitPending();
    setMessageSendStatus("Sending…");
    try {
      const notification = activeThread?.source === "notification" || Boolean(activeThread?.notificationKey);
      await sendOutgoingMessage({ address, body, notification,
        notificationKey: activeThread?.notificationKey || (notification ? activeThread?.id : undefined) },
        { sendSms: sendDeviceSms, replyNotification: replyDeviceNotification });
      setMessageSendStatus("Sent");
      // Never erase text typed while the asynchronous send was in flight.
      if (messageDraftRef.current === body) { setCommittedText(""); clearPending(); }
      markAddressAsRead(address, activeThread?.threadId);
      refreshConversations(true);
      // A completed request must not redirect the user from another screen/thread.
      if (currentViewRef.current === currentView && activeThreadRef.current === activeThread) {
        const sent = { id: `sent_${Date.now()}`, address, body, date: Date.now(), type: 2, unread: false };
        setThreadMessages((prev) => currentView === "message-compose" ? [sent] : [...prev, sent].slice(-120));
        if (currentView === "message-compose") {
          setActiveThread({ address, contactName: composeRecipient, threadId: "", source: "sms" });
          setCurrentView("message-thread");
        }
      }
    } catch (error) {
      const code = String(error?.message || "");
      setMessageSendStatus(code.includes("recipient") ? "Select a phone number first" :
        code.includes("unconfirmed") ? "Send not confirmed. Check before retrying." :
        "Send failed or incomplete. Draft kept.");
    } finally {
      isSendingRef.current = false;
    }
  }, [committedText, pendingChar, composeRecipientNumber, composeRecipient, activeThread,
    commitPending, clearPending, refreshConversations, currentView]);

  const activateSetting = useCallback((setting) => {
    if (isDumbModeBlocked(setting, dumbMode)) { openDumbMode(); return; }
    const action = resolveSettingAction(setting);
    if (!action) return;

    if (action.type === "internal-feature") {
      if (setting?.id === "dumb-mode") { openDumbMode(); return; }
      setCurrentView(action.view);
      return;
    }

    const request = action.type === "app-action"
      ? (action.action === "review" ? openAppReview() : shareLauncherApp())
      : action.type === "web-url"
      ? openWebUrl(action.url)
      : openSystemSetting(action.setting);

    request.catch((error) =>
      console.error(`Error opening ${setting.id}:`, error)
    );
  }, [dumbMode, openDumbMode]);

  const isCallingRef = useRef(false);

  const handleMakeCall = useCallback((number) => {
    if (!number || isCallingRef.current) return;
    isCallingRef.current = true;
    setIsCalling(true);
    makePhoneCall(number)
      .catch((err) => {
        console.error("Error making direct phone call:", err);
      })
      .finally(() => {
        setTimeout(() => {
          isCallingRef.current = false;
          setIsCalling(false);
        }, 600);
      });
  }, []);

  const handleDeleteRecentCall = useCallback(async (callToDelete) => {
    const item = (callToDelete && callToDelete.id) ? callToDelete : visibleMenuItems[selectedIndex];
    if (!item?.id) return;
    triggerHaptic(65);
    const result = await deleteDeviceRecentCall(item.id);
    if (!result?.success) return;
    setRecentCalls((prev) => {
      const next = prev.filter((c) => c.id !== item.id);
      if (currentViewRef.current === "recent-calls") {
        setSelectedIndex((idx) => Math.max(0, Math.min(idx, next.length - 1)));
      }
      return next;
    });
  }, [selectedIndex, visibleMenuItems]);

  const handleSelect = useCallback(() => {
    if (currentView === "home") {
      const target = HOME_FOCUS_TARGETS[selectedIndex];
      if (HOME_APP_TARGETS.includes(target) && !homeShortcuts.some((item) => item.id === target)) return;
      if (target === "clock") {
        setCurrentView("clock");
      } else if (target === "search") {
        openBuiltInBrowser();
      } else if (target === "messages") {
        const defaultMsgApp = getDefaultApp("messages", apps);
        if (!defaultMsgApp || defaultMsgApp.action === "built-in-messages" || defaultMsgApp.id === "built-in-messages") {
          setSearchActive(false);
          setCommittedText("");
          clearPending();
          setSelectedIndex(conversations.length > 0 ? 1 : 0);
          setCurrentView("messages");
          refreshConversations();
        } else {
          launchInstalledApp(defaultMsgApp).catch((err) => console.error("Error opening messages:", err));
        }
      } else if (target === "ai") {
        const defaultAiApp = getDefaultApp("ai", apps);
        if (defaultAiApp) {
          launchInstalledApp(defaultAiApp).catch((err) => console.error("Error opening AI:", err));
        } else {
          setSearchActive(false);
          setCommittedText("");
          clearPending();
          setSelectedIndex(0);
          setCurrentView("ai");
        }
      } else if (target === "maps") {
        const defaultMapsApp = getDefaultApp("maps", apps);
        if (defaultMapsApp) {
          launchInstalledApp(defaultMapsApp).catch((err) => console.error("Error opening maps:", err));
        } else {
          setSearchActive(false);
          setCommittedText("");
          clearPending();
          setSelectedIndex(0);
          setCurrentView("maps");
        }
      } else if (target === "phone") {
        const defaultPhoneApp = getDefaultApp("phone", apps);
        if (!defaultPhoneApp || defaultPhoneApp.action === "default-phone" || defaultPhoneApp.id === "default-phone") {
          setSearchActive(false);
          setCommittedText("");
          clearPending();
          setSelectedIndex(0);
          setCurrentView("contacts");
        } else {
          launchInstalledApp(defaultPhoneApp).catch((err) => console.error("Error opening phone:", err));
        }
      } else if (target === "camera") {
        const defaultCameraApp = getDefaultApp("camera", apps);
        if (!defaultCameraApp || defaultCameraApp.action === "built-in-camera" || defaultCameraApp.id === "built-in-camera") {
          setCameraReturnView("home");
          setCurrentView("camera");
        } else {
          launchInstalledApp(defaultCameraApp).catch((err) => console.error("Error opening camera:", err));
        }
      } else {
        handleOpenApp(resolveHomeShortcut(homeShortcuts, target));
      }
    } else if (currentView === "messages" && visibleMenuItems[selectedIndex]) {
      handleOpenConversation(visibleMenuItems[selectedIndex]);
    } else if ((currentView === "menu" || currentView === "ai" || currentView === "maps" || currentView === "phone" || currentView === "cameras" || currentView === "messages-picker") && visibleMenuItems[selectedIndex]) {
      handleOpenApp(visibleMenuItems[selectedIndex]);
    } else if (currentView === "settings" && visibleMenuItems[selectedIndex]) {
      activateSetting(visibleMenuItems[selectedIndex]);
    } else if (currentView === "contacts" && visibleMenuItems[selectedIndex]) {
      const contact = visibleMenuItems[selectedIndex];
      if (contact?.number) {
        handleMakeCall(contact.number);
      }
    } else if (currentView === "recent-calls" && visibleMenuItems[selectedIndex]) {
      const call = visibleMenuItems[selectedIndex];
      if (call?.number) {
        handleMakeCall(call.number);
      }
    }
  }, [currentView, selectedIndex, visibleMenuItems, handleOpenApp, handleOpenConversation, homeShortcuts, openBuiltInBrowser, activateSetting, apps, clearPending, refreshConversations, conversations.length, handleMakeCall]);

  const handleBack = useCallback(() => {
    if (currentView === "message-compose") {
      if (pendingChar) { clearPending(); return; }
      if (composeFieldRef.current === "body" && committedText) {
        setCommittedText("");
        return;
      }
      if (composeFieldRef.current === "recipient" && composeRecipient) {
        setComposeRecipient("");
        setComposeRecipientNumber("");
        return;
      }
      setCommittedText("");
      clearPending();
      setSearchActive(false);
      searchActiveRef.current = false;
      if (activeThread) {
        setCurrentView("message-thread");
        setSelectedIndex((threadMessages?.length || 1) - 1);
      } else {
        setSelectedIndex(savedMessagesIndexRef.current != null ? savedMessagesIndexRef.current : 1);
        setCurrentView("messages");
      }
      return;
    }
    if (currentView === "message-thread") {
      if (pendingChar) { clearPending(); return; }
      if (committedText) { setCommittedText(""); return; }
      setCommittedText("");
      clearPending();
      setSearchActive(false);
      searchActiveRef.current = false;
      setActiveThread(null);
      setThreadMessages([]);
      setSelectedIndex(savedMessagesIndexRef.current != null ? savedMessagesIndexRef.current : 1);
      setCurrentView("messages");
      return;
    }
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
      return;
    }
    if (currentView === "contacts" || currentView === "recent-calls" || currentView === "messages" || currentView === "ai" || currentView === "maps" || currentView === "phone" || currentView === "cameras" || currentView === "messages-picker") {
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
  }, [currentView, searchActive, committedText, pendingChar, clearPending, settingsReturnView, activeThread, composeRecipient, threadMessages?.length]);

  const handleMultiTapInput = useCallback(
    (key) => {
      if (!searchActiveRef.current && currentView !== "message-compose" && currentView !== "message-thread") return false;
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
        if (caseModeRef.current === CASE_MODES.TITLE) {
          setCaseMode(CASE_MODES.LOWER);
          caseModeRef.current = CASE_MODES.LOWER;
          wordCapitalizedRef.current = false;
        }
        return true;
      }
      return false;
    },
    [commitPending, currentView]
  );

  const handleMultiTapDelete = useCallback(() => {
    if (!searchActiveRef.current && currentView !== "message-compose" && currentView !== "message-thread") return false;
    if (!committedText && !pendingChar) return false;
    if (!multiTapComposerRef.current.cancelPending()) {
      setCommittedText((text) => {
        const nextText = text.slice(0, -1);
        if (caseModeRef.current === CASE_MODES.TITLE) {
          if (!nextText || nextText.endsWith(" ")) {
            wordCapitalizedRef.current = false;
          }
        }
        return nextText;
      });
    }
    return true;
  }, [currentView, committedText, pendingChar]);

  const featureRefsByView = useMemo(() => ({
    customization: customizationFeatureRef,
    camera: cameraFeatureRef,
    clock: clockFeatureRef,
    browser: browserFeatureRef,
    snake: snakeFeatureRef,
    sound: soundFeatureRef,
    "dumb-mode": dumbModeFeatureRef,
  }), []);

  const returnHome = useCallback(() => {
    if (toneSetupVisible) {
      skipToneSetup();
      return;
    }
    restoreHome();
  }, [restoreHome, skipToneSetup, toneSetupVisible]);

  const handleDeleteCurrentItem = useCallback(() => {
    if (currentView === "messages") {
      const item = visibleMenuItems[selectedIndex];
      if (item && item.id !== "new_message" && !item.isNotificationAccessPrompt) {
        handleDeleteConversation(item);
        return true;
      }
    } else if (currentView === "recent-calls") {
      const item = visibleMenuItems[selectedIndex];
      if (item?.id) {
        handleDeleteRecentCall(item);
        return true;
      }
    } else if (currentView === "message-thread") {
      const fullInputText = (committedText + pendingChar).trim();
      if (fullInputText) {
        setCommittedText("");
        clearPending();
        return true;
      }
      const selectedMsg = threadMessages?.[selectedIndex];
      if (selectedMsg) {
        handleDeleteMessage(selectedMsg);
        return true;
      }
    }
    return false;
  }, [currentView, visibleMenuItems, selectedIndex, handleDeleteConversation, handleDeleteRecentCall, committedText, pendingChar, clearPending, threadMessages, handleDeleteMessage]);

  const handleUniversalDelete = useCallback(() => {
    if (dialActive || dialActiveRef.current || dialNumber) {
      setIsCalling(false);
      setDialNumber((prev) => (prev ? prev.slice(0, -1) : ""));
      return;
    }
    if (currentView === "message-compose" && composeFieldRef.current === "recipient") {
      setComposeRecipient((prev) => prev.slice(0, -1));
      setComposeRecipientNumber((prev) => prev.slice(0, -1));
      return;
    }
    if (handleMultiTapDelete()) return;

    if (currentView === "messages") {
      // Single press in inbox must NOT delete conversation!
      // Only long press (KEY_INTENTS.LONG_DELETE) deletes the conversation.
      return;
    }

    if (currentView === "recent-calls") {
      const item = visibleMenuItems[selectedIndex];
      if (item?.id) {
        handleDeleteRecentCall(item);
        return;
      }
    }

    if (currentView === "message-thread") {
      // If composer has text, handleMultiTapDelete() deleted a char above.
      // If composer has no text, delete the currently selected message.
      const selectedMsg = threadMessages?.[selectedIndex];
      if (selectedMsg) {
        handleDeleteMessage(selectedMsg);
        return;
      }
    }

    featureRefsByView[currentView]?.current?.handleKey(KEY_INTENTS.DELETE);
  }, [currentView, dialActive, dialNumber, featureRefsByView, handleMultiTapDelete, threadMessages, selectedIndex, handleDeleteMessage, visibleMenuItems, handleDeleteRecentCall]);

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
        handleMakeCall(dialNumber);
      }
      return;
    }
    if (currentView === "message-compose") {
      if (composeFieldRef.current === "recipient") {
        commitPending();
        setComposeField("body");
        return;
      }
    }
    if (currentView === "message-thread") {
      const textToSend = (committedText + pendingChar).trim();
      if (textToSend.length > 0) {
        handleSendSms();
        return;
      }
      handleReplyThread();
      return;
    }
    handleSelect();
  }, [acceptToneSetup, commitPending, currentView, dialActive, dialNumber, featureRefsByView, handleSelect, toneSetupVisible, committedText, pendingChar, handleSendSms, handleReplyThread, handleMakeCall]);

  const handleUniversalDirection = useCallback((key) => {
    const featureRef = featureRefsByView[currentView];
    if (featureRef) {
      featureRef.current?.handleKey(key);
      return;
    }
    if (dialActive || dialActiveRef.current) {
      return;
    }
    if (currentView === "message-compose") {
      if (key === KEY_INTENTS.UP) {
        commitPending();
        setComposeField("recipient");
        return;
      }
      if (key === KEY_INTENTS.DOWN) {
        commitPending();
        setComposeField("body");
        return;
      }
      return;
    }
    if (currentView === "home") {
      const homeDirection = {
        UP: () => setCurrentView("menu"),
        LEFT: () => handleHomeCursor("left"),
        RIGHT: () => handleHomeCursor("right"),
        DOWN: () => {
          setSearchActive(false);
          setCommittedText("");
          clearPending();
          setSelectedIndex(0);
          setCurrentView("recent-calls");
        },
      }[key];
      homeDirection?.();
      return;
    }
    handleNavigation(key.toLowerCase());
  }, [commitPending, currentView, dialActive, featureRefsByView, handleHomeCursor, handleNavigation, clearPending]);

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
        handleMakeCall(dialNumber);
      }
      return;
    }
    const sendAction = {
      home: () => setCurrentView("menu"),
      menu: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      messages: () => visibleMenuItems[selectedIndex] && handleOpenConversation(visibleMenuItems[selectedIndex]),
      ai: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      maps: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      phone: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      cameras: () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      "messages-picker": () => visibleMenuItems[selectedIndex] && handleOpenApp(visibleMenuItems[selectedIndex]),
      "recent-calls": () => {
        const call = visibleMenuItems[selectedIndex];
        if (call?.number) {
          handleMakeCall(call.number);
        }
      },
      contacts: () => {
        const contact = visibleMenuItems[selectedIndex];
        if (contact?.number) {
          handleMakeCall(contact.number);
        }
      },
      "message-thread": () => {
        const textToSend = (committedText + pendingChar).trim();
        if (textToSend.length > 0) {
          handleSendSms();
          return;
        }
        if (activeThread?.address) {
          handleMakeCall(activeThread.address);
        }
      },
      "message-compose": () => {
        handleSendSms();
      },
    }[currentView];
    sendAction?.();
  }, [currentView, dialActive, dialNumber, featureRefsByView, handleOpenApp, handleOpenConversation, selectedIndex, visibleMenuItems, activeThread, committedText, pendingChar, handleSendSms, handleMakeCall]);

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
      setCaseMode(CASE_MODES.LOWER);
      caseModeRef.current = CASE_MODES.LOWER;
      wordCapitalizedRef.current = false;
    }
  }, [searchActive, clearPending]);

  // ── Main keypad dispatcher ─────────────────────────────────────────────────
  const handleKeypadPress = useCallback(
    (key) => {
      // Tour practice keys use the same sound and haptic path as normal typing.
      const soundPrefs = soundPrefsRef.current || loadSoundSettings();
      playKeypadTone(key, soundPrefs.keypadTone, soundPrefs.volume, soundPrefs.vibrate);
      if (weekCheckInVisible) {
        const intent = resolveContextualIntent(key, "check-in");
        if ([KEY_INTENTS.BACK, KEY_INTENTS.HOME, KEY_INTENTS.END].includes(intent)) dismissWeekCheckIn();
        else checkInRef.current?.handleKey(intent);
        return;
      }
      if (onboardingActive && !onboardingChoosing) {
        const intent = resolveContextualIntent(key, "home");
        const hints = {
          UP: "↑ on Home opens Menu.", DOWN: "↓ on Home opens Recent Calls.",
          LEFT: "← selects the previous Home shortcut.", RIGHT: "→ selects the next Home shortcut.",
          SELECT: "The centre key opens your selected shortcut.", GOTO: "Left softkey: Go to on Home; Delete in lists.",
          SETTINGS: "Right softkey: Settings on Home; Back in other views.",
          HOME: "Red returns Home. Hold it to lock the screen.", END: "Red returns Home.",
          RECENT_APPS: "Green on Home opens Android’s recent apps.", HASH: "# stays # in numbers; changes case in text.",
          LOCK_SCREEN: "Holding Red requests screen lock. Nothing is locked during this guide.",
        };
        setOnboardingKeyHint(hints[intent] || (/^[0-9*]$/.test(key) ? `${key}: a dial key on Home; letters and symbols in text.` : "Use this key in the relevant screen. Nothing is sent during this guide."));
        return;
      }
      if (onboardingActive && onboardingChoosing && [KEY_INTENTS.HOME, KEY_INTENTS.END, KEY_INTENTS.SOFT_RIGHT, KEY_INTENTS.BACK].includes(key)) {
        setCurrentView("home");
        setOnboardingChoosing(false);
        return;
      }
      if (onboardingActive && onboardingChoosing && ![KEY_INTENTS.UP, KEY_INTENTS.DOWN, KEY_INTENTS.LEFT, KEY_INTENTS.RIGHT, KEY_INTENTS.SELECT].includes(key)) return;

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
        [KEY_INTENTS.LONG_DELETE]: handleDeleteCurrentItem,
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

      const isSearchOrComposeTextActive =
        ["menu", "settings", "contacts", "recent-calls", "ai", "maps", "phone", "cameras", "messages-picker"].includes(currentView) ||
        (currentView === "messages" && searchActiveRef.current) ||
        currentView === "message-compose" ||
        currentView === "message-thread";

      const textHandlers = isSearchOrComposeTextActive
        ? {
          [KEY_INTENTS.CAPS_LOCK]: () => {
            if (currentView === "message-compose" && composeFieldRef.current === "recipient") {
              setRecipientInputMode((prev) => (prev === "digits" ? "multi-tap" : "digits"));
              return;
            }
            commitPending();
            const now = Date.now();
            const nextMode = resolveNextCaseMode(
              caseModeRef.current,
              lastHashPressRef.current,
              now,
              600
            );
            lastHashPressRef.current = now;
            setCaseMode(nextMode);
            caseModeRef.current = nextMode;
            wordCapitalizedRef.current = false;
          },
          ...Object.fromEntries([...Object.keys(NOKIA_MULTI_TAP_CYCLES), "0", "*"].map((textKey) => [
            textKey,
            () => {
              if (currentView === "message-compose" && composeFieldRef.current === "recipient") {
                if (recipientInputModeRef.current === "digits") {
                  if (textKey === "*") {
                    setComposeRecipient((prev) => prev + "+");
                    setComposeRecipientNumber((prev) => prev + "+");
                  } else {
                    setComposeRecipient((prev) => prev + textKey);
                    setComposeRecipientNumber((prev) => prev + textKey);
                  }
                  return;
                }
              }
              if (currentView !== "message-compose" && currentView !== "message-thread" && !searchActiveRef.current) activateSearch();
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
      handleDeleteCurrentItem,
      handleUniversalDirection,
      handleUniversalSelect,
      handleUniversalSend,
      handleUniversalTab,
      handleUniversalRecentApps,
      handleNotificationModeCycle,
      returnHome,
      onboardingActive, onboardingChoosing, setOnboardingKeyHint, setOnboardingChoosing,
      weekCheckInVisible, dismissWeekCheckIn,
    ]
  );

  const handleKeypadPressRef = useRef(handleKeypadPress);
  handleKeypadPressRef.current = handleKeypadPress;

  const stableKeypadPress = useCallback((key) => {
    handleKeypadPressRef.current?.(key);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher" data-appearance={appearance} data-guide={onboarding.active ? onboarding.step.id : undefined}>
      <div className="nokia-shell-rim" aria-hidden="true" />
      {appearance === "sidephone" && <SidephoneShell />}
      {/* LCD and the brand band share a continuous dark surround. */}
      <div className="nokia-launcher__screen h-1/2 w-full relative flex flex-col">
        <div className="h-full w-full min-h-0" inert={(onboarding.active && !onboarding.choosing) || weekCheckInVisible ? true : undefined}>
        {toneSetupVisible ? (
          <ToneSetupPrompt
            busy={toneSetupBusy}
            message={toneSetupMessage}
            onAccept={acceptToneSetup}
            onSkip={skipToneSetup}
          />
        ) : currentView === "customization" ? (
          <CustomizationFeature ref={customizationFeatureRef} appearance={appearance}
            onChange={changeAppearance} onExit={() => setCurrentView("settings")} />
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
        ) : currentView === "dumb-mode" && DumbModeComponent ? (
          <DumbModeComponent ref={dumbModeFeatureRef} dumbModeSnapshot={dumbMode} onStateChange={acceptDumbMode}
            onExit={() => setCurrentView("settings")} />
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
          onAppLongPress={handleAppLongPress}
          onContactClick={(contact) => {
            triggerHaptic(65);
            if (contact?.number) {
              handleMakeCall(contact.number);
            }
          }}
          onCallClick={(call) => {
            triggerHaptic(65);
            if (call?.number) {
              handleMakeCall(call.number);
            }
          }}
          onDeleteCall={handleDeleteRecentCall}
          onConversationClick={handleOpenConversation}
          activeThread={activeThread}
          threadMessages={threadMessages}
          onReplyClick={handleReplyThread}
          composeRecipient={composeRecipient}
          composeRecipientNumber={composeRecipientNumber}
          composeField={composeField}
          recipientInputMode={recipientInputMode}
          caseMode={caseMode}
          onSelectComposeField={(field) => {
            commitPending();
            setComposeField(field);
          }}
          composeText={fullInput}
          onSendSms={handleSendSms}
          messageSendStatus={messageSendStatus}
          onOpenMenu={() => { triggerHaptic(65); setCurrentView("menu"); }}
          onOpenSettings={() => { triggerHaptic(65); openSettings(currentView); }}
          onSettingClick={(s) => { triggerHaptic(65); handleSettingClick(s); }}
          onListSearchFocus={() => { triggerHaptic(65); activateSearch(); }}
          onBack={() => { triggerHaptic(65); if (onboardingChoosing) restoreHome(); else handleBack(); }}
          dialActive={dialActive}
          dialNumber={dialNumber}
          isCalling={isCalling}
          onCall={(num) => { handleUniversalSend(); triggerHaptic(65); }}
          onDelete={() => { handleUniversalDelete(); triggerHaptic(65); }}
          onDeleteConversation={handleDeleteConversation}
          onDeleteMessage={handleDeleteMessage}
          onOpenUrl={(url) => { triggerHaptic(65); openWebUrl(url); }}
          deviceStatus={deviceStatus}
          onNotificationStatusClick={() => { triggerHaptic(65); openNotificationAccessSettings(); }}
          onSirenToggle={() => { triggerHaptic(65); handleSirenToggle(); }}
          onNotificationModeCycle={() => { triggerHaptic(65); handleNotificationModeCycle(); }}
          onStatusIconClick={(type) => { triggerHaptic(65); openSystemSetting(type); }}
        />}
        </div>
        {weekCheckInVisible && <Suspense fallback={null}><WeekCheckIn ref={checkInRef} onClose={dismissWeekCheckIn} /></Suspense>}
        {onboarding.active && <OnboardingGuide tour={onboarding}
          onChoose={() => { handleAppLongPress({ id: "messages" }); onboarding.setChoosing(true); }}
          onFinish={() => { restoreHome(); onboarding.finish(); }}
          onNext={() => { if (onboarding.choosing) restoreHome(); onboarding.next(); }}
          onBack={() => { if (onboarding.choosing) restoreHome(); onboarding.back(); }}
        />}
      </div>

      <div className="nokia-wordmark" aria-label="Nokia">
        <svg viewBox="0 0 300 52" aria-hidden="true">
          <path fill="currentColor" fillRule="evenodd" d="M0 0H13L43 34V0H55V52H42L12 18V52H0ZM75 0H112Q123 0 123 11V41Q123 52 112 52H75Q64 52 64 41V11Q64 0 75 0ZM78 11Q76 11 76 14V38Q76 41 79 41H108Q111 41 111 38V14Q111 11 108 11ZM133 0H145V21L171 0H189L158 25L190 52H172L145 29V52H133ZM198 0H210V52H198ZM244 0H263L300 52H284L277 41H231L224 52H209ZM238 30H269L254 8Z" />
        </svg>
      </div>
      {/* Physical tray retains the shared logical keypad interface. */}
      <div className="nokia-launcher__keypad h-1/2 w-full flex items-center justify-center">
        <Keypad variant="launcher" appearance={appearance} onKeypadPress={stableKeypadPress} />
      </div>
    </div>
  );
};

export default NokiaLauncher;
