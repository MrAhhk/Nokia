import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import FriendAuthenticatorScreens from './FriendAuthenticatorScreens';
import * as api from '@/lib/launcherApps';
jest.mock('@/lib/launcherApps', () => Object.fromEntries(['getFriendAuthenticatorState', 'getHeldFriendCode', 'beginFriendPairing', 'acceptFriendPairing', 'inspectFriendPairing', 'completeFriendPairing', 'acknowledgeFriendPairing', 'cancelFriendPairing', 'removeFriendPairing', 'getFriendPairingQr', 'startFriendPairingScan', 'stopFriendPairingScan', 'pasteFriendPairingText', 'shareFriendPairingText'].map(name => [name, jest.fn()])));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, ref;
const empty = { revision: 4, owners: [], holders: [], pending: [] };
const button = text => [...container.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const click = text => act(async () => button(text).click());
const input = (node, value) => act(() => { Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
const render = (props = {}) => act(async () => root.render(<FriendAuthenticatorScreens ref={ref} role="owner" state={empty} onRefresh={jest.fn()} onBack={jest.fn()} {...props} />));
beforeEach(() => { jest.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); ref = createRef(); api.getFriendAuthenticatorState.mockResolvedValue(empty); api.stopFriendPairingScan.mockResolvedValue({}); Object.defineProperty(document, 'hidden', { configurable: true, value: false }); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

test('public invitation sharing does not complete pairing; owner confirms fingerprint and eight digits', async () => {
  api.beginFriendPairing.mockResolvedValue({ pendingId: 'pair', invitation: 'public-invitation' });
  api.inspectFriendPairing.mockResolvedValue({ fingerprint: '123456789012' });
  api.completeFriendPairing.mockResolvedValue({ receipt: 'public-receipt', state: empty });
  api.shareFriendPairingText.mockResolvedValue({});
  await render(); await click('Add friend'); input(container.querySelector('input'), 'Alice'); await click('Continue');
  await click('Share pairing text'); expect(api.completeFriendPairing).not.toHaveBeenCalled();
  await click('Enter friend’s response'); input(container.querySelector('textarea'), 'public-response'); await click('Continue');
  expect(container.textContent).toContain('123456789012'); expect(button('Confirm pairing').disabled).toBe(true);
  act(() => container.querySelector('[type=checkbox]').click());
  act(() => '00123456'.split('').forEach(key => ref.current.handleKey(key)));
  expect(container.querySelector('[aria-label="Friend’s current code"]').value).toBe('00123456');
  expect(api.completeFriendPairing).not.toHaveBeenCalled(); await click('Confirm pairing');
  expect(api.completeFriendPairing).toHaveBeenCalledWith({ pendingId: 'pair', response: 'public-response', fingerprintAcknowledged: true, code: '00123456', expectedRevision: 4 });
  expect(container.querySelector('[aria-label="Public pairing message"]').value).toBe('public-receipt');
});

test('held codes stay hidden in lists, available while locked, and clear on background and exit', async () => {
  jest.useFakeTimers(); api.getHeldFriendCode.mockResolvedValue({ code: '00123456', expiresAt: Date.now() + 30000 });
  await render({ role: 'holder', active: true, state: { ...empty, holders: [{ id: 'pair', label: 'Alice', confirmed: true }] } });
  expect(api.getHeldFriendCode).not.toHaveBeenCalled();
  await act(async () => container.querySelector('.dm-menu-row').click()); expect(container.textContent).toContain('0012 3456');
  Object.defineProperty(document, 'hidden', { configurable: true, value: true }); act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(container.textContent).not.toContain('0012 3456'); act(() => jest.advanceTimersByTime(60000)); expect(api.getHeldFriendCode).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false }); await act(async () => document.dispatchEvent(new Event('visibilitychange')));
  expect(api.getHeldFriendCode).toHaveBeenCalledTimes(2); await click('Back'); act(() => jest.advanceTimersByTime(60000)); expect(api.getHeldFriendCode).toHaveBeenCalledTimes(2);
});

test('active owner pairings cannot mutate, yet confirmation receipts remain recoverable', async () => {
  await render({ active: true, state: { ...empty, owners: [{ id: 'pair', label: 'Alice', confirmed: true, receipt: 'saved-receipt' }] } });
  expect(button('Add friend').disabled).toBe(true); expect(button('Remove Alice').disabled).toBe(true);
  await click('Return confirmation receipt'); expect(container.querySelector('textarea').value).toBe('saved-receipt'); expect(api.getHeldFriendCode).not.toHaveBeenCalled();
});

test('pending holder resumes response and verifies a receipt without regenerating a pairing', async () => {
  api.acknowledgeFriendPairing.mockResolvedValue({ state: empty });
  await render({ role: 'holder', state: { ...empty, pending: [{ id: 'pair', role: 'holder', label: 'Alice', response: 'saved-response', fingerprint: '123456789012' }] } });
  await act(async () => container.querySelector('.dm-menu-row').click()); expect(container.querySelector('textarea').value).toBe('saved-response');
  await click('Enter confirmation receipt'); input(container.querySelector('textarea'), 'receipt'); act(() => container.querySelector('[type=checkbox]').click()); await click('Finish pairing');
  expect(api.acknowledgeFriendPairing).toHaveBeenCalledWith({ pendingId: 'pair', receipt: 'receipt', expectedRevision: 4 }); expect(api.acceptFriendPairing).not.toHaveBeenCalled();
});
