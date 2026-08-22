import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import SnakeFeature from "./SnakeFeature";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("SnakeFeature", () => {
  let container;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.useRealTimers();
  });

  test("selects a level, starts, pauses, and exits through the shared keypad seam", () => {
    const featureRef = createRef();
    const onExit = jest.fn();
    act(() => root.render(<SnakeFeature ref={featureRef} onExit={onExit} />));
    expect(container.textContent).toContain("Level 5");

    act(() => featureRef.current.handleKey("UP"));
    expect(container.textContent).toContain("Level 6");
    act(() => featureRef.current.handleKey("SELECT"));
    expect(container.textContent).toContain("RUNNING");
    act(() => featureRef.current.handleKey("5"));
    expect(container.textContent).toContain("PAUSED");
    act(() => featureRef.current.handleKey("END"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test("accepts numeric steering and pauses when the app becomes hidden", () => {
    const featureRef = createRef();
    act(() => root.render(<SnakeFeature ref={featureRef} onExit={() => {}} />));
    act(() => featureRef.current.handleKey("SEND"));
    act(() => featureRef.current.handleKey("2"));
    act(() => jest.advanceTimersByTime(240));
    expect(container.querySelector("canvas").getAttribute("aria-label")).toContain("status running");

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(container.textContent).toContain("PAUSED");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });
});
