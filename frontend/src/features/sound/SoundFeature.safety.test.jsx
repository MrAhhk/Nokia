import { act } from "react";
import { createRoot } from "react-dom/client";
import SoundFeature from "./SoundFeature";
import { playRingtone } from "./nokiaAudioEngine";

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("./nokiaAudioEngine", () => ({
  playKeypadTone: jest.fn(() => ({ stop: jest.fn() })),
  playNotificationTone: jest.fn(() => ({ stop: jest.fn() })),
  playRingtone: jest.fn(() => ({ stop: jest.fn() })),
  playAlarmTone: jest.fn(() => ({ stop: jest.fn() })),
  stopAllSounds: jest.fn(),
}));

jest.mock("@/lib/launcherApps", () => ({
  openSystemSetting: jest.fn().mockResolvedValue(undefined),
  triggerHaptic: jest.fn(),
}));

test("sound previews respect the saved vibration-off preference", () => {
  window.localStorage.clear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SoundFeature onExit={() => {}} />));

  act(() => container.querySelector('[data-testid="sound-row-vibrate"]').click());
  act(() => container.querySelector('[data-testid="sound-row-ringtone"]').click());

  expect(playRingtone).toHaveBeenLastCalledWith(expect.any(String), 4, false, false);

  act(() => root.unmount());
  container.remove();
});
