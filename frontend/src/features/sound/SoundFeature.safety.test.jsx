import { act } from "react";
import { createRoot } from "react-dom/client";
import SoundFeature from "./SoundFeature";
import { playRingtone } from "./nokiaAudioEngine";
import { applySystemTone, getSystemToneAccess, requestSystemToneAccess } from "@/lib/launcherApps";
import { _resetSoundSettingsCache } from "./soundStorage";

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
  getSystemToneAccess: jest.fn().mockResolvedValue({ supported: true, granted: false }),
  requestSystemToneAccess: jest.fn().mockResolvedValue({ opened: true }),
  applySystemTone: jest.fn().mockResolvedValue({ success: true }),
}));

beforeEach(() => {
  window.localStorage.clear();
  _resetSoundSettingsCache();
  getSystemToneAccess.mockResolvedValue({ supported: true, granted: false });
  requestSystemToneAccess.mockResolvedValue({ opened: true });
  applySystemTone.mockResolvedValue({ success: true });
});

test("sound previews respect the saved vibration-off preference", async () => {
  window.localStorage.clear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SoundFeature onExit={() => {}} />));

  act(() => container.querySelector('[data-testid="sound-row-vibrate"]').click());
  act(() => container.querySelector('[data-testid="sound-row-ringtone"]').click());

  expect(playRingtone).toHaveBeenLastCalledWith(expect.any(String), 4, false, false);

  act(() => root.unmount());
  container.remove();
});

test("requests system-tone access only from an explicit apply action", async () => {
  window.localStorage.clear();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SoundFeature onExit={() => {}} />));

  expect(requestSystemToneAccess).not.toHaveBeenCalled();
  await act(async () => container.querySelector('[data-testid="sound-row-apply_ringtone"]').click());

  expect(getSystemToneAccess).toHaveBeenCalled();
  expect(requestSystemToneAccess).toHaveBeenCalledTimes(1);
  expect(applySystemTone).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Grant access, then return");

  act(() => root.unmount());
  container.remove();
});

test("applies the selected packaged ringtone after access is granted", async () => {
  getSystemToneAccess.mockResolvedValue({ supported: true, granted: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SoundFeature onExit={() => {}} />));

  await act(async () => container.querySelector('[data-testid="sound-row-apply_ringtone"]').click());

  expect(requestSystemToneAccess).not.toHaveBeenCalled();
  expect(applySystemTone).toHaveBeenCalledWith(
    "ringtone",
    "./sounds/modern/nokia_tune_series30.mp3",
    "Nokia 3310 Remaster",
  );
  expect(container.textContent).toContain("Ringtone applied");

  act(() => root.unmount());
  container.remove();
});

test("can apply the selected message alert as the phone notification sound", async () => {
  getSystemToneAccess.mockResolvedValue({ supported: true, granted: true });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<SoundFeature onExit={() => {}} />));

  const notificationAction = container.querySelector('[data-testid="sound-row-apply_notification"]');
  expect(notificationAction).not.toBeNull();
  await act(async () => notificationAction.click());

  expect(applySystemTone).toHaveBeenCalledWith(
    "notification",
    "./sounds/sms_ascending.mp3",
    "Ascending",
  );
  expect(container.textContent).toContain("Notification applied");

  act(() => root.unmount());
  container.remove();
});
