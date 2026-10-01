import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";
import * as api from "@/lib/launcherApps";

global.IS_REACT_ACT_ENVIRONMENT = true;
let root, container;
beforeEach(() => {
  localStorage.clear(); delete window.Capacitor;
  jest.spyOn(api, "getDeviceStatus").mockResolvedValue({});
  jest.spyOn(api, "getDeviceContacts").mockResolvedValue([{ id: "test-contact", name: "Device Contact", number: "123" }]);
  jest.spyOn(api, "getDeviceConversations").mockResolvedValue([{ id: "sms", threadId: "7", address: "123", contactName: "Device SMS", snippet: "Ready", date: 1 }]);
  jest.spyOn(api, "getDeviceNotificationConversations").mockReturnValue(new Promise(() => {}));
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.restoreAllMocks(); });
const mount = () => act(async () => root.render(<NokiaLauncher apps={[]} />));
test("built-in Contacts exists without an installed contacts app and loads when opened", async () => {
  await mount();
  expect(api.getDeviceContacts).not.toHaveBeenCalled();
  await act(async () => container.querySelector('[aria-label="Up"]').click());
  const contacts = container.querySelector('[data-testid="app-list-item-contacts"]');
  expect(contacts).not.toBeNull();
  await act(async () => contacts.click());
  expect(api.getDeviceContacts).toHaveBeenCalledWith(true);
  expect(container.textContent).toContain("Device Contact");
});
test("phone SMS renders even while the notification source has not completed", async () => {
  await mount();
  await act(async () => container.querySelector('[data-testid="home-menu-item-messages"]').click());
  expect(container.textContent).toContain("Device SMS");
});

test("a call waiting for native permission is not dispatched twice", async () => {
  let finishPermission;
  const call = jest.spyOn(api, "makePhoneCall").mockImplementation(() => new Promise(resolve => { finishPermission = resolve; }));
  await mount();
  await act(async () => container.querySelector('[aria-label="Up"]').click());
  await act(async () => container.querySelector('[data-testid="app-list-item-contacts"]').click());
  const button = Array.from(container.querySelectorAll('button')).find(el => el.textContent === 'Call');
  expect(button).toBeDefined();
  await act(async () => { button.click(); button.click(); });
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith("123");
  await act(async () => finishPermission());
});
