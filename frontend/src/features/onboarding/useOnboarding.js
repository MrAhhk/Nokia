import { useCallback, useState } from "react";
import { loadOnboarding, saveOnboarding, TOUR_STEPS } from "./onboardingState";
import { isNativeLauncher } from "@/lib/launcherApps";

const storage = () => { try { return window.localStorage; } catch { return null; } };

export default function useOnboarding() {
  const [state, setState] = useState(() => isNativeLauncher()
    ? loadOnboarding(storage()) : { completed: true, index: 0 });
  const [choosing, setChoosing] = useState(false);
  const [keyHint, setKeyHint] = useState("");
  const [finishedThisSession, setFinishedThisSession] = useState(false);
  const change = useCallback((next) => {
    saveOnboarding(storage(), next);
    setState(next);
    setKeyHint("");
    setChoosing(false);
  }, []);
  const finish = useCallback(() => { setFinishedThisSession(true); change({ completed: true, index: 0 }); }, [change]);
  const next = useCallback(() => state.index === TOUR_STEPS.length - 1
    ? finish() : change({ completed: false, index: state.index + 1 }), [state.index, change, finish]);
  const back = useCallback(() => change({ completed: false, index: Math.max(0, state.index - 1) }), [state.index, change]);
  return { active: !state.completed, index: state.index, step: TOUR_STEPS[state.index], choosing,
    setChoosing, keyHint, setKeyHint, next, back, finish, finishedThisSession };
}
