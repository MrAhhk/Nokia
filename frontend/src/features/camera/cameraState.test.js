import {
  CAMERA_MODES,
  CAMERA_VIEWS,
  createCameraState,
  reduceCameraState,
} from "./cameraState";
import { getCameraCommand, getCameraTouchCommand } from "./cameraCommands";

describe("camera state", () => {
  test("starts in the camera view with photo mode", () => {
    expect(createCameraState()).toMatchObject({
      view: CAMERA_VIEWS.CAMERA,
      mode: CAMERA_MODES.PHOTO,
      recording: false,
      finalizing: false,
    });
  });

  test("blocks gallery while recording and opens it when idle", () => {
    const recording = reduceCameraState(createCameraState(), { type: "RECORDING_STARTED" });
    expect(reduceCameraState(recording, { type: "OPEN_GALLERY" }).view).toBe(CAMERA_VIEWS.CAMERA);

    const stopped = reduceCameraState(recording, { type: "RECORDING_FINALIZED", media: { id: "1" } });
    expect(reduceCameraState(stopped, { type: "OPEN_GALLERY" }).view).toBe(CAMERA_VIEWS.GALLERY);
  });

  test("marks an active recording finalizing before exit", () => {
    const recording = reduceCameraState(createCameraState(), { type: "RECORDING_STARTED" });
    expect(reduceCameraState(recording, { type: "REQUEST_EXIT" })).toMatchObject({
      recording: false,
      finalizing: true,
      exitAfterFinalize: true,
    });
  });
});

describe("camera keypad commands", () => {
  test("green opens gallery and center captures in photo mode", () => {
    const state = createCameraState();
    expect(getCameraCommand(state, "SEND")).toEqual({ type: "OPEN_GALLERY" });
    expect(getCameraCommand(state, "SELECT")).toEqual({ type: "CAPTURE_PHOTO" });
    expect(getCameraCommand(state, "5")).toEqual({ type: "CAPTURE_PHOTO" });
  });

  test("center starts and stops video recording", () => {
    const video = { ...createCameraState(), mode: CAMERA_MODES.VIDEO };
    expect(getCameraCommand(video, "SELECT")).toEqual({ type: "START_VIDEO" });
    expect(getCameraCommand({ ...video, recording: true }, "SELECT")).toEqual({ type: "STOP_VIDEO" });
  });

  test("red safely stops an active recording before exit", () => {
    const recording = { ...createCameraState(), mode: CAMERA_MODES.VIDEO, recording: true };
    expect(getCameraCommand(recording, "END")).toEqual({ type: "STOP_VIDEO_AND_EXIT" });
  });

  test("Back matches Exit in gallery and Back in the viewer", () => {
    const camera = createCameraState();
    const gallery = { ...camera, view: CAMERA_VIEWS.GALLERY };
    const viewer = { ...camera, view: CAMERA_VIEWS.VIEWER };
    expect(getCameraCommand(camera, "BACK")).toEqual({ type: "EXIT_CAMERA" });
    expect(getCameraCommand(gallery, "BACK")).toEqual({ type: "EXIT_CAMERA" });
    expect(getCameraCommand(viewer, "BACK")).toEqual({ type: "BACK_TO_GALLERY" });
  });

  test('center matches Next for photos and playback for videos; Send returns to Camera', () => {
    const viewer = { ...createCameraState(), view: CAMERA_VIEWS.VIEWER, selectedMedia: { type: 'photo' } };
    expect(getCameraCommand(viewer, 'SELECT')).toEqual({ type: 'NEXT_MEDIA' });
    expect(getCameraCommand({ ...viewer, selectedMedia: { type: 'video' } }, 'SELECT')).toEqual({ type: 'TOGGLE_PLAYBACK' });
    expect(getCameraCommand({ ...viewer, view: CAMERA_VIEWS.GALLERY }, 'SEND')).toEqual({ type: 'BACK_TO_CAMERA' });
  });

  test("star toggles the composition grid only while idle", () => {
    const idle = createCameraState();
    expect(getCameraCommand(idle, "*")).toEqual({ type: "TOGGLE_GRID" });
    expect(reduceCameraState(idle, { type: "TOGGLE_GRID" }).grid).toBe(false);
    expect(getCameraCommand({ ...idle, recording: true }, "*")).toBeNull();
  });

  test("native touch controls reuse the same camera commands", () => {
    const photo = createCameraState();
    const video = { ...photo, mode: CAMERA_MODES.VIDEO };
    expect(getCameraTouchCommand(photo, "gallery")).toEqual({ type: "OPEN_GALLERY" });
    expect(getCameraTouchCommand(photo, "shutter")).toEqual({ type: "CAPTURE_PHOTO" });
    expect(getCameraTouchCommand(video, "shutter")).toEqual({ type: "START_VIDEO" });
    expect(getCameraTouchCommand({ ...video, recording: true }, "shutter")).toEqual({ type: "STOP_VIDEO" });
    expect(getCameraTouchCommand(photo, "mode-video")).toEqual({ type: "SET_MODE", mode: CAMERA_MODES.VIDEO });
    expect(getCameraTouchCommand(video, "mode-video")).toBeNull();
    expect(getCameraTouchCommand(photo, "flip")).toEqual({ type: "SWITCH_LENS" });
    expect(getCameraTouchCommand(photo, "flash")).toEqual({ type: "CYCLE_FLASH" });
  });
});
