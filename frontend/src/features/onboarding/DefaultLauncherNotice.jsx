import { useEffect, useRef, useState } from "react";
import { openSystemSetting } from "@/lib/launcherApps";

// Role truth comes from the launcher's existing native snapshot subscription.
// This notice performs no startup, focus or idle queries of its own.
export default function DefaultLauncherNotice({ onDismiss, onSetup }) {
  const alive = useRef(true);
  const opening = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    onSetup?.();
    setBusy(true); setMessage("");
    try {
      await openSystemSetting("default-launcher");
      if (alive.current) setMessage("Choose Nokia Launcher as your Home app.");
    } catch {
      if (alive.current) setMessage("Couldn’t open settings. Choose Home app in Android Settings.");
    } finally {
      opening.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <section className="onboarding-handoff default-launcher-notice" data-home-notice
    data-testid="default-launcher-notice" aria-label="Set default launcher">
    <strong>Make Nokia your Home.</strong>
    {message && <p role="status">{message}</p>}
    <div><button autoFocus disabled={busy} onClick={open}>{busy ? "Opening…" : "Set default launcher"}</button>
      <button data-notice-dismiss onClick={onDismiss}>Later</button></div>
  </section>;
}
