const getLauncherAppsPlugin = () => {
  return window.Capacitor?.Plugins?.LauncherApps ?? null;
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
const INSTALLED_APPS_STORAGE_KEY = "nokia-launcher.installed-apps.v1";

export const getCachedInstalledApps = () => {
  if (typeof window === "undefined") return [];
  try {
    const cached = JSON.parse(window.localStorage.getItem(INSTALLED_APPS_STORAGE_KEY) || "[]");
    return Array.isArray(cached) ? cached : [];
  } catch (_error) {
    return [];
  }
};

const persistInstalledApps = (apps) => {
  if (typeof window === "undefined" || !Array.isArray(apps) || apps.length === 0) return;
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
  installedAppsRequest = launcherApps
    .getInstalledApps()
    .then((result) => {
      installedAppsCache = Array.isArray(result?.apps) ? result.apps : [];
      if (installedAppsCache.length === 0) {
        console.warn("Native LauncherApps plugin returned 0 apps. Falling back to static mock apps.");
        installedAppsCache = STATIC_FALLBACK_APPS;
      }
      persistInstalledApps(installedAppsCache);
      return installedAppsCache;
    })
    .catch((error) => {
      console.error("Error calling native LauncherApps, falling back to static mock apps:", error);
      installedAppsCache = STATIC_FALLBACK_APPS;
      return STATIC_FALLBACK_APPS;
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
  if (!forceRefresh && deviceContactsCache && deviceContactsCache.length > 0) {
    return deviceContactsCache;
  }
  if (!forceRefresh && deviceContactsRequest) {
    return deviceContactsRequest;
  }

  deviceContactsRequest = (async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getContacts !== "function") {
      deviceContactsCache = STATIC_FALLBACK_CONTACTS;
      return STATIC_FALLBACK_CONTACTS;
    }
    try {
      const result = await plugin.getContacts();
      if (result && Array.isArray(result.contacts) && result.contacts.length > 0) {
        deviceContactsCache = result.contacts;
        return result.contacts;
      }
      deviceContactsCache = STATIC_FALLBACK_CONTACTS;
      return STATIC_FALLBACK_CONTACTS;
    } catch (error) {
      console.warn("Could not fetch device contacts, using fallback:", error);
      deviceContactsCache = STATIC_FALLBACK_CONTACTS;
      return STATIC_FALLBACK_CONTACTS;
    } finally {
      deviceContactsRequest = null;
    }
  })();

  return deviceContactsRequest;
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
const deviceThreadCache = {};

export const getDeviceConversations = async (forceRefresh = false) => {
  if (!forceRefresh && deviceConversationsCache && deviceConversationsCache.length > 0) {
    return deviceConversationsCache;
  }
  if (!forceRefresh && deviceConversationsRequest) {
    return deviceConversationsRequest;
  }

  deviceConversationsRequest = (async () => {
    const plugin = getLauncherAppsPlugin();
    if (!plugin || typeof plugin.getConversations !== "function") {
      deviceConversationsCache = STATIC_FALLBACK_CONVERSATIONS;
      return STATIC_FALLBACK_CONVERSATIONS;
    }
    try {
      const result = await plugin.getConversations();
      if (result && Array.isArray(result.conversations) && result.conversations.length > 0) {
        deviceConversationsCache = result.conversations;
        return result.conversations;
      }
      deviceConversationsCache = STATIC_FALLBACK_CONVERSATIONS;
      return STATIC_FALLBACK_CONVERSATIONS;
    } catch (error) {
      console.warn("Could not fetch device conversations, using fallback:", error);
      deviceConversationsCache = STATIC_FALLBACK_CONVERSATIONS;
      return STATIC_FALLBACK_CONVERSATIONS;
    } finally {
      deviceConversationsRequest = null;
    }
  })();

  return deviceConversationsRequest;
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
  if (!forceRefresh && cacheKey && deviceThreadCache[cacheKey]) {
    return deviceThreadCache[cacheKey];
  }

  const plugin = getLauncherAppsPlugin();
  if (!plugin || typeof plugin.getThreadMessages !== "function") {
    const fallback = (threadId && STATIC_FALLBACK_THREADS[threadId]) ||
      (address && STATIC_FALLBACK_THREADS[address]) ||
      STATIC_FALLBACK_THREADS["1"] || [];
    if (cacheKey) deviceThreadCache[cacheKey] = fallback;
    return fallback;
  }

  try {
    const result = await plugin.getThreadMessages({ threadId, address });
    if (result && Array.isArray(result.messages)) {
      if (cacheKey) deviceThreadCache[cacheKey] = result.messages;
      return result.messages;
    }
    const fallback = (threadId && STATIC_FALLBACK_THREADS[threadId]) ||
      (address && STATIC_FALLBACK_THREADS[address]) ||
      STATIC_FALLBACK_THREADS["1"] || [];
    if (cacheKey) deviceThreadCache[cacheKey] = fallback;
    return fallback;
  } catch (error) {
    console.warn("Could not fetch thread messages, using fallback:", error);
    const fallback = (threadId && STATIC_FALLBACK_THREADS[threadId]) ||
      (address && STATIC_FALLBACK_THREADS[address]) ||
      STATIC_FALLBACK_THREADS["1"] || [];
    if (cacheKey) deviceThreadCache[cacheKey] = fallback;
    return fallback;
  }
};

export const sendDeviceSms = async (address, body) => {
  const plugin = getLauncherAppsPlugin();
  // Clear caches so updated message list shows
  deviceConversationsCache = null;
  Object.keys(deviceThreadCache).forEach((k) => delete deviceThreadCache[k]);

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
