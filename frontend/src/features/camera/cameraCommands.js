import { CAMERA_MODES, CAMERA_VIEWS } from "./cameraState";

export const getCameraCommand = (state, key) => {
  if (state.view === CAMERA_VIEWS.CAMERA) {
    if (key === "SEND") return state.recording || state.finalizing ? null : { type: "OPEN_GALLERY" };
    if (key === "END" || key === "#") {
      return state.recording ? { type: "STOP_VIDEO_AND_EXIT" } : { type: "EXIT_CAMERA" };
    }
    if (key === "SELECT" || key === "5") {
      if (state.finalizing) return null;
      if (state.mode === CAMERA_MODES.PHOTO) return { type: "CAPTURE_PHOTO" };
      return { type: state.recording ? "STOP_VIDEO" : "START_VIDEO" };
    }
    if (state.recording || state.finalizing) return null;
    if (key === "UP" || key === "DOWN" || key === "2" || key === "8") {
      return { type: "TOGGLE_MODE" };
    }
    if (key === "LEFT" || key === "4") return { type: "CYCLE_FLASH" };
    if (key === "RIGHT" || key === "6") return { type: "SWITCH_LENS" };
    if (key === "*") return { type: "TOGGLE_GRID" };
  }

  if (state.view === CAMERA_VIEWS.GALLERY) {
    if (key === "END" || key === "#" || key === "SEND") return { type: "BACK_TO_CAMERA" };
    if (key === "SELECT" || key === "5") return { type: "OPEN_SELECTED_MEDIA" };
    if (["UP", "DOWN", "LEFT", "RIGHT"].includes(key)) {
      return { type: "MOVE_GALLERY", direction: key.toLowerCase() };
    }
  }

  if (state.view === CAMERA_VIEWS.VIEWER) {
    if (key === "END" || key === "#") return { type: "BACK_TO_GALLERY" };
    if (key === "SELECT" || key === "5") return { type: "TOGGLE_PLAYBACK" };
    if (key === "LEFT" || key === "4") return { type: "PREVIOUS_MEDIA" };
    if (key === "RIGHT" || key === "6") return { type: "NEXT_MEDIA" };
  }

  return null;
};

export const getCameraTouchCommand = (state, control) => {
  if (state.view !== CAMERA_VIEWS.CAMERA || state.finalizing) return null;
  if (control === "gallery") return state.recording ? null : { type: "OPEN_GALLERY" };
  if (control === "shutter") {
    if (state.mode === CAMERA_MODES.PHOTO) return { type: "CAPTURE_PHOTO" };
    return { type: state.recording ? "STOP_VIDEO" : "START_VIDEO" };
  }
  if (state.recording) return null;
  if (control === "mode-photo" && state.mode !== CAMERA_MODES.PHOTO) {
    return { type: "SET_MODE", mode: CAMERA_MODES.PHOTO };
  }
  if (control === "mode-video" && state.mode !== CAMERA_MODES.VIDEO) {
    return { type: "SET_MODE", mode: CAMERA_MODES.VIDEO };
  }
  if (control === "flip") return { type: "SWITCH_LENS" };
  if (control === "flash") return { type: "CYCLE_FLASH" };
  return null;
};
