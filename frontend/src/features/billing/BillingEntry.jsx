import { useCallback, useEffect, useRef, useState } from 'react';
import NokiaFrame from '@/components/NokiaFrame';
import { loadAppearance } from '@/features/customization/appearanceStorage';
import BillingOnboarding from './BillingOnboarding';
import BillingPaywall from './BillingPaywall';
import { refreshBillingCatalog } from '@/lib/launcherApps';

// Lazy UI boundary: do not load frame/audio/onboarding assets on disabled or IME paths.
export default function BillingEntry({ billingView, onboardingFinished, onCompleteOnboarding,
  onBillingView, onRetryInitialization, onExistingFriendRecovery }) {
  const [appearance] = useState(loadAppearance);
  const [guideId, setGuideId] = useState();
  const onboardingRef = useRef(null), paywallRef = useRef(null);
  const presentationRequested = useRef(null), publish = useRef(onBillingView);
  publish.current = onBillingView;
  const onboarding = !onboardingFinished;
  const hasPrices = billingView.catalog.some(item => item.available);
  const busy = ['checking', 'checkout', 'restoring'].includes(billingView.operation.state);
  useEffect(() => {
    if (onboarding || hasPrices || busy || billingView.unresolvedPurchase || !billingView.capabilities.restore
      || presentationRequested.current === billingView.controllerEpoch) return;
    presentationRequested.current = billingView.controllerEpoch;
    let active = true;
    // Finite presentation request after the guide, never idle Home/IME work.
    refreshBillingCatalog().then(view => { if (active) publish.current?.(view); }).catch(() => {});
    return () => { active = false; };
  }, [onboarding, hasPrices, busy, billingView.unresolvedPurchase, billingView.capabilities.restore, billingView.controllerEpoch]);
  const handleKey = useCallback(key => (onboarding ? onboardingRef : paywallRef).current?.handleKey(key), [onboarding]);
  return <NokiaFrame appearance={appearance} guideId={onboarding ? guideId : undefined} onKeypadPress={handleKey}>
    {onboarding ? <BillingOnboarding ref={onboardingRef} onComplete={onCompleteOnboarding} onStepChange={setGuideId} />
      : <BillingPaywall ref={paywallRef} billingView={billingView} onBillingView={onBillingView}
        onRetryInitialization={onRetryInitialization} onExistingFriendRecovery={onExistingFriendRecovery} />}
  </NokiaFrame>;
}
