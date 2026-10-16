import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { getBillingBootstrapPolicy, initializeBilling, getBillingSnapshot, refreshBilling, restoreBillingPurchases, openBillingManagement, getBillingSupportSummary, subscribeToBillingUpdates, openBillingRecovery, billingShellReady } from '@/lib/launcherApps';
import { validateBillingView } from './billingContract';
import { serializeBillingLegacyEvidence } from './billingLegacyEvidence';
import './billingBootstrap.css';
import { BillingContext } from './BillingContext';
import BillingUiBoundary from './BillingUiBoundary';
import BillingRecoveryFrame from './BillingRecoveryFrame';
export { default as BillingUiBoundary } from './BillingUiBoundary';
const BillingEntry = lazy(() => import('./BillingEntry'));
const BillingFriendRecovery = lazy(() => import('./BillingFriendRecovery'));

// Keep the original evidence across retries, StrictMode and subsequent Home remounts.
// Never consult storage or recapture evidence after a launcher writer has run.
const originalEvidence = new WeakMap();
function captureOnce(root) {
  if (!originalEvidence.has(root)) originalEvidence.set(root, serializeBillingLegacyEvidence(root));
  return originalEvidence.get(root);
}

export default function BillingBootstrap({ children }) {
  const [captureJson] = useState(() => captureOnce(window));
  const [attempt, setAttempt] = useState(0);
  const [surface, setSurface] = useState('loading');
  const stream = useRef({ epoch: null, sequence: -1, retired: new Set() });
  const initializedView = useRef(null);
  const applyLatest = useRef(null);
  const restoreLock = useRef(false);
  const [billingView, setBillingView] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [escapeFailed, setEscapeFailed] = useState(false);
  const manageLock = useRef(false);
  const [managing, setManaging] = useState(false);
  const [manageFailed, setManageFailed] = useState(false);
  const supportLock = useRef(false);
  const [supportText, setSupportText] = useState(null);
  const [supportFailed, setSupportFailed] = useState(false);
  const [onboardingFinished, setOnboardingFinished] = useState(false);
  const [friendRecovery, setFriendRecovery] = useState(false);
  const finishOnboarding = useCallback(() => setOnboardingFinished(true), []);
  const healthySignaled = useRef(false);
  useEffect(() => {
    if (surface === 'loading' || healthySignaled.current) return;
    healthySignaled.current = true;
    // Runs after a healthy launcher/recovery DOM commit, independently of provider latency.
    Promise.resolve().then(() => billingShellReady()).catch(() => {});
  }, [surface]);

  useEffect(() => {
    let active = true;
    let subscription;
    let snapshotPending = false;
    let readAgain = false;
    let epochVerificationPending = false;
    const deadline = setTimeout(() => { if (active) setSurface('recovery'); }, 3000);
    setSurface('loading');
    restoreLock.current = false; setRestoring(false);
    const recovery = () => { if (active) setSurface('recovery'); };
    const apply = (raw, authoritative = false) => {
      if (!active) return;
      const checked = validateBillingView(raw);
      if (!checked.ok) { recovery(); return; }
      const view = checked.value;
      const cursor = stream.current;
      if (cursor.retired.has(view.controllerEpoch)) return;
      if (view.controllerEpoch !== cursor.epoch) {
        if (!authoritative) {
          epochVerificationPending = true;
          // A controller handoff is not a revocation. Keep established Home
          // mounted while its latest native snapshot confirms the new epoch.
          readSnapshot();
          return;
        }
        if (cursor.epoch !== null) cursor.retired.add(cursor.epoch);
        cursor.epoch = view.controllerEpoch;
        cursor.sequence = -1;
      }
      if (!authoritative && epochVerificationPending) return;
      if (view.sequence < cursor.sequence || (!authoritative && view.sequence === cursor.sequence)) return;
      epochVerificationPending = false;
      cursor.sequence = view.sequence;
      initializedView.current = view;
      setBillingView(view);
      clearTimeout(deadline);
      // Paid access does not authorize startup writers before the local decision
      // is sealed. Established legacy evidence alone may allow a full session
      // when the native eligible seal could not be persisted.
      setSurface(view.access.full && (view.legacy.persisted || view.legacy.status === 'eligible') ? 'launcher' : 'recovery');
    };
    applyLatest.current = apply;
    const readSnapshot = async () => {
      if (!active) return;
      if (snapshotPending) { readAgain = true; return; }
      snapshotPending = true;
      try {
        const view = await getBillingSnapshot();
        if (!readAgain) apply(view, true);
      } catch (_) { recovery(); }
      finally {
        snapshotPending = false;
        if (readAgain && active) { readAgain = false; readSnapshot(); }
      }
    };
    (async () => {
      try {
        const policy = await getBillingBootstrapPolicy();
        if (!active) return;
        if (policy.enabled === false) { clearTimeout(deadline); setSurface('launcher'); return; }
        if (policy.enabled !== true) throw new Error('billing_invalid_policy');
        subscription = subscribeToBillingUpdates(view => apply(view));
        await subscription.ready;
        if (!active) return;
        const view = attempt > 0 && initializedView.current !== null
          ? await refreshBilling({ reason: 'user' })
          : await initializeBilling({ captureJson });
        if (!active) return;
        // A late initialize result cannot replace an already established stream epoch.
        if (stream.current.epoch === null || stream.current.epoch === view.controllerEpoch) apply(view, true);
        else readSnapshot();
      } catch (_) { recovery(); }
    })();
    return () => { active = false; applyLatest.current = null; clearTimeout(deadline); subscription?.remove(); };
  }, [attempt, captureJson]);

  if (surface === 'launcher') return <BillingContext.Provider value={billingView ? {
    billingView, onBillingView: raw => applyLatest.current?.(raw, true),
    onRetryInitialization: () => setAttempt(value => value + 1),
  } : null}>{children}</BillingContext.Provider>;
  const escape = async action => {
    setEscapeFailed(false);
    try { await openBillingRecovery({ action }); } catch (_) { setEscapeFailed(true); }
  };
  const restore = async () => {
    if (restoreLock.current || !billingView?.capabilities.restore) return;
    restoreLock.current = true; setRestoring(true); setRestoreFailed(false);
    const apply = applyLatest.current;
    try {
      await restoreBillingPurchases(); // Acceptance only; native events/snapshot own rights.
      if (applyLatest.current !== apply) return;
      const latest = await getBillingSnapshot();
      if (applyLatest.current === apply) apply?.(latest, true);
    }
    catch (_) { if (applyLatest.current === apply) setRestoreFailed(true); }
    finally { if (applyLatest.current === apply) { restoreLock.current = false; setRestoring(false); } }
  };
  const manage = async () => {
    if (manageLock.current) return;
    manageLock.current = true; setManaging(true); setManageFailed(false);
    try { await openBillingManagement(); }
    catch (_) { setManageFailed(true); }
    finally { manageLock.current = false; setManaging(false); }
  };
  const support = async () => {
    if (supportLock.current) return;
    supportLock.current = true; setSupportFailed(false);
    try { setSupportText((await getBillingSupportSummary()).text); }
    catch (_) { setSupportFailed(true); }
    finally { supportLock.current = false; }
  };
  const recoverySurface = <main className="billing-bootstrap" data-state={surface} aria-label="Launcher access">
    <section className="billing-bootstrap__screen" aria-live="polite">
      <p className="billing-bootstrap__brand">Nokia Launcher <span>ACCESS</span></p>
      <h1>{surface === 'loading' ? 'Checking access…' : 'Access check'}</h1>
      <p>{surface === 'loading' ? 'Confirming access for this device.' : 'Access is not confirmed. Retry or restore a Play purchase.'}</p>
      {surface === 'recovery' && <button onClick={() => setAttempt(value => value + 1)}>Retry</button>}
      {surface === 'recovery' && billingView && (billingView.capabilities.restore || billingView.operation.state === 'restoring') && <button disabled={restoring || billingView.operation.state === 'restoring'} onClick={restore}>{restoring || billingView.operation.state === 'restoring' ? 'Restoring…' : 'Restore purchases'}</button>}
      {surface === 'recovery' && <button disabled={managing} onClick={manage}>{managing ? 'Opening Google Play…' : 'Manage subscription'}</button>}
      {surface === 'recovery' && <button onClick={support}>Support details</button>}
      {surface === 'recovery' && <button onClick={() => setFriendRecovery(true)}>Recover friend codes</button>}
      {supportText && <section aria-label="Billing support details"><p>Copy these details into your message to mr.ahhk142857@gmail.com. Nothing is sent automatically.</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{supportText}</pre></section>}
      {supportFailed && <p role="alert">Support details are unavailable. Contact mr.ahhk142857@gmail.com with your app version and the error shown here.</p>}
      {manageFailed && <p role="alert">Google Play subscriptions could not open. Check that Google Play or a browser is available, then retry.</p>}
      {restoreFailed && <p role="alert">Restore could not finish. Check your connection and Google Play account, then retry.</p>}
      {escapeFailed && <p role="alert">Android could not open that option. Use your device’s system navigation.</p>}
    </section>
    <nav className="billing-bootstrap__actions" aria-label="Android recovery">
      <button onClick={() => escape('home-settings')}>Choose Home app</button>
      <button onClick={() => escape('system-settings')}>Android settings</button>
      <button onClick={() => escape('dialer')}>Phone</button>
      <button onClick={() => escape('ime-settings')}>Keyboard settings</button>
    </nav>
  </main>;
  // The presentation-only Home shell is immediately available, including while
  // payment chunks load. Keep the independent plain fallback if the shell fails.
  const framedRecovery = <BillingUiBoundary fallback={recoverySurface}>
    <BillingRecoveryFrame>{recoverySurface}</BillingRecoveryFrame>
  </BillingUiBoundary>;
  if (surface === 'recovery' && friendRecovery) {
    return <BillingUiBoundary fallback={framedRecovery}><Suspense fallback={framedRecovery}>
      <BillingFriendRecovery onExit={() => setFriendRecovery(false)} />
    </Suspense></BillingUiBoundary>;
  }
  // A persisted first native decision precedes any onboarding preference writer.
  // Disabled/paid/legacy/IME paths never load the payment frame feature.
  if (surface === 'recovery' && billingView?.legacy.status === 'ineligible' && billingView.legacy.persisted) {
    return <BillingUiBoundary fallback={framedRecovery}><Suspense fallback={framedRecovery}><BillingEntry billingView={billingView}
      onboardingFinished={onboardingFinished} onCompleteOnboarding={finishOnboarding}
      onExistingFriendRecovery={() => setFriendRecovery(true)}
      onBillingView={raw => applyLatest.current?.(raw, true)}
      onRetryInitialization={() => setAttempt(value => value + 1)} /></Suspense></BillingUiBoundary>;
  }
  return framedRecovery;
}
