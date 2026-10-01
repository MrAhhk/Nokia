import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { getDumbModeState, getDumbModeApps, prepareDumbMode, activateDumbMode, cancelDumbModeSetup, unlockDumbMode, subscribeToDumbModeUpdates, openDumbModeAccessibilitySettings, openSystemSetting, pasteDumbModeCode } from '@/lib/launcherApps';
import { CASE_MODES, NOKIA_MULTI_TAP_CYCLES, resolveContextualIntent, resolveNextCaseMode, formatCharForCase } from '@/domain/keyGrammar';
import { createMultiTapComposer } from '@/domain/multiTapComposer';
import OnboardingGuide from '@/features/onboarding/OnboardingGuide';
import { sameDumbModeSnapshot } from './snapshot';
import FriendAuthenticatorScreens, { friendErrorMessage } from './FriendAuthenticatorScreens';
import { numericFriendCode } from './pairingFlow';
import * as friendApi from '@/lib/launcherApps';
import './dumbMode.css';

const groups = { games: 'Games', social: 'Social', video: 'Video', news: 'News', audio: 'Music & audio', photography: 'Photography', maps: 'Maps & navigation', productivity: 'Productivity', accessibility: 'Accessibility', unclassified: 'Others' };
const GUIDE_KEY = 'nokia-launcher.dumb-mode-guide.v2';
const GUIDE_STEPS = [
  { id: 'dumb-apps', title: 'Choose your quiet.', text: 'Games are always blocked. Choose other apps by category, or search for a name.', hint: 'Expand a category to select apps. Essentials remain available.' },
  { id: 'dumb-code', title: 'Let a friend hold the key.', text: 'Pair a friend who can hold rotating unlock codes, then choose who can unlock this session.', hint: 'Any selected friend can help. Without their code, there is no in-app reset.' },
  { id: 'dumb-block', title: 'Less temptation. More space.', text: 'Hidden apps return you Home when opened elsewhere. To turn Dumb Mode off, ask a selected friend for their current code.', hint: 'Requires default Home and Accessibility. Android may briefly show an app before blocking it.' },
];
const guideSeen = () => { try { return localStorage.getItem(GUIDE_KEY) === 'done'; } catch { return false; } };
const categoryOf = app => {
  const byNumber = { 0: 'games', 1: 'audio', 2: 'video', 3: 'photography', 4: 'social', 5: 'news', 6: 'maps', 7: 'productivity', 8: 'accessibility' };
  return byNumber[app.androidCategory] || (groups[app.categoryGroup] ? app.categoryGroup : 'unclassified');
};
const messageFor = error => {
  const message = String(error?.message || error || '');
  if (message.includes('clipboard_code')) return 'Copy your 12-character code, then tap Paste code.';
  if (message.includes('incorrect_code')) return 'Incorrect code. Check uppercase and lowercase letters and try again.';
  if (message.includes('dumb_mode_unavailable')) return 'Dumb Mode is available in the Android app. Open it on your Android phone to continue.';
  return 'Unable to update Dumb Mode. Check Android permissions and try again.';
};
const DumbModeFeature = forwardRef(({ onExit, onStateChange, dumbModeSnapshot }, ref) => {
  const hasParentSnapshot = Boolean(dumbModeSnapshot && Number.isFinite(dumbModeSnapshot.revision));
  const [snapshot, setSnapshot] = useState(() => dumbModeSnapshot || { state: 'LOADING', active: false, blockedIds: [], mandatoryIds: [] });
  const [apps, setApps] = useState([]), [selected, setSelected] = useState([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [step, setStep] = useState(() => guideSeen() ? 'overview' : 'guide'), [setup, setSetup] = useState(null);
  const [saved, setSaved] = useState(false), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [code, setCode] = useState(''), [preview, setPreview] = useState(''), [caseMode, setCaseMode] = useState(CASE_MODES.LOWER);
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState({ revision: 0, owners: [], holders: [], pending: [] });
  const [friendsLoaded, setFriendsLoaded] = useState(false), [selectedFriends, setSelectedFriends] = useState([]), [unlockFriend, setUnlockFriend] = useState('');
  const friendPanel = useRef(null), friendLatest = useRef(null);
  const applyFriends = value => { if (!alive.current || !value || !Number.isFinite(value.revision)) return; if (friendLatest.current?.revision > value.revision) return; friendLatest.current = value; setFriends(value); setFriendsLoaded(true); };
  const isFriendSession = snapshot.unlockMethod === 'friend_totp';
  const queryRef = useRef('');
  const [onlySelected, setOnlySelected] = useState(false);
  const focusedControl = useRef(null);
  const panel = useRef(null), alive = useRef(false), pending = useRef(null), working = useRef(false), generation = useRef(0);
  const current = useRef({}), onChange = useRef(onStateChange), composer = useRef(null), codeRef = useRef(''), latestSnapshot = useRef(dumbModeSnapshot || null);
  onChange.current = onStateChange;
  current.current = { step, caseMode, snapshot, isFriendSession };
  const replaceCode = value => { codeRef.current = value; setCode(value); };
  const applySnapshot = value => {
    if (!alive.current || !value || !Array.isArray(value.blockedIds) || !Number.isFinite(value.revision)) return;
    if (latestSnapshot.current && (latestSnapshot.current.revision > value.revision || sameDumbModeSnapshot(latestSnapshot.current, value))) return;
    latestSnapshot.current = value;
    setSnapshot(value);
    onChange.current?.(value);
  };
  const cancel = () => { const value = pending.current; pending.current = null; if (value) cancelDumbModeSetup({ setupId: value.setupId }).catch(() => {}); };
  const leave = () => { alive.current = false; generation.current += 1; cancel(); composer.current?.dispose(); onExit?.(); };
  useEffect(() => {
    alive.current = true;
    generation.current += 1;
    let unsubscribe, friendUnsubscribe, stopped = false, receivedEvent = false;
    Promise.resolve(friendApi.getFriendAuthenticatorState()).then(applyFriends).catch(failure => { if (alive.current) setError(friendErrorMessage(failure)); });
    Promise.resolve(friendApi.subscribeToFriendAuthenticatorUpdates(applyFriends)).then(cleanup => { if (alive.current) friendUnsubscribe = cleanup; else cleanup?.(); }).catch(failure => { if (alive.current) setError(friendErrorMessage(failure)); });
    const valid = () => alive.current && !stopped;
    const stateRequest = hasParentSnapshot ? Promise.resolve(dumbModeSnapshot) : getDumbModeState();
    Promise.all([stateRequest, getDumbModeApps()]).then(([state, result]) => {
      if (!valid()) return;
      if (!receivedEvent) applySnapshot(result.snapshot || state); setApps(result.apps || []);
      setSelected((result.apps || []).filter(app => app.selected || app.mandatory).map(app => app.id));
      setInventoryLoaded(true);
    }).catch(failure => { if (valid()) { setError(messageFor(failure)); setSnapshot({ state: 'ERROR', active: false, blockedIds: [], mandatoryIds: [] }); } });
    if (!hasParentSnapshot) {
      Promise.resolve(subscribeToDumbModeUpdates(value => { if (valid()) { receivedEvent = true; applySnapshot(value); } })).then(cleanup => { if (valid()) unsubscribe = cleanup; else cleanup?.(); }).catch(failure => { if (valid()) setError(messageFor(failure)); });
    }
    composer.current = createMultiTapComposer({
      cycles: { ...NOKIA_MULTI_TAP_CYCLES, '0': ['0'], '1': ['1'] }, delay: 650,
      onPreview: character => { if (alive.current) setPreview(formatCharForCase(character, current.current.caseMode, true)); },
      onCommit: character => {
        if (!alive.current) return;
        if (current.current.step === 'choose') { queryRef.current = (queryRef.current + character).slice(0, 40); setQuery(queryRef.current); return; }
        if (current.current.step !== 'unlock' || current.current.isFriendSession) return;
        replaceCode((codeRef.current + formatCharForCase(character, current.current.caseMode, true)).slice(0, 12));
        if (current.current.caseMode === CASE_MODES.TITLE) { current.current.caseMode = CASE_MODES.LOWER; setCaseMode(CASE_MODES.LOWER); }
      },
    });
    return () => { stopped = true; alive.current = false; generation.current += 1; unsubscribe?.(); friendUnsubscribe?.(); cancel(); composer.current?.dispose(); };
    // This subscription belongs to the mounted feature, not to individual renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (dumbModeSnapshot && alive.current) applySnapshot(dumbModeSnapshot);
  }, [dumbModeSnapshot]);
  useEffect(() => {
    panel.current?.querySelector('h2')?.focus({ preventScroll: true });
    const body = panel.current?.querySelector('.dumb-mode__body');
    if (body) body.scrollTop = 0;
  }, [step]);
  const run = async action => {
    if (working.current || !alive.current) return;
    working.current = true; setBusy(true); setError('');
    const epoch = generation.current;
    try { await action(() => alive.current && generation.current === epoch); }
    catch (failure) { if (alive.current && generation.current === epoch) setError(snapshot.unlockMethod === 'friend_totp' || /friend|pair|cooldown|storage|stale/.test(String(failure?.message)) ? friendErrorMessage(failure) : messageFor(failure)); }
    finally { working.current = false; if (alive.current && generation.current === epoch) setBusy(false); }
  };
  const finishGuide = () => { try { localStorage.setItem(GUIDE_KEY, 'done'); } catch {} setStep('overview'); };
  const nextGuide = () => { if (guideIndex < GUIDE_STEPS.length - 1) setGuideIndex(index => index + 1); else finishGuide(); };
  const back = () => {
    if (step === 'guide') { if (guideIndex > 0) setGuideIndex(index => index - 1); else finishGuide(); return; }
    if (step === 'overview') { leave(); return; }
    generation.current += 1; cancel(); composer.current?.reset(); replaceCode(''); setSetup(null); setSaved(false); setError(''); setBusy(false);
    setStep(step === 'review' ? 'friends' : step === 'friends' ? 'choose' : 'overview');
  };
  const prepare = () => run(async valid => {
    composer.current?.reset();
    const result = await prepareDumbMode({ selectedIds: selected, selectedFriendIds: selectedFriends, expectedRevision: snapshot.revision });
    if (!valid()) { await cancelDumbModeSetup({ setupId: result.setupId }); return; }
    pending.current = result; setSetup(result); setStep('review');
  });
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if ((step === 'friendOwners' || step === 'friendHolders') && friendPanel.current?.handleKey(key)) return true;
    const intent = resolveContextualIntent(key, 'dumb-mode');
    if (step === 'guide') {
      if (intent === 'HOME' || intent === 'END') leave();
      else if (intent === 'BACK' || intent === 'LEFT' || intent === 'UP') back();
      else if (intent === 'SELECT' || intent === 'RIGHT' || intent === 'DOWN') nextGuide();
      return true;
    }
    if (intent === 'BACK') back();
    else if (intent === 'HOME' || intent === 'END') leave();
    else if (intent === 'UP' || intent === 'DOWN' || intent === 'TAB') {
      composer.current?.commit();
      const controls = [...(panel.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), summary') || [])].filter(element => !element.closest('details:not([open])') || element.tagName === 'SUMMARY');
      const index = controls.indexOf(panel.current?.contains(document.activeElement) ? document.activeElement : focusedControl.current), delta = intent === 'UP' ? -1 : 1;
      const next = controls[(index + delta + controls.length) % controls.length]; next?.focus({ preventScroll: true });
      const body = panel.current?.querySelector('.dumb-mode__body');
      if (next && body?.contains(next)) {
        const bounds = body.getBoundingClientRect(), target = next.getBoundingClientRect();
        if (target.bottom > bounds.bottom) body.scrollTop += target.bottom - bounds.bottom;
        else if (target.top < bounds.top) body.scrollTop -= bounds.top - target.top;
      }
    } else if (intent === 'SELECT') { composer.current?.commit(); const target = panel.current?.contains(document.activeElement) ? document.activeElement : focusedControl.current; if (target && panel.current?.contains(target) && !target.disabled) target.click(); }
    else if (step === 'choose' && !busy) {
      if (intent === 'DELETE') { if (!composer.current?.cancelPending()) { queryRef.current = queryRef.current.slice(0, -1); setQuery(queryRef.current); } }
      else if (/^[0-9]$/.test(key)) composer.current?.press(key);
    }
    else if (step === 'unlock' && !busy) {
      if (isFriendSession) { if (/^[0-9]$/.test(key)) replaceCode((codeRef.current + key).slice(0, 8)); else if (intent === 'DELETE') replaceCode(codeRef.current.slice(0, -1)); return true; }
      if (intent === 'CAPS_LOCK') { composer.current?.commit(); const next = resolveNextCaseMode(current.current.caseMode); current.current.caseMode = next; setCaseMode(next); }
      else if (intent === 'DELETE') { if (!composer.current?.cancelPending()) replaceCode(codeRef.current.slice(0, -1)); }
      else if (/^[0-9]$/.test(key)) { if (codeRef.current.length < 12 || composer.current?.hasPending()) composer.current?.press(key); }
    }
    return true;
  } }));
  const mandatory = app => app.mandatory || snapshot.mandatoryIds?.includes(app.id);
  const choose = () => { setError(''); queryRef.current = ''; setQuery(''); setOnlySelected(false); setStep('choose'); };
  const toggleGroup = items => {
    const optional = items.filter(app => !mandatory(app));
    const allSelected = optional.every(app => selected.includes(app.id));
    setSelected(previous => allSelected ? previous.filter(id => !optional.some(app => app.id === id)) : [...new Set([...previous, ...optional.map(app => app.id)])]);
  };
  const searchText = (query + (step === 'choose' ? preview : '')).toLocaleLowerCase();
  const ready = inventoryLoaded && snapshot.enforcementAvailable && snapshot.state !== 'ERROR';
  const interrupted = snapshot.active && !snapshot.enforcementAvailable;
  const titles = { overview: 'Dumb Mode', choose: 'Choose apps', friends: 'Choose friends', review: 'Review Dumb Mode', unlockFriends: 'Choose a friend', unlock: 'Turn off Dumb Mode', permission: 'Accessibility', blocked: 'Blocked apps' };
  const activate = () => run(async valid => {
    const value = await activateDumbMode({ setupId: setup.setupId, expectedRevision: setup.snapshot?.revision ?? snapshot.revision });
    if (!valid()) return;
    pending.current = null; setSetup(null); applySnapshot(value); setStep('overview');
  });
  const unlock = () => {
    composer.current?.commit();
    run(async valid => {
      const value = await unlockDumbMode({ ...(isFriendSession ? { friendId: unlockFriend } : {}), code: codeRef.current, expectedRevision: snapshot.revision });
      if (!valid()) return;
      replaceCode(''); applySnapshot(value); setStep('overview');
    });
  };
  const refresh = () => run(async () => { await openDumbModeAccessibilitySettings(); });
  if (step === 'friendOwners' || step === 'friendHolders') return <FriendAuthenticatorScreens ref={friendPanel} role={step === 'friendOwners' ? 'owner' : 'holder'} state={friends} active={snapshot.active} onRefresh={applyFriends} onBack={() => setStep('overview')} />;
  if (step === 'guide') return <div ref={panel} className="dm-guide-host">
    <OnboardingGuide steps={GUIDE_STEPS} headingText="DUMB MODE" regionLabel="Dumb Mode guide"
      tour={{ index: guideIndex, step: GUIDE_STEPS[guideIndex] }}
      onFinish={finishGuide} onBack={back} onNext={nextGuide} />
  </div>;
  return <section className="dumb-mode lcd-screen" ref={panel} onFocusCapture={event => { focusedControl.current = event.target; }} aria-label="Dumb Mode">
    <header className="dm-header">
      <h2 tabIndex={-1}>{titles[step]}</h2>
      <span className="dm-status">{step === 'choose' ? '1 / 3' : step === 'friends' ? '2 / 3' : step === 'review' ? '3 / 3' : snapshot.active ? (interrupted ? 'PAUSED' : 'ON') : 'OFF'}</span>
    </header>
    <div className="dumb-mode__body">
      {error && <p className="dm-alert" role="alert">{error}</p>}
      {snapshot.state === 'LOADING' ? <p className="dm-loading" role="status">Loading…</p> : <>
        {step === 'overview' && <>
          <button className="dm-menu-row" disabled={busy || !friendsLoaded} onClick={() => setStep('friendOwners')}><span>Friends who can unlock me</span><span>{(friends.owners || []).filter(friend => friend.confirmed === true).length} <b aria-hidden="true">›</b></span></button>
          <button className="dm-menu-row" disabled={busy || !friendsLoaded} onClick={() => setStep('friendHolders')}><span>Codes I hold for friends</span><span>{(friends.holders || []).filter(friend => friend.confirmed === true).length} <b aria-hidden="true">›</b></span></button>
          <div className="dm-state-panel">
            <div className="dm-state-title"><span className="dm-lock" aria-hidden="true" /><div><h3>{snapshot.active ? 'Dumb Mode is on' : 'Your phone, simplified'}</h3><p>{snapshot.active ? (isFriendSession ? 'Ask a selected friend for their current code.' : 'Your saved code is needed to turn it off.') : 'Hide distractions. Keep useful apps.'}</p></div></div>
            <dl className="dm-facts">
              <div><dt>Games</dt><dd>Always blocked</dd></div>
              <div><dt>Other apps</dt><dd>{snapshot.active ? 'Locked for this session' : 'You choose'}</dd></div>
              <div><dt>Unlock</dt><dd>{snapshot.active && !isFriendSession ? '12-character code' : 'Friend authenticator'}</dd></div>
            </dl>
          </div>
          {snapshot.active && isFriendSession && <p className="dm-note">Selected friends: {(snapshot.selectedFriendIds || []).map(id => friends.owners?.find(friend => (friend.id || friend.pairingId) === id)?.label || 'Friend').join(', ')}</p>}
          {snapshot.active && <>
            <button className="dm-menu-row" onClick={() => setStep('blocked')}><span>View blocked apps</span><span>{snapshot.blockedIds?.length || 0} <b aria-hidden="true">›</b></span></button>
            {interrupted && <p className="dm-alert" role="status">Blocking is paused. Restore the settings below.</p>}
          </>}
          {!snapshot.active && <div className="dm-how"><span>CHOOSE APPS</span><i aria-hidden="true">›</i><span>CHOOSE FRIENDS</span><i aria-hidden="true">›</i><span>TURN ON</span></div>}
          {!inventoryLoaded && snapshot.state !== 'ERROR' && <p role="status" className="dm-note">Loading apps…</p>}
          {snapshot.defaultLauncherAvailable === false && <button className="dm-menu-row" disabled={busy} onClick={() => run(async () => { await openSystemSetting('default-launcher'); })}><span>Set default launcher</span><b aria-hidden="true">›</b></button>}
          {!(snapshot.accessibilityAvailable ?? snapshot.enforcementAvailable) && <button className="dm-menu-row" disabled={busy} onClick={() => setStep('permission')}><span>Enable Accessibility</span><b aria-hidden="true">›</b></button>}
          <button className="dm-text-action" onClick={() => { setGuideIndex(0); setStep('guide'); }}>How Dumb Mode works</button>
          {!snapshot.enforcementAvailable && <button className="dm-text-action" disabled={busy} onClick={refresh}>Check permission</button>}
        </>}
        {step === 'permission' && <div className="dm-permission">
          <h3>Allow app blocking</h3>
          <p>Dumb Mode uses app identities to return you Home when a blocked app opens.</p>
          <p>It does not read screen text. Android may briefly show the app before returning Home.</p>
          <label className="dm-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>I agree to this use of Accessibility</span></label>
        </div>}
        {step === 'choose' && <>
          <div className="dm-selection-summary"><span><strong>{selected.length}</strong> selected</span><button className="dm-filter" aria-pressed={onlySelected} onClick={() => setOnlySelected(value => !value)}>{onlySelected ? 'Show all' : 'Selected only'}</button></div>
          <div className="dm-search"><input aria-label="Find an app" type="text" inputMode="none" placeholder="Find an app…" value={query + preview} onChange={event => { composer.current?.reset(); queryRef.current = event.target.value.slice(0, 40); setQuery(queryRef.current); }} />{(query || preview) && <button aria-label="Clear search" onClick={() => { composer.current?.reset(); queryRef.current = ''; setQuery(''); }}>×</button>}</div>
          <div className="dm-groups">{Object.entries(groups).map(([group, title]) => {
            const categoryApps = apps.filter(app => categoryOf(app) === group);
            const items = categoryApps.filter(app => app.name.toLocaleLowerCase().includes(searchText) && (!onlySelected || mandatory(app) || selected.includes(app.id)));
            if (!items.length) return null;
            const count = items.filter(app => mandatory(app) || selected.includes(app.id)).length;
            return <details className="dm-group" key={group} open={searchText ? true : undefined}>
              <summary><span>{title}</span><span className="dm-group-count">{group === 'games' ? 'Always on' : `${count} / ${items.length}`}<b className="dm-chevron" aria-hidden="true">›</b></span></summary>
              {group !== 'games' && <button className="dm-group-toggle" disabled={busy} onClick={() => toggleGroup(categoryApps)}>{categoryApps.filter(app => !mandatory(app)).every(app => selected.includes(app.id)) ? 'Clear group' : 'Select group'}</button>}
              {group === 'unclassified' && <p className="dm-group-note">No category supplied. Choose which apps to block.</p>}
              {items.map(app => <label className="dm-app-row" key={app.id}>
                <input type="checkbox" checked={mandatory(app) || selected.includes(app.id)} disabled={mandatory(app) || busy} onChange={event => setSelected(previous => event.target.checked ? [...new Set([...previous, app.id])] : previous.filter(id => id !== app.id))} />
                <span>{app.name}</span>{mandatory(app) && <small>Required</small>}
              </label>)}
            </details>;
          })}</div>
          {!apps.some(app => app.name.toLocaleLowerCase().includes(searchText) && (!onlySelected || mandatory(app) || selected.includes(app.id))) && <p className="dm-note">No matching apps. Try another name.</p>}
        </>}
        {step === 'friends' && <>
          <p className="dm-note">Any one selected friend can give you an unlock code.</p>
          {(friends.owners || []).filter(friend => friend.confirmed === true).map(friend => { const id = friend.id || friend.pairingId; return <label className="dm-app-row" key={id}><input type="checkbox" checked={selectedFriends.includes(id)} disabled={busy} onChange={event => setSelectedFriends(previous => event.target.checked ? [...new Set([...previous, id])] : previous.filter(value => value !== id))} /><span>{friend.label || 'Friend'}</span></label>; })}
          {!(friends.owners || []).some(friend => friend.confirmed === true) && <><p className="dm-warning">Pair a friend before turning on Dumb Mode.</p><button className="dm-secondary" onClick={() => setStep('friendOwners')}>Add friend</button></>}
        </>}
        {step === 'review' && setup && <>
          <p className="dm-note">{selected.length} apps selected. Games are always blocked.</p>
          <p className="dm-note">Friends: {selectedFriends.map(id => friends.owners.find(friend => (friend.id || friend.pairingId) === id)?.label || 'Friend').join(', ')}</p>
          <p className="dm-warning">Any one of these friends can give you an unlock code. Apps and friends stay fixed while Dumb Mode is on.</p>
          <label className="dm-check"><input type="checkbox" checked={saved} disabled={busy} onChange={event => setSaved(event.target.checked)} /><span>If none of them can provide a code, there is no in-app reset.</span></label>
        </>}
        {step === 'unlockFriends' && <><p className="dm-note">Ask one of these friends for their current code.</p>{(snapshot.selectedFriendIds || []).map(id => <button className="dm-menu-row" key={id} onClick={() => { setUnlockFriend(id); replaceCode(''); setStep('unlock'); }}><span>{friends.owners?.find(friend => (friend.id || friend.pairingId) === id)?.label || 'Friend'}</span><span aria-hidden="true">›</span></button>)}</>}
        {step === 'blocked' && <><p className="dm-note">These apps stay blocked until you enter your code.</p><ul className="dm-blocked-list">{snapshot.blockedIds?.map(id => <li key={id}><span>{apps.find(app => app.id === id)?.name || id}</span><span aria-hidden="true">−</span></li>)}</ul></>}
        {step === 'unlock' && isFriendSession && <>
          <p className="dm-note">Enter the current eight-digit code from {friends.owners?.find(friend => (friend.id || friend.pairingId) === unlockFriend)?.label || 'your friend'}.</p>
          <label className="dm-code-label">Friend’s code<input aria-label="Friend’s code" type="text" inputMode="none" autoComplete="off" value={code} disabled={busy} onChange={event => { const value = numericFriendCode(event.target.value); if (/^\d{0,8}$/.test(value)) replaceCode(value); }} onPaste={event => { event.preventDefault(); const value = numericFriendCode(event.clipboardData.getData('text')); if (/^\d{8}$/.test(value)) replaceCode(value); else setError('Enter eight digits from your friend.'); }} /></label>
          <p className="dm-input-meta">{code.length} / 8</p>
          <button className="dm-secondary" disabled={busy} onClick={() => run(async valid => { const value = numericFriendCode(await pasteDumbModeCode()); if (!valid()) return; if (/^\d{8}$/.test(value)) replaceCode(value); else setError('Enter eight digits from your friend.'); })}>Paste code</button>
          {snapshot.cooldownUntil > Date.now() && <p className="dm-warning">Wait until the cooldown ends before trying again.</p>}
        </>}
        {step === 'unlock' && !isFriendSession && <>
          <div className="dm-code-intro"><h3>Enter your unlock code</h3><p>Ask the friend who saved it for you.</p></div>
          <p className="dm-note">Enter your 12-character code. Letter case matters.</p>
          <label className="dm-code-label">Recovery code<input type="text" inputMode="none" value={(code + preview).slice(0, 12)} maxLength={12} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busy}
            onChange={event => { composer.current?.reset(); const value = event.target.value; if (/^[A-Za-z0-9]{0,12}$/.test(value)) replaceCode(value); }}
            onPaste={event => { event.preventDefault(); composer.current?.reset(); const value = event.clipboardData.getData('text').trim(); if (/^[A-Za-z0-9]{0,12}$/.test(value)) replaceCode(value); else setError('Use the 12-character code exactly as saved.'); }} /></label>
          <div className="dm-input-meta"><span>{(code + preview).length} / 12</span><span># · {caseMode === CASE_MODES.LOWER ? 'abc' : caseMode === CASE_MODES.TITLE ? 'Abc' : 'ABC'}</span></div>
          <button className="dm-secondary" disabled={busy} onClick={() => run(async valid => { const value = (await pasteDumbModeCode()).trim(); if (!valid()) return; composer.current?.reset(); if (/^[A-Za-z0-9]{0,12}$/.test(value)) replaceCode(value); else setError('Use the 12-character code exactly as saved.'); })}>Paste code</button>
        </>}
      </>}
    </div>
    <footer className="dm-footer">
      {busy && <p role="status" className="dm-progress">Please wait…</p>}
      <div className="dm-actions">
        <button className="dm-back" onClick={back}>Back</button>
        {step === 'overview' && (snapshot.active ? <button className="dm-primary" disabled={busy} onClick={() => { replaceCode(''); setStep(isFriendSession ? 'unlockFriends' : 'unlock'); }}>Turn off Dumb Mode</button> : <button className="dm-primary" disabled={busy || !ready} onClick={choose}>Choose apps</button>)}
        {step === 'choose' && <button className="dm-primary" disabled={busy || !friendsLoaded} onClick={() => { setSelectedFriends((friends.owners || []).filter(friend => friend.confirmed === true).map(friend => friend.id || friend.pairingId)); setSaved(false); setStep('friends'); }}>Continue</button>}
        {step === 'friends' && <button className="dm-primary" disabled={busy || !selectedFriends.length} onClick={prepare}>Continue</button>}
        {step === 'review' && setup && <button className="dm-primary" disabled={!saved || busy} onClick={activate}>Activate Dumb Mode</button>}
        {step === 'unlock' && <button className="dm-primary" disabled={busy || (isFriendSession ? code.length !== 8 : (code + preview).length !== 12)} onClick={unlock}>Unlock</button>}
        {step === 'permission' && <button className="dm-primary" disabled={!consent || busy} onClick={() => run(async valid => { await openDumbModeAccessibilitySettings(); const value = await getDumbModeState(); if (valid()) applySnapshot(value); })}>Open Accessibility settings</button>}
      </div>
    </footer>
  </section>;
});
export default DumbModeFeature;
