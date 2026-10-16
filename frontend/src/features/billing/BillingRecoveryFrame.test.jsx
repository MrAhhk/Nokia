import { act } from 'react';
import { createRoot } from 'react-dom/client';
import BillingRecoveryFrame from './BillingRecoveryFrame';
jest.mock('@/features/sound/nokiaAudioEngine', () => ({ playKeypadTone: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;
test('recovery keypad focuses independent Android tools, and only Select invokes the action', async () => {
  const open = jest.fn();
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<BillingRecoveryFrame><main><button>Retry</button>
      <nav className="billing-bootstrap__actions"><button onClick={open}>Choose Home app</button></nav>
    </main></BillingRecoveryFrame>));
    act(() => container.querySelector('[aria-label="Settings or Back"]').click());
    expect(document.activeElement.textContent).toBe('Choose Home app'); expect(open).not.toHaveBeenCalled();
    container.querySelector('[aria-label="Select"]').focus();
    expect(container.querySelector('[data-billing-focused="true"]').textContent).toBe('Choose Home app');
    act(() => container.querySelector('[aria-label="Select"]').click());
    expect(open).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
  } finally { act(() => root.unmount()); container.remove(); }
});
