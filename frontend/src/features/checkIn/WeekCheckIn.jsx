import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { openAppReview, shareLauncherApp } from "@/lib/launcherApps";
import "./checkIn.css";

const WeekCheckIn = forwardRef(function WeekCheckIn({ onClose }, ref) {
  const panel = useRef(null);
  const pendingAction = useRef(false);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const run = async (action) => {
    if (pendingAction.current) return;
    pendingAction.current = true;
    setBusy(true); setStatus("");
    try { await action(); }
    catch (error) { if (error?.name !== "AbortError") setStatus("Couldn’t open that right now. You can try again from Settings."); }
    finally { pendingAction.current = false; setBusy(false); }
  };
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if (["BACK", "HOME", "END"].includes(key)) { onClose(); return; }
    const buttons = Array.from(panel.current?.querySelectorAll("button:not(:disabled)") || []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement);
    if (["UP", "LEFT", "DOWN", "RIGHT"].includes(key)) {
      const direction = ["UP", "LEFT"].includes(key) ? -1 : 1;
      buttons[(current < 0 ? 0 : (current + direction + buttons.length) % buttons.length)].focus();
    } else if (key === "SELECT" || key === "SEND") (buttons[current < 0 ? 0 : current]).click();
  } }), [onClose]);

  return <section ref={panel} className="lcd-screen week-check-in" role="region" aria-label="One-week check-in" data-testid="week-check-in">
    <header className="week-check-in__header"><span>ONE WEEK IN</span><button onClick={onClose} aria-label="Close check-in">Close</button></header>
    <div className="week-check-in__body">
      <h2>{answer === null ? "A little more life." : answer ? "That’s a meaningful step." : "You’re still making an effort."}</h2>
      <p>{answer === null ? "Has Nokia Launcher helped you reduce your screen time?" : answer ? "Well done. Keep making room for what matters. Share a calmer phone with a friend." : "That’s okay. Change takes time. Keep going at your own pace — and invite a friend to try with you."}</p>
      {answer === null && <div className="week-check-in__answers"><button onClick={() => setAnswer(true)}>Yes</button><button onClick={() => setAnswer(false)}>Not yet</button></div>}
      <p className="week-check-in__note">{status || "Your honest review helps. Sharing is optional."}</p>
    </div>
    <div className="week-check-in__actions"><button disabled={busy} onClick={() => run(shareLauncherApp)}>Share with a friend</button><button disabled={busy} onClick={() => run(openAppReview)}>Review on Google Play</button></div>
    <footer>Just this once. No reminders.</footer>
  </section>;
});
export default WeekCheckIn;
