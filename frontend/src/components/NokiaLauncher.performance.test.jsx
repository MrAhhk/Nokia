import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";
import * as launcherApps from "@/lib/launcherApps";

global.IS_REACT_ACT_ENVIRONMENT = true;

const mountLauncher = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<NokiaLauncher apps={[]} />));
  return { container, root };
};

describe("launcher lifecycle performance", () => {
  test("hidden Home does not render minute updates and refreshes on return", async () => {
    jest.useFakeTimers();
    let visibility = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
    const container = document.createElement("div");
    const root = createRoot(container);
    const render = jest.fn();
    try {
      await act(async () => root.render(<Profiler id="home" onRender={render}><NokiaLauncher apps={[]} /></Profiler>));
      act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
      render.mockClear();
      act(() => jest.advanceTimersByTime(120000));
      expect(render).not.toHaveBeenCalled();
      await act(async () => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
      expect(render).toHaveBeenCalled();
    } finally { act(() => root.unmount()); }
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  test("does not poll native device status while the visible launcher is idle", async () => {
    jest.useFakeTimers();
    const getDeviceStatus = jest
      .spyOn(launcherApps, "getDeviceStatus")
      .mockResolvedValue({ batteryLevel: 80 });
    const { root } = await mountLauncher();

    await act(async () => jest.advanceTimersByTime(30_000));

    expect(getDeviceStatus).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  test("returning Home does not block on another native status snapshot", async () => {
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const getDeviceStatus = jest
      .spyOn(launcherApps, "getDeviceStatus")
      .mockResolvedValue({ batteryLevel: 80 });
    const { root } = await mountLauncher();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(getDeviceStatus).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  test("coalesces focus and visibility without querying providers on idle Home", async () => {
    let visibilityState = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
    const getConversations = jest.spyOn(launcherApps, "getDeviceConversations").mockResolvedValue([]);
    const getRecentCalls = jest.spyOn(launcherApps, "getDeviceRecentCalls").mockResolvedValue([]);
    const { root } = await mountLauncher();

    expect(getConversations).toHaveBeenCalledTimes(1);
    expect(getRecentCalls).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      visibilityState = "visible";
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(getConversations).toHaveBeenCalledTimes(1);
    expect(getRecentCalls).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  test("coalesces focus and visibility into one refresh for the visible provider screen", async () => {
    let visibilityState = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibilityState);
    jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
    const getRecentCalls = jest.spyOn(launcherApps, "getDeviceRecentCalls").mockResolvedValue([]);
    const { container, root } = await mountLauncher();

    act(() => container.querySelector('[aria-label="Down"]').click());
    await act(async () => Promise.resolve());
    const callsBeforeResume = getRecentCalls.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      visibilityState = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
      visibilityState = "visible";
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(getRecentCalls).toHaveBeenCalledTimes(callsBeforeResume + 1);
    expect(getRecentCalls).toHaveBeenLastCalledWith(true);
    act(() => root.unmount());
  });

  test("a native Home request exits a feature and restores the launcher", async () => {
    jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
    jest.spyOn(launcherApps, "startBuiltInBrowser").mockResolvedValue({ native: true });
    jest.spyOn(launcherApps, "stopBuiltInBrowser").mockResolvedValue({ stopped: true });
    const { container, root } = await mountLauncher();

    act(() => container.querySelector('[aria-label="Open built-in browser"]').click());
    expect(container.querySelector('[data-testid="screen-browser"]')).not.toBeNull();

    act(() => window.dispatchEvent(new Event("nokia-home-request")));

    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
    act(() => root.unmount());
  });
});
