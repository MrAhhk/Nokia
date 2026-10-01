import { useEffect, useRef, useState } from "react";
import { openSystemSetting, showKeyboardSettings, showKeyboardPicker, openNotificationAccessSettings } from "@/lib/launcherApps";
import { TOUR_STEPS } from "./onboardingState";
import { playKeypadTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import "./onboarding.css";

export default function OnboardingGuide({ tour, onChoose, onFinish, onBack, onNext, steps = TOUR_STEPS, headingText = "GETTING STARTED", regionLabel = "First-time guide" }) {
  const heading = useRef(null);
  const alive = useRef(true);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { setStatus(""); heading.current?.focus({ preventScroll: true }); }, [tour.index, tour.choosing]);
  const open = async (action) => {
    if (busy) return;
    setBusy(true);
    try { await action(); if (alive.current) setStatus("Make your choice in Android, then return here."); }
    catch { if (alive.current) setStatus("Couldn’t open that setting. You can find it in Android Settings later."); }
    finally { if (alive.current) setBusy(false); }
  };
  const playFeedback = (event) => {
    if (!event.target.closest("button") || event.target.closest("button").disabled) return;
    const prefs = loadSoundSettings();
    playKeypadTone("SELECT", prefs.keypadTone, prefs.volume, prefs.vibrate);
  };
  // The real app picker owns the whole LCD during this exercise.
  // Do not squeeze the guide into a small card over its rows.
  if (tour.choosing) return null;
  return <section className="lcd-screen onboarding-coach" onClickCapture={playFeedback}
    role="region" aria-label={regionLabel} data-testid="onboarding-guide">
    <header className="onboarding-coach__eyebrow"><span>{headingText}</span><span>{String(tour.index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span></header>
    <div className="onboarding-coach__progress" aria-hidden="true">{steps.map((s, i) => <i key={s.id} className={i <= tour.index ? "is-done" : ""} />)}</div>
    <div className="onboarding-coach__copy">
      <h2 ref={heading} tabIndex={-1}>{tour.step.title}</h2>
      <p>{tour.step.text}</p>
      {<p className="onboarding-coach__hint" role="status">{status || tour.keyHint || tour.step.hint}</p>}
      {tour.step.id === "defaults" && <button className="onboarding-coach__action" onClick={onChoose}>Choose Messages app ↗</button>}
      {tour.step.id === "permissions" && <button className="onboarding-coach__action" disabled={busy} onClick={() => open(openNotificationAccessSettings)}>Optional: notification access ↗</button>}
      {tour.step.id === "setup" && <div className="onboarding-coach__settings">
        <button disabled={busy} onClick={() => open(() => openSystemSetting("default-launcher"))}>Set Home app ↗</button>
        <button disabled={busy} onClick={() => open(showKeyboardSettings)}>1. Enable keyboard ↗</button>
        <button disabled={busy} onClick={() => open(showKeyboardPicker)}>2. Select keyboard ↗</button>
      </div>}
    </div>
    <footer className="onboarding-coach__footer">
      <button onClick={onFinish} className="onboarding-coach__skip">Skip guide</button>
      <div>{tour.index > 0 && <button onClick={onBack}>Back</button>}<button className="onboarding-coach__next" onClick={onNext}>{tour.index === steps.length - 1 ? "Finish" : "Next →"}</button></div>
    </footer>
  </section>;
}
