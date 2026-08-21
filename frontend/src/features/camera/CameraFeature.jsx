import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  captureCameraPhoto,
  addCameraControlListener,
  controlCameraMedia,
  hideCameraMedia,
  listCameraMedia,
  setCameraFlash,
  setCameraGrid,
  setCameraLens,
  setCameraMode,
  showCameraMedia,
  startBuiltInCamera,
  startCameraVideo,
  stopBuiltInCamera,
  stopCameraVideo,
} from "@/lib/launcherApps";
import { getCameraCommand, getCameraTouchCommand } from "./cameraCommands";
import { CAMERA_MODES, CAMERA_VIEWS, createCameraState, reduceCameraState } from "./cameraState";
import "./camera.css";

const FLASH_MODES = ["off", "auto", "on"];

const getNativeBounds = (element) => {
  const rect = element?.getBoundingClientRect();
  if (!rect) return null;
  const scale = window.devicePixelRatio || 1;
  return {
    x: Math.round(rect.left * scale),
    y: Math.round(rect.top * scale),
    width: Math.max(1, Math.round(rect.width * scale)),
    height: Math.max(1, Math.round(rect.height * scale)),
  };
};

const CameraFeature = forwardRef(({ onExit }, ref) => {
  const [state, dispatch] = useReducer(reduceCameraState, undefined, createCameraState);
  const [media, setMedia] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Starting camera");
  const [busy, setBusy] = useState(false);
  const surfaceRef = useRef(null);
  const cameraConfigRef = useRef({ lens: state.lens, mode: state.mode, grid: state.grid });
  const stateRef = useRef(state);
  cameraConfigRef.current = { lens: state.lens, mode: state.mode, grid: state.grid };
  stateRef.current = state;

  const startPreview = useCallback(async () => {
    const bounds = getNativeBounds(surfaceRef.current);
    if (!bounds) return;
    setStatus("Starting camera");
    try {
      const result = await startBuiltInCamera({ ...bounds, ...cameraConfigRef.current });
      setStatus(result?.sessionId === "browser-camera" ? "Camera preview on Android" : "Ready");
    } catch (error) {
      const message = String(error?.message || error || "camera_error");
      dispatch({ type: "ERROR", error: message });
      setStatus(message.includes("permission") ? "Camera permission needed" : "Camera unavailable");
    }
  }, []);

  useEffect(() => {
    if (state.view !== CAMERA_VIEWS.CAMERA) return undefined;
    const frame = requestAnimationFrame(startPreview);
    return () => cancelAnimationFrame(frame);
  }, [state.view, startPreview]);

  useEffect(() => () => {
    stopBuiltInCamera().catch(() => {});
  }, []);

  useEffect(() => {
    if (state.view !== CAMERA_VIEWS.VIEWER || !state.selectedMedia) return undefined;
    const frame = requestAnimationFrame(() => {
      const bounds = getNativeBounds(surfaceRef.current);
      if (bounds) showCameraMedia({ ...state.selectedMedia, ...bounds }).catch(() => setStatus("Cannot open media"));
    });
    return () => {
      cancelAnimationFrame(frame);
      hideCameraMedia().catch(() => {});
    };
  }, [state.view, state.selectedMedia]);

  const loadGallery = useCallback(async () => {
    setStatus("Loading gallery");
    try {
      const result = await listCameraMedia({ limit: 60 });
      const nextMedia = Array.isArray(result?.media) ? result.media : [];
      setMedia(nextMedia);
      setSelectedIndex((index) => Math.min(index, Math.max(0, nextMedia.length - 1)));
      setStatus(nextMedia.length ? `${nextMedia.length} local items` : "No captures yet");
    } catch {
      setMedia([]);
      setStatus("Gallery unavailable");
    }
  }, []);

  const stopRecording = useCallback(async (exitAfter = false) => {
    if (busy) return;
    setBusy(true);
    dispatch({ type: "RECORDING_STOPPING" });
    setStatus("Saving video");
    try {
      const result = await stopCameraVideo();
      dispatch({ type: "RECORDING_FINALIZED", media: result?.media });
      setStatus("Video saved");
      if (exitAfter) {
        await stopBuiltInCamera();
        onExit();
      }
    } catch (error) {
      dispatch({ type: "ERROR", error: String(error?.message || error) });
      setStatus("Video could not be saved");
    } finally {
      setBusy(false);
    }
  }, [busy, onExit]);

  const executeCommand = useCallback(async (command) => {
    if (!command || busy) return;
    switch (command.type) {
      case "CAPTURE_PHOTO":
        setBusy(true);
        setStatus("Capturing");
        try {
          const result = await captureCameraPhoto();
          dispatch({ type: "RECORDING_FINALIZED", media: result?.media });
          setStatus(result?.media ? "Photo saved" : "Camera preview on Android");
        } catch {
          setStatus("Photo failed");
        } finally {
          setBusy(false);
        }
        break;
      case "START_VIDEO":
        setBusy(true);
        setStatus("Starting video");
        try {
          const result = await startCameraVideo({ audioEnabled: true });
          dispatch({ type: "RECORDING_STARTED" });
          setStatus(result?.audioEnabled === false ? "Recording muted" : "Recording");
        } catch {
          setStatus("Video unavailable");
        } finally {
          setBusy(false);
        }
        break;
      case "STOP_VIDEO":
        await stopRecording(false);
        break;
      case "STOP_VIDEO_AND_EXIT":
        await stopRecording(true);
        break;
      case "OPEN_GALLERY":
        await stopBuiltInCamera();
        dispatch({ type: "OPEN_GALLERY" });
        await loadGallery();
        break;
      case "BACK_TO_CAMERA":
        await hideCameraMedia();
        dispatch({ type: "BACK_TO_CAMERA" });
        setStatus("Starting camera");
        break;
      case "EXIT_CAMERA":
        await stopBuiltInCamera();
        onExit();
        break;
      case "TOGGLE_MODE": {
        const mode = state.mode === CAMERA_MODES.PHOTO ? CAMERA_MODES.VIDEO : CAMERA_MODES.PHOTO;
        await setCameraMode(mode);
        dispatch({ type: "SET_MODE", mode });
        setStatus(mode === CAMERA_MODES.PHOTO ? "Photo mode" : "Video mode");
        break;
      }
      case "SET_MODE": {
        await setCameraMode(command.mode);
        dispatch({ type: "SET_MODE", mode: command.mode });
        setStatus(command.mode === CAMERA_MODES.PHOTO ? "Photo mode" : "Video mode");
        break;
      }
      case "TOGGLE_GRID": {
        const enabled = !state.grid;
        await setCameraGrid(enabled);
        dispatch({ type: "TOGGLE_GRID" });
        break;
      }
      case "CYCLE_FLASH": {
        const flash = FLASH_MODES[(FLASH_MODES.indexOf(state.flash) + 1) % FLASH_MODES.length];
        await setCameraFlash(flash);
        dispatch({ type: "SET_FLASH", flash });
        setStatus(`Flash ${flash}`);
        break;
      }
      case "SWITCH_LENS": {
        const lens = state.lens === "back" ? "front" : "back";
        await setCameraLens(lens);
        dispatch({ type: "SET_LENS", lens });
        setStatus(`${lens} camera`);
        break;
      }
      case "MOVE_GALLERY": {
        if (!media.length) break;
        const delta = command.direction === "left" ? -1 : command.direction === "right" ? 1 : command.direction === "up" ? -3 : 3;
        setSelectedIndex((index) => (index + delta + media.length) % media.length);
        break;
      }
      case "OPEN_SELECTED_MEDIA": {
        const selected = media[selectedIndex];
        if (selected) dispatch({ type: "OPEN_VIEWER", media: selected });
        break;
      }
      case "BACK_TO_GALLERY":
        await hideCameraMedia();
        dispatch({ type: "BACK_TO_GALLERY" });
        break;
      case "TOGGLE_PLAYBACK":
        await controlCameraMedia("toggle");
        break;
      case "PREVIOUS_MEDIA":
      case "NEXT_MEDIA": {
        if (!media.length) break;
        const next = (selectedIndex + (command.type === "PREVIOUS_MEDIA" ? -1 : 1) + media.length) % media.length;
        setSelectedIndex(next);
        await hideCameraMedia();
        dispatch({ type: "OPEN_VIEWER", media: media[next] });
        break;
      }
      default:
        break;
    }
  }, [busy, loadGallery, media, onExit, selectedIndex, state.flash, state.grid, state.lens, state.mode, stopRecording]);

  const executeCommandRef = useRef(executeCommand);
  executeCommandRef.current = executeCommand;

  useEffect(() => {
    let listener;
    let disposed = false;
    addCameraControlListener(({ control }) => {
      executeCommandRef.current(getCameraTouchCommand(stateRef.current, control));
    }).then((handle) => {
      if (disposed) handle.remove();
      else listener = handle;
    }).catch(() => {});
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, []);

  useImperativeHandle(ref, () => ({
    handleKey: (key) => executeCommand(getCameraCommand(state, key)),
  }), [executeCommand, state]);

  if (state.view === CAMERA_VIEWS.GALLERY) {
    return (
      <div className="lcd-screen camera-screen camera-screen--gallery" data-testid="screen-camera-gallery">
        <CameraHeader title="Gallery" status={status} />
        <div className="camera-gallery">
          {media.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`camera-gallery__item ${index === selectedIndex ? "is-selected" : ""}`}
              onClick={() => { setSelectedIndex(index); dispatch({ type: "OPEN_VIEWER", media: item }); }}
            >
              {item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span>{item.type === "video" ? "▶" : "▧"}</span>}
              {item.type === "video" && <i>VIDEO</i>}
            </button>
          ))}
          {!media.length && <div className="camera-empty">No captures yet</div>}
        </div>
        <div className="camera-softkeys"><span>Camera</span><span>Select</span><span>Back</span></div>
      </div>
    );
  }

  if (state.view === CAMERA_VIEWS.VIEWER) {
    return (
      <div className="lcd-screen camera-screen camera-screen--viewer" data-testid="screen-camera-viewer">
        <CameraHeader title={state.selectedMedia?.type === "video" ? "Video" : "Photo"} status="Local capture" />
        <div ref={surfaceRef} className="camera-native-slot camera-native-slot--viewer" />
        <div className="camera-softkeys"><span>Previous</span><span>{state.selectedMedia?.type === "video" ? "Play" : "View"}</span><span>Back</span></div>
      </div>
    );
  }

  return (
    <div className="lcd-screen camera-screen" data-testid="screen-camera">
      <div ref={surfaceRef} className="camera-native-slot camera-native-slot--full" aria-label="Camera preview" />
    </div>
  );
});

const CameraHeader = ({ title, status, recording }) => (
  <div className="camera-header">
    <strong className={recording ? "is-recording" : ""}>{title}</strong>
    <small>{status}</small>
  </div>
);

CameraFeature.displayName = "CameraFeature";

export default CameraFeature;
