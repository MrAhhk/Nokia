import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import OnboardingGuide from '@/features/onboarding/OnboardingGuide';
import useOnboarding from '@/features/onboarding/useOnboarding';
import { openBillingRecovery } from '@/lib/launcherApps';
import { loadSoundSettings } from '@/features/sound/soundStorage';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';
import './billingOnboarding.css';

// Mount only after the immutable native local decision has been persisted.
// Owns the existing onboarding preference, never launcher caches or billing rights.
export default forwardRef(function BillingOnboarding({ onComplete, onStepChange }, ref) {
  const tour = useOnboarding();
  const guide = useRef(null);
  const completed = useRef(false);
  useEffect(() => {
    if (!tour.active && !completed.current) { completed.current = true; onComplete(); }
  }, [tour.active, onComplete]);
  useEffect(() => { onStepChange?.(tour.active ? tour.step.id : undefined); }, [tour.active, tour.step.id, onStepChange]);
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if (!tour.active) return;
    const sound = loadSoundSettings();
    playKeypadTone(key, sound.keypadTone, sound.volume, sound.vibrate);
    guide.current?.handleKey(key);
  } }), [tour.active]);
  const requestHome = useCallback(() => openBillingRecovery({ action: 'home-settings' }), []);
  if (!tour.active) return null;
  return <OnboardingGuide ref={guide} tour={tour} onFinish={tour.finish}
    onNext={tour.next} onBack={tour.back} onRequestHome={requestHome}
    completionLabel="Choose a plan" className="billing-onboarding" />;
});
