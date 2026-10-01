import { useCallback, useEffect, useState } from "react";
import { isNativeLauncher } from "@/lib/launcherApps";
import { claimWeekCheckIn } from "./checkInState";

export default function useWeekCheckIn(eligible) {
  const [visible, setVisible] = useState(false);
  const dismiss = useCallback(() => setVisible(false), []);
  useEffect(() => {
    if (!visible) return;
    window.addEventListener("nokia-home-request", dismiss);
    return () => window.removeEventListener("nokia-home-request", dismiss);
  }, [visible, dismiss]);
  useEffect(() => {
    if (!isNativeLauncher()) return;
    const check = () => {
      try {
        if (claimWeekCheckIn(window.localStorage, Date.now(), eligible && !document.hidden)) setVisible(true);
      } catch { /* Storage may be disabled by the host. */ }
    };
    check();
    if (!eligible) return;
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [eligible]);
  return { visible, dismiss };
}
