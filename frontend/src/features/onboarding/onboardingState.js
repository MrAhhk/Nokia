// Stable across app updates. Completion is local to this installation's app data.
export const ONBOARDING_KEY = "nokia-launcher.onboarding";
export const TOUR_STEPS = Object.freeze([
  { id: "navigation", title: "Meet your keys.", text: "↑ Menu · ↓ Recent Calls\n← → Move · Centre: select\nRed: Home · Green: recent apps on Home, call/send in a conversation.", hint: "Top keys follow the screen labels: Go to / Settings on Home, Delete / Back elsewhere. Try a key." },
  { id: "typing", title: "Tap. Pause. Type.", text: "On Home, numbers start dialing.\nIn text, tap 2–9 again to pick a letter, then pause. # changes case.", hint: "Try the keys below. Nothing is called or sent." },
  { id: "defaults", title: "Your apps. Your Home.", text: "Hold a Home shortcut.\nChoose a built-in tool or an installed app. Change it any time.", hint: "Try with Messages, or keep your current choice." },
  { id: "permissions", title: "Only what you use.", text: "Contacts & calls → names and history\nSMS → built-in messages\nCamera & mic → photos and video", hint: "You can decline. Optional notification access reads other apps’ notifications into your inbox." },
  { id: "setup", title: "Make yourself at Home.", text: "Set Nokia Launcher as your Home app.\nWant these keys in other apps? Enable the keyboard, then select it.", hint: "Keyboard setup is optional. Finish once; this guide stays out of your way." },
]);

export function loadOnboarding(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(ONBOARDING_KEY) || "null");
    if (saved?.completed === true) return { completed: true, index: 0 };
    return { completed: false, index: Number.isInteger(saved?.index) && saved.index >= 0 && saved.index < TOUR_STEPS.length ? saved.index : 0 };
  } catch { return { completed: false, index: 0 }; }
}

export function saveOnboarding(storage, state) {
  try { storage?.setItem(ONBOARDING_KEY, JSON.stringify(state)); return Boolean(storage); }
  catch { return false; }
}
