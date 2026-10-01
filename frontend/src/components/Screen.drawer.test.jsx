import { act } from "react";
import { createRoot } from "react-dom/client";
import Screen from "./Screen";
global.IS_REACT_ACT_ENVIRONMENT = true;

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
