import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import CameraFeature from './CameraFeature';
import { startBuiltInCamera, stopBuiltInCamera, addCameraControlListener, listCameraMedia, hideCameraMedia, showCameraMedia, controlCameraMedia, captureCameraPhoto } from '@/lib/launcherApps';

jest.mock('@/lib/launcherApps', () => ({
  startBuiltInCamera: jest.fn(), stopBuiltInCamera: jest.fn(() => Promise.resolve()),
  addCameraControlListener: jest.fn(() => Promise.resolve({ remove() {} })),
  setCameraMode: jest.fn(() => Promise.resolve()), setCameraLens: jest.fn(() => Promise.resolve()),
  setCameraFlash: jest.fn(() => Promise.resolve()), setCameraGrid: jest.fn(() => Promise.resolve()),
  listCameraMedia: jest.fn(), hideCameraMedia: jest.fn(),
  showCameraMedia: jest.fn(), controlCameraMedia: jest.fn(), captureCameraPhoto: jest.fn(),
}));

let root, container, frames;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  frames = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frames.push(fn); return frames.length; });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  startBuiltInCamera.mockReset(); stopBuiltInCamera.mockClear();
  stopBuiltInCamera.mockResolvedValue({});
  addCameraControlListener.mockResolvedValue({ remove() {} });
  listCameraMedia.mockResolvedValue({ media: [] }); hideCameraMedia.mockResolvedValue({});
  showCameraMedia.mockReset().mockResolvedValue({ shown: true });
  controlCameraMedia.mockReset().mockResolvedValue({ controlled: true }); captureCameraPhoto.mockReset();
});

test('gallery failure has a retry action instead of claiming no photos exist', async () => {
  listCameraMedia.mockRejectedValueOnce(Error('unavailable')).mockResolvedValueOnce({ media: [{ id: 'a', type: 'photo' }] });
  const ref = createRef();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={jest.fn()} />));
  await act(async () => ref.current.handleKey('SEND'));
  expect(container.textContent).toContain('Gallery unavailable');
  expect(container.textContent).not.toContain('No photos yet');
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Try again').click());
  expect(container.querySelectorAll('.camera-gallery__item')).toHaveLength(1);
});

test('viewer touch actions browse photos, control videos and return to gallery', async () => {
  listCameraMedia.mockResolvedValue({ media: [{ id: 'a', type: 'photo', uri: 'photo' }, { id: 'b', type: 'video', uri: 'video' }] });
  const ref = createRef();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={jest.fn()} />));
  await act(async () => ref.current.handleKey('SEND'));
  await act(async () => ref.current.handleKey('SELECT'));
  await act(async () => frames.splice(0).forEach(fn => fn()));
  const button = label => [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(button('Next')).toBeDefined();
  await act(async () => button('Next').click());
  await act(async () => frames.splice(0).forEach(fn => fn()));
  await act(async () => button('Play / pause').click());
  expect(controlCameraMedia).toHaveBeenCalledWith('toggle');
  await act(async () => button('Back').click());
  expect(container.querySelector('[data-testid=screen-camera-gallery]')).not.toBeNull();
});

test('unreadable viewer media shows retry and back controls', async () => {
  showCameraMedia.mockRejectedValueOnce(Error('missing'));
  listCameraMedia.mockResolvedValue({ media: [{ id: 'a', type: 'photo', uri: 'gone' }] });
  const ref = createRef();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={jest.fn()} />));
  await act(async () => ref.current.handleKey('SEND'));
  await act(async () => ref.current.handleKey('SELECT'));
  await act(async () => frames.splice(0).forEach(fn => fn()));
  expect(container.textContent).toContain('Cannot open photo');
  expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Try again')).toBe(true);
});

test('two capture keys before a rerender start only one native capture', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  captureCameraPhoto.mockImplementation(() => pending);
  const ref = createRef();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={jest.fn()} />));
  let first, second;
  act(() => { first = ref.current.handleKey('SELECT'); second = ref.current.handleKey('SELECT'); });
  const calls = captureCameraPhoto.mock.calls.length;
  await act(async () => { finish({ media: { id: 'a' } }); await Promise.all([first, second]); });
  expect(calls).toBe(1);
});

test('Exit stays available while a gallery request is pending', async () => {
  let finish;
  listCameraMedia.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const ref = createRef(), exit = jest.fn();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={exit} />));
  let opening;
  await act(async () => { opening = ref.current.handleKey('SEND'); await Promise.resolve(); });
  expect(container.textContent).not.toContain('No photos yet');
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Exit').click());
  expect(exit).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ media: [{ id: 'late', type: 'photo' }] }); await opening; });
  expect(container.querySelectorAll('.camera-gallery__item')).toHaveLength(0);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const mount = async onExit => {
  await act(async () => root.render(<CameraFeature onExit={onExit} />));
  await act(async () => { frames.splice(0).forEach(fn => fn()); });
};
test('failed preview can retry successfully without leaving an error overlay', async () => {
  startBuiltInCamera.mockRejectedValueOnce(Error('permission denied')).mockResolvedValueOnce({ sessionId: 'native' });
  await mount(jest.fn());
  expect(container.textContent).toContain('Camera permission needed');
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Try again').click());
  expect(startBuiltInCamera).toHaveBeenCalledTimes(2);
  expect(container.querySelector('.camera-unavailable')).toBeNull();
});
test('Back from failed preview stops native resources before leaving', async () => {
  startBuiltInCamera.mockRejectedValue(Error('unavailable')); const exit = jest.fn();
  await mount(exit);
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Back').click());
  expect(stopBuiltInCamera).toHaveBeenCalledTimes(1); expect(exit).toHaveBeenCalledTimes(1);
  expect(stopBuiltInCamera.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]);
});

test('two-column gallery keeps D-pad selection aligned and exits without capturing', async () => {
  startBuiltInCamera.mockResolvedValue({ sessionId: 'native' });
  listCameraMedia.mockResolvedValue({ media: Array.from({ length: 6 }, (_, i) => ({ id: String(i), type: 'photo' })) });
  const ref = createRef(); const exit = jest.fn();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={exit} />));
  await act(async () => ref.current.handleKey('SEND'));
  expect(container.querySelectorAll('.camera-gallery__item')).toHaveLength(6);
  await act(async () => ref.current.handleKey('DOWN'));
  expect(container.querySelector('[aria-current="true"]').getAttribute('aria-label')).toBe('Open photo 3');
  await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Exit').click());
  expect(exit).toHaveBeenCalledTimes(1);
});

test.each([3, 5])('vertical navigation preserves each column with %i gallery items', async (count) => {
  startBuiltInCamera.mockResolvedValue({ sessionId: 'native' });
  listCameraMedia.mockResolvedValue({ media: Array.from({ length: count }, (_, i) => ({ id: String(i), type: 'photo' })) });
  const ref = createRef();
  await act(async () => root.render(<CameraFeature ref={ref} onExit={jest.fn()} />));
  await act(async () => ref.current.handleKey('SEND'));
  const selected = () => container.querySelector('[aria-current="true"]').getAttribute('aria-label');
  await act(async () => ref.current.handleKey('UP'));
  expect(selected()).toBe(`Open photo ${count}`);
  await act(async () => ref.current.handleKey('DOWN'));
  expect(selected()).toBe('Open photo 1');
  await act(async () => ref.current.handleKey('RIGHT'));
  await act(async () => ref.current.handleKey('UP'));
  expect(selected()).toBe(`Open photo ${count - 1}`);
  await act(async () => ref.current.handleKey('DOWN'));
  expect(selected()).toBe('Open photo 2');
});
