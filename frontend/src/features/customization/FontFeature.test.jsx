import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import FontFeature from './FontFeature';
import { FONT_KEY, loadFont, saveFont } from './fontStorage';
let root, container;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); localStorage.clear(); });
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });
test('pixel is default; original choice survives reload and invalid data safely falls back', () => {
  expect(loadFont()).toBe('vt323');
  expect(saveFont('classic')).toBe(true); expect(loadFont()).toBe('classic');
  expect(saveFont('invented')).toBe(false); expect(loadFont()).toBe('classic');
  localStorage.setItem(FONT_KEY, 'corrupt'); expect(loadFont()).toBe('vt323');
});
test('keypad selects and applies a font; Back exits without another change', () => {
  const ref = createRef(), onChange = jest.fn(() => true), onExit = jest.fn();
  act(() => root.render(<FontFeature ref={ref} font="vt323" onChange={onChange} onExit={onExit} />));
  act(() => ref.current.handleKey('DOWN')); act(() => ref.current.handleKey('SELECT'));
  expect(onChange).toHaveBeenCalledWith('classic');
  act(() => ref.current.handleKey('BACK')); expect(onExit).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledTimes(1);
});
test('storage denial is visible and does not claim persistence', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  expect(saveFont('classic')).toBe(false);
  act(() => root.render(<FontFeature font="vt323" onChange={() => false} onExit={() => {}} />));
  act(() => container.querySelectorAll('[role=radio]')[1].click());
  expect(container.querySelector('[role=status]').textContent).toContain('Storage is unavailable');
});
