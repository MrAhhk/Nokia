const getLauncherAppsPlugin = () => {
  return window.Capacitor?.Plugins?.LauncherApps ?? null;
};
export const isNativeLauncher = () => Boolean(window.Capacitor?.isNativePlatform?.());

// Dumb mode never simulates a successful lock when the native implementation is absent.
const dumbModeCall = (method, input) => {
  const plugin = getLauncherAppsPlugin();
  if (typeof plugin?.[method] !== "function") return Promise.reject(new Error("dumb_mode_unavailable"));
  return Promise.resolve().then(() => plugin[method](input));
};
export const getDumbModeState = () => dumbModeCall("getDumbModeState");
export const getDumbModeApps = () => dumbModeCall("getDumbModeApps");
export const prepareDumbMode = (input) => dumbModeCall("prepareDumbMode", input);
export const shareDumbModeCode = (input) => dumbModeCall("shareDumbModeCode", input);
export const activateDumbMode = (input) => dumbModeCall("activateDumbMode", input);
export const cancelDumbModeSetup = (input) => dumbModeCall("cancelDumbModeSetup", input);
export const unlockDumbMode = (input) => dumbModeCall("unlockDumbMode", input);
export const getFriendAuthenticatorState = () => dumbModeCall("getFriendAuthenticatorState");
export const beginFriendPairing = input => dumbModeCall("beginFriendPairing", input);
export const acceptFriendPairing = input => dumbModeCall("acceptFriendPairing", input);
export const inspectFriendPairing = input => dumbModeCall("inspectFriendPairing", input);
export const completeFriendPairing = input => dumbModeCall("completeFriendPairing", input);
export const acknowledgeFriendPairing = input => dumbModeCall("acknowledgeFriendPairing", input);
export const cancelFriendPairing = input => dumbModeCall("cancelFriendPairing", input);
export const removeFriendPairing = input => dumbModeCall("removeFriendPairing", input);
export const getHeldFriendCode = input => dumbModeCall("getHeldFriendCode", input);
export const getFriendPairingQr = input => dumbModeCall("getFriendPairingQr", input);
export const startFriendPairingScan = input => dumbModeCall("startFriendPairingScan", input);
export const stopFriendPairingScan = input => dumbModeCall("stopFriendPairingScan", input);
export const shareFriendPairingText = input => dumbModeCall("shareFriendPairingText", input);
export const pasteFriendPairingText = async () => {
  if (isNativeLauncher()) return (await dumbModeCall("pasteFriendPairingText")).text;
  return navigator.clipboard.readText();
};
export const openDumbModeAccessibilitySettings = () => dumbModeCall("showAccessibilitySettings");
export const pasteDumbModeCode = async () => {
  if (isNativeLauncher()) return (await dumbModeCall("pasteDumbModeCode")).code;
  return navigator.clipboard.readText();
};
export const APP_STORE_URL = "https://play.google.com/store/apps/details?id=com.nokialauncher";
export const APP_SHARE_TEXT = "Try Nokia Launcher — a calmer way to use your phone. Make more room for life beyond the screen.";

export const openAppReview = async () => {
  const plugin = getLauncherAppsPlugin();
  if (plugin?.openAppReview) return plugin.openAppReview();
  window.open(APP_STORE_URL, "_blank", "noopener,noreferrer");
};

export const shareLauncherApp = async () => {
  const plugin = getLauncherAppsPlugin();
  if (plugin?.shareApp) return plugin.shareApp();
  if (navigator.share) return navigator.share({ title: "Nokia Launcher", text: APP_SHARE_TEXT, url: APP_STORE_URL });
  throw new Error("Sharing is unavailable on this device");
};
export { requestPlayIntegrityCheck } from "./playIntegrity";

const STATIC_FALLBACK_APPS = [
  { id: "phone", name: "Phone", icon: "Phone", category: "important", is_system: true },
  { id: "messages", name: "Messages", icon: "MessageSquare", category: "important", is_system: true },
  { id: "contacts", name: "Contacts", icon: "Users", category: "important", is_system: true },
  { id: "whatsapp", name: "WhatsApp", icon: "MessageCircle", category: "important", is_system: false },
  { id: "messenger", name: "Messenger", icon: "Send", category: "important", is_system: false },
  { id: "maps", name: "Maps", icon: "Map", category: "important", is_system: false },
  { id: "camera", name: "Camera", icon: "Camera", category: "important", is_system: true },
  { id: "gallery", name: "Gallery", icon: "Image", category: "important", is_system: true },
  { id: "clock", name: "Clock", icon: "Clock", category: "important", is_system: true },
  { id: "calendar", name: "Calendar", icon: "Calendar", category: "important", is_system: true },
  { id: "calculator", name: "Calculator", icon: "Calculator", category: "important", is_system: true },
  { id: "settings", name: "Settings", icon: "Settings", category: "important", is_system: true },
  { id: "youtube", name: "YouTube", icon: "Youtube", category: "unimportant", is_system: false },
  { id: "facebook", name: "Facebook", icon: "Facebook", category: "unimportant", is_system: false },
  { id: "tiktok", name: "TikTok", icon: "Video", category: "unimportant", is_system: false },
  { id: "instagram", name: "Instagram", icon: "Instagram", category: "unimportant", is_system: false },
  { id: "twitter", name: "Twitter", icon: "Twitter", category: "unimportant", is_system: false },
  { id: "spotify", name: "Spotify", icon: "Music", category: "unimportant", is_system: false },
  { id: "games", name: "Games", icon: "Gamepad2", category: "unimportant", is_system: false },
  { id: "snake", name: "Snake", icon: "Gamepad", category: "unimportant", is_system: true },
];

let installedAppsCache = null;
let installedAppsRequest = null;
let installedAppsGeneration = 0;
const INSTALLED_APPS_STORAGE_KEY = "nokia-launcher.installed-apps.v1";

const validInstalledApps = (apps) => Array.isArray(apps) ? apps.filter((app) =>
  app && typeof app === "object" && typeof app.id === "string" &&
  (!isNativeLauncher() || (typeof app.packageName === "string" && app.packageName.trim()))
) : [];

export const getCachedInstalledApps = () => {
  if (typeof window === "undefined") return [];
  try {
    const cached = JSON.parse(window.localStorage.getItem(INSTALLED_APPS_STORAGE_KEY) || "[]");
    return validInstalledApps(cached);
  } catch (_error) {
    return [];
  }
};

const persistInstalledApps = (apps) => {
  if (typeof window === "undefined" || !Array.isArray(apps)) return;
  try {
    window.localStorage.setItem(INSTALLED_APPS_STORAGE_KEY, JSON.stringify(apps));
  } catch (_error) {
    // Storage can be unavailable in restricted WebViews; in-memory caching still works.
  }
};

export const getInstalledApps = async () => {
  if (installedAppsCache) {
    return installedAppsCache;
  }

  if (installedAppsRequest) {
    return installedAppsRequest;
  }

  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    if (isNativeLauncher()) return getCachedInstalledApps();
    console.warn("LauncherApps plugin unavailable, falling back to backend API or static mock apps");
    
    let backendUrl = process.env.REACT_APP_BACKEND_URL || "";
    if (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
      backendUrl = "http://localhost:8000";
    }
    
    const url = `${backendUrl.replace(/\/+$/, "")}/api/apps`;
    
    installedAppsRequest = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        installedAppsCache = Array.isArray(data?.apps) ? data.apps : [];
        if (installedAppsCache.length === 0) {
          installedAppsCache = STATIC_FALLBACK_APPS;
        }
        persistInstalledApps(installedAppsCache);
        return installedAppsCache;
      })
      .catch((error) => {
        console.error("Error fetching apps from backend, using static mock fallback:", error);
        installedAppsCache = STATIC_FALLBACK_APPS;
        return STATIC_FALLBACK_APPS;
      })
      .finally(() => {
        installedAppsRequest = null;
      });

    return installedAppsRequest;
  }

  // Capacitor native bridge is present
  installedAppsRequest = (async () => {
      // Only one scan in flight. If packages change during the scan, discard
      // that result and fetch the new generation before publishing it.
      let generation, result;
      do {
        generation = installedAppsGeneration;
        result = await launcherApps.getInstalledApps();
      } while (generation !== installedAppsGeneration);
      installedAppsCache = validInstalledApps(result?.apps);
      persistInstalledApps(installedAppsCache);
      return installedAppsCache;
    })()
    .catch((error) => {
      console.error("Error loading native apps; retaining the last real app list:", error);
      // Do not cache failures: a later request must be able to recover.
      return getCachedInstalledApps();
    })
    .finally(() => {
      installedAppsRequest = null;
    });

  return installedAppsRequest;
};

export const launchInstalledApp = async (app) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    console.log(`Mock launching app: ${app?.name || app?.id}`);
    if (typeof window !== "undefined") {
      window.alert(`Mock launching app: ${app?.name || app?.id}`);
    }
    return;
  }

  if (!app?.packageName) {
    throw new Error("Selected app has no packageName");
  }

  await launcherApps.launchApp({
    packageName: app.packageName,
    activityName: app.activityName,
  });
};

export const makePhoneCall = async (number) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    console.log(`Mock calling phone number: ${number}`);
    if (typeof window !== "undefined") {
      window.alert(`Mock calling phone number: ${number}`);
    }
    return;
  }

  await launcherApps.makePhoneCall({
    number: number,
  });
};

export const openWebUrl = async (url) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    return;
  }

  await launcherApps.openWebUrl({ url });
};

export const showKeyboardSettings = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    console.log("Mock showKeyboardSettings");
    if (typeof window !== "undefined") {
      window.alert("Mock showKeyboardSettings: Open Android Settings to enable keyboard");
    }
    return;
  }
  await launcherApps.showKeyboardSettings();
};

export const showKeyboardPicker = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    console.log("Mock showKeyboardPicker");
    if (typeof window !== "undefined") {
      window.alert("Mock showKeyboardPicker: Open Keyboard selection menu");
    }
    return;
  }
  await launcherApps.showKeyboardPicker();
};

const callCameraMethod = async (method, options, fallback) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.[method]) return fallback;
  return launcherApps[method](options || {});
};

const callBrowserMethod = async (method, options, fallback) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.[method]) return fallback;
  return launcherApps[method](options || {});
};

export const startBuiltInBrowser = (options = {}) =>
  callBrowserMethod("startBrowser", options, { started: false, native: false });

export const navigateBuiltInBrowser = (url) =>
  callBrowserMethod("navigateBrowser", { url }, { url, native: false });

export const controlBuiltInBrowser = (command, options = {}) =>
  callBrowserMethod("controlBrowser", { command, ...options }, { handled: false, native: false });

export const updateBrowserSurfaceBounds = (bounds) =>
  callBrowserMethod("updateBrowserSurfaceBounds", bounds, { updated: false, native: false });

export const stopBuiltInBrowser = () =>
  callBrowserMethod("stopBrowser", {}, { stopped: true, native: false });

export const addBrowserStateListener = async (handler) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.addListener) return { remove: async () => {} };
  return launcherApps.addListener("browserState", handler);
};

export const startBuiltInCamera = (options = {}) =>
  callCameraMethod("startCamera", options, { sessionId: "browser-camera" });

export const captureCameraPhoto = () =>
  callCameraMethod("capturePhoto", {}, { media: null });

export const startCameraVideo = (options = {}) =>
  callCameraMethod("startVideo", options, { recording: false });

export const stopCameraVideo = () =>
  callCameraMethod("stopVideo", {}, { media: null });

export const stopBuiltInCamera = () =>
  callCameraMethod("stopCamera", {}, { stopped: true });

export const listCameraMedia = (options = {}) =>
  callCameraMethod("listCameraMedia", options, { media: [] });

export const updateCameraSurfaceBounds = (bounds) =>
  callCameraMethod("updateCameraSurfaceBounds", bounds, { updated: false });

export const setCameraLens = (lens) =>
  callCameraMethod("setCameraLens", { lens }, { lens });

export const setCameraFlash = (mode) =>
  callCameraMethod("setCameraFlash", { mode }, { mode });

export const setCameraMode = (mode) =>
  callCameraMethod("setCameraMode", { mode }, { mode });

export const setCameraGrid = (enabled) =>
  callCameraMethod("setCameraGrid", { enabled }, { enabled });

export const addCameraControlListener = async (handler) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.addListener) return { remove: async () => {} };
  return launcherApps.addListener("cameraControl", handler);
};

export const openDefaultPhone = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) return;
  await launcherApps.openDefaultPhone();
};

export const openDefaultMaps = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    if (typeof window !== "undefined") window.open("https://maps.google.com", "_blank", "noopener,noreferrer");
    return;
  }
  await launcherApps.openDefaultMaps();
};

export const selectDefaultApp = async (type) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps) {
    console.log(`Mock selecting default app for: ${type}`);
    if (typeof window !== "undefined") {
      window.alert(`Select default ${type} app`);
    }
    return;
  }
  await launcherApps.selectDefaultApp({ type });
};

export const getDeviceStatus = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.getDeviceStatus) {
    return {
      wifi: navigator.onLine,
      bluetooth: null,
      vpn: false,
      charging: false,
      powerSave: false,
      silent: false,
      batteryLevel: 100,
      notificationCount: 0,
      packageNotificationCounts: {},
      notificationAccess: false,
    };
  }
  return launcherApps.getDeviceStatus();
};

export const openNotificationAccessSettings = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.openNotificationAccessSettings) return;
  await launcherApps.openNotificationAccessSettings();
};

export const openSystemSetting = async (setting) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.openSystemSetting) return;
  await launcherApps.openSystemSetting({ setting });
};

export const toggleSirenSound = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.toggleSirenSound) return { sirenMuted: false };
  return launcherApps.toggleSirenSound();
};

export const cycleNotificationMode = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.cycleNotificationMode) return { notificationMode: "active" };
  return launcherApps.cycleNotificationMode();
};

export const toggleFlashlight = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.toggleFlashlight) return { enabled: false, supported: false };
  return launcherApps.toggleFlashlight();
};

export const lockScreen = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.lockScreen) return { locked: false, supported: false };
  return launcherApps.lockScreen();
};

export const openRecentApps = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.openRecentApps) return { opened: false, supported: false };
  return launcherApps.openRecentApps();
};

export const showCameraMedia = (media) =>
  callCameraMethod("showCameraMedia", media, { shown: false });

export const controlCameraMedia = (action = "toggle") =>
  callCameraMethod("controlCameraMedia", { action }, { controlled: false });

export const hideCameraMedia = () =>
  callCameraMethod("hideCameraMedia", {}, { hidden: true });

export const triggerHaptic = async (durationMs = 95) => {
  const isPattern = Array.isArray(durationMs);
  const sanitizeDuration = (value) => Math.min(1000, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0));
  const pattern = isPattern ? durationMs.slice(0, 20).map(sanitizeDuration) : null;
  const dur = isPattern ? (pattern.find((d) => d > 0) || 95) : (sanitizeDuration(durationMs) || 95);

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(isPattern ? pattern : dur);
      return true;
    } catch (_e) {}
  }

  if (typeof window !== "undefined") {
    if (isPattern && window.NokiaIMEBridge?.triggerHapticPattern) {
      try {
        window.NokiaIMEBridge.triggerHapticPattern(JSON.stringify(pattern));
        return true;
      } catch (_e) {}
    } else if (window.NokiaIMEBridge?.triggerHaptic) {
      try {
        window.NokiaIMEBridge.triggerHaptic(dur);
        return true;
      } catch (_e) {}
    }
  }

  const launcherApps = getLauncherAppsPlugin();
  if (launcherApps?.vibrate) {
    try {
      if (isPattern) {
        await launcherApps.vibrate({ pattern });
      } else {
        await launcherApps.vibrate({ duration: dur });
      }
      return true;
    } catch (_e) {}
  }
  return false;
};

export const getSystemToneAccess = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.getSystemToneAccess) {
    return { supported: false, granted: false };
  }
  return launcherApps.getSystemToneAccess();
};

export const requestSystemToneAccess = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.requestSystemToneAccess) {
    return { opened: false, supported: false };
  }
  return launcherApps.requestSystemToneAccess({});
};

export const applySystemTone = async (toneType, assetPath, title) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.applySystemTone) {
    return { success: false, supported: false };
  }
  return launcherApps.applySystemTone({ toneType, assetPath, title });
};

export const playNativeKeypadTone = async (key, duration = 200, haptic = true) => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.playKeypadTone) {
    return false;
  }
  try {
    await launcherApps.playKeypadTone({ key: String(key), duration, haptic });
    return true;
  } catch (_e) {
    return false;
  }
};

export const triggerKeyHaptic = async (duration = 60) => {
  const launcherApps = getLauncherAppsPlugin();
  if (launcherApps?.triggerKeyHaptic) {
    try {
      await launcherApps.triggerKeyHaptic({ duration });
      return true;
    } catch (_e) {}
  }
  return triggerHaptic([0, duration]);
};


export const isDefaultLauncher = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.isDefaultLauncher) {
    return { isDefault: false };
  }
  try {
    return await launcherApps.isDefaultLauncher();
  } catch (_e) {
    return { isDefault: false };
  }
};

export const requestDefaultLauncher = async () => {
  const launcherApps = getLauncherAppsPlugin();
  if (!launcherApps?.requestDefaultLauncher) {
    return { requested: false };
  }
  try {
    return await launcherApps.requestDefaultLauncher();
  } catch (_e) {
    return { requested: false };
  }
};

export const STATIC_FALLBACK_CONTACTS = [
  { id: "1", name: "An Na", number: "0915231765" },
  { id: "2", name: "Anh Bình. pbqlto..", number: "0796359718" },
  { id: "3", name: "Anh Châu. cơm", number: "0918404949" },
  { id: "4", name: "Anh Khôi", number: "0913893896" },
  { id: "5", name: "Anh Sinh", number: "0908123456" },
];

let deviceContactsCache = null;
let deviceContactsRequest = null;

export const getDeviceContacts = async (forceRefresh = false) => {
  if (deviceContactsRequest) return deviceContactsRequest;
  if (!forceRefresh && deviceContactsCache !== null) return deviceContactsCache;
  const request = Promise.resolve().then(async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getContacts !== "function") return STATIC_FALLBACK_CONTACTS;
    try {
      const result = await plugin.getContacts();
      return Array.isArray(result?.contacts) ? result.contacts : [];
    } catch (_) { return null; }
  }).then((contacts) => {
    if (contacts !== null) deviceContactsCache = contacts;
    return contacts ?? [];
  });
  deviceContactsRequest = request;
  request.then(
    () => { if (deviceContactsRequest === request) deviceContactsRequest = null; },
    () => { if (deviceContactsRequest === request) deviceContactsRequest = null; }
  );
  return request;
};

export const STATIC_FALLBACK_RECENT_CALLS = [
  {
    id: "call_1",
    number: "0915231765",
    name: "An Na",
    type: "missed",
    date: Date.now() - 1000 * 60 * 35,
    duration: 0,
    sim: "SIM 1",
  },
  {
    id: "call_2",
    number: "0796359718",
    name: "Anh Bình. pbqlto..",
    type: "outgoing",
    date: Date.now() - 1000 * 60 * 60 * 3,
    duration: 145,
    sim: "SIM 1",
  },
  {
    id: "call_3",
    number: "0918404949",
    name: "Anh Châu. cơm",
    type: "incoming",
    date: Date.now() - 1000 * 60 * 60 * 25,
    duration: 62,
    sim: "SIM 2",
  },
  {
    id: "call_4",
    number: "0913893896",
    name: "Anh Khôi",
    type: "missed",
    date: Date.now() - 1000 * 60 * 60 * 49,
    duration: 0,
    sim: "SIM 1",
  },
  {
    id: "call_5",
    number: "0908123456",
    name: "Anh Sinh",
    type: "outgoing",
    date: Date.now() - 1000 * 60 * 60 * 75,
    duration: 310,
    sim: "SIM 2",
  },
  {
    id: "call_6",
    number: "0909999888",
    name: "",
    type: "incoming",
    date: Date.now() - 1000 * 60 * 60 * 120,
    duration: 45,
    sim: "SIM 1",
  },
];

let deviceRecentCallsCache = null;
let deviceRecentCallsRequest = null;
let recentCallsCacheGeneration = 0;

export const getDeviceRecentCalls = async (forceRefresh = false, limit = 100) => {
  // One bounded native snapshot; callers requesting fewer rows share its cache.
  const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 100;
  if (boundedLimit !== 100) {
    return (await getDeviceRecentCalls(forceRefresh, 100)).slice(0, boundedLimit);
  }
  if (deviceRecentCallsRequest) {
    return deviceRecentCallsRequest;
  }
  if (!forceRefresh && deviceRecentCallsCache !== null) {
    return deviceRecentCallsCache;
  }

  const generation = recentCallsCacheGeneration;
  const request = (async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getRecentCalls !== "function") {
      return STATIC_FALLBACK_RECENT_CALLS;
    }
    try {
      const result = await plugin.getRecentCalls({ limit });
      return Array.isArray(result?.calls) ? result.calls : [];
    } catch (error) {
      console.warn("Could not fetch device recent calls:", error);
      return [];
    }
  })().then((calls) => {
    if (generation !== recentCallsCacheGeneration) {
      // Release this request before retrying, otherwise it waits on itself forever.
      if (deviceRecentCallsRequest === request) deviceRecentCallsRequest = null;
      return getDeviceRecentCalls(true, limit);
    }
    deviceRecentCallsCache = calls;
    return calls;
  });

  deviceRecentCallsRequest = request;
  request.then(
    () => { if (deviceRecentCallsRequest === request) deviceRecentCallsRequest = null; },
    () => { if (deviceRecentCallsRequest === request) deviceRecentCallsRequest = null; }
  );
  return request;
};

export const deleteDeviceRecentCall = async (id) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.deleteRecentCall !== "function") {
    if (plugin) return { success: false, error: "delete_unavailable" };
    recentCallsCacheGeneration += 1;
    deviceRecentCallsCache = (deviceRecentCallsCache ?? STATIC_FALLBACK_RECENT_CALLS).filter((c) => c.id !== id);
    return { success: true };
  }
  try {
    const result = await plugin.deleteRecentCall({ id });
    if (result?.success) clearRecentCallsCache();
    return result;
  } catch (error) {
    console.warn("Failed to delete recent call:", error);
    return { success: false, error: error?.message };
  }
};

export const clearRecentCallsCache = () => {
  recentCallsCacheGeneration += 1;
  deviceRecentCallsCache = null;
};

export const STATIC_FALLBACK_CONVERSATIONS = [
  {
    id: "c1",
    threadId: "1",
    address: "0915231765",
    contactName: "An Na",
    snippet: "Alo bạn có nhà không?",
    date: Date.now() - 1000 * 60 * 15,
    type: 1,
    unread: false,
  },
  {
    id: "c2",
    threadId: "2",
    address: "0796359718",
    contactName: "Anh Bình. pbqltopaz",
    snippet: "Ok để mình gửi file qua nhé.",
    date: Date.now() - 1000 * 60 * 60 * 2,
    type: 1,
    unread: false,
  },
  {
    id: "c3",
    threadId: "3",
    address: "0918404949",
    contactName: "Anh Châu. cơm",
    snippet: "Nay quán có món mới nha em.",
    date: Date.now() - 1000 * 60 * 60 * 24,
    type: 1,
    unread: false,
  },
];

export const STATIC_FALLBACK_THREADS = {
  "1": [
    { id: "m1", address: "0915231765", body: "Chào bạn", date: Date.now() - 1000 * 60 * 30, type: 1, unread: false },
    { id: "m2", address: "0915231765", body: "Alo bạn có nhà không?", date: Date.now() - 1000 * 60 * 15, type: 1, unread: false },
  ],
  "0915231765": [
    { id: "m1", address: "0915231765", body: "Chào bạn", date: Date.now() - 1000 * 60 * 30, type: 1, unread: false },
    { id: "m2", address: "0915231765", body: "Alo bạn có nhà không?", date: Date.now() - 1000 * 60 * 15, type: 1, unread: false },
  ],
};

let deviceConversationsCache = null;
let deviceConversationsRequest = null;
const deviceThreadCache = Object.create(null);
const deviceThreadRequests = Object.create(null);
let smsCacheGeneration = 0;

export const getDeviceConversations = async (forceRefresh = false) => {
  if (deviceConversationsRequest) return deviceConversationsRequest;
  if (!forceRefresh && deviceConversationsCache !== null) return deviceConversationsCache;
  const generation = smsCacheGeneration;
  const request = Promise.resolve().then(async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getConversations !== "function") return STATIC_FALLBACK_CONVERSATIONS;
    try {
      const result = await plugin.getConversations();
      return Array.isArray(result?.conversations) ? result.conversations : [];
    } catch (_) { return null; }
  }).then((conversations) => {
    if (deviceConversationsRequest === request) deviceConversationsRequest = null;
    if (generation !== smsCacheGeneration) return getDeviceConversations(true);
    if (conversations !== null) deviceConversationsCache = conversations;
    return conversations ?? [];
  });
  deviceConversationsRequest = request;
  return request;
};

export const getDeviceThread = async (threadIdOrOptions, maybeAddress, forceRefresh = false) => {
  let threadId = "";
  let address = "";
  if (typeof threadIdOrOptions === "object" && threadIdOrOptions !== null) {
    threadId = threadIdOrOptions.threadId || threadIdOrOptions.id || "";
    address = threadIdOrOptions.address || "";
  } else {
    threadId = threadIdOrOptions || "";
    address = maybeAddress || "";
  }

  const cacheKey = threadId || address;
  if (cacheKey && deviceThreadRequests[cacheKey]) {
    return deviceThreadRequests[cacheKey];
  }
  if (!forceRefresh && cacheKey && deviceThreadCache[cacheKey]) {
    return deviceThreadCache[cacheKey];
  }

  const generation = smsCacheGeneration;
  const request = Promise.resolve().then(async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getThreadMessages !== "function") {
      return (threadId && STATIC_FALLBACK_THREADS[threadId]) ||
        (address && STATIC_FALLBACK_THREADS[address]) || STATIC_FALLBACK_THREADS["1"] || [];
    }
    try {
      const result = await plugin.getThreadMessages({ threadId, address });
      return Array.isArray(result?.messages) ? result.messages : [];
    } catch (_) { return []; }
  }).then((messages) => {
    if (cacheKey && deviceThreadRequests[cacheKey] === request) delete deviceThreadRequests[cacheKey];
    if (generation !== smsCacheGeneration) return getDeviceThread({ threadId, address }, undefined, true);
    if (cacheKey) deviceThreadCache[cacheKey] = messages;
    return messages;
  });
  if (cacheKey) deviceThreadRequests[cacheKey] = request;
  return request;
};

export const clearSmsCaches = () => {
  smsCacheGeneration += 1;
  deviceConversationsCache = null;
  Object.keys(deviceThreadCache).forEach((k) => delete deviceThreadCache[k]);
};

const subscribeNativeEvent = (name, callback) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin?.addListener) return () => {};
  let disposed = false;
  let handle;
  const remove = (item) => {
    try { Promise.resolve(item?.remove?.()).catch(() => {}); } catch (_) {}
  };
  try {
    Promise.resolve(plugin.addListener(name, (event) => {
      if (!disposed) callback?.(event);
    })).then((item) => {
      if (disposed) remove(item);
      else handle = item;
    }).catch(() => {});
  } catch (_) {}
  return () => { disposed = true; remove(handle); handle = null; };
};

export const subscribeToSmsUpdates = (callback) => subscribeNativeEvent("smsReceived", (event) => {
  clearSmsCaches();
  callback?.(event);
});

export const subscribeToDumbModeUpdates = (callback) => subscribeNativeEvent("dumbModeChanged", callback);
export const subscribeToFriendAuthenticatorUpdates = callback => subscribeNativeEvent("friendAuthenticatorChanged", callback);

export const subscribeToInstalledAppsUpdates = (callback) => subscribeNativeEvent("installedAppsChanged", () => {
  installedAppsGeneration += 1;
  installedAppsCache = null;
  callback?.();
});

export const subscribeToRecentCallsUpdates = (callback) => subscribeNativeEvent("recentCallsChanged", (event) => {
  clearRecentCallsCache();
  callback?.(event);
});

export const sendDeviceSms = async (address, body) => {
  const plugin = getLauncherAppsPlugin();
  // Clear caches so updated message list shows
  clearSmsCaches();

  if (!plugin || typeof plugin.sendSms !== "function") {
    console.warn("sendSms not supported on this platform");
    return { sent: false, fallback: true };
  }

  try {
    return await plugin.sendSms({ address, body });
  } catch (error) {
    console.warn("Failed to send device SMS:", error);
    return { sent: false, fallback: true, error: error?.message };
  }
};

export const markDeviceConversationRead = async (threadId, address) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.markConversationRead !== "function") {
    return;
  }
  try {
    await plugin.markConversationRead({ threadId, address });
  } catch (error) {
    console.warn("Failed to mark conversation read:", error);
  }
};

let deviceNotificationConversationsCache = [];

export const getDeviceNotificationConversations = async () => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.getNotificationConversations !== "function") {
    return deviceNotificationConversationsCache;
  }
  try {
    const result = await plugin.getNotificationConversations();
    if (result && Array.isArray(result.conversations)) {
      deviceNotificationConversationsCache = result.conversations;
      return result.conversations;
    }
    return deviceNotificationConversationsCache;
  } catch (error) {
    console.warn("Failed to get notification conversations:", error);
    return deviceNotificationConversationsCache;
  }
};

export const replyDeviceNotification = async (notificationKey, body) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.replyNotificationMessage !== "function") {
    console.warn("replyNotificationMessage not supported on this platform");
    return { success: false, error: "Not supported" };
  }
  try {
    return await plugin.replyNotificationMessage({ notificationKey, body });
  } catch (error) {
    console.warn("Failed to reply notification:", error);
    return { success: false, error: error?.message };
  }
};

export const deleteDeviceConversation = async ({ threadId, address, notificationKey, source } = {}) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.deleteConversation !== "function") {
    return { success: true };
  }
  try {
    return await plugin.deleteConversation({ threadId, address, notificationKey, source });
  } catch (error) {
    console.warn("Failed to delete conversation:", error);
    return { success: false, error: error?.message };
  }
};

export const deleteDeviceMessage = async ({ id, notificationKey } = {}) => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.deleteMessage !== "function") {
    return { success: true };
  }
  try {
    return await plugin.deleteMessage({ id, notificationKey });
  } catch (error) {
    console.warn("Failed to delete message:", error);
    return { success: false, error: error?.message };
  }
};


export const subscribeToNotificationMessages = (callback) =>
  subscribeNativeEvent("notificationMessageReceived", callback);

export const subscribeToNotificationCounts = (callback) =>
  subscribeNativeEvent("notificationCountsChanged", callback);

export const checkNotificationAccess = async () => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.checkNotificationAccess !== "function") {
    return false;
  }
  try {
    const res = await plugin.checkNotificationAccess();
    return Boolean(res?.hasAccess);
  } catch (_e) {
    return false;
  }
};

export const openNotificationListenerSettings = async () => {
  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.openNotificationAccessSettings !== "function") {
    return;
  }
  try {
    await plugin.openNotificationAccessSettings();
  } catch (err) {
    console.warn("Failed to open notification settings:", err);
  }
};
