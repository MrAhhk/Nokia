import { act } from "react";
import { createRoot } from "react-dom/client";
import Screen from "./Screen";
global.IS_REACT_ACT_ENVIRONMENT = true;

describe("drawer app options", () => {
  let container, root, app, props;
  // React derives onPointerLeave from the browser's pointerout event.
  const pointer = (row, type) => row.dispatchEvent(new MouseEvent(type === "pointerleave" ? "pointerout" : type, { bubbles: true, button: 0 }));
  const button = label => [...container.querySelectorAll("button")].find(item => item.textContent === label);
  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    root = createRoot(container);
    app = { id: "example", name: "Example", packageName: "org.example.app" };
    props = { currentView: "menu", menuItems: [app], selectedIndex: 0, deviceStatus: {}, currentTime: new Date(), onAppClick: jest.fn(), onDeleteApp: jest.fn().mockResolvedValue({ opened: true }) };
    act(() => root.render(<Screen {...props} />));
  });
  afterEach(() => { act(() => root.unmount()); jest.useRealTimers(); });

  test("a hold opens options at 500ms without launching; the held click is suppressed", () => {
    const row = container.querySelector('[data-testid="app-list-item-example"]');
    act(() => pointer(row, "pointerdown"));
    act(() => jest.advanceTimersByTime(499));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    act(() => jest.advanceTimersByTime(1));
    expect(container.querySelector('[role="dialog"]').textContent).toContain("Example");
    act(() => { pointer(row, "pointerup"); row.click(); });
    expect(props.onAppClick).not.toHaveBeenCalled();
    act(() => button("Cancel").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onDeleteApp).not.toHaveBeenCalled();
  });

  test.each(["pointerup", "pointerleave", "pointercancel"])("%s cancels an unfinished hold", type => {
    const row = container.querySelector('[data-testid="app-list-item-example"]');
    act(() => pointer(row, "pointerdown"));
    act(() => jest.advanceTimersByTime(250));
    act(() => pointer(row, type));
    act(() => jest.advanceTimersByTime(500));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(props.onAppClick).not.toHaveBeenCalled();
  });

  test("leaving the drawer cancels its pending hold", () => {
    act(() => pointer(container.querySelector('[data-testid="app-list-item-example"]'), "pointerdown"));
    act(() => root.render(<Screen {...props} currentView="home" menuItems={[]} />));
    act(() => jest.advanceTimersByTime(500));
    act(() => root.render(<Screen {...props} />));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  test("context menu opens options and Delete app sends the exact app to the latest callback", async () => {
    const latestDelete = jest.fn().mockResolvedValue({ opened: true });
    act(() => root.render(<Screen {...props} onDeleteApp={latestDelete} />));
    act(() => container.querySelector('[data-testid="app-list-item-example"]')
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(props.onAppClick).not.toHaveBeenCalled();
    await act(async () => button("Delete app").click());
    expect(latestDelete).toHaveBeenCalledTimes(1);
    expect(latestDelete).toHaveBeenCalledWith(app);
    expect(props.onDeleteApp).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  test('a failed Android handoff stays visible inside the options menu', async () => {
    act(() => root.render(<Screen {...props} onDeleteApp={jest.fn().mockRejectedValue(Error('unavailable'))} />));
    act(() => container.querySelector('[data-testid="app-list-item-example"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    await act(async () => button('Delete app').click());
    expect(container.querySelector('[role=dialog] [role=alert]')?.textContent).toContain('Cannot open app settings');
    expect(button('Cancel')).toBeDefined();
  });

  test('repeated delete taps start only one pending Android handoff', async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const remove = jest.fn(() => pending);
    act(() => root.render(<Screen {...props} onDeleteApp={remove} />));
    act(() => container.querySelector('[data-testid="app-list-item-example"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    act(() => { button('Delete app').click(); button('Delete app').click(); });
    const count = remove.mock.calls.length;
    await act(async () => finish({ opened: true }));
    expect(count).toBe(1);
  });
});

test("drawer taps use the latest callback even when rows and selection stay unchanged", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  const app = { id: "example", name: "Example" };
  const props = { currentView: "menu", menuItems: [app], selectedIndex: 0, deviceStatus: {}, currentTime: new Date() };
  const oldClick = jest.fn();
  const newClick = jest.fn();
  try {
    act(() => root.render(<Screen {...props} onAppClick={oldClick} />));
    act(() => root.render(<Screen {...props} onAppClick={newClick} />));
    act(() => container.querySelector('[data-testid="app-list-item-example"]').click());
    expect(newClick).toHaveBeenCalledWith(app);
    expect(oldClick).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); }
});

test("leaving Home cancels an unfinished shortcut long press", () => {
  jest.useFakeTimers();
  const container = document.createElement("div");
  const root = createRoot(container);
  const onLongPress = jest.fn();
  const props = { currentTime: new Date(), deviceStatus: {}, selectedIndex: 0 };
  try {
    act(() => root.render(<Screen {...props} currentView="home"
      menuItems={[{ id: "phone", label: "Phone" }]} onAppLongPress={onLongPress} />));
    act(() => container.querySelector('[data-testid="home-menu-item-phone"]')
      .dispatchEvent(new Event("pointerdown", { bubbles: true })));
    act(() => root.render(<Screen {...props} currentView="menu" menuItems={[]} />));
    act(() => jest.advanceTimersByTime(500));
    expect(onLongPress).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); jest.useRealTimers(); }
});
