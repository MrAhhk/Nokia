import { act } from 'react';
import { createRoot } from 'react-dom/client';
import NokiaLauncher from './NokiaLauncher';
import * as api from '@/lib/launcherApps';

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container, emit;
const game = { id: 'example.game/Main', packageName: 'example.game', name: 'Game' };
const tool = { id: 'example.tool/Main', packageName: 'example.tool', name: 'Tool' };
const active = { state: 'ACTIVE', active: true, revision: 1, blockedIds: ['example.game', 'snake'], mandatoryIds: ['snake'], enforcementAvailable: true };
beforeEach(() => {
  localStorage.clear();
  window.Capacitor = { isNativePlatform: () => true };
  localStorage.setItem('nokia-launcher.onboarding', JSON.stringify({ completed: true }));
  jest.spyOn(api, 'getDeviceStatus').mockResolvedValue({});
  jest.spyOn(api, 'getDumbModeState').mockResolvedValue(active);
  jest.spyOn(api, 'subscribeToDumbModeUpdates').mockImplementation(callback => { emit = callback; return jest.fn(); });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); delete window.Capacitor; jest.restoreAllMocks(); });
const mount = () => act(async () => root.render(<NokiaLauncher apps={[game, tool]} />));
const click = selector => act(async () => container.querySelector(selector).click());
test('native policy hides drawer packages and Snake, then restores both after unlock event', async () => {
  await mount();
  await click('[aria-label="Settings or Back"]');
  expect(container.querySelector('[data-testid="settings-item-snake"]')).toBeNull();
  expect(container.textContent).toContain('Dumb Mode');
  await click('[aria-label="Home"]');
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Menu').click());
  expect(container.querySelector(`[data-testid="app-list-item-${game.id}"]`)).toBeNull();
  expect(container.querySelector(`[data-testid="app-list-item-${tool.id}"]`)).not.toBeNull();
  await act(async () => emit({ ...active, state: 'OFF', active: false, revision: 2, blockedIds: [] }));
  expect(container.querySelector(`[data-testid="app-list-item-${game.id}"]`)).not.toBeNull();
});
test('active Dumb Mode keeps its outside Settings switch marked active', async () => {
  await mount();
  await click('[aria-label="Settings or Back"]');
  const row = container.querySelector('[role="switch"]');
  expect(row).not.toBeNull();
  expect(row.getAttribute('aria-label')).toBe('Dumb Mode · On');
  expect(row.className).toContain('is-dumb-mode-active');
  expect(row.querySelector('.lcd-setting-switch').className).toContain('is-on');
});
test('opening Dumb Mode does not replace Settings with a temporary loading screen', async () => {
  await mount();
  await click('[aria-label="Settings or Back"]');
  await click('[data-testid="settings-item-dumb-mode"]');
  expect(container.querySelector('[aria-label="Loading Dumb Mode"]')).toBeNull();
  expect(container.querySelector('[aria-label="Dumb Mode guide"]')).not.toBeNull();
});
test('slow bootstrap result cannot undo a newer native policy event', async () => {
  let resolve;
  api.getDumbModeState.mockReturnValue(new Promise(done => { resolve = done; }));
  await mount();
  await act(async () => emit(active));
  await act(async () => resolve({ ...active, state: 'OFF', active: false, revision: 0, blockedIds: [] }));
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Menu').click());
  expect(container.querySelector(`[data-testid="app-list-item-${game.id}"]`)).toBeNull();
});

