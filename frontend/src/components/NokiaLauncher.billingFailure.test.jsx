import { act } from 'react';
import { createRoot } from 'react-dom/client';
import NokiaLauncher from './NokiaLauncher';
import { BillingContext } from '@/features/billing/BillingContext';
import fixture from '@/features/billing/__fixtures__/billing-v1.json';

jest.mock('@/features/billing/BillingPaywall', () => ({ __esModule: true, default: () => { throw new Error('payment module failed'); } }));
global.IS_REACT_ACT_ENVIRONMENT = true;

test('physical Back escapes a failed lazy payment feature without remounting another frame', async () => {
  delete window.Capacitor;
  localStorage.clear();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  // Distinct physical presses exceed the keypad's 30ms duplicate-event guard.
  let pressTime = Date.now();
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => pressTime);
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BillingContext.Provider value={{ billingView: fixture }}><NokiaLauncher apps={[]} /></BillingContext.Provider>));
    await act(async () => container.querySelector('[aria-label="Settings or Back"]').click());
    await act(async () => container.querySelector('[data-testid="settings-item-billing"]').click());
    expect(container.textContent).toContain('Payments could not open.');
    expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
    pressTime += 50;
    await act(async () => container.querySelector('[aria-label="Settings or Back"]').click());
    expect(container.querySelector('[data-testid="screen-settings"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Payments could not open.');
  } finally {
    act(() => root.unmount()); container.remove(); log.mockRestore(); clock.mockRestore();
  }
});
