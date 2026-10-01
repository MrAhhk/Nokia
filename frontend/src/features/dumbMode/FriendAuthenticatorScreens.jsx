import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState } from 'react';
import * as api from '@/lib/launcherApps';
import { NOKIA_MULTI_TAP_CYCLES, resolveContextualIntent } from '@/domain/keyGrammar';
import { createMultiTapComposer } from '@/domain/multiTapComposer';
import { initialPairingFlow, pairingFlowReducer, numericFriendCode } from './pairingFlow';

export const friendErrorMessage = error => {
  const text = String(error?.message || error || '');
  if (/cooldown/.test(text)) return 'Too many attempts. Wait 60 seconds before trying again.';
  if (/incorrect|expired_code|replay/.test(text)) return 'Incorrect or expired code. Ask your friend for the newest code. Codes already used for pairing or unlocking cannot be reused. Check automatic date and time on both phones.';
  if (/stale/.test(text)) return 'The session changed. Go Back and try again.';
  if (/storage|keystore|corrupt/.test(text)) return 'Protected storage is unavailable. Your lock stays on. Restart the app and try again.';
  if (/camera|permission/.test(text)) return 'Camera unavailable. Paste the pairing text instead.';
  if (/fingerprint|transcript|malformed|payload|self_pair|duplicate/.test(text)) return 'This pairing message cannot be accepted. Check that it came from the correct friend and pairing.';
  if (/limit/.test(text)) return 'Your friend list is full. Remove an unused pairing first.';
  return 'Unable to update the authenticator. Check the pairing message and try again.';
};
const idOf = record => record.id || record.pairingId || record.pendingId;
const labelOf = record => record.label || record.localLabel || 'Friend';
const formatCode = code => String(code || '').replace(/^(\d{4})(\d{4})$/, '$1 $2');

const FriendAuthenticatorScreens = forwardRef(({ role, state, active, onRefresh, onBack }, ref) => {
  const [flow, dispatch] = useReducer(pairingFlowReducer, { ...initialPairingFlow, role });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [held, setHeld] = useState(null), [now, setNow] = useState(Date.now());
  const panel = useRef(null), latest = useRef(flow), alive = useRef(true), working = useRef(false), epoch = useRef(0), composer = useRef(null), focused = useRef(null), scan = useRef(null);
  latest.current = flow;
  const patch = value => { latest.current = { ...latest.current, ...value }; dispatch({ type: 'PATCH', value }); };
  const stopScan = () => { const scanId = scan.current; scan.current = null; if (scanId) api.stopFriendPairingScan({ scanId }).catch(() => {}); };
  const run = async action => {
    if (working.current || !alive.current) return;
    working.current = true; setBusy(true); setError(''); const turn = epoch.current;
    const valid = () => alive.current && epoch.current === turn;
    try { await action(valid); } catch (failure) { if (valid()) setError(friendErrorMessage(failure)); }
    finally { working.current = false; if (valid()) setBusy(false); }
  };
  useEffect(() => {
    alive.current = true;
    composer.current = createMultiTapComposer({ cycles: NOKIA_MULTI_TAP_CYCLES, delay: 650,
      onPreview: character => { if (alive.current) { const input = panel.current?.querySelector('[data-pair-label]'); if (input) input.value = (latest.current.label + character).slice(0, 40); } },
      onCommit: character => { if (alive.current && latest.current.stage === 'name') patch({ label: (latest.current.label + character).slice(0, 40) }); },
    });
    const background = () => { if (!document.hidden) return; patch({ code: '' }); if (scan.current) { epoch.current += 1; stopScan(); setBusy(false); patch({ stage: latest.current.scanReturnStage || 'receive' }); } };
    document.addEventListener('visibilitychange', background);
    return () => { alive.current = false; epoch.current += 1; composer.current?.dispose(); stopScan(); document.removeEventListener('visibilitychange', background); };
  }, []);
  useEffect(() => { panel.current?.querySelector('h2')?.focus(); const body = panel.current?.querySelector('.dumb-mode__body'); if (body) body.scrollTop = 0; }, [flow.stage]);
  // Codes exist in component memory only while this one detail screen is visible.
  useEffect(() => {
    const pairingId = flow.stage === 'detail' && flow.detail && idOf(flow.detail);
    if (!pairingId) { setHeld(null); return; }
    let cancelled = false, boundary, ticker, fetching = false;
    const clear = () => { clearTimeout(boundary); clearInterval(ticker); };
    const refresh = async () => {
      if (cancelled || document.hidden || fetching) return;
      fetching = true;
      try {
        const result = await api.getHeldFriendCode({ pairingId });
        if (cancelled || document.hidden) return;
        const expiry = Number(result.expiresAt);
        if (!/^\d{8}$/.test(String(result.code)) || !Number.isFinite(expiry) || expiry <= Date.now()) throw new Error('code_unavailable');
        setHeld(result); setNow(Date.now());
        boundary = setTimeout(refresh, Math.max(100, expiry - Date.now() + 40));
      } catch (failure) { if (!cancelled) { setHeld(null); setError(friendErrorMessage(failure)); } }
      finally { fetching = false; }
    };
    const visible = () => { clear(); setHeld(null); if (!document.hidden) { refresh(); ticker = setInterval(() => setNow(Date.now()), 1000); } };
    document.addEventListener('visibilitychange', visible); visible();
    return () => { cancelled = true; clear(); document.removeEventListener('visibilitychange', visible); };
  }, [flow.stage, flow.detail]);
  const back = () => { epoch.current += 1; stopScan(); composer.current?.reset(); setHeld(null); setError(''); setBusy(false); if (flow.stage === 'list') onBack(); else if (flow.stage === 'detail' && flow.detail?.confirmed === false) patch({ stage: 'response' }); else dispatch({ type: 'RESET' }); };
  useImperativeHandle(ref, () => ({ handleKey(key) {
    const intent = resolveContextualIntent(key, 'dumb-mode');
    if (intent === 'BACK') { back(); return true; }
    if (intent === 'HOME' || intent === 'END') { stopScan(); return false; }
    if (busy) return true;
    if (intent === 'UP' || intent === 'DOWN' || intent === 'TAB') {
      composer.current?.commit();
      const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)')];
      const index = controls.indexOf(panel.current.contains(document.activeElement) ? document.activeElement : focused.current);
      const next = controls[(index + (intent === 'UP' ? -1 : 1) + controls.length) % controls.length]; next?.focus({ preventScroll: true });
      const body = panel.current.querySelector('.dumb-mode__body');
      if (next && body.contains(next)) { const b = body.getBoundingClientRect(), t = next.getBoundingClientRect(); if (t.bottom > b.bottom) body.scrollTop += t.bottom - b.bottom; else if (t.top < b.top) body.scrollTop -= b.top - t.top; }
      return true;
    }
    if (intent === 'SELECT') { composer.current?.commit(); const target = panel.current.contains(document.activeElement) ? document.activeElement : focused.current; if (!target?.disabled) target?.click(); return true; }
    if (flow.stage === 'name') {
      if (/^[0-9]$/.test(key)) composer.current?.press(key);
      else if (intent === 'DELETE' && !composer.current?.cancelPending()) patch({ label: latest.current.label.slice(0, -1) });
    } else if (flow.stage === 'verify') {
      if (/^[0-9]$/.test(key)) patch({ code: (latest.current.code + key).slice(0, 8) });
      else if (intent === 'DELETE') patch({ code: latest.current.code.slice(0, -1) });
    }
    return true;
  } }));
  const refreshState = async valid => { const value = await api.getFriendAuthenticatorState(); if (valid()) onRefresh(value); };
  const publicText = (label = 'Pairing text') => <label className="dm-code-label">{label}<textarea aria-label={label} value={flow.payload} maxLength={2048} disabled={busy} onChange={event => patch({ payload: event.target.value })} /></label>;
  const paste = () => run(async valid => { const value = await api.pasteFriendPairingText(); if (valid()) patch({ payload: String(value).slice(0, 2048) }); });
  const scanner = () => run(async valid => {
    const scanId = `friend-${Date.now()}-${Math.random().toString(36).slice(2)}`; scan.current = scanId;
    const returnStage = flow.stage; patch({ stage: 'scan', scanReturnStage: returnStage });
    await new Promise(resolve => setTimeout(resolve, 0));
    if (!valid()) return;
    const bounds = panel.current?.querySelector('.dm-scan-window')?.getBoundingClientRect() || panel.current.getBoundingClientRect();
    const result = await api.startFriendPairingScan({ scanId, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } });
    stopScan(); if (valid()) patch({ stage: returnStage, payload: result.payload });
  });
  const outbound = <>
    <p className="dm-note">Only public pairing information is shared. Send it directly to your friend.</p>
    <button className="dm-secondary" disabled={busy} onClick={() => run(async valid => { const result = await api.getFriendPairingQr({ payload: flow.outbound }); if (valid()) patch({ qr: result.dataUrl || result.dataURL }); })}>Show QR</button>
    {flow.qr && <img className="dm-pair-qr" src={flow.qr} alt="Friend pairing QR" />}
    <button className="dm-secondary" disabled={busy} onClick={() => run(async () => { await api.shareFriendPairingText({ payload: flow.outbound }); })}>Share pairing text</button>
    <details><summary>View pairing text</summary><textarea readOnly aria-label="Public pairing message" value={flow.outbound} /></details>
  </>;
  const ownerRecords = (state.owners || []).filter(record => record.confirmed === true), holders = (state.holders || []).filter(record => record.confirmed === true);
  const records = flow.role === 'owner' ? ownerRecords : holders;
  const pendingRecords = (state.pending || []).filter(record => record.role === flow.role);
  const lockedOwner = flow.role === 'owner' && active;
  const remove = record => patch({ stage: 'remove', detail: record });
  const resume = record => {
    patch({ pendingId: idOf(record), label: labelOf(record), fingerprint: record.fingerprint || '', outbound: flow.role === 'owner' ? record.invitation : record.response, stage: flow.role === 'owner' ? 'invite' : 'response', acknowledged: false, detail: record });
  };
  return <section className="dumb-mode lcd-screen" ref={panel} onFocusCapture={event => { focused.current = event.target; }} aria-label="Friend authenticator">
    <header className="dm-header"><h2 tabIndex={-1}>{flow.stage === 'list' ? flow.role === 'owner' ? 'Friends who can unlock me' : 'Codes I hold' : flow.stage === 'detail' ? labelOf(flow.detail) : 'Pair with a friend'}</h2><span className="dm-status">OFFLINE</span></header>
    <div className="dumb-mode__body">
      {error && <p className="dm-alert" role="alert">{error}</p>}
      {flow.stage === 'list' && <>
        <p className="dm-note">{flow.role === 'owner' ? 'Any selected friend can provide a code to turn off Dumb Mode.' : 'You can show these codes even while your own Dumb Mode is on.'}</p>
        {lockedOwner && <p className="dm-warning">Friends are fixed while Dumb Mode is on.</p>}
        {records.map(record => <div key={idOf(record)}><button className={`dm-menu-row ${flow.role === 'owner' ? 'dm-paired-row' : ''}`} disabled={flow.role === 'owner'} onClick={() => dispatch({ type: 'DETAIL', value: record })}><span>{labelOf(record)}</span><span>{flow.role === 'holder' ? 'Show code ›' : 'Paired'}</span></button>{flow.role === 'owner' && record.receipt && <button className="dm-text-action" disabled={busy} onClick={() => patch({ stage: 'sent', outbound: record.receipt, pendingId: idOf(record) })}>Return confirmation receipt</button>}<button className="dm-text-action" disabled={busy || lockedOwner} onClick={() => remove(record)}>Remove {labelOf(record)}</button></div>)}
        {!records.length && <p className="dm-note">No friends paired yet.</p>}
        {pendingRecords.map(record => <button className="dm-menu-row" key={idOf(record)} disabled={lockedOwner} onClick={() => resume(record)}><span>{labelOf(record)}</span><span>Finish pairing ›</span></button>)}
      </>}
      {flow.stage === 'name' && <><p className="dm-note">Use a name you recognise. It stays on this phone.</p><label className="dm-code-label">Friend’s name<input data-pair-label aria-label="Friend’s name" inputMode="none" maxLength={40} value={flow.label} disabled={busy} onChange={event => { composer.current?.reset(); patch({ label: event.target.value.slice(0, 40) }); }} /></label></>}
      {flow.stage === 'invite' && <>{outbound}<p className="dm-warning">Ask your friend to open Codes I hold → Add person, then return their response.</p><button className="dm-secondary" disabled={busy} onClick={() => patch({ stage: 'receive', payload: '' })}>Enter friend’s response</button></>}
      {flow.stage === 'receive' && <>{publicText(flow.role === 'owner' ? 'Friend’s response' : 'Friend’s invitation')}<button className="dm-secondary" disabled={busy} onClick={paste}>Paste pairing text</button><button className="dm-secondary" disabled={busy} onClick={scanner}>Scan QR</button></>}
      {flow.stage === 'scan' && <><div className="dm-scan-window" aria-label="Camera scanner" /><p className="dm-note">Point the camera at your friend’s QR. Back stops the camera.</p><button className="dm-secondary" onClick={() => { epoch.current += 1; stopScan(); setBusy(false); patch({ stage: flow.scanReturnStage || 'receive' }); }}>Use pairing text</button></>}
      {flow.stage === 'verify' && <><p className="dm-note">Compare this fingerprint with your friend in person or in your established conversation.</p><output className="dumb-mode__code" aria-label="Pairing fingerprint">{flow.fingerprint}</output><label className="dm-check"><input type="checkbox" checked={flow.acknowledged} disabled={busy} onChange={event => patch({ acknowledged: event.target.checked })} /><span>The fingerprint matches on both phones</span></label><label className="dm-code-label">Friend’s current code<input aria-label="Friend’s current code" inputMode="none" autoComplete="off" value={flow.code} disabled={busy} onChange={event => { const code = numericFriendCode(event.target.value); if (/^\d{0,8}$/.test(code)) patch({ code }); }} onPaste={event => { event.preventDefault(); const code = numericFriendCode(event.clipboardData.getData('text')); if (/^\d{8}$/.test(code)) patch({ code }); else setError('Enter eight digits from your friend.'); }} /></label></>}
      {flow.stage === 'response' && <>{outbound}<p className="dm-note">Compare this fingerprint with your friend before sharing the confirmation code.</p><output className="dumb-mode__code" aria-label="Pairing fingerprint">{flow.fingerprint}</output><label className="dm-check"><input type="checkbox" checked={flow.acknowledged} onChange={event => patch({ acknowledged: event.target.checked })} /><span>The fingerprint matches on both phones</span></label><button className="dm-secondary" disabled={!flow.acknowledged || busy} onClick={() => dispatch({ type: 'DETAIL', value: { id: flow.pendingId, label: flow.label, confirmed: false } })}>Show confirmation code</button><button className="dm-secondary" disabled={busy} onClick={() => patch({ stage: 'receipt', payload: '' })}>Enter confirmation receipt</button></>}
      {flow.stage === 'receipt' && <><p className="dm-note">Compare this fingerprint with your friend before finishing.</p><output className="dumb-mode__code" aria-label="Pairing fingerprint">{flow.fingerprint}</output><label className="dm-check"><input type="checkbox" checked={flow.acknowledged} disabled={busy} onChange={event => patch({ acknowledged: event.target.checked })} /><span>The fingerprint matches on both phones</span></label>{publicText('Confirmation receipt')}<button className="dm-secondary" disabled={busy} onClick={paste}>Paste pairing text</button><button className="dm-secondary" disabled={busy} onClick={scanner}>Scan QR</button></>}
      {flow.stage === 'sent' && <>{outbound}<p className="dm-warning">Return this receipt to your friend so they can finish pairing. Opening Share does not confirm delivery.</p><button className="dm-secondary" onClick={() => patch({ stage: 'mutual' })}>Receipt delivered</button></>}
      {flow.stage === 'mutual' && <><p className="dm-note">Pairing complete. Holding each other’s codes requires a second, independent pairing.</p><button className="dm-secondary" disabled={active && flow.role === 'holder'} onClick={() => { dispatch({ type: 'OPEN', role: flow.role === 'owner' ? 'holder' : 'owner' }); patch({ stage: 'name' }); }}>Pair the other direction</button></>}
      {flow.stage === 'detail' && <><p className="dm-note">{flow.detail.confirmed === false ? 'Pairing is pending. Share this code only after comparing fingerprints.' : 'Tell this code directly to your friend when you agree to help them unlock.'}</p>{held ? <><output className="dumb-mode__code" aria-label="Friend unlock code">{formatCode(held.code)}</output><p role="timer" className="dm-note">Changes in {Math.max(0, Math.ceil((Number(held.expiresAt) - now) / 1000))} seconds</p></> : <p role="status">Code hidden or loading…</p>}{flow.detail.confirmed === false && <button className="dm-secondary" onClick={() => { setHeld(null); patch({ stage: 'response' }); }}>Return to pairing</button>}</>}
      {flow.stage === 'remove' && <><p className="dm-warning">{flow.role === 'holder' ? 'Deleting this code cannot notify your friend. If they selected you and have no other code holder, they will have no in-app exit.' : 'This friend will no longer be available for future sessions.'}</p><p className="dm-note">Remove {labelOf(flow.detail)}?</p></>}
    </div>
    <footer className="dm-footer">{busy && <p role="status" className="dm-progress">Please wait…</p>}<div className="dm-actions"><button className="dm-back" onClick={back}>Back</button>
      {flow.stage === 'list' && <button className="dm-primary" disabled={busy || lockedOwner} onClick={() => patch({ stage: 'name', label: '' })}>{flow.role === 'owner' ? 'Add friend' : 'Add person'}</button>}
      {flow.stage === 'name' && <button className="dm-primary" disabled={busy || !flow.label.trim()} onClick={() => { composer.current?.commit(); if (flow.role === 'holder') { patch({ stage: 'receive' }); return; } run(async valid => { const result = await api.beginFriendPairing({ label: latest.current.label.trim(), expectedRevision: state.revision }); if (!valid()) return; patch({ stage: 'invite', pendingId: result.pendingId, outbound: result.invitation }); await refreshState(valid); }); }}>Continue</button>}
      {flow.stage === 'receive' && <button className="dm-primary" disabled={busy || !flow.payload.trim()} onClick={() => run(async valid => { if (flow.role === 'owner') { const result = await api.inspectFriendPairing({ pendingId: flow.pendingId, response: flow.payload }); if (valid()) patch({ stage: 'verify', fingerprint: result.fingerprint, acknowledged: false, code: '' }); } else { const result = await api.acceptFriendPairing({ invitation: flow.payload, label: flow.label, expectedRevision: state.revision }); if (!valid()) return; patch({ stage: 'response', pendingId: result.pendingId, fingerprint: result.fingerprint, outbound: result.response }); await refreshState(valid); } })}>Continue</button>}
      {flow.stage === 'verify' && <button className="dm-primary" disabled={busy || !flow.acknowledged || flow.code.length !== 8} onClick={() => run(async valid => { const result = await api.completeFriendPairing({ pendingId: flow.pendingId, response: flow.payload, fingerprintAcknowledged: true, code: flow.code, expectedRevision: state.revision }); if (!valid()) return; patch({ stage: 'sent', outbound: result.receipt || result.state?.owners?.find(record => idOf(record) === flow.pendingId)?.receipt, code: '' }); await refreshState(valid); })}>Confirm pairing</button>}
      {flow.stage === 'receipt' && <button className="dm-primary" disabled={busy || !flow.payload.trim() || !flow.acknowledged} onClick={() => run(async valid => { await api.acknowledgeFriendPairing({ pendingId: flow.pendingId, receipt: flow.payload, expectedRevision: state.revision }); if (!valid()) return; patch({ stage: 'mutual' }); await refreshState(valid); })}>Finish pairing</button>}
      {flow.stage === 'remove' && <button className="dm-primary" disabled={busy} onClick={() => run(async valid => { await api.removeFriendPairing({ pairingId: idOf(flow.detail), expectedRevision: state.revision }); if (!valid()) return; dispatch({ type: 'RESET' }); await refreshState(valid); })}>Remove pairing</button>}
      {flow.stage === 'mutual' && <button className="dm-primary" onClick={onBack}>Done</button>}
    </div>{flow.pendingId && ['invite', 'receive', 'verify', 'response', 'receipt'].includes(flow.stage) && <button className="dm-text-action" disabled={busy} onClick={() => run(async valid => { await api.cancelFriendPairing({ pendingId: flow.pendingId, expectedRevision: state.revision }); if (!valid()) return; dispatch({ type: 'RESET' }); await refreshState(valid); })}>Cancel pairing</button>}</footer>
  </section>;
});
export default FriendAuthenticatorScreens;
