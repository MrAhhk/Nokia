import {
  captureCameraPhoto,
  listCameraMedia,
  setCameraFlash,
  setCameraLens,
  setCameraMode,
  setCameraGrid,
  showCameraMedia,
  startBuiltInCamera,
  startCameraVideo,
  stopBuiltInCamera,
  stopCameraVideo,
  updateCameraSurfaceBounds,
  controlCameraMedia,
  hideCameraMedia,
  addCameraControlListener,
} from "./launcherApps";

describe("built-in camera bridge", () => {
  beforeEach(() => {
    window.Capacitor = {
      Plugins: {
        LauncherApps: {
          startCamera: jest.fn().mockResolvedValue({ sessionId: "camera-1" }),
          capturePhoto: jest.fn().mockResolvedValue({ media: { id: "photo-1" } }),
          startVideo: jest.fn().mockResolvedValue({ recording: true }),
          stopVideo: jest.fn().mockResolvedValue({ media: { id: "video-1" } }),
          stopCamera: jest.fn().mockResolvedValue({ stopped: true }),
          listCameraMedia: jest.fn().mockResolvedValue({ media: [] }),
          setCameraFlash: jest.fn().mockResolvedValue({ mode: "auto" }),
          setCameraLens: jest.fn().mockResolvedValue({ lens: "front" }),
          setCameraMode: jest.fn().mockResolvedValue({ mode: "video" }),
          setCameraGrid: jest.fn().mockResolvedValue({ enabled: false }),
          updateCameraSurfaceBounds: jest.fn().mockResolvedValue({ updated: true }),
          showCameraMedia: jest.fn().mockResolvedValue({ shown: true }),
          controlCameraMedia: jest.fn().mockResolvedValue({ controlled: true }),
          hideCameraMedia: jest.fn().mockResolvedValue({ hidden: true }),
          addListener: jest.fn().mockResolvedValue({ remove: jest.fn() }),
        },
      },
    };
  });

  test("forwards camera controls and internal media surface calls", async () => {
    await expect(setCameraFlash("auto")).resolves.toEqual({ mode: "auto" });
    await expect(setCameraLens("front")).resolves.toEqual({ lens: "front" });
    await expect(setCameraMode("video")).resolves.toEqual({ mode: "video" });
    await expect(setCameraGrid(false)).resolves.toEqual({ enabled: false });
    await expect(updateCameraSurfaceBounds({ x: 1, y: 2, width: 3, height: 4 })).resolves.toEqual({ updated: true });
    await expect(showCameraMedia({ uri: "content://photo", type: "photo" })).resolves.toEqual({ shown: true });
    await expect(controlCameraMedia("toggle")).resolves.toEqual({ controlled: true });
    await expect(hideCameraMedia()).resolves.toEqual({ hidden: true });
  });

  afterEach(() => {
    delete window.Capacitor;
  });

  test("forwards camera lifecycle and capture calls through LauncherApps", async () => {
    await expect(startBuiltInCamera({ lens: "back", mode: "photo" })).resolves.toEqual({ sessionId: "camera-1" });
    await expect(captureCameraPhoto()).resolves.toEqual({ media: { id: "photo-1" } });
    await expect(startCameraVideo({ audioEnabled: true })).resolves.toEqual({ recording: true });
    await expect(stopCameraVideo()).resolves.toEqual({ media: { id: "video-1" } });
    await expect(stopBuiltInCamera()).resolves.toEqual({ stopped: true });
  });

  test("returns an empty local gallery in browser fallback", async () => {
    delete window.Capacitor;
    await expect(listCameraMedia()).resolves.toEqual({ media: [] });
  });

  test("subscribes to native camera touch controls with a removable fallback", async () => {
    const handler = jest.fn();
    const handle = await addCameraControlListener(handler);
    expect(window.Capacitor.Plugins.LauncherApps.addListener).toHaveBeenCalledWith("cameraControl", handler);
    expect(handle.remove).toEqual(expect.any(Function));

    delete window.Capacitor;
    const fallback = await addCameraControlListener(handler);
    await expect(fallback.remove()).resolves.toBeUndefined();
  });
});
