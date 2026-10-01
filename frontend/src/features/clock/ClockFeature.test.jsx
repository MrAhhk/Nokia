import { renderToStaticMarkup } from "react-dom/server";
import { act, Profiler } from "react";
import { createRoot } from "react-dom/client";
import ClockFeature from "./ClockFeature";
import { playAlarmTone } from "@/features/sound/nokiaAudioEngine";

jest.mock("@/features/sound/nokiaAudioEngine", () => ({ playAlarmTone: jest.fn() }));
global.IS_REACT_ACT_ENVIRONMENT = true;

describe("clock background work", () => {
  let visibility, container, root;
  beforeEach(() => {
    jest.useFakeTimers();
    visibility = "visible";
    jest.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    localStorage.clear();
    container = document.createElement("div"); root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    jest.restoreAllMocks(); jest.useRealTimers(); jest.clearAllMocks(); localStorage.clear();
  });
  test("hidden clock stops rendering and catches up immediately when visible", () => {
    const render = jest.fn();
    act(() => root.render(<Profiler id="clock" onRender={render}><ClockFeature /></Profiler>));
    act(() => { visibility = "hidden"; document.dispatchEvent(new Event("visibilitychange")); });
    render.mockClear();
    act(() => jest.advanceTimersByTime(10000));
    expect(render).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(render).toHaveBeenCalled();
  });
  test("a hidden timer retains one deadline and rings once without UI polling", () => {
    visibility = "hidden";
    localStorage.setItem("nokia-launcher-clock-runtime", JSON.stringify({timerRunning:true,timerDeadline:Date.now()+60000}));
    act(() => root.render(<ClockFeature />));
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(60001));
    expect(playAlarmTone).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    act(() => { visibility = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
    expect(playAlarmTone).toHaveBeenCalledTimes(1);
  });
});

test("renders a finite touch-accessible clock with timer and stopwatch modes", () => {
  const markup = renderToStaticMarkup(<ClockFeature onExit={() => {}} />);

  expect(markup).toContain('data-testid="screen-clock"');
  expect(markup).toContain("Clock");
  expect(markup).toContain("Timer");
  expect(markup).toContain("Stopwatch");
  expect(markup).toContain("Back");
  expect(markup).toMatch(
    /class="clock-readout__clock"[\s\S]*class="clock-readout__time"[\s\S]*class="clock-readout__seconds"/
  );
});
