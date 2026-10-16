import { act } from 'react';
import { createRoot } from 'react-dom/client';
import AccessibilityHomeNotice from './AccessibilityHomeNotice';
import * as api from '@/lib/launcherApps';
jest.mock('@/lib/launcherApps', () => ({ acceptAccessibilityDisclosure: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, dismiss;
beforeEach(() => {
  jest.clearAllMocks(); dismiss = jest.fn();
  api.acceptAccessibilityDisclosure.mockResolvedValue({});
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AccessibilityHomeNotice onDismiss={dismiss} />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
test('Home notice preserves disclosure and default selection declines without opening settings', () => {
  expect(container.textContent).toContain('screen text/controls');
  expect(container.textContent).toContain('off-screen');
  expect(container.textContent).toContain('no screen-history storage or sharing');
  expect(document.activeElement.textContent).toBe('Later');
  act(() => document.activeElement.click());
  expect(dismiss).toHaveBeenCalledTimes(1);
  expect(api.acceptAccessibilityDisclosure).not.toHaveBeenCalled();
});
test('explicit enable acknowledges the version before dismissing Home notice', async () => {
  await act(async () => container.querySelector('button').click());
  expect(api.acceptAccessibilityDisclosure).toHaveBeenCalledWith(1);
  expect(dismiss).toHaveBeenCalledTimes(1);
});
test('failed settings opening keeps the notice and retry available', async () => {
  api.acceptAccessibilityDisclosure.mockRejectedValue(new Error('unavailable'));
  await act(async () => container.querySelector('button').click());
  expect(dismiss).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Try again');
  expect(container.querySelector('button').disabled).toBe(false);
});
