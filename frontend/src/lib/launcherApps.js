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
