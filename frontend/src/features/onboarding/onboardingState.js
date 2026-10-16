// Stable across app updates. Completion is local to this installation's app data.
export const ONBOARDING_KEY = "nokia-launcher.onboarding";
export const TOUR_STEPS = Object.freeze([
  { id: "welcome", kind: "welcome", title: "A calmer phone.", text: "Keep the tools you need. Make distractions easier to leave.", primaryLabel: "Get started" },
  { id: "dumb-mode", kind: "dumb-mode", title: "Less temptation.\nMore control.", text: "Choose apps to block. Let a trusted friend hold your unlock code.", primaryLabel: "Continue" },
  { id: "navigation", kind: "keys", title: "Your keys.\nMade simple.", text: "Up opens Menu. Centre selects. Red returns Home.", primaryLabel: "Continue" },
  { id: "accessibility", kind: "accessibility", title: "Accessibility", text: "", primaryLabel: "Not now" },
  { id: "setup", kind: "home-setup", title: "Make it your Home.", text: "Choose Nokia Launcher as your Home app.", primaryLabel: "Use for now" },
]);

export function loadOnboarding(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(ONBOARDING_KEY) || "null");
    if (saved?.completed === true) return { completed: true, index: 0 };
    if (saved?.schema === 2) {
      const index = TOUR_STEPS.findIndex(step => step.id === saved.stepId);
      return { completed: false, index: Math.max(0, index) };
    }
    const legacyIds = ["navigation", "navigation", "setup", "setup", "setup"];
    const id = Number.isInteger(saved?.index) ? legacyIds[saved.index] : null;
    return { completed: false, index: id ? TOUR_STEPS.findIndex(step => step.id === id) : 0 };
  } catch { return { completed: false, index: 0 }; }
}

export function saveOnboarding(storage, state) {
  try { storage?.setItem(ONBOARDING_KEY, JSON.stringify({ ...state, schema: 2, stepId: TOUR_STEPS[state.index]?.id || "welcome" })); return Boolean(storage); }
  catch { return false; }
}
