import {
  CAMERA_MODES,
  CAMERA_VIEWS,
  createCameraState,
  reduceCameraState,
} from "./cameraState";
import { getCameraCommand } from "./cameraCommands";

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
});
