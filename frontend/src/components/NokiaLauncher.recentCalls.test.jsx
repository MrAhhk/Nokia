import { act } from "react";
import { createRoot } from "react-dom/client";
import NokiaLauncher from "./NokiaLauncher";
import * as launcherApps from "@/lib/launcherApps";

global.IS_REACT_ACT_ENVIRONMENT = true;

const mountLauncher = async (apps = []) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<NokiaLauncher apps={apps} />));
  return { container, root };
};

const click = (container, selector) => act(() => container.querySelector(selector).click());

describe("NokiaLauncher built-in Recent Calls", () => {
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

  test("pressing DOWN on homescreen opens built-in Recent Calls miniscreen", async () => {
    const { container, root } = await mountLauncher();

    // Verify currently on home screen
    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

    // Press D-pad DOWN
    click(container, '[aria-label="Down"]');

    // Should open recent-calls screen
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();
    expect(container.querySelector('.lcd-list-title')?.textContent).toBe("Recent Calls");

    // Check softkeys
    const softkeys = container.querySelector(".lcd-list-softkeys--recent-calls");
    expect(softkeys?.textContent).toContain("Delete");
    expect(softkeys?.textContent).toContain("Call");
    expect(softkeys?.textContent).toContain("Exit");

    act(() => root.unmount());
  });

  test("displays recent calls with indicators, contact names, numbers, SIM slot, and duration", async () => {
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    const callRows = container.querySelectorAll(".lcd-call-row");
    expect(callRows.length).toBeGreaterThanOrEqual(1);

    // First fallback call is missed call from An Na
    const firstRow = callRows[0];
    expect(firstRow.textContent).toContain("An Na");
    expect(firstRow.textContent).toContain("0915231765");
    expect(firstRow.textContent).toContain("✕");
    expect(firstRow.textContent).toContain("SIM 1");
    expect(firstRow.textContent).toContain("Missed");

    act(() => root.unmount());
  });

  test("pressing GREEN key or Call softkey makes a phone call to selected recent call", async () => {
    const makePhoneCallSpy = jest.spyOn(launcherApps, "makePhoneCall").mockResolvedValue({ called: true });
    const { container, root } = await mountLauncher();

    // Open recent calls
    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    // Press GREEN (Call) key
    click(container, '[aria-label="Call or Tab"]');
    expect(makePhoneCallSpy).toHaveBeenCalledWith("0915231765");

    act(() => root.unmount());
  });

  test("pressing Delete removes the selected recent call entry", async () => {
    const deleteRecentCallSpy = jest.spyOn(launcherApps, "deleteDeviceRecentCall").mockResolvedValue({ success: true });
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    const initialCount = container.querySelectorAll(".lcd-call-row").length;
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // Press Delete (Soft Left)
    await act(async () => container.querySelector('[aria-label="Go to or Delete"]').click());

    expect(deleteRecentCallSpy).toHaveBeenCalledWith("call_1");
    const newCount = container.querySelectorAll(".lcd-call-row").length;
    expect(newCount).toBe(initialCount - 1);

    act(() => root.unmount());
  });

  test("failed deletion leaves visible history intact", async () => {
    jest.spyOn(launcherApps, "deleteDeviceRecentCall").mockResolvedValue({ success: false });
    const { container, root } = await mountLauncher();
    click(container, '[aria-label="Down"]');
    const count = container.querySelectorAll(".lcd-call-row").length;
    await act(async () => container.querySelector('[aria-label="Go to or Delete"]').click());
    expect(container.querySelectorAll(".lcd-call-row")).toHaveLength(count);
    act(() => root.unmount());
  });

  test("pending native history never displays callable demo rows", async () => {
    window.Capacitor = { Plugins: { LauncherApps: {} } };
    jest.spyOn(launcherApps, "getDeviceRecentCalls").mockReturnValue(new Promise(() => {}));
    const { container, root } = await mountLauncher();
    click(container, '[aria-label="Down"]');
    expect(container.querySelectorAll(".lcd-call-row")).toHaveLength(0);
    act(() => root.unmount());
  });

  test("pressing Back / Exit returns to homescreen", async () => {
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    // Press Back (Soft Right)
    click(container, '[aria-label="Settings or Back"]');
    expect(container.querySelector('[data-testid="screen-home"]')).not.toBeNull();

    act(() => root.unmount());
  });

  test("built-in contacts is not deleted and remains accessible via app drawer", async () => {
    const { container, root } = await mountLauncher([
      { id: "contacts", name: "Contacts", category: "important" },
    ]);

    // Open menu (D-pad UP on home)
    click(container, '[aria-label="Up"]');
    expect(container.querySelector('[data-testid="screen-menu"]')).not.toBeNull();

    // Open Contacts from app drawer
    const contactsItem = container.querySelector('[data-testid="app-list-item-contacts"]');
    expect(contactsItem).not.toBeNull();
    act(() => contactsItem.click());

    // Contacts screen is intact and accessible!
    expect(container.querySelector('[data-testid="screen-contacts"]')).not.toBeNull();
    expect(container.querySelector('.lcd-list-title')?.textContent).toBe("Contacts");

    act(() => root.unmount());
  });

  test("typing digits filters recent calls by search query", async () => {
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    // Type '2' -> 'a' in multi-tap
    click(container, '[data-testid="keypad-btn-2"]');
    expect(container.querySelector(".lcd-list-search")?.textContent).toContain("a");

    // Rows should be filtered
    const filteredRows = container.querySelectorAll(".lcd-call-row");
    expect(filteredRows.length).toBeGreaterThan(0);
    expect(filteredRows[0].textContent).toContain("An Na");

    act(() => root.unmount());
  });

  test("clicking the on-screen Delete softkey button removes the selected recent call", async () => {
    const deleteRecentCallSpy = jest.spyOn(launcherApps, "deleteDeviceRecentCall").mockResolvedValue({ success: true });
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    const initialCount = container.querySelectorAll(".lcd-call-row").length;
    const deleteSoftkey = container.querySelector('.lcd-list-softkeys--recent-calls button');
    expect(deleteSoftkey.textContent).toBe("Delete");

    await act(async () => {
      deleteSoftkey.click();
    });

    expect(deleteRecentCallSpy).toHaveBeenCalledWith("call_1");
    const newCount = container.querySelectorAll(".lcd-call-row").length;
    expect(newCount).toBe(initialCount - 1);

    act(() => root.unmount());
  });

  test("deleting the last item properly clamps selectedIndex without error", async () => {
    jest.spyOn(launcherApps, "deleteDeviceRecentCall").mockResolvedValue({ success: true });
    const { container, root } = await mountLauncher();

    click(container, '[aria-label="Down"]');
    expect(container.querySelector('[data-testid="screen-recent-calls"]')).not.toBeNull();

    const count = container.querySelectorAll(".lcd-call-row").length;
    // Navigate down to the last item
    for (let i = 0; i < count - 1; i++) {
      click(container, '[aria-label="Down"]');
    }

    // Delete the last item via Soft Left key
    await act(async () => container.querySelector('[aria-label="Go to or Delete"]').click());

    const updatedRows = container.querySelectorAll(".lcd-call-row");
    expect(updatedRows.length).toBe(count - 1);
    // The newly selected row should be the new last item and have is-selected class
    const selectedRow = container.querySelector(".lcd-call-row.is-selected");
    expect(selectedRow).not.toBeNull();

    act(() => root.unmount());
  });
});
