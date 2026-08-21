export const CAMERA_MODES = Object.freeze({ PHOTO: "photo", VIDEO: "video" });
export const CAMERA_VIEWS = Object.freeze({ CAMERA: "camera", GALLERY: "gallery", VIEWER: "viewer" });

export const createCameraState = () => ({
  view: CAMERA_VIEWS.CAMERA,
  mode: CAMERA_MODES.PHOTO,
  lens: "back",
  flash: "auto",
  recording: false,
  finalizing: false,
  exitAfterFinalize: false,
  selectedMedia: null,
  lastMedia: null,
  error: null,
});

export const reduceCameraState = (state, action) => {
  switch (action.type) {
    case "SET_MODE":
      return state.recording || state.finalizing ? state : { ...state, mode: action.mode };
    case "SET_LENS":
      return state.recording || state.finalizing ? state : { ...state, lens: action.lens };
    case "SET_FLASH":
      return state.finalizing ? state : { ...state, flash: action.flash };
    case "RECORDING_STARTED":
      return { ...state, recording: true, finalizing: false, error: null };
    case "RECORDING_STOPPING":
      return { ...state, recording: false, finalizing: true };
    case "RECORDING_FINALIZED":
      return {
        ...state,
        recording: false,
        finalizing: false,
        lastMedia: action.media || state.lastMedia,
      };
    case "OPEN_GALLERY":
      return state.recording || state.finalizing ? state : { ...state, view: CAMERA_VIEWS.GALLERY };
    case "OPEN_VIEWER":
      return { ...state, view: CAMERA_VIEWS.VIEWER, selectedMedia: action.media };
    case "BACK_TO_GALLERY":
      return { ...state, view: CAMERA_VIEWS.GALLERY, selectedMedia: null };
    case "BACK_TO_CAMERA":
      return { ...state, view: CAMERA_VIEWS.CAMERA, selectedMedia: null };
    case "REQUEST_EXIT":
      return state.recording
        ? { ...state, recording: false, finalizing: true, exitAfterFinalize: true }
        : { ...state, exitAfterFinalize: true };
    case "ERROR":
      return { ...state, recording: false, finalizing: false, error: action.error || "camera_error" };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    default:
      return state;
  }
};
