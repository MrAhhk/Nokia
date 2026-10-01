import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";
import * as launcherApps from "@/lib/launcherApps";

global.IS_REACT_ACT_ENVIRONMENT = true;

test("opens Snake from Settings, returns with Back, and red always returns Home", async () => {
  jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  HTMLCanvasElement.prototype.getContext = jest.fn(() => null);

  await act(async () => root.render(<NokiaLauncher apps={[]} />));
  act(() => [...container.querySelectorAll('.lcd-softkeys button')].find(button => button.textContent === 'Settings').click());
  expect(container.querySelector('[data-testid="settings-item-snake"]')).not.toBeNull();

  act(() => container.querySelector('[data-testid="settings-item-snake"]').click());
  expect(container.querySelector('[data-testid="screen-snake"]')).not.toBeNull();

  act(() => container.querySelector('[aria-label="Up"]').click());
  expect(container.querySelector('[data-testid="screen-snake"]')).not.toBeNull();
  act(() => [...container.querySelectorAll('.snake-softkeys button')].find(button => button.textContent === 'Back').click());
  expect(container.querySelector('[data-testid="screen-settings"]')).not.toBeNull();
  act(() => container.querySelector('[data-testid="keypad-btn-end"]').click());
  expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

  act(() => root.unmount());
  container.remove();
});
