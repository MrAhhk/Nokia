import { act } from 'react';
import { createRoot } from 'react-dom/client';
import OnboardingGuide from './OnboardingGuide';
import { TOUR_STEPS } from './onboardingState';
import * as api from '@/lib/launcherApps';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, next;
beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container); next = jest.fn();
  jest.spyOn(api, 'acceptAccessibilityDisclosure').mockResolvedValue({});
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const mount = () => act(async () => root.render(<OnboardingGuide tour={{ index: 3, step: TOUR_STEPS.find(s => s.id === 'accessibility') }} onNext={next} onBack={jest.fn()} onFinish={jest.fn()} />));
test('display and Not now never grant access; explicit agreement uses the displayed version', async () => {
  await mount();
  expect(container.textContent).toContain('screen text/controls');
  expect(container.textContent).toContain('off-screen');
  expect(api.acceptAccessibilityDisclosure).not.toHaveBeenCalled();
  await act(async () => container.querySelector('.onboarding-coach__next').click());
  expect(next).toHaveBeenCalledTimes(1);
  expect(api.acceptAccessibilityDisclosure).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Enable Accessibility').click());
  expect(api.acceptAccessibilityDisclosure).toHaveBeenCalledWith(1);
  expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Continue');
});
test('a failed activation leaves a retry and never implies consent succeeded', async () => {
  api.acceptAccessibilityDisclosure.mockRejectedValue(new Error('unavailable'));
  await mount();
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Enable Accessibility').click());
  expect(container.querySelector('.onboarding-coach__next').textContent).toBe('Not now');
  expect(next).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Couldn’t open');
});

