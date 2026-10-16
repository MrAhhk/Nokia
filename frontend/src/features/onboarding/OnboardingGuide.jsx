import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { openSystemSetting, showKeyboardSettings, showKeyboardPicker, openNotificationAccessSettings, getDumbModeState, subscribeToSystemSettingReturns } from "@/lib/launcherApps";
import { TOUR_STEPS } from "./onboardingState";
import { KEY_INTENTS } from "@/domain/keyGrammar";
import { playKeypadTone } from "@/features/sound/nokiaAudioEngine";
import { loadSoundSettings } from "@/features/sound/soundStorage";
import OnboardingPreview from "./OnboardingPreview";
import { acceptAccessibilityDisclosure } from "@/lib/launcherApps";
import { ACCESSIBILITY_DISCLOSURE, ACCESSIBILITY_DISCLOSURE_VERSION } from "./accessibilityDisclosure";
import "./onboarding.css";

const OnboardingGuide = forwardRef(function OnboardingGuide({ tour, onChoose, onFinish, onBack, onNext, steps = TOUR_STEPS, headingText = "GET STARTED", regionLabel = "First-time guide", onRequestHome, homeState, completionLabel, className = "" }, ref) {
  const section = useRef(null);
  const heading = useRef(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const opening = useRef(false);
  const keyActivating = useRef(false);
  const homeReturn = useRef({ armed: false, left: false });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkedHome, setCheckedHome] = useState("idle");
  const [tips, setTips] = useState(false);
  const [practice, setPractice] = useState(false);
  const [accessAgreed, setAccessAgreed] = useState(false);
  const step = tour.step;
  const modern = Boolean(step.kind);
  const home = homeState || checkedHome;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    generation.current++;
    homeReturn.current = { armed: false, left: false };
    opening.current = false;
    setStatus(""); setBusy(false); setCheckedHome("idle"); setTips(false); setPractice(false); setAccessAgreed(false);
    heading.current?.focus({ preventScroll: true });
    if (section.current) section.current.querySelector('.onboarding-coach__copy').scrollTop = 0;
  }, [tour.index, tour.choosing]);
  const open = async (action) => {
    if (opening.current) return;
    opening.current = true;
    const token = generation.current;
    setBusy(true);
    try { await action(); if (alive.current && token === generation.current) setStatus("Make your choice in Android, then return here."); }
    catch { if (alive.current && token === generation.current) { homeReturn.current.armed = false; setStatus("Couldn’t open that setting. You can find it in Android Settings later."); } }
    finally { if (alive.current && token === generation.current) { opening.current = false; setBusy(false); } }
  };
  const checkHome = async () => {
    const token = generation.current;
    homeReturn.current.armed = false;
    setCheckedHome("checking");
    setStatus("");
    try {
      const state = await getDumbModeState();
      if (!alive.current || token !== generation.current) return;
      setCheckedHome(typeof state?.defaultLauncherAvailable === "boolean" ? (state.defaultLauncherAvailable ? "ready" : "idle") : "unavailable");
      setStatus(state?.defaultLauncherAvailable === true ? "" : "Choose Nokia Launcher in Android’s Home app settings.");
    } catch { if (alive.current && token === generation.current) setCheckedHome("unavailable"); }
  };
  // Only an explicitly opened Home setting arms a return read. No idle polling.
  useEffect(() => {
    if (step.kind !== "home-setup") return;
    const leave = () => { if (homeReturn.current.armed) homeReturn.current.left = true; };
    const resume = () => { if (homeReturn.current.armed && homeReturn.current.left) checkHome(); };
    const visibility = () => document.hidden ? leave() : resume();
    const unsubscribe = subscribeToSystemSettingReturns(event => {
      if (event?.setting === "default-launcher" && homeReturn.current.armed) checkHome();
    });
    window.addEventListener("blur", leave); window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => { unsubscribe(); window.removeEventListener("blur", leave); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", visibility); };
    // checkHome reads refs; this listener is scoped to the current guide screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind]);
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if ([KEY_INTENTS.HOME, KEY_INTENTS.END].includes(key)) { if (practice) { setPractice(false); return; } onFinish(); return; }
    if ([KEY_INTENTS.BACK, KEY_INTENTS.SOFT_RIGHT].includes(key)) { if (practice) setPractice(false); else if (tips) setTips(false); else if (tour.index > 0) onBack(); return; }
    if (practice) {
      const hints = { UP: "Up opens Menu.", SELECT: "Centre selects.", GREEN: "Green opens recent apps on Home.", DOWN: "Down opens Recent Calls.", LOCK_SCREEN: "Hold Red to lock. Practice never locks your phone." };
      setStatus(hints[key] || (/^[0-9*#]$/.test(key) ? `${key}: a dial key on Home; letters and symbols in text.` : "This is practice. Nothing is called or sent."));
      return;
    }
    const buttons = [...(section.current?.querySelectorAll("button:not(:disabled)") || [])];
    if ([KEY_INTENTS.UP, KEY_INTENTS.DOWN, KEY_INTENTS.LEFT, KEY_INTENTS.RIGHT].includes(key)) {
      const i = buttons.indexOf(document.activeElement);
      const delta = [KEY_INTENTS.UP, KEY_INTENTS.LEFT].includes(key) ? -1 : 1;
      const next = i < 0 ? buttons.find(b => b.classList.contains('onboarding-coach__next')) : buttons[(i + delta + buttons.length) % buttons.length];
      next?.focus(); next?.scrollIntoView?.({ block: "nearest" }); return;
    }
    if ([KEY_INTENTS.SELECT, KEY_INTENTS.GREEN, KEY_INTENTS.SEND, KEY_INTENTS.SOFT_LEFT].includes(key)) {
      const active = buttons.includes(document.activeElement) ? document.activeElement : section.current?.querySelector('.onboarding-coach__next');
      keyActivating.current = true;
      try { active?.click(); } finally { keyActivating.current = false; }
      return;
    }
    if (/^[0-9*#]$/.test(key)) setStatus(`${key}: a dial key on Home; letters and symbols in text.`);
  }}));
  const playFeedback = event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || keyActivating.current) return;
    const prefs = loadSoundSettings(); playKeypadTone("SELECT", prefs.keypadTone, prefs.volume, prefs.vibrate);
  };
  if (tour.choosing) return null;
  return <section ref={section} className={`lcd-screen onboarding-coach ${className}`} onClickCapture={playFeedback}
    role="region" aria-label={regionLabel} data-testid="onboarding-guide">
    <header className="onboarding-coach__eyebrow"><span>{step.kind === "dumb-mode" ? "DUMB MODE" : headingText}<small>{tour.index + 1} / {steps.length}</small></span><button onClick={onFinish} className="onboarding-coach__skip">Skip guide</button></header>
    <div className="onboarding-coach__progress" aria-hidden="true">{steps.map((s, i) => <i key={s.id} className={i <= tour.index ? "is-done" : ""} />)}</div>
    <div className="onboarding-coach__copy">
      <h2 ref={heading} tabIndex={-1}>{step.title}</h2>
      {step.text && <p>{step.text}</p>}
      {step.kind === "accessibility" && <div className="onboarding-coach__disclosure" aria-label="Accessibility disclosure">
        {ACCESSIBILITY_DISCLOSURE.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
      </div>}
      <OnboardingPreview kind={step.kind} />
      {step.kind === "dumb-mode" && <div className="onboarding-coach__accountability"><p>To turn it off, ask a selected friend for their current eight-digit code.</p><p><strong>No in-app reset</strong> if your selected friends cannot provide a code.</p></div>}
      {step.kind === "keys" && <>
        <button className="onboarding-coach__action" aria-pressed={practice} onClick={() => { setPractice(!practice); setStatus(""); }}>{practice ? "Done practising" : "Try the keys"}</button>
        <button aria-expanded={tips} onClick={() => setTips(!tips)}>More key tips {tips ? "−" : "+"}</button>
        {tips && <p className="onboarding-coach__hint">On Home, numbers start dialing. In text, tap 2–9 again to pick a letter, then pause. # changes case. Hold a Home shortcut to choose its app. Keyboard setup is available in Settings.</p>}
      </>}
      {(status || tour.keyHint || (!modern && step.hint)) && <p className="onboarding-coach__hint" role="status">{status || tour.keyHint || step.hint}</p>}
      {step.id === "defaults" && <button className="onboarding-coach__action" onClick={onChoose}>Choose Messages app ↗</button>}
      {step.id === "permissions" && <button className="onboarding-coach__action" disabled={busy} onClick={() => open(openNotificationAccessSettings)}>Optional: notification access ↗</button>}
      {step.kind === "home-setup" ? <div className="onboarding-coach__settings">
        {home !== "ready" && <button disabled={busy || home === "checking"} onClick={() => { homeReturn.current = { armed: true, left: false }; open(onRequestHome || (() => openSystemSetting("default-launcher"))); }}>Set Home app ↗</button>}
        {home !== "ready" && <button disabled={home === "checking"} onClick={checkHome}>{home === "checking" ? "Checking…" : "Check again"}</button>}
        {home === "ready" && <p role="status">Nokia Launcher is your Home app.</p>}
        {home === "unavailable" && <p role="status">Couldn’t check Home setup. You can set it in Android Settings.</p>}
      </div> : step.id === "setup" && <div className="onboarding-coach__settings">
        <button disabled={busy} onClick={() => open(() => openSystemSetting("default-launcher"))}>Set Home app ↗</button>
        <button disabled={busy} onClick={() => open(showKeyboardSettings)}>1. Enable keyboard ↗</button>
        <button disabled={busy} onClick={() => open(showKeyboardPicker)}>2. Select keyboard ↗</button>
      </div>}
    </div>
    <footer className="onboarding-coach__footer">
      {tour.index > 0 && step.kind !== "accessibility" && <button onClick={() => practice ? setPractice(false) : tips ? setTips(false) : onBack()}>Back</button>}
      {step.kind === "accessibility" && !accessAgreed && <button disabled={busy} onClick={() => open(async () => {
        const token = generation.current;
        await acceptAccessibilityDisclosure(ACCESSIBILITY_DISCLOSURE_VERSION);
        if (alive.current && token === generation.current) setAccessAgreed(true);
      })}>Enable Accessibility</button>}
      <button className="onboarding-coach__next" disabled={busy} onClick={onNext}>{step.kind === "accessibility" && accessAgreed ? "Continue" : completionLabel && tour.index === steps.length - 1 ? completionLabel : step.kind === "home-setup" && home === "ready" ? "Start using Nokia Launcher" : step.primaryLabel || (tour.index === steps.length - 1 ? "Finish" : "Next →")}</button>
    </footer>
  </section>;
});
export default OnboardingGuide;
