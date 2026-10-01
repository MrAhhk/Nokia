import { pasteDumbModeCode, getDumbModeState, prepareDumbMode, shareDumbModeCode, activateDumbMode, unlockDumbMode, subscribeToDumbModeUpdates } from "./launcherApps";
import { getFriendAuthenticatorState, beginFriendPairing, getHeldFriendCode, subscribeToFriendAuthenticatorUpdates, pasteFriendPairingText, startFriendPairingScan, stopFriendPairingScan } from "./launcherApps";

afterEach(() => { delete window.Capacitor; });
test("missing native implementation never simulates a successful lock", async () => {
  await expect(getDumbModeState()).rejects.toThrow("dumb_mode_unavailable");
  await expect(activateDumbMode({ setupId: "x" })).rejects.toThrow("dumb_mode_unavailable");
});
test("facade delegates secrets only on explicit prepare/unlock and share uses setup ID", async () => {
  const plugin = { prepareDumbMode: jest.fn().mockResolvedValue({ setupId: "s", code: "Abc123Xyz789" }), shareDumbModeCode: jest.fn(), unlockDumbMode: jest.fn() };
  window.Capacitor = { Plugins: { LauncherApps: plugin } };
  await prepareDumbMode({ selectedIds: ["p.game"], expectedRevision: 0 });
  await shareDumbModeCode({ setupId: "s" });
  await unlockDumbMode({ code: "Abc123Xyz789", expectedRevision: 1 });
  expect(plugin.shareDumbModeCode).toHaveBeenCalledWith({ setupId: "s" });
  expect(plugin.unlockDumbMode).toHaveBeenCalledWith({ code: "Abc123Xyz789", expectedRevision: 1 });
});
test("late native listener handle is removed after UI disposal", async () => {
  let resolveHandle, callback;
  const remove = jest.fn();
  const onState = jest.fn();
  window.Capacitor = { Plugins: { LauncherApps: { addListener: jest.fn((name, cb) => { callback = cb; return new Promise(resolve => { resolveHandle = resolve; }); }) } } };
  const dispose = subscribeToDumbModeUpdates(onState);
  dispose();
  callback({ active: true });
  resolveHandle({ remove });
  await Promise.resolve();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(onState).not.toHaveBeenCalled();
});

test('Android paste uses the native clipboard without WebView clipboard permission', async () => {
  const paste = jest.fn().mockResolvedValue({ code: 'AbCd1234efGH' });
  window.Capacitor = { isNativePlatform: () => true, Plugins: { LauncherApps: { pasteDumbModeCode: paste } } };
  await expect(pasteDumbModeCode()).resolves.toBe('AbCd1234efGH');
  expect(paste).toHaveBeenCalledTimes(1);
});

test('friend authentication does not simulate pairing or code generation in a browser', async () => {
  await expect(getFriendAuthenticatorState()).rejects.toThrow('dumb_mode_unavailable');
  await expect(beginFriendPairing({ label: 'Alex', expectedRevision: 0 })).rejects.toThrow('dumb_mode_unavailable');
  await expect(getHeldFriendCode({ pairingId: 'owner' })).rejects.toThrow('dumb_mode_unavailable');
});

test('friend facade preserves explicit operation arguments and independent subscriptions', async () => {
  const plugin = { beginFriendPairing: jest.fn(), startFriendPairingScan: jest.fn(), stopFriendPairingScan: jest.fn(), pasteFriendPairingText: jest.fn().mockResolvedValue({ text: 'public invitation' }), addListener: jest.fn().mockResolvedValue({ remove: jest.fn() }) };
  window.Capacitor = { isNativePlatform: () => true, Plugins: { LauncherApps: plugin } };
  const dispose = subscribeToFriendAuthenticatorUpdates(jest.fn());
  await beginFriendPairing({ label: 'Alex', expectedRevision: 4 });
  await startFriendPairingScan({ scanId: 'scan1', bounds: { x: 2, y: 3, width: 100, height: 100 } });
  await stopFriendPairingScan({ scanId: 'scan1' });
  await expect(pasteFriendPairingText()).resolves.toBe('public invitation');
  expect(plugin.beginFriendPairing).toHaveBeenCalledWith({ label: 'Alex', expectedRevision: 4 });
  expect(plugin.addListener).toHaveBeenCalledWith('friendAuthenticatorChanged', expect.any(Function));
  expect(plugin.stopFriendPairingScan).toHaveBeenCalledWith({ scanId: 'scan1' });
  dispose();
});
