import { openDumbModeAccessibilitySettings, openRecentApps, lockScreen,
  subscribeToAccessibilityDisclosureRequests } from './launcherApps';
afterEach(() => { delete window.Capacitor; });
test.each([
  ['showAccessibilitySettings', openDumbModeAccessibilitySettings],
  ['openRecentApps', openRecentApps],
  ['lockScreen', lockScreen],
])('%s hands an unconsented native response to Home exactly once', async (method, invoke) => {
  const listener = jest.fn();
  const remove = subscribeToAccessibilityDisclosureRequests(listener);
  window.Capacitor = { Plugins: { LauncherApps: { [method]: jest.fn().mockResolvedValue({ needsDisclosure: true }) } } };
  try {
    await invoke();
    expect(listener).toHaveBeenCalledTimes(1);
    remove(); await invoke();
    expect(listener).toHaveBeenCalledTimes(1);
  } finally { remove(); }
});
test('a successful native operation does not ask again', async () => {
  const listener = jest.fn(); const remove = subscribeToAccessibilityDisclosureRequests(listener);
  window.Capacitor = { Plugins: { LauncherApps: { openRecentApps: jest.fn().mockResolvedValue({ opened: true }) } } };
  try { await openRecentApps(); expect(listener).not.toHaveBeenCalled(); } finally { remove(); }
});
