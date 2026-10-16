import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getBillingSnapshot, purchaseBillingPlan, restoreBillingPurchases, reconcileBillingPurchase, refreshBillingCatalog, refreshBilling, openBillingManagement, getBillingSupportSummary, openBillingRecovery } from '@/lib/launcherApps';
import { KEY_INTENTS } from '@/domain/keyGrammar';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';
import { loadSoundSettings } from '@/features/sound/soundStorage';
import { validateBillingView } from './billingContract';
import './billing.css';

const PLANS = ['monthly', 'yearly', 'lifetime'];
const LABELS = { monthly: 'Monthly', yearly: 'Yearly', lifetime: 'Lifetime' };
const ACTIVE = ['checking', 'checkout', 'restoring'];
const SUPPORT_EMAIL = 'mr.ahhk142857@gmail.com';
// These bridge responses explicitly reject the intent before native acceptance.
// An unrecognized transport failure might have lost an accepted operation ID.
const REJECTED = ['billing_operation_rejected', 'billing_not_ready', 'billing_checkout_disabled', 'billing_storage_recovery', 'billing_invalid_purchase', 'invalid_billing_input'];
const price = entry => entry?.available && entry.priceText ? entry.priceText : 'Price unavailable';
const date = ms => ms === null ? null : new Date(ms).toLocaleDateString();

// LCD-only feature. The outer native bootstrap owns ordered snapshots and the
// launcher mount gate; acknowledgements here never become access decisions.
const BillingPaywall = forwardRef(function BillingPaywall({ billingView, onBillingView, onRetryInitialization, onExistingFriendRecovery, onExit, initialPage, keypadFeedback = true }, ref) {
  const checked = validateBillingView(billingView);
  const view = checked.ok ? checked.value : null;
  const gift = view?.access.sources.includes('legacyDevice');
  const lifetime = view?.access.sources.includes('storeLifetime');
  const [page, setPage] = useState(() => initialPage === 'management' || gift || lifetime ? 'management' : 'plans');
  const [selection, setSelection] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [supportText, setSupportText] = useState(null);
  const [escapeBusy, setEscapeBusy] = useState([]);
  const section = useRef(null), heading = useRef(null), focusTarget = useRef(null);
  const alive = useRef(true), commandLock = useRef(false), lastSelect = useRef(-Infinity);
  const keyActivating = useRef(false);
  const escapeLocks = useRef(new Set());
  const observedRestore = useRef(null);
  const observedCheck = useRef(null);
  const observedCheckout = useRef(null);
  const latest = useRef(null); latest.current = view;
  const entry = view?.catalog.find(item => item.key === selection?.plan);
  const awaiting = Boolean(pending || view?.unresolvedPurchase || ACTIVE.includes(view?.operation.state));
  const canRestore = Boolean(view?.capabilities.restore && !busy && !ACTIVE.includes(view?.operation.state) && pending?.kind !== 'restore');
  const effectivePage = awaiting && !['support', 'recovery', 'management'].includes(page) ? 'status' : page;
  const purchasable = Boolean(view?.capabilities.checkout && entry?.available && entry.priceText && selection?.revision === entry.catalogRevision && !awaiting && !busy && !gift && !lifetime);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (pending?.kind !== 'purchase' || !pending.id || !view) return;
    if (view.operation.state === 'checkout' && view.operation.id === pending.id) {
      observedCheckout.current = { id: pending.id, epoch: view.controllerEpoch, sequence: view.sequence };
      return;
    }
    const observed = observedCheckout.current;
    if (observed?.id === pending.id && observed.epoch === view.controllerEpoch &&
        view.sequence > observed.sequence && view.operation.state === 'idle' &&
        view.issue === 'product_unavailable' && !view.unresolvedPurchase && view.legacy.persisted) {
      observedCheckout.current = null;
      setPending(null); setPage('plans');
    }
  }, [view, pending]);
  useEffect(() => {
    const observed = observedCheck.current;
    if (view && observed && observed.epoch === view.controllerEpoch && view.sequence > observed.sequence &&
        view.operation.state === 'idle' && view.legacy.persisted && view.issue !== 'storage') {
      observedCheck.current = null;
      setMessage('Purchase checked. See the confirmed access status above.');
    }
  }, [view]);
  useEffect(() => {
    if (pending?.kind !== 'restore' || !pending.id || !view) return;
    if (view.operation.state === 'restoring' && view.operation.id === pending.id) {
      observedRestore.current = { id: pending.id, epoch: view.controllerEpoch, sequence: view.sequence };
      return;
    }
    const observed = observedRestore.current;
    // Release a local wait only after observing this accepted Restore running
    // and then a newer native IDLE. An unrelated idle/event absence is no proof.
    if (observed?.id === pending.id && observed.epoch === view.controllerEpoch &&
        view.sequence > observed.sequence && view.operation.state === 'idle' &&
        view.legacy.persisted && view.issue !== 'storage') {
      observedRestore.current = null;
      setPending(null); setMessage('Restore checked. See the confirmed access status above.');
    }
  }, [view, pending]);
  useEffect(() => {
    focusTarget.current?.removeAttribute('data-billing-focused');
    focusTarget.current = null;
    heading.current?.focus({ preventScroll: true });
    const body = section.current?.querySelector('.billing-lcd__body'); if (body) body.scrollTop = 0;
  }, [effectivePage]);
  useEffect(() => {
    if (selection && ((entry && entry.catalogRevision !== selection.revision) || (!entry && selection.revision !== null))) {
      setSelection(null); setAccepted(false); setPage('plans'); setMessage('Prices changed. Select a plan again to review the current price.');
    }
  }, [entry, selection]);
  useEffect(() => {
    if (gift || lifetime) { setSelection(null); setAccepted(false); setPage('management'); }
  }, [gift, lifetime]);

  const go = destination => { setPage(destination); setError(''); };
  const back = () => {
    if (page !== 'plans' && page !== 'management') { setSelection(null); setAccepted(false); go(gift || lifetime ? 'management' : 'plans'); }
    else if (onExit) onExit(); else go('recovery');
  };
  const publish = raw => { if (alive.current && validateBillingView(raw).ok) onBillingView?.(raw); };
  const run = async (action, failure) => {
    if (commandLock.current) return;
    commandLock.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (_) { if (alive.current) setError(failure); }
    finally { if (alive.current) { commandLock.current = false; setBusy(false); } }
  };
  // Each native escape has its own admission lock. A hung billing request or
  // another escape must never hold Home, Phone, settings or Play management.
  const runEscape = async (key, action, failure) => {
    if (escapeLocks.current.has(key)) return;
    escapeLocks.current.add(key); setEscapeBusy([...escapeLocks.current]); setError('');
    try { await action(); }
    catch (_) { if (alive.current) setError(failure); }
    finally {
      escapeLocks.current.delete(key);
      if (alive.current) setEscapeBusy([...escapeLocks.current]);
    }
  };
  const read = async (settleKind = null) => {
    const result = validateBillingView(await getBillingSnapshot());
    if (!result.ok) throw new Error('billing_invalid_view');
    if (!alive.current) return;
    publish(result.value);
    // Native finishes Restore/cancel with IDLE; it does not retain a terminal
    // operation ID. Only this explicit authoritative post-command read releases
    // the local UI admission wait. It never resolves the native journal or rights.
    const snapshot = result.value;
    const current = latest.current;
    const currentRead = !current || (snapshot.controllerEpoch === current.controllerEpoch && snapshot.sequence >= current.sequence);
    if (currentRead && settleKind === 'restore' && snapshot.operation.state === 'restoring' && snapshot.operation.id) {
      observedRestore.current = { id: snapshot.operation.id, epoch: snapshot.controllerEpoch, sequence: snapshot.sequence };
    }
    if (currentRead && settleKind === 'purchase' && snapshot.operation.state === 'checking' && snapshot.operation.id) {
      observedCheck.current = { epoch: snapshot.controllerEpoch, sequence: snapshot.sequence };
    }
    const settledJournal = settleKind === 'restore' || (!snapshot.unresolvedPurchase && !['pending', 'uncertain'].includes(snapshot.issue));
    if (settleKind && currentRead && snapshot.operation.state === 'idle' && snapshot.legacy.persisted && snapshot.issue !== 'storage') {
      setMessage(settleKind === 'restore' ? 'Restore checked. See the confirmed access status above.' : 'Purchase checked. See the confirmed access status above.');
    }
    if (settleKind && currentRead && !ACTIVE.includes(snapshot.operation.state) && settledJournal && snapshot.legacy.persisted && snapshot.issue !== 'storage') {
      setPending(null); setPage('status');
      setMessage(settleKind === 'restore' ? 'Restore checked. See the confirmed access status above.' : 'Purchase checked. See the confirmed access status above.');
    }
  };
  const refreshPrices = () => run(async () => { publish(await refreshBillingCatalog()); }, 'Prices could not be loaded. Check your connection, then retry.');
  const choose = plan => {
    const current = latest.current?.catalog.find(item => item.key === plan);
    setSelection({ plan, revision: current?.catalogRevision || null }); setAccepted(false); setMessage(''); go('details');
  };
  const buy = () => {
    const current = latest.current;
    const offer = current?.catalog.find(item => item.key === selection?.plan);
    if (commandLock.current || !current?.capabilities.checkout || current.unresolvedPurchase || ACTIVE.includes(current.operation.state) || !offer?.available || !offer.priceText || offer.catalogRevision !== selection?.revision || pending || gift || lifetime || (selection.plan === 'lifetime' && !accepted)) return;
    run(async () => {
      setPending({ id: null, kind: 'purchase', plan: selection.plan, epoch: current.controllerEpoch, sequence: current.sequence }); setPage('status');
      let acknowledgement;
      try { acknowledgement = await purchaseBillingPlan({ plan: selection.plan, catalogRevision: selection.revision, acceptedImmediateCharge: selection.plan === 'lifetime' && accepted }); }
      catch (failure) {
        if (alive.current && REJECTED.includes(failure?.message)) { setPending(null); setPage('details'); }
        throw failure;
      }
      if (!alive.current) return;
      setPending({ id: acknowledgement.operationId, kind: 'purchase' }); setPage('status'); setMessage('');
      try { await read('purchase'); } catch (_) { if (alive.current) setError('The purchase was requested. Check its status before trying another payment.'); }
    }, 'Purchase could not be started. Check the purchase status before trying again.');
  };
  const restore = () => {
    if (!latest.current?.capabilities.restore || !canRestore) return;
    run(async () => {
      observedRestore.current = null;
      const current = latest.current;
      setPending({ id: null, kind: 'restore', epoch: current.controllerEpoch, sequence: current.sequence }); setPage('status');
      let acknowledgement;
      try { acknowledgement = await restoreBillingPurchases(); }
      catch (failure) {
        if (alive.current && REJECTED.includes(failure?.message)) { setPending(null); setPage('plans'); }
        throw failure;
      }
      if (!alive.current) return;
      setPending({ id: acknowledgement.operationId, kind: 'restore' }); setPage('status'); setMessage('');
      try { await read('restore'); } catch (_) { if (alive.current) setError('Restore was requested. Check its status before trying again.'); }
    }, 'Restore could not start. Check your connection and the Google Play account that bought the app.');
  };
  const checkPurchase = () => run(async () => {
    await reconcileBillingPurchase(); if (!alive.current) return;
    setMessage('A check was requested. Google Play’s confirmed result will appear here.'); await read(pending?.kind || 'purchase');
  }, 'The purchase could not be checked. Try again or contact support; avoid another payment.');
  const manage = () => {
    go('management');
    runEscape('manage', async () => {
      await openBillingManagement(); if (alive.current) setMessage('After returning from Google Play, choose Check after returning.');
    }, 'Google Play subscriptions could not open. Check that Google Play or a browser is available, then retry.');
  };
  const checkManagement = () => run(async () => { publish(await refreshBilling({ reason: 'manage-return' })); }, 'Subscription status could not be checked. Retry or contact support.');
  const support = () => { go('support'); runEscape('support', async () => { const summary = await getBillingSupportSummary(); if (alive.current) setSupportText(summary.text); }, 'Support details are unavailable. Include your app version and the issue in your message.'); };
  const recover = action => runEscape(action, () => openBillingRecovery({ action }), 'Android could not open that option. Use your device’s system navigation.');
  const playFeedback = key => {
    if (!keypadFeedback) return;
    const settings = loadSoundSettings();
    playKeypadTone(key, settings.keypadTone, settings.volume, settings.vibrate);
  };

  useImperativeHandle(ref, () => ({ handleKey(key) {
    playFeedback(key);
    if ([KEY_INTENTS.BACK, KEY_INTENTS.SOFT_RIGHT, KEY_INTENTS.HOME, KEY_INTENTS.END].includes(key)) { back(); return true; }
    const controls = [...(section.current?.querySelectorAll('button:not(:disabled), input:not(:disabled)') || [])];
    if ([KEY_INTENTS.UP, KEY_INTENTS.DOWN, KEY_INTENTS.LEFT, KEY_INTENTS.RIGHT].includes(key)) {
      const focused = controls.includes(document.activeElement) ? document.activeElement : focusTarget.current;
      const index = controls.indexOf(focused), delta = [KEY_INTENTS.UP, KEY_INTENTS.LEFT].includes(key) ? -1 : 1;
      const next = controls[index < 0 ? 0 : (index + delta + controls.length) % controls.length];
      next?.focus(); next?.scrollIntoView?.({ block: 'nearest' }); return true;
    }
    if ([KEY_INTENTS.SELECT, KEY_INTENTS.GREEN, KEY_INTENTS.SEND, KEY_INTENTS.SOFT_LEFT].includes(key)) {
      // The shared keypad emits logical presses rather than browser repeat flags.
      // A fast repeated centre press may select, but must never also charge.
      const now = Date.now(); if (now - lastSelect.current < 450) return true; lastSelect.current = now;
      const target = controls.includes(document.activeElement) ? document.activeElement : controls.includes(focusTarget.current) ? focusTarget.current : controls.find(node => node.dataset.primary) || controls[0];
      keyActivating.current = true;
      try { target?.click(); } finally { keyActivating.current = false; }
      return true;
    }
    return true;
  }}));

  const recoveryLinks = <><button disabled={escapeBusy.includes('support')} onClick={support}>Support</button><button onClick={() => go('recovery')}>Android recovery</button></>;
  const restoreButton = <button disabled={!canRestore} onClick={restore}>Restore purchases</button>;
  const canReviewPlans = Boolean(view && !view.access.full && !awaiting && !busy);
  const statusTitle = view?.unresolvedPurchase?.stage === 'pending' ? 'Purchase pending' : view?.unresolvedPurchase ? 'Purchase needs checking' : awaiting ? 'Waiting for Google Play' : message.startsWith('Restore checked') ? 'Restore checked' : 'Purchase status';
  const idleUnconfirmedCopy = message.startsWith('Restore checked')
    ? 'Restore finished. This purchase is still unconfirmed. Check purchase or contact Support before paying again.'
    : message.startsWith('Purchase checked')
      ? 'Check finished. This purchase is still unconfirmed. Contact Support before paying again.'
      : 'The purchase result is not confirmed. Check this purchase or restore previous purchases before paying again.';
  return <section ref={section} className="lcd-screen billing-lcd" data-page={effectivePage} role="region" aria-label="Launcher payment" aria-busy={busy && ['plans', 'details', 'status'].includes(effectivePage)}
    onClickCapture={event => { const control = event.target.closest('button, input'); if (control && !control.disabled && !keyActivating.current) playFeedback('SELECT'); }}
    onFocusCapture={event => { if (event.target.matches('button, input')) {
      focusTarget.current?.removeAttribute('data-billing-focused');
      focusTarget.current = event.target;
      event.target.setAttribute('data-billing-focused', 'true');
    } }}>
    <header className="billing-lcd__header"><span>NOKIA LAUNCHER</span><span>{effectivePage === 'plans' ? 'PLANS' : 'ACCESS'}</span></header>
    <div className="billing-lcd__body">
      <h2 ref={heading} tabIndex={-1}>{effectivePage === 'plans' ? 'Choose your plan.' : effectivePage === 'details' ? `${LABELS[selection?.plan]} plan` : effectivePage === 'status' ? statusTitle : effectivePage === 'support' ? 'Support' : effectivePage === 'recovery' ? 'Android recovery' : 'Your access'}</h2>
      {view?.issue === 'product_unavailable' && <p role="alert" className="billing-lcd__notice">Google Play could not offer this plan. Check your Play account and availability.</p>}
      {effectivePage === 'plans' && <>
        <p className="billing-lcd__intro">Every plan includes all features.</p>
        <div className="billing-lcd__plans">{PLANS.map(plan => {
          const row = view?.catalog.find(item => item.key === plan);
          return <button key={plan} onClick={() => choose(plan)}><strong>{LABELS[plan]}</strong><span>{row?.available && row.priceText ? row.priceText : 'Price unavailable'}</span><small>{plan === 'lifetime' ? 'No renewal' : 'Auto-renewing'}</small><small>{plan === 'lifetime' ? 'Pay once' : plan === 'monthly' ? 'Per month' : 'Per year'}</small></button>;
        })}</div>
        <p className="billing-lcd__small">Subscriptions renew automatically. Cancel in Google Play.</p>
        <div className="billing-lcd__utilities" aria-label="Purchase help"><button disabled={busy} onClick={refreshPrices}>Retry prices</button>{restoreButton}<button disabled={escapeBusy.includes('manage')} onClick={manage}>Manage subscription</button>{recoveryLinks}</div>
      </>}
      {effectivePage === 'details' && <>
        <p className="billing-lcd__price">{price(entry)}</p>
        {entry?.available && entry.periodText && <p className="billing-lcd__small billing-lcd__period">{entry.periodText}</p>}
        <p>Includes all launcher features.</p>
        <p>{selection?.plan === 'lifetime' ? 'Pay once. Lifetime access through the Google Play account used for this purchase.' : 'This subscription automatically renews until you cancel it in Google Play.'}</p>
        {selection?.plan === 'lifetime' && <>
          <p>A Lifetime purchase does not cancel a subscription. Turn off renewal in Google Play, then check after returning before you buy.</p>
          <button disabled={escapeBusy.includes('manage')} onClick={manage}>Manage subscription</button><button disabled={busy} onClick={checkManagement}>Check after returning</button>
          <label className="billing-lcd__ack"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />I understand I will be charged {price(entry)} immediately for this one-time purchase.</label>
        </>}
        {!purchasable && <p className="billing-lcd__small">Checkout is unavailable until Google Play confirms the current price and purchase eligibility.</p>}
        <button disabled={busy} onClick={refreshPrices}>Retry prices</button>{restoreButton}{recoveryLinks}
      </>}
      {effectivePage === 'status' && <>
        <p role="status">{awaiting ? view?.unresolvedPurchase?.stage === 'pending' ? 'Complete any pending payment in Google Play. Wait for confirmation before another purchase.' : view?.unresolvedPurchase && !ACTIVE.includes(view?.operation.state) && !busy ? idleUnconfirmedCopy : 'Checking your purchase with Google Play. Your launcher will open once it is confirmed.' : view?.access.full ? 'Your access is confirmed.' : 'No access confirmed yet. Restore a previous purchase or review plans.'}</p>
        <div className="billing-lcd__status-actions">
          {canReviewPlans && <button data-primary onClick={() => go('plans')}>Review plans</button>}
          <button data-primary={canReviewPlans ? undefined : true} disabled={busy} onClick={checkPurchase}>Check purchase</button>{restoreButton}<button disabled={escapeBusy.includes('manage')} onClick={manage}>Manage subscription</button>{recoveryLinks}
        </div>
        {(view?.unresolvedPurchase || pending) && <p className="billing-lcd__small">Use the account used to buy: Google Play → Payments &amp; subscriptions → Budget &amp; history. If the result stays unclear, choose Support. Clearing app data can remove a local tester gift.</p>}
      </>}
      {effectivePage === 'management' && <>
        {gift && <p>Gift on this device. Clearing app data or changing devices can remove this local gift.</p>}
        {lifetime && <p>Lifetime purchase. Restore with the same Google Play account if you reinstall or change devices.</p>}
        {view?.store.subscriptionActive && <p>{LABELS[view.store.plan] || 'Subscription'}{view.store.renewState === 'off' && date(view.store.expiresAtMs) ? ` — Use until ${date(view.store.expiresAtMs)}.` : view.store.renewState === 'on' ? ' still renews in Google Play.' : ' — Renewal status is being confirmed.'}</p>}
        {view?.store.subscriptionActive && view.store.renewState === 'on' && date(view.store.expiresAtMs) && <p>Current period ends {date(view.store.expiresAtMs)}. Check Google Play for the next charge.</p>}
        {view?.store.renewState === 'on' && (gift || lifetime) && <p>Lifetime or a local gift does not cancel subscription renewal. Manage it in Google Play.</p>}
        {(view?.store.billingProblem || ['unknown_subscription', 'verification'].includes(view?.issue)) && <p>Payment status needs checking. Check Google Play or contact support before paying again.</p>}
        {!view && <p>Access could not be confirmed. Google Play management and Android recovery remain available.</p>}
        <button data-primary disabled={escapeBusy.includes('manage')} onClick={manage}>Manage subscription</button><button disabled={busy} onClick={checkManagement}>Check after returning</button>{restoreButton}
        {!gift && !lifetime && <button onClick={() => go('plans')}>Review plans</button>}
        <button onClick={() => go('gift')}>Tester gift instructions</button>{recoveryLinks}
        <p className="billing-lcd__small">If Google Play cannot open here, use this address on another device with the same Play account:</p>
        <input aria-label="Google Play subscriptions address" readOnly value="https://play.google.com/store/account/subscriptions" onFocus={event => event.target.select()} />
      </>}
      {effectivePage === 'gift' && <><p>Redeem your private Lifetime gift code in Google Play with the account you want to keep. Then return and choose Restore purchases.</p><p>A local device gift cannot be restored after app data is lost. A redeemed Play Lifetime purchase can be restored.</p>{restoreButton}{recoveryLinks}</>}
      {effectivePage === 'support' && <><p>Contact {SUPPORT_EMAIL}. Nothing is sent automatically.</p><p>Copy these details into your message. Do not include payment details, friend codes or purchase tokens.</p>{supportText && <pre>{supportText}</pre>}<button disabled={escapeBusy.includes('support')} onClick={support}>Retry support details</button></>}
      {effectivePage === 'recovery' && <><p>Choose an Android tool or return to payment. These actions remain available while access is being checked.</p>{[['home-settings', 'Choose Home app'], ['system-settings', 'Android settings'], ['dialer', 'Phone'], ['ime-settings', 'Keyboard settings']].map(([action, label]) => <button key={action} disabled={escapeBusy.includes(action)} onClick={() => recover(action)}>{label}</button>)}{onExistingFriendRecovery && <button onClick={onExistingFriendRecovery}>Recover friend codes</button>}{onRetryInitialization && <button disabled={busy} onClick={onRetryInitialization}>Retry access check</button>}<button disabled={escapeBusy.includes('manage')} onClick={manage}>Manage subscription</button>{restoreButton}<button disabled={escapeBusy.includes('support')} onClick={support}>Support</button></>}
      {message && <p role="status" className="billing-lcd__small">{message}</p>}{error && <p role="alert">{error}</p>}
      {view?.issue === 'offline' && <p role="status">Offline. Restore or price checks need a connection; your plans remain here.</p>}
    </div>
    <footer className="billing-lcd__footer"><button onClick={back}>Back</button>{effectivePage === 'details' && <button data-primary disabled={!purchasable || (selection?.plan === 'lifetime' && !accepted)} onClick={buy}>Buy {price(entry)}</button>}</footer>
  </section>;
});
export default BillingPaywall;
