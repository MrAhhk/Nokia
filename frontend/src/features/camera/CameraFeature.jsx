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
import MiniscreenClock from '@/components/MiniscreenClock';

const FLASH_MODES = ["off", "auto", "on"];
const GALLERY_COLUMNS = 2;

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

const CameraFeature = forwardRef(({ onExit, currentTime }, ref) => {
  const [state, dispatch] = useReducer(reduceCameraState, undefined, createCameraState);
  const [media, setMedia] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState("Starting camera");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const galleryRequest = useRef(0);
  const [galleryStatus, setGalleryStatus] = useState('idle');
  const [viewerError, setViewerError] = useState(false);
  const [viewerAttempt, setViewerAttempt] = useState(0);
  const surfaceRef = useRef(null);
  const galleryRef = useRef(null);
  const cameraConfigRef = useRef({ lens: state.lens, mode: state.mode, grid: state.grid });
  const stateRef = useRef(state);
  cameraConfigRef.current = { lens: state.lens, mode: state.mode, grid: state.grid };
  stateRef.current = state;

  const startPreview = useCallback(async () => {
    const bounds = getNativeBounds(surfaceRef.current);
    if (!bounds) return;
    dispatch({ type: "CLEAR_ERROR" });
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      galleryRequest.current += 1;
      stopBuiltInCamera().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (stateRef.current.recording) {
          dispatch({ type: "RECORDING_STOPPING" });
          stopCameraVideo()
            .then((result) => dispatch({ type: "RECORDING_FINALIZED", media: result?.media }))
            .catch((error) => dispatch({ type: "ERROR", error: String(error?.message || error) }))
            .finally(() => stopBuiltInCamera().catch(() => {}));
        } else {
          stopBuiltInCamera().catch(() => {});
        }
        return;
      }
      if (stateRef.current.view === CAMERA_VIEWS.CAMERA) {
        requestAnimationFrame(startPreview);
      } else if (stateRef.current.view === CAMERA_VIEWS.VIEWER) {
        setViewerAttempt(attempt => attempt + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [startPreview]);

  useEffect(() => {
    if (state.view !== CAMERA_VIEWS.VIEWER || !state.selectedMedia) return undefined;
    let disposed = false;
    setViewerError(false);
    const frame = requestAnimationFrame(() => {
      const bounds = getNativeBounds(surfaceRef.current);
      if (bounds) showCameraMedia({ ...state.selectedMedia, ...bounds }).catch(() => {
        if (!disposed) setViewerError(true);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      disposed = true;
      hideCameraMedia().catch(() => {});
    };
  }, [state.view, state.selectedMedia, viewerAttempt]);

  const loadGallery = useCallback(async () => {
    const request = ++galleryRequest.current;
    setGalleryStatus('loading');
    setStatus("Loading gallery");
    try {
      const result = await listCameraMedia({ limit: 60 });
      if (!mountedRef.current || request !== galleryRequest.current) return;
      const nextMedia = Array.isArray(result?.media) ? result.media : [];
      setMedia(nextMedia);
      setSelectedIndex((index) => Math.min(index, Math.max(0, nextMedia.length - 1)));
      setStatus(nextMedia.length ? `${nextMedia.length} local items` : "No captures yet");
      setGalleryStatus('ready');
    } catch {
      if (!mountedRef.current || request !== galleryRequest.current) return;
      setMedia([]);
      setStatus("Gallery unavailable");
      setGalleryStatus('error');
    }
  }, []);

  useEffect(() => {
    if (state.view !== CAMERA_VIEWS.GALLERY) return;
    const list = galleryRef.current;
    const item = list?.querySelector('[aria-current="true"]');
    if (!item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + item.offsetHeight - list.clientHeight;
    }
  }, [selectedIndex, state.view, media.length]);

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
    if (!command || busyRef.current) return;
    busyRef.current = true;
    try {
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
        // Listing must not trap the user in a loading screen.
        void loadGallery();
        break;
      case "BACK_TO_CAMERA":
        galleryRequest.current += 1;
        await hideCameraMedia();
        dispatch({ type: "BACK_TO_CAMERA" });
        setStatus("Starting camera");
        break;
      case "EXIT_CAMERA":
        galleryRequest.current += 1;
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
        if (!media.length || galleryStatus !== 'ready') break;
        setSelectedIndex((index) => {
          if (command.direction === "left" || command.direction === "right") {
            const delta = command.direction === "left" ? -1 : 1;
            return (index + delta + media.length) % media.length;
          }
          const column = index % GALLERY_COLUMNS;
          const rowsInColumn = Math.ceil((media.length - column) / GALLERY_COLUMNS);
          const row = Math.floor(index / GALLERY_COLUMNS);
          const delta = command.direction === "up" ? -1 : 1;
          return ((row + delta + rowsInColumn) % rowsInColumn) * GALLERY_COLUMNS + column;
        });
        break;
      }
      case "OPEN_SELECTED_MEDIA": {
        if (galleryStatus !== 'ready') break;
        const selected = media[selectedIndex];
        if (selected) dispatch({ type: "OPEN_VIEWER", media: selected });
        break;
      }
      case "BACK_TO_GALLERY":
        await hideCameraMedia();
        dispatch({ type: "BACK_TO_GALLERY" });
        break;
      case "TOGGLE_PLAYBACK":
        if (state.selectedMedia?.type === 'video') await controlCameraMedia("toggle");
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
    } catch {
      setStatus('Camera action unavailable');
      if (state.view === CAMERA_VIEWS.VIEWER) setViewerError(true);
      else if (state.view === CAMERA_VIEWS.CAMERA) dispatch({ type: 'ERROR', error: 'camera_action_failed' });
    } finally {
      busyRef.current = false;
    }
  }, [galleryStatus, loadGallery, media, onExit, selectedIndex, state.flash, state.grid, state.lens, state.mode, state.selectedMedia, state.view, stopRecording]);

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
        <MiniscreenClock currentTime={currentTime} />
        <CameraHeader hideClock title="Gallery" status={media.length ? `${selectedIndex + 1} / ${media.length}` : "On this phone"} />
        <div ref={galleryRef} className="camera-gallery" aria-label="Local photos and videos">
          {media.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={`camera-gallery__item ${index === selectedIndex ? "is-selected" : ""}`}
              aria-current={index === selectedIndex ? "true" : undefined}
              aria-label={`Open ${item.type === "video" ? "video" : "photo"} ${index + 1}`}
              disabled={galleryStatus === 'loading'}
              onClick={() => { setSelectedIndex(index); dispatch({ type: "OPEN_VIEWER", media: item }); }}
            >
              <span className="camera-gallery__image"><span aria-hidden="true">{item.type === "video" ? "▶" : "▧"}</span>{item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />}{item.type === 'video' && <span className="camera-gallery__video" aria-hidden="true">▶</span>}</span>
              <span className="camera-gallery__caption"><strong>{item.type === "video" ? "Video" : "Photo"} {index + 1}</strong><span aria-hidden="true">{index === selectedIndex ? "↗" : ""}</span></span>
            </button>
          ))}
          {galleryStatus === 'loading' && <div className="camera-empty" role="status"><strong>Loading gallery</strong><p>Your photos stay on this phone.</p></div>}
          {galleryStatus === 'error' && <div className="camera-empty" role="alert"><strong>Gallery unavailable</strong><p>Could not load your photos and videos.</p><button type="button" onClick={loadGallery}>Try again</button></div>}
          {galleryStatus === 'ready' && !media.length && <div className="camera-empty"><span aria-hidden="true">▧</span><strong>No photos yet</strong><p>Photos and videos taken with Camera appear here.</p><button type="button" onClick={() => executeCommand({ type: "BACK_TO_CAMERA" })}>Open camera</button></div>}
        </div>
        <div className="camera-softkeys"><button type="button" onClick={() => executeCommand({ type: "BACK_TO_CAMERA" })}>Camera</button><button type="button" disabled={!media.length || galleryStatus !== 'ready'} onClick={() => executeCommand({ type: "OPEN_SELECTED_MEDIA" })}>Open</button><button type="button" onClick={() => executeCommand({ type: "EXIT_CAMERA" })}>Exit</button></div>
      </div>
    );
  }

  if (state.view === CAMERA_VIEWS.VIEWER) {
    return (
      <div className="lcd-screen camera-screen camera-screen--viewer" data-testid="screen-camera-viewer">
        <MiniscreenClock currentTime={currentTime} />
        <div className="camera-viewer-heading"><CameraHeader hideClock title={state.selectedMedia?.type === "video" ? "Video" : "Photo"} status={`${selectedIndex + 1} / ${media.length}`} />{state.selectedMedia?.type === 'video' && <button type="button" className="camera-viewer-next" disabled={media.length < 2} onClick={() => executeCommand({ type: 'NEXT_MEDIA' })}>Next</button>}</div>
        <div ref={surfaceRef} className="camera-native-slot camera-native-slot--viewer">
          {viewerError ? <div className="camera-viewer-error" role="alert"><strong>Cannot open {state.selectedMedia?.type === 'video' ? 'video' : 'photo'}</strong><p>The file may have been moved or removed.</p><button type="button" onClick={() => setViewerAttempt(attempt => attempt + 1)}>Try again</button></div> : state.selectedMedia?.thumbnail && <img className="camera-viewer-fallback" src={state.selectedMedia.thumbnail} alt="Selected capture" />}
        </div>
        <div className="camera-softkeys"><button type="button" disabled={media.length < 2} onClick={() => executeCommand({ type: 'PREVIOUS_MEDIA' })}>Previous</button><button type="button" disabled={state.selectedMedia?.type === 'video' ? viewerError : media.length < 2} onClick={() => executeCommand({ type: state.selectedMedia?.type === 'video' ? 'TOGGLE_PLAYBACK' : 'NEXT_MEDIA' })}>{state.selectedMedia?.type === 'video' ? 'Play / pause' : 'Next'}</button><button type="button" onClick={() => executeCommand({ type: 'BACK_TO_GALLERY' })}>Back</button></div>
      </div>
    );
  }

  return (
    <div className={`lcd-screen camera-screen ${state.error || status === "Camera preview on Android" ? "camera-screen--unavailable" : ""}`} data-testid="screen-camera">
      <div ref={surfaceRef} className="camera-native-slot camera-native-slot--full" aria-label="Camera preview" />
      {(state.error || status === "Camera preview on Android") && <div className="camera-unavailable">
        <CameraHeader currentTime={currentTime} title="Camera" status="Preview" />
        <div role="status"><h2>{status}</h2><p>{status === "Camera preview on Android" ? "Open the Android app to take photos and videos." : "Check camera access in Android settings, then try again."}</p></div>
        <div className="camera-unavailable__actions"><button type="button" onClick={startPreview}>Try again</button><button type="button" onClick={() => executeCommand({ type: "EXIT_CAMERA" })}>Back</button></div>
      </div>}
    </div>
  );
});

const CameraHeader = ({ title, status, recording, currentTime, hideClock = false }) => (
  <div className="camera-header">
    <strong className={recording ? "is-recording" : ""}>{title}</strong>
    <div className="camera-header-meta">{!hideClock && <MiniscreenClock currentTime={currentTime} />}<small>{status}</small></div>
  </div>
);

CameraFeature.displayName = "CameraFeature";

export default CameraFeature;
