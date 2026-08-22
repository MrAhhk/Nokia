import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  addBrowserStateListener,
  controlBuiltInBrowser,
  startBuiltInBrowser,
  stopBuiltInBrowser,
  updateBrowserSurfaceBounds,
} from "../../lib/launcherApps";
import { BROWSER_START_URL } from "./browserAddress";
import { createBrowserKeypadController } from "./browserKeypad";
import "./browser.css";

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

const BrowserFeature = forwardRef(({ initialUrl = BROWSER_START_URL, onExit }, ref) => {
  const surfaceRef = useRef(null);
  const initialUrlRef = useRef(initialUrl);
  const onExitRef = useRef(onExit);
  const keypadControllerRef = useRef(null);
  const [nativeReady, setNativeReady] = useState(true);
  onExitRef.current = onExit;

  if (keypadControllerRef.current === null) {
    keypadControllerRef.current = createBrowserKeypadController({
      send: (command, options) => controlBuiltInBrowser(command, options).catch((error) =>
        console.warn(`Browser command ${command} failed:`, error)
      ),
      onExit: () => {
        stopBuiltInBrowser().catch(() => {}).finally(() => onExitRef.current());
      },
    });
  }

  const startBrowser = useCallback(async () => {
    const bounds = getNativeBounds(surfaceRef.current);
    if (!bounds) return;
    try {
      const result = await startBuiltInBrowser({ ...bounds, url: initialUrlRef.current });
      setNativeReady(result?.native !== false);
    } catch (error) {
      console.error("Built-in browser unavailable:", error);
      setNativeReady(false);
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(startBrowser);
    return () => {
      cancelAnimationFrame(frame);
      stopBuiltInBrowser().catch(() => {});
    };
  }, [startBrowser]);

  useEffect(() => () => keypadControllerRef.current?.dispose(), []);

  useEffect(() => {
    const updateBounds = () => {
      const bounds = getNativeBounds(surfaceRef.current);
      if (bounds) updateBrowserSurfaceBounds(bounds).catch(() => {});
    };
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateBounds);
    if (surfaceRef.current) observer?.observe(surfaceRef.current);
    window.addEventListener("resize", updateBounds);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateBounds);
    };
  }, []);

  useEffect(() => {
    let listener;
    let disposed = false;
    addBrowserStateListener(({ event }) => {
      if (event === "closed") onExit();
    }).then((handle) => {
      if (disposed) handle.remove();
      else listener = handle;
    }).catch(() => {});
    return () => {
      disposed = true;
      listener?.remove();
    };
  }, [onExit]);

  const handleKey = useCallback((key) => {
    keypadControllerRef.current?.handleKey(key);
  }, []);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  return (
    <div className="lcd-screen browser-screen" data-testid="screen-browser">
      <div
        ref={surfaceRef}
        className="browser-native-slot"
        aria-label="Built-in browser surface"
      >
        {!nativeReady && (
          <div className="browser-native-slot__fallback">
            Built-in browser is available in the Android app.
          </div>
        )}
      </div>
    </div>
  );
});

BrowserFeature.displayName = "BrowserFeature";

export default BrowserFeature;
