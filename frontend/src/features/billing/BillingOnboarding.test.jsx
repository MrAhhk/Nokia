import { act, createRef, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import BillingOnboarding from './BillingOnboarding';
import { ONBOARDING_KEY, TOUR_STEPS } from '@/features/onboarding/onboardingState';
import { KEY_INTENTS } from '@/domain/keyGrammar';
import * as native from '@/lib/launcherApps';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';
jest.mock('@/features/sound/nokiaAudioEngine', () => ({ playKeypadTone: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => {
  localStorage.clear(); window.Capacitor = { isNativePlatform: () => true };
  jest.spyOn(native, 'openBillingRecovery').mockResolvedValue({ opened: true });
  jest.spyOn(native, 'getDumbModeState').mockResolvedValue({ defaultLauncherAvailable: false });
  jest.spyOn(native, 'getDeviceContacts').mockResolvedValue([]);
  jest.spyOn(native, 'getDeviceConversations').mockResolvedValue([]);
  jest.spyOn(native, 'purchaseBillingPlan').mockResolvedValue({ operationId: 'unused' });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete window.Capacitor; jest.restoreAllMocks(); jest.clearAllMocks(); });
test('uses every approved step and Home setup before handing off without launcher or money commands', async () => {
  const done = jest.fn(); await act(async () => root.render(<BillingOnboarding onComplete={done} />));
  for (let i = 0; i < TOUR_STEPS.length; i++) {
    expect(container.querySelector('h2').textContent).toBe(TOUR_STEPS[i].title);
    if (i === TOUR_STEPS.length - 1) {
      expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Choose a plan');
      await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Set Home app ↗').click());
      expect(native.openBillingRecovery).toHaveBeenCalledWith({ action: 'home-settings' });
    }
    await act(async () => container.querySelector('.onboarding-coach__next').click());
  }
  expect(done).toHaveBeenCalledTimes(1);
  expect(JSON.parse(localStorage.getItem(ONBOARDING_KEY)).completed).toBe(true);
  expect(native.getDeviceContacts).not.toHaveBeenCalled(); expect(native.getDeviceConversations).not.toHaveBeenCalled();
  expect(native.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('keypad skip completes only onboarding and retains the existing feedback path', async () => {
  const done = jest.fn(); const ref = createRef();
  await act(async () => root.render(<BillingOnboarding ref={ref} onComplete={done} />));
  await act(async () => ref.current.handleKey(KEY_INTENTS.HOME));
  expect(done).toHaveBeenCalledTimes(1); expect(playKeypadTone).toHaveBeenCalled();
  expect(native.purchaseBillingPlan).not.toHaveBeenCalled();
});
test('completed guide does not repeat or write preferences during StrictMode handoff', async () => {
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify({ completed: true }));
  const writes = jest.spyOn(Storage.prototype, 'setItem'); const done = jest.fn();
  await act(async () => root.render(<StrictMode><BillingOnboarding onComplete={done} /></StrictMode>));
  expect(done).toHaveBeenCalledTimes(1); expect(writes).not.toHaveBeenCalled(); expect(container.textContent).toBe('');
});
