import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import CustomizationFeature from './CustomizationFeature';
import { APPEARANCE_KEY, loadAppearance, saveAppearance } from './appearanceStorage';

let root, container;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); jest.restoreAllMocks(); });
const render = (element) => act(() => root.render(element));
const find = (id) => container.querySelector(`[data-testid="${id}"]`);
test('valid choices persist; corrupt data falls back to original', () => {
  localStorage.setItem(APPEARANCE_KEY, 'unknown');
  expect(loadAppearance()).toBe('nokia');
  expect(saveAppearance('sidephone')).toBe(true);
  expect(loadAppearance()).toBe('sidephone');
  expect(saveAppearance('unknown')).toBe(false);
  expect(loadAppearance()).toBe('sidephone');
});
test('unavailable storage fails safely and the UI explains temporary application', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('quota'); });
  expect(saveAppearance('sidephone')).toBe(false);
  render(<CustomizationFeature appearance="nokia" onChange={() => false} onExit={() => {}} />);
  act(() => find('appearance-sidephone').click());
  expect(container.querySelector('[role="status"]').textContent).toContain('Storage is unavailable');
});
test('D-pad selects, Select applies, Back exits; renders the active choice', () => {
  const ref = createRef(); const onChange = jest.fn(() => true); const onExit = jest.fn();
  render(<CustomizationFeature ref={ref} appearance="nokia" onChange={onChange} onExit={onExit} />);
  expect(find('appearance-nokia').getAttribute('aria-checked')).toBe('true');
  act(() => ref.current.handleKey('DOWN'));
  act(() => ref.current.handleKey('SELECT'));
  expect(onChange).toHaveBeenCalledWith('sidephone');
  act(() => ref.current.handleKey('BACK'));
  expect(onExit).toHaveBeenCalledTimes(1);
});
