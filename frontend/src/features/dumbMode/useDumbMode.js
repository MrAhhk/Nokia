import { useCallback, useEffect, useRef, useState } from "react";
import { getDumbModeState, subscribeToDumbModeUpdates, isNativeLauncher } from "@/lib/launcherApps";
import { sameDumbModeSnapshot } from "./snapshot";

const OFF = { state: "OFF", active: false, revision: -1, blockedIds: [], mandatoryIds: [], enforcementAvailable: false };

export default function useDumbMode() {
  const [snapshot, setSnapshot] = useState(() => ({ ...OFF, state: isNativeLauncher() ? "LOADING" : "OFF" }));
  const alive = useRef(true);
  const eventVersion = useRef(0);
  const latestSnapshot = useRef(null);
  const acceptSnapshot = useCallback((next) => {
    if (!alive.current || !next || !Array.isArray(next.blockedIds) || !Number.isFinite(next.revision)) return;
    if (latestSnapshot.current && (next.revision < latestSnapshot.current.revision || sameDumbModeSnapshot(latestSnapshot.current, next))) return;
    latestSnapshot.current = next;
    eventVersion.current += 1;
    setSnapshot(next);
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!isNativeLauncher()) return () => { alive.current = false; };
    // Subscribe before the one bootstrap read; an older read cannot overwrite an event.
    const unsubscribe = subscribeToDumbModeUpdates(acceptSnapshot);
    const version = eventVersion.current;
    getDumbModeState().then((next) => {
      if (version === eventVersion.current) acceptSnapshot(next);
    }).catch(() => {
      if (alive.current && version === eventVersion.current) {
        setSnapshot((previous) => ({ ...previous, state: "ERROR", error: "dumb_mode_unavailable" }));
      }
    });
    return () => { alive.current = false; unsubscribe(); };
  }, [acceptSnapshot]);
  return { snapshot, acceptSnapshot };
}
