const getLauncherAppsPlugin = () => {
  return window.Capacitor?.Plugins?.LauncherApps ?? null;
};

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


