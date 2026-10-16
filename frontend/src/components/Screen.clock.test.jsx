import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Screen from './Screen';

global.IS_REACT_ACT_ENVIRONMENT = true;
test.each(['menu', 'settings', 'contacts', 'recent-calls', 'messages', 'message-thread', 'message-compose'])('%s clock advances with otherwise stable props', view => {
  const container = document.createElement('div'); const root = createRoot(container);
  const props = { currentView: view, menuItems: [], threadMessages: [], activeThread: { address: 'Fixture' }, selectedIndex: 0, deviceStatus: {} };
  try {
    act(() => root.render(<Screen {...props} currentTime={new Date('2026-10-09T10:42:00')} />));
    const clock = () => container.querySelector('.lcd-list-time, .miniscreen-clock');
    expect(clock().textContent).toBe('10:42');
    act(() => root.render(<Screen {...props} currentTime={new Date('2026-10-09T10:43:00')} />));
    expect(clock().textContent).toBe('10:43');
  } finally { act(() => root.unmount()); }
});
