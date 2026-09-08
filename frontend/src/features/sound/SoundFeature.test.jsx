import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import SoundFeature from "./SoundFeature";
import { _resetAudioContext } from "./nokiaAudioEngine";

global.IS_REACT_ACT_ENVIRONMENT = true;

describe("SoundFeature", () => {
  let container;
  let root;
  let mockAudioContext;

  beforeEach(() => {
    _resetAudioContext();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mockAudioContext = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      createGain: jest.fn(() => ({
        gain: {
          setValueAtTime: jest.fn(),
          exponentialRampToValueAtTime: jest.fn(),
        },
        connect: jest.fn(),
        disconnect: jest.fn(),
      })),
      createOscillator: jest.fn(() => ({
        frequency: { setValueAtTime: jest.fn() },
        type: "sine",
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
      })),
    };
    window.AudioContext = jest.fn(() => mockAudioContext);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    _resetAudioContext();
  });

  test("renders sound settings list with all sections and handles keypad navigation", async () => {
    const featureRef = createRef();
    const onExit = jest.fn();

    await act(async () => root.render(<SoundFeature ref={featureRef} onExit={onExit} />));

    expect(container.textContent).toContain("Sound");
    expect(container.textContent).toContain("Ringtone");
    expect(container.textContent).toContain("Ringing volume");
    expect(container.textContent).toContain("Keypad tones");
    expect(container.textContent).toContain("Message alert");
    expect(container.textContent).toContain("Alarm tone");
    expect(container.textContent).toContain("Nokia 3310 Remaster");

    // Move DOWN to Ringing volume
    act(() => featureRef.current.handleKey("DOWN"));
    const volumeRow = container.querySelector('[data-testid="sound-row-volume"]');
    expect(volumeRow.classList.contains("is-selected")).toBe(true);

    // Press RIGHT to change volume
    act(() => featureRef.current.handleKey("RIGHT"));
    expect(volumeRow.textContent).toContain("Level 5");

    // Move UP back to Ringtone
    act(() => featureRef.current.handleKey("UP"));
    const ringtoneRow = container.querySelector('[data-testid="sound-row-ringtone"]');
    expect(ringtoneRow.classList.contains("is-selected")).toBe(true);

    // Press RIGHT to cycle ringtone
    act(() => featureRef.current.handleKey("RIGHT"));
    expect(ringtoneRow.textContent).toContain("Nokia tune");

    // Click row directly
    act(() => {
      ringtoneRow.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(ringtoneRow.textContent).toContain("Ring ring");

    // Press the white Back key to exit this surface.
    act(() => featureRef.current.handleKey("BACK"));
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
