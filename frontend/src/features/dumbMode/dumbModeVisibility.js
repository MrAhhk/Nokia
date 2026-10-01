// Visibility is a projection only. Native Android remains the enforcement authority.
export const isDumbModeBlocked = (app, snapshot) => {
  if (!app) return false;
  const target = app.app || app;
  if (snapshot?.state === "LOADING") return Boolean(target.packageName || target.id === "snake");
  if (!snapshot?.active) return false;
  return (snapshot.blockedIds || []).includes(target.packageName || target.id)
    || (target.id === "snake" || target.internalView === "snake");
};

export const visibleDumbModeApps = (apps, snapshot) =>
  (Array.isArray(apps) ? apps : []).filter((app) => !isDumbModeBlocked(app, snapshot));

export const dumbModeSettingLabel = (snapshot) => {
  if (snapshot?.state === "LOADING") return "Dumb Mode · Loading";
  if (snapshot?.state === "ERROR") return "Dumb Mode · Unavailable";
  if (snapshot?.state === "DEGRADED") return "Dumb Mode · Interrupted";
  return snapshot?.active ? "Dumb Mode · On" : "Dumb Mode";
};
