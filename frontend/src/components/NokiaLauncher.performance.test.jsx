import { act } from "react";
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
