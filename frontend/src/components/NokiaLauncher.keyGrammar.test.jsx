import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";
import * as launcherApps from "@/lib/launcherApps";
import { BillingContext } from '@/features/billing/BillingContext';
import billingFixture from '@/features/billing/__fixtures__/billing-v1.json';

global.IS_REACT_ACT_ENVIRONMENT = true;

const mountLauncher = async (billing = null, apps = []) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<BillingContext.Provider value={billing}><NokiaLauncher apps={apps} /></BillingContext.Provider>));
  return { container, root };
};

const click = (container, selector) => act(() => container.querySelector(selector).click());

describe("contextual physical-key grammar", () => {
  test("drawer options capture D-pad Select and Back without opening the selected app", async () => {
    const app = { id: "org.example.app", name: "Example", packageName: "org.example.app" };
    const launch = jest.spyOn(launcherApps, "launchInstalledApp").mockResolvedValue({ launched: true });
    const remove = jest.spyOn(launcherApps, "openAppRemovalSettings").mockResolvedValue({ opened: true });
    const { container, root } = await mountLauncher(null, [app]);
    try {
      click(container, '[aria-label="Up"]');
      expect(container.querySelector('[data-testid="screen-menu"]')).not.toBeNull();
      const openOptions = () => act(() => container.querySelector('[data-testid="app-list-item-org.example.app"]')
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
      openOptions();
      expect(document.activeElement.textContent).toBe("Cancel");
      click(container, '[aria-label="Up"]');
      expect(document.activeElement.textContent).toBe("Delete app");
      await act(async () => container.querySelector('[data-testid="keypad-btn-select"]').click());
      expect(remove).toHaveBeenCalledWith(app);
      expect(launch).not.toHaveBeenCalled();
      expect(container.querySelector('[data-testid="drawer-options"]')).toBeNull();
      expect(container.querySelector('[data-testid="screen-menu"]')).not.toBeNull();
      openOptions();
      click(container, '[aria-label="Settings or Back"]');
      expect(container.querySelector('[data-testid="drawer-options"]')).toBeNull();
      expect(container.querySelector('[data-testid="screen-menu"]')).not.toBeNull();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(launch).not.toHaveBeenCalled();
    } finally { act(() => root.unmount()); }
  });
  test('enabled billing management opens in the existing frame and physical Back returns to Settings', async () => {
    const { container, root } = await mountLauncher({ billingView: { ...billingFixture,
      access: { full: true, sources: ['storeLifetime'] } }, onBillingView: jest.fn() });
    click(container, '[aria-label="Settings or Back"]');
    await act(async () => container.querySelector('[data-testid="settings-item-billing"]').click());
    expect(container.textContent).toContain('Lifetime purchase');
    expect(container.querySelectorAll('[data-testid="nokia-launcher"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="Google Play subscriptions address"]').value).toBe('https://play.google.com/store/account/subscriptions');
    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="settings-item-billing"]')).not.toBeNull();
    act(() => root.unmount());
  });
  beforeEach(() => {
    delete window.Capacitor;
    window.localStorage.clear();
    let now = 1_000;
    jest.spyOn(Date, "now").mockImplementation(() => {
      now += 100;
      return now;
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: jest.fn(),
    });
    jest.spyOn(launcherApps, "getDeviceStatus").mockResolvedValue({ batteryLevel: 80 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("soft keys mean Go to and Settings only on Home, then Delete and Back elsewhere", async () => {
    jest.spyOn(launcherApps, "startBuiltInBrowser").mockResolvedValue({ native: true });
    jest.spyOn(launcherApps, "stopBuiltInBrowser").mockResolvedValue({ stopped: true });
    const controlBrowser = jest.spyOn(launcherApps, "controlBuiltInBrowser").mockResolvedValue({ success: true });
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="settings-item-billing"]')).toBeNull();

    click(container, '[data-testid="keypad-btn-2"]');
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("a");
    click(container, '[aria-label="Go to or Delete"]');
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("Search");

    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-settings"]')).not.toBeNull();
    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

    click(container, '[aria-label="Go to or Delete"]');
    expect(container.querySelector('[data-testid="screen-browser"]')).not.toBeNull();
    controlBrowser.mockClear();

    click(container, '[aria-label="Go to or Delete"]');
    expect(controlBrowser).toHaveBeenCalledWith("backspace", {});
    click(container, '[aria-label="Settings or Back"]');
    expect(controlBrowser).toHaveBeenCalledWith("back", {});
    expect(container.querySelector('[data-testid="screen-browser"]')).not.toBeNull();

    act(() => root.unmount());
  });

  test("hash single press uppercases one word (Abc) and double press activates caps lock (ABC)", async () => {
    const { container, root } = await mountLauncher();

    click(container, '[data-testid="keypad-btn-hash"]');
    expect(container.querySelector('[data-testid="screen-dial"]')?.textContent).toContain("#");
    click(container, '[data-testid="keypad-btn-end"]');

    // Open settings search
    click(container, '[aria-label="Settings or Back"]');

    // Single press # -> Abc mode (uppercase one word)
    click(container, '[data-testid="keypad-btn-hash"]');
    // Press 2 -> preview "A", then press 3 -> commits "A", preview "d"
    click(container, '[data-testid="keypad-btn-2"]');
    click(container, '[data-testid="keypad-btn-3"]');
    // textContent should contain "Ad"
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("Ad");

    // Type space (key 0) -> ends word, reverts mode to lower "abc"
    click(container, '[data-testid="keypad-btn-0"]');
    // Next word starts lowercase: press 2 -> preview "a"
    click(container, '[data-testid="keypad-btn-2"]');
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("Ad a");

    // Clear search
    click(container, '[data-testid="keypad-btn-end"]');
    click(container, '[aria-label="Settings or Back"]');

    // Double press # within 600ms -> activates CAPS LOCK (ABC)
    click(container, '[data-testid="keypad-btn-hash"]');
    click(container, '[data-testid="keypad-btn-hash"]');
    // Press 2 then 3 -> both uppercase: "A", "D"
    click(container, '[data-testid="keypad-btn-2"]');
    click(container, '[data-testid="keypad-btn-3"]');
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("AD");

    act(() => root.unmount());
  });

  test("green key directly dials when dialing, and opens recent apps in menu/settings", async () => {
    const makePhoneCall = jest.spyOn(launcherApps, "makePhoneCall").mockResolvedValue({ called: true });
    const openRecentApps = jest.spyOn(launcherApps, "openRecentApps").mockResolvedValue({ success: true });
    const { container, root } = await mountLauncher();

    // In home/settings: green key opens recent apps
    click(container, '[data-testid="keypad-btn-tab"]');
    expect(openRecentApps).toHaveBeenCalled();
    expect(makePhoneCall).not.toHaveBeenCalled();

    // Now enter dial numbers
    click(container, '[data-testid="keypad-btn-1"]');
    click(container, '[data-testid="keypad-btn-2"]');
    click(container, '[data-testid="keypad-btn-3"]');
    expect(container.querySelector('[data-testid="screen-dial"]')?.textContent).toContain("123");

    // Green key in dial context triggers direct call
    click(container, '[data-testid="keypad-btn-tab"]');
    expect(makePhoneCall).toHaveBeenCalledWith("123");

    act(() => root.unmount());
  });

  test("soft right deletes dial digits when dialing", async () => {
    const { container, root } = await mountLauncher();

    click(container, '[data-testid="keypad-btn-9"]');
    click(container, '[data-testid="keypad-btn-8"]');
    expect(container.querySelector('[data-testid="screen-dial"]')?.textContent).toContain("98");

    // Soft Right is Delete in dial context
    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-dial"]')?.textContent).toContain("9");

    click(container, '[aria-label="Settings or Back"]');
    // Dial number emptied -> remains on dial screen (does not exit to home screen)
    expect(container.querySelector('[data-testid="screen-dial"]')).not.toBeNull();

    // Red END key returns to home screen
    click(container, '[data-testid="keypad-btn-end"]');
    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

    act(() => root.unmount());
  });

  test("pressing LEFT on home screen navigates shortcuts and does not open messages", async () => {
    const { container, root } = await mountLauncher();

    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

    // Press LEFT arrow key on home
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    });

    // Verify it stays on home screen, does NOT navigate to messages
    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="screen-messages"]')).toBeNull();

    act(() => root.unmount());
  });

  test("key 5 in messages opens conversation without activating search and typing in thread stays in composer", async () => {
    const mockConv = { id: "conv1", address: "123456", contactName: "Alice", snippet: "Hello there" };
    jest.spyOn(launcherApps, "getDeviceConversations").mockResolvedValue([mockConv]);
    jest.spyOn(launcherApps, "getDeviceThread").mockResolvedValue([
      { id: "m1", body: "Hello there", date: 1000, type: 1 },
      { id: "m2", body: "How are you?", date: 2000, type: 1 },
    ]);

    const { container, root } = await mountLauncher();

    // From Home, click Messages shortcut
    await act(async () => {
      click(container, '[data-testid="home-menu-item-messages"]');
    });

    // Wait for messages to load
    await act(async () => {});

    expect(container.querySelector('[data-testid="screen-messages"]')).not.toBeNull();

    // Press key 5 -> Should open selected conversation, NOT activate search!
    await act(async () => {
      click(container, '[data-testid="keypad-btn-5"]');
    });

    // Verify it opened message-thread
    expect(container.querySelector('[data-testid="screen-message-thread"]')).not.toBeNull();
    // Verify search is NOT active
    expect(container.querySelector('[data-search-active="true"]')).toBeNull();

    // Now type '4' in thread -> should type 'g' into the inline reply bar, NOT search
    await act(async () => {
      click(container, '[data-testid="keypad-btn-4"]');
    });

    expect(container.querySelector('.lcd-thread-composer-text')?.textContent).toContain("g");
    expect(container.querySelector('[data-testid="screen-message-thread"]')).not.toBeNull();

    act(() => root.unmount());
  });
});
