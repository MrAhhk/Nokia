import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import CustomizationFeature from './CustomizationFeature';
import { KEYBOARD_COLORS, KEYBOARD_COLOR_KEY, loadKeyboardColor, saveKeyboardColor } from './keyboardColorStorage';
import { syncKeyboardColor } from '@/lib/launcherApps';

let root, host;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.clear(); delete window.Capacitor; jest.restoreAllMocks(); });
test('all nine persist; invalid and denied storage recover safely', () => {
  for (const color of KEYBOARD_COLORS) { expect(saveKeyboardColor(color)).toBe(true); expect(loadKeyboardColor()).toBe(color); }
  expect(saveKeyboardColor('pink')).toBe(false);
  localStorage.setItem(KEYBOARD_COLOR_KEY, 'broken'); expect(loadKeyboardColor()).toBe('black');
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('denied'); });
  expect(saveKeyboardColor('red')).toBe(false);
});
test('Customization opens nine colors; D-pad navigates grid and Back returns to Customization', async () => {
  const ref = createRef(), onChange = jest.fn(async () => true), onExit = jest.fn();
  act(() => root.render(<CustomizationFeature ref={ref} appearance="nokia" onChange={() => true} onExit={onExit} keyboardColor="black" onKeyboardColorChange={onChange} />));
  act(() => ref.current.handleKey('DOWN')); act(() => ref.current.handleKey('DOWN')); act(() => ref.current.handleKey('SELECT'));
  expect(host.querySelectorAll('[role="radio"]')).toHaveLength(9);
  act(() => ref.current.handleKey('RIGHT'));
  await act(async () => ref.current.handleKey('SELECT'));
  expect(onChange).toHaveBeenCalledWith('red');
  act(() => ref.current.handleKey('DOWN'));
  await act(async () => ref.current.handleKey('SELECT'));
  expect(onChange).toHaveBeenLastCalledWith('green');
  act(() => ref.current.handleKey('BACK'));
  expect(host.querySelector('[data-testid="screen-customization"]')).not.toBeNull(); expect(onExit).not.toHaveBeenCalled();
});
test('native preference result is not assumed saved when bridge is missing', async () => {
  window.Capacitor = { isNativePlatform: () => true, Plugins: {} };
  expect((await syncKeyboardColor('white')).success).toBe(false);
  const native = jest.fn(async () => ({ success: true })); window.Capacitor.Plugins.LauncherApps = { syncKeyboardColor: native };
  expect((await syncKeyboardColor('white')).success).toBe(true); expect(native).toHaveBeenCalledWith({ color: 'white' });
});
