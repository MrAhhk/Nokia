import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import PhoneNameFeature from './PhoneNameFeature';
import { loadPhoneName, savePhoneName, normalizePhoneName, PHONE_NAME_KEY } from './phoneNameStorage';

let root, node;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; node = document.createElement('div'); root = createRoot(node); localStorage.clear(); });
afterEach(() => { act(() => root.unmount()); localStorage.clear(); jest.restoreAllMocks(); });
test('name survives reload and blank restores Nokia; storage denial is reported', () => {
  expect(loadPhoneName()).toBe('Nokia'); expect(savePhoneName('  My phone  ')).toBe(true); expect(loadPhoneName()).toBe('My phone');
  expect(savePhoneName('')).toBe(true); expect(loadPhoneName()).toBe('Nokia');
  expect(normalizePhoneName('\u0000  Test\n')).toBe('Test');
  localStorage.setItem(PHONE_NAME_KEY, 'x'.repeat(100)); expect(loadPhoneName()).toHaveLength(20);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('denied'); }); expect(savePhoneName('Test')).toBe(false);
});
test('keypad commits pending text when saved and disposes timer on exit', () => {
  jest.useFakeTimers(); const ref = createRef(), save = jest.fn(() => true), exit = jest.fn();
  act(() => root.render(<PhoneNameFeature ref={ref} name="" onSave={save} onExit={exit} />));
  const input = node.querySelector('input');
  expect(input.readOnly).toBe(true); expect(input.inputMode).toBe('none');
  act(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
  expect(document.activeElement).not.toBe(input);
  act(() => ref.current.handleKey('2')); act(() => ref.current.handleKey('2'));
  expect(input.value).toBe('b');
  act(() => ref.current.handleKey('3')); expect(input.value).toBe('bd');
  act(() => ref.current.handleKey('SOFT_LEFT')); expect(input.value).toBe('b');
  act(() => ref.current.handleKey('SELECT'));
  expect(save).toHaveBeenCalledWith('b');
  act(() => ref.current.handleKey('BACK')); expect(exit).toHaveBeenCalledTimes(1);
  act(() => jest.runOnlyPendingTimers()); expect(save).toHaveBeenCalledTimes(1); jest.useRealTimers();
});
test('failed persistence keeps the editor open with an error', () => {
  const ref = createRef(), exit = jest.fn();
  act(() => root.render(<PhoneNameFeature ref={ref} name="Test" onSave={() => false} onExit={exit} />));
  act(() => ref.current.handleKey('SELECT')); expect(node.querySelector('[role=alert]').textContent).toContain('Could not save'); expect(exit).not.toHaveBeenCalled();
});
