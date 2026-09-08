import {
  CONTROL_SURFACE_EVENTS,
  CONTROL_SURFACE_MODES,
  reduceControlSurface,
} from "./controlSurfaceState";

describe("control surface state", () => {
  test.each([
    ["TEXT_FOCUSED", "INPUT_TEXT"],
    ["NUMBER_FOCUSED", "INPUT_NUMBER"],
    ["SECURE_FOCUSED", "SECURE"],
    ["LANDSCAPE_ENTERED", "IMMERSIVE"],
    ["UNSUPPORTED_WINDOW", "UNSUPPORTED"],
    ["SERVICE_DISABLED", "HIDDEN"],
  ])("%s produces %s", (event, expected) => {
    expect(
      reduceControlSurface(
        CONTROL_SURFACE_MODES.NAVIGATION,
        CONTROL_SURFACE_EVENTS[event]
      )
    ).toBe(CONTROL_SURFACE_MODES[expected]);
  });

  it("returns to navigation after input only when the service is available", () => {
    expect(reduceControlSurface("INPUT_TEXT", "INPUT_FINISHED")).toBe("NAVIGATION");
    expect(reduceControlSurface("HIDDEN", "INPUT_FINISHED")).toBe("HIDDEN");
  });
});
