import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import DumbModeFeature from './DumbModeFeature';
import * as api from '@/lib/launcherApps';
jest.mock('@/lib/launcherApps', () => ({ getDumbModeState: jest.fn(), getDumbModeApps: jest.fn(), prepareDumbMode: jest.fn(), shareDumbModeCode: jest.fn(), activateDumbMode: jest.fn(), cancelDumbModeSetup: jest.fn(), unlockDumbMode: jest.fn(), subscribeToDumbModeUpdates: jest.fn(), openDumbModeAccessibilitySettings: jest.fn(), openSystemSetting: jest.fn(), pasteDumbModeCode: jest.fn(), getFriendAuthenticatorState: jest.fn(), subscribeToFriendAuthenticatorUpdates: jest.fn(), getHeldFriendCode: jest.fn(), beginFriendPairing: jest.fn(), acceptFriendPairing: jest.fn(), inspectFriendPairing: jest.fn(), completeFriendPairing: jest.fn(), acknowledgeFriendPairing: jest.fn(), cancelFriendPairing: jest.fn(), removeFriendPairing: jest.fn(), getFriendPairingQr: jest.fn(), startFriendPairingScan: jest.fn(), stopFriendPairingScan: jest.fn(), pasteFriendPairingText: jest.fn(), shareFriendPairingText: jest.fn() }));
jest.mock('@/features/sound/nokiaAudioEngine', () => ({ playKeypadTone: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
test('restricted recovery preserves exact selected-friend unlock and never scans or creates a lock', async () => {
  localStorage.removeItem('nokia-launcher.dumb-mode-guide.v2');
  await render({ ...active, unlockMethod: 'friend_totp', selectedFriendIds: ['alice'] }, { recoveryOnly: true });
  expect(api.getDumbModeApps).not.toHaveBeenCalled();
  expect(localStorage.getItem('nokia-launcher.dumb-mode-guide.v2')).toBeNull();
  await click('Turn off Dumb Mode'); await click('Alice');
  act(() => '00123456'.split('').forEach(key => ref.current.handleKey(key)));
  expect(api.unlockDumbMode).not.toHaveBeenCalled();
  api.unlockDumbMode.mockResolvedValue({ ...off, revision: 3 }); await click('Unlock');
  expect(api.unlockDumbMode).toHaveBeenCalledWith({ friendId: 'alice', code: '00123456', expectedRevision: 2 });
  expect(button('Choose apps')).toBeUndefined();
  expect(api.prepareDumbMode).not.toHaveBeenCalled(); expect(api.activateDumbMode).not.toHaveBeenCalled();
});

test('restricted recovery keeps the established legacy code unlock', async () => {
  await render(active, { recoveryOnly: true }); await click('Turn off Dumb Mode');
  api.pasteDumbModeCode.mockResolvedValue('AbCd1234efGH'); await click('Paste code');
  api.unlockDumbMode.mockResolvedValue({ ...off, revision: 3 }); await click('Unlock');
  expect(api.unlockDumbMode).toHaveBeenCalledWith({ code: 'AbCd1234efGH', expectedRevision: 2 });
  expect(api.getDumbModeApps).not.toHaveBeenCalled();
});
let root, container, ref, unsubscribe;
const off = { state: 'OFF', active: false, revision: 1, blockedIds: [], mandatoryIds: ['snake'], enforcementAvailable: true };
const active = { ...off, state: 'ACTIVE', active: true, revision: 2, blockedIds: ['snake'] };
const button = text => [...container.querySelectorAll('button')].find(item => { const copy = item.cloneNode(true); copy.querySelectorAll('[aria-hidden=true]').forEach(node => node.remove()); return copy.textContent.trim() === text; });
const click = async text => act(async () => button(text).click());
const render = async (state, props = {}) => { api.getDumbModeState.mockResolvedValue(state); api.getDumbModeApps.mockResolvedValue({ snapshot: state, apps: [{ id: 'snake', name: 'Snake', categoryGroup: 'games', mandatory: true, selected: true }, { id: 'music', name: 'Music', categoryGroup: 'audio', selected: false }] }); await act(async () => root.render(<DumbModeFeature ref={ref} {...props} />)); };
beforeEach(() => {
  localStorage.setItem('nokia-launcher.dumb-mode-guide.v2', 'done');
  jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); ref = createRef(); unsubscribe = jest.fn();
  api.getFriendAuthenticatorState.mockResolvedValue({ revision: 1, owners: [{ id: 'alice', label: 'Alice', confirmed: true }, { id: 'bob', label: 'Bob', confirmed: true }], holders: [], pending: [] }); api.subscribeToFriendAuthenticatorUpdates.mockReturnValue(jest.fn()); api.subscribeToDumbModeUpdates.mockReturnValue(unsubscribe); api.cancelDumbModeSetup.mockResolvedValue(off); api.prepareDumbMode.mockResolvedValue({ setupId: 'setup', code: 'AbCd1234efGH', snapshot: off }); api.shareDumbModeCode.mockResolvedValue({}); api.activateDumbMode.mockResolvedValue(active);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });
test('new sessions select confirmed friends and require explicit no-reset acknowledgement', async () => {
  await render(off); await click('Choose apps');
  const checks = container.querySelectorAll('input[type=checkbox]'); expect(checks[0].disabled).toBe(true); expect(checks[0].checked).toBe(true); expect(checks[1].checked).toBe(false);
  await click('Continue');
  expect([...container.querySelectorAll('input')].every(input => input.checked)).toBe(true);
  act(() => container.querySelectorAll('input')[1].click());
  await click('Continue'); expect(button('Activate Dumb Mode').disabled).toBe(true);
  expect(api.prepareDumbMode).toHaveBeenCalledWith({ selectedIds: ['snake'], selectedFriendIds: ['alice'], expectedRevision: 1 });
  expect(api.shareDumbModeCode).not.toHaveBeenCalled(); expect(container.textContent).not.toContain('AbCd1234efGH');
  act(() => container.querySelector('input').click()); await click('Activate Dumb Mode');
  expect(api.activateDumbMode).toHaveBeenCalledWith({ setupId: 'setup', expectedRevision: 1 }); expect(container.textContent).toContain('Dumb Mode is on');
});

test('wrong code permits immediate repeated attempts with exact paste casing', async () => {
  await render(active); await click('Turn off Dumb Mode');
  const input = container.querySelector('input'); const paste = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '  AbCd1234efGH  ' } });
  act(() => input.dispatchEvent(paste)); api.unlockDumbMode.mockRejectedValue(new Error('incorrect_code'));
  await click('Unlock'); expect(container.textContent).toContain('Incorrect code'); expect(button('Unlock').disabled).toBe(false); await click('Unlock');
  expect(api.unlockDumbMode).toHaveBeenCalledTimes(2); expect(api.unlockDumbMode).toHaveBeenLastCalledWith({ code: 'AbCd1234efGH', expectedRevision: 2 });
});
test('late prepare after Back is cancelled without displaying the code', async () => {
  let resolve; api.prepareDumbMode.mockReturnValue(new Promise(done => { resolve = done; }));
  await render(off); await click('Choose apps'); await click('Continue'); await click('Continue'); await click('Back');
  await act(async () => resolve({ setupId: 'late', code: 'AbCd1234efGH', snapshot: off }));
  expect(api.cancelDumbModeSetup).toHaveBeenCalledWith({ setupId: 'late' }); expect(container.textContent).not.toContain('AbCd1234efGH');
});
test('unmount releases subscription and pending setup', async () => {
  await render(off); await click('Choose apps'); await click('Continue'); await click('Continue'); act(() => root.unmount()); root = createRoot(container);
  expect(unsubscribe).toHaveBeenCalledTimes(1); expect(api.cancelDumbModeSetup).toHaveBeenCalledWith({ setupId: 'setup' });
});
test('shared keypad composition supports case switching and shows input', async () => {
  jest.useFakeTimers(); await render(active); await click('Turn off Dumb Mode');
  act(() => ref.current.handleKey('HASH')); act(() => ref.current.handleKey('2')); act(() => jest.advanceTimersByTime(650));
  expect(container.querySelector('input').value).toBe('A'); expect(container.querySelector('input').type).toBe('text');
  act(() => ref.current.handleKey('3')); act(() => jest.advanceTimersByTime(650)); expect(container.querySelector('input').value).toBe('Ad');
  act(() => expect(ref.current.handleKey('SOFT_LEFT')).toBe(true)); expect(container.querySelector('input').value).toBe('A');
});

test('default Home requirement is actionable independently of Accessibility', async () => {
  await render({ ...off, enforcementAvailable: false, accessibilityAvailable: true, defaultLauncherAvailable: false });
  expect(button('Choose apps').disabled).toBe(true);
  await click('Set default launcher');
  expect(api.openSystemSetting).toHaveBeenCalledWith('default-launcher');
  expect(button('Open Accessibility settings')).toBeUndefined();
});
test('Select stays within feature when the external keypad takes focus', async () => {
  await render(off);
  const external = document.createElement('button'); document.body.appendChild(external);
  const externalClick = jest.fn(); external.onclick = externalClick;
  button('Choose apps').focus(); external.focus();
  await act(async () => ref.current.handleKey('SELECT'));
  expect(externalClick).not.toHaveBeenCalled();
  expect(button('Continue')).toBeDefined(); external.remove();
});

test('a fast state event cannot enable selection before the app inventory arrives', async () => {
  let resolveApps;
  api.getDumbModeState.mockResolvedValue(off);
  api.getDumbModeApps.mockReturnValue(new Promise(resolve => { resolveApps = resolve; }));
  await act(async () => root.render(<DumbModeFeature ref={ref} />));
  await act(async () => api.subscribeToDumbModeUpdates.mock.calls[0][0](off));
  expect(button('Choose apps').disabled).toBe(true);
  await act(async () => resolveApps({ snapshot: off, apps: [{ id: 'snake', name: 'Snake', mandatory: true }] }));
  expect(button('Choose apps').disabled).toBe(false);
  await click('Choose apps'); expect(container.querySelector('input[type=checkbox]').checked).toBe(true);
});
test('reuses the Launcher snapshot without a second native state subscription', async () => {
  api.getDumbModeApps.mockResolvedValue({ snapshot: off, apps: [{ id: 'snake', name: 'Snake', mandatory: true, selected: true }] });
  await act(async () => root.render(<DumbModeFeature ref={ref} dumbModeSnapshot={off} />));
  await act(async () => {});
  expect(api.getDumbModeState).not.toHaveBeenCalled();
  expect(api.subscribeToDumbModeUpdates).not.toHaveBeenCalled();
  expect(button('Choose apps').disabled).toBe(false);
});

test('keypad expands categories before entering their hidden optional app rows', async () => {
  await render(off); await click('Choose apps');
  const categories = container.querySelectorAll('summary');
  act(() => categories[0].focus());
  expect(document.activeElement).toBe(categories[0]);
  act(() => ref.current.handleKey('DOWN'));
  expect(document.activeElement).toBe(categories[1]);
  act(() => ref.current.handleKey('SELECT'));
  expect(categories[1].parentElement.open).toBe(true);
  act(() => ref.current.handleKey('DOWN'));
  expect(document.activeElement).toBe(button('Select group'));
  act(() => ref.current.handleKey('DOWN'));
  expect(document.activeElement).toBe(container.querySelectorAll('input[type=checkbox]')[1]);
  act(() => ref.current.handleKey('SELECT'));
  expect(container.querySelectorAll('input[type=checkbox]')[1].checked).toBe(true);
});
test('permission disclosure is separate and still requires explicit consent', async () => {
  await render({ ...off, enforcementAvailable: false, accessibilityAvailable: false });
  await click('Enable Accessibility');
  expect(button('Open Accessibility settings').disabled).toBe(true);
  act(() => container.querySelector('input').click());
  await click('Open Accessibility settings');
  expect(api.openDumbModeAccessibilitySettings).toHaveBeenCalledTimes(1);
});

test('group actions and selected filter preserve mandatory games', async () => {
  await render(off); await click('Choose apps');
  await click('Select group');
  expect(container.querySelectorAll('input[type=checkbox]')[1].checked).toBe(true);
  await click('Clear group');
  await click('Selected only');
  expect(container.textContent).toContain('Snake');
  expect(container.textContent).not.toContain('Music');
  expect(container.querySelector('input[type=checkbox]').disabled).toBe(true);
});
test('keypad search filters apps without changing selection', async () => {
  jest.useFakeTimers(); await render(off); await click('Choose apps');
  act(() => ref.current.handleKey('6')); act(() => jest.advanceTimersByTime(650));
  expect(container.querySelector('[aria-label="Find an app"]').value).toBe('m');
  expect(container.textContent).toContain('Music'); expect(container.textContent).not.toContain('Snake');
  act(() => ref.current.handleKey('SOFT_LEFT'));
  expect(container.textContent).toContain('Snake');
});

test('Paste code uses the native facade and displays exact case', async () => {
  api.pasteDumbModeCode.mockResolvedValue('AbCd1234efGH');
  await render(active); await click('Turn off Dumb Mode'); await click('Paste code');
  expect(api.pasteDumbModeCode).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.dm-code-label input').value).toBe('AbCd1234efGH');
  expect(container.querySelector('.dm-code-label input').type).toBe('text');
});
test('Check permission opens Android accessibility settings', async () => {
  await render({ ...off, enforcementAvailable: false }); await click('Check permission');
  expect(api.openDumbModeAccessibilitySettings).toHaveBeenCalledTimes(1);
});

test('first visit uses the shared three-step guide; completion and replay work', async () => {
  localStorage.removeItem('nokia-launcher.dumb-mode-guide.v2');
  await render(off);
  expect(container.querySelector('[aria-label="Dumb Mode guide"]')).not.toBeNull();
  expect(container.textContent).toContain('Choose your quiet.');
  await click('Next →'); await click('Next →'); await click('Finish');
  expect(localStorage.getItem('nokia-launcher.dumb-mode-guide.v2')).toBe('done');
  expect(button('Choose apps')).toBeDefined();
  await click('How Dumb Mode works'); expect(container.textContent).toContain('Choose your quiet.');
});
test('category metadata exposes detailed Android categories with only one fallback', async () => {
  api.getDumbModeState.mockResolvedValue(off);
  api.getDumbModeApps.mockResolvedValue({snapshot:off, apps:[
    {id:'photo',name:'Camera tools',androidCategory:3,categoryGroup:'other'},
    {id:'map',name:'Navigation',androidCategory:6,categoryGroup:'other'},
    {id:'work',name:'Documents',androidCategory:7,categoryGroup:'other'},
    {id:'unknown',name:'Custom app',androidCategory:-1,categoryGroup:'other'},
  ]});
  await act(async()=>root.render(<DumbModeFeature ref={ref}/>));await click('Choose apps');
  const titles=[...container.querySelectorAll('summary > span:first-child')].map(el=>el.textContent);
  expect(titles).toEqual(['Photography','Maps & navigation','Productivity','Others']);
});
test('directional focus does not scroll the LCD ancestor', async () => {
  await render(off); await click('Choose apps');
  const control = button('Selected only'); const focus = jest.spyOn(control, 'focus');
  act(() => ref.current.handleKey('DOWN'));
  expect(focus).toHaveBeenCalledWith({preventScroll:true});
});


test('friend session keypad is immediate, preserves zeroes, and only explicit Unlock submits', async () => {
  await render({ ...active, unlockMethod: 'friend_totp', selectedFriendIds: ['alice', 'bob'] });
  await click('Turn off Dumb Mode');
  await click('Alice');
  act(() => '00123456'.split('').forEach(key => ref.current.handleKey(key)));
  expect(container.querySelector('input').value).toBe('00123456');
  expect(api.unlockDumbMode).not.toHaveBeenCalled();
  api.unlockDumbMode.mockResolvedValue({ ...off, revision: 3 }); await click('Unlock');
  expect(api.unlockDumbMode).toHaveBeenCalledWith({ friendId: 'alice', code: '00123456', expectedRevision: 2 });
});

test('new activation has no static fallback when no friends are paired', async () => {
  api.getFriendAuthenticatorState.mockResolvedValue({ revision: 1, owners: [], holders: [], pending: [] });
  await render(off); await click('Choose apps'); await click('Continue');
  expect(button('Continue').disabled).toBe(true); expect(container.textContent).toContain('Pair a friend');
  expect(api.prepareDumbMode).not.toHaveBeenCalled();
});

test('friend code paste removes spaces and Back never unlocks', async () => {
  api.pasteDumbModeCode.mockResolvedValue(' 0012 3456 ');
  await render({ ...active, unlockMethod: 'friend_totp', selectedFriendIds: ['bob'] }); await click('Turn off Dumb Mode'); await click('Bob'); await click('Paste code');
  expect(container.querySelector('input').value).toBe('00123456'); await click('Back'); expect(api.unlockDumbMode).not.toHaveBeenCalled();
});
