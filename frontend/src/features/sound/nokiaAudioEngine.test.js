import {
  playTone,
  playKeypadTone,
  playNotificationTone,
  playRingtone,
  playAlarmTone,
  playBuffer,
  preloadSound,
  preloadAllSounds,
  stopAllSounds,
  pauseAudioEngine,
  _resetAudioContext,
} from "./nokiaAudioEngine";
import {
  KEYPAD_TONE_TYPES,
  MESSAGE_ALERT_TYPES,
  RINGTONE_TYPES,
  ALARM_TONE_TYPES,
} from "./soundConfig";

describe("nokiaAudioEngine", () => {
  const originalFetch = global.fetch;
  let mockAudioContext;
  let createdOscillators;
  let createdGainNodes;
  let createdBufferSources;

  beforeEach(() => {
    global.fetch = undefined;
    _resetAudioContext();
    createdOscillators = [];
    createdGainNodes = [];
    createdBufferSources = [];

    mockAudioContext = {
      state: "running",
      currentTime: 0,
      destination: {},
      resume: jest.fn().mockResolvedValue(undefined),
      decodeAudioData: jest.fn((buffer, success) => success({ duration: 1.0 })),
      createGain: jest.fn(() => {
        const gain = {
          gain: {
            setValueAtTime: jest.fn(),
            exponentialRampToValueAtTime: jest.fn(),
            linearRampToValueAtTime: jest.fn(),
            value: 1,
          },
          connect: jest.fn(),
          disconnect: jest.fn(),
        };
        createdGainNodes.push(gain);
        return gain;
      }),
      createOscillator: jest.fn(() => {
        const osc = {
          frequency: {
            setValueAtTime: jest.fn(),
          },
          type: "sine",
          connect: jest.fn(),
          disconnect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
        };
        createdOscillators.push(osc);
        return osc;
      }),
      createBufferSource: jest.fn(() => {
        const source = {
          buffer: null,
          loop: false,
          connect: jest.fn(),
          disconnect: jest.fn(),
          start: jest.fn(),
          stop: jest.fn(),
        };
        createdBufferSources.push(source);
        return source;
      }),
    };

    window.AudioContext = jest.fn(() => mockAudioContext);
  });

  afterEach(() => {
    stopAllSounds();
    _resetAudioContext();
    global.fetch = originalFetch;
    delete window.NokiaIMEBridge;
    delete window.Capacitor;
  });

  test("routes IME DTMF through the same native keypad tone path as homescreen", () => {
    window.NokiaIMEBridge = { playKeypadTone: jest.fn() };

    const handle = playKeypadTone("5", KEYPAD_TONE_TYPES.DTMF, 4, true);

    expect(window.NokiaIMEBridge.playKeypadTone).toHaveBeenCalledWith("5", 200, true);
    expect(createdOscillators).toHaveLength(0);
    expect(handle).toHaveProperty("stop");
  });

  test("loads only the pressed keypad sample on demand", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const handle = playKeypadTone("5", KEYPAD_TONE_TYPES.DTMF, 4, false);
    await Promise.resolve();
    await Promise.resolve();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith("./sounds/dtmf/5.wav");
    handle.stop();
  });

  test("pauses audio and vibration immediately when the app is backgrounded", () => {
    mockAudioContext.suspend = jest.fn().mockResolvedValue(undefined);
    const originalVibrate = navigator.vibrate;
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: jest.fn() });
    playTone(440, 1000, 0.2);

    pauseAudioEngine();

    expect(mockAudioContext.suspend).toHaveBeenCalledTimes(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(0);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: originalVibrate });
  });

  test("background pause cancels repeating ringtone vibration", () => {
    jest.useFakeTimers();
    const originalVibrate = navigator.vibrate;
    const vibrate = jest.fn();
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
    playRingtone(RINGTONE_TYPES.NOKIA_TUNE, 4, true, true);

    pauseAudioEngine();
    const callsAfterPause = vibrate.mock.calls.length;
    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(20_000);

    expect(vibrate).toHaveBeenCalledWith(0);
    expect(vibrate).toHaveBeenCalledTimes(callsAfterPause);
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: originalVibrate });
    jest.useRealTimers();
  });

  test("plays single and dual tones with proper gain envelope", () => {
    const handle = playTone([697, 1209], 50, 0.2);
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(handle).toHaveProperty("stop");
    handle.stop();
  });

  test("plays DTMF keypad tone for digit 5", () => {
    const handle = playKeypadTone("5", KEYPAD_TONE_TYPES.DTMF, 4);
    expect(createdOscillators.length).toBe(2);
    // DTMF row 770, col 1336
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(770, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1336, 0);
    handle.stop();
  });

  test("plays DTMF keypad tone for HASH key", () => {
    createdOscillators.length = 0;
    const handle = playKeypadTone("HASH", KEYPAD_TONE_TYPES.DTMF, 4);
    expect(createdOscillators.length).toBe(2);
    // DTMF row 941, col 1477
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(941, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1477, 0);
    handle.stop();
  });

  test("plays DTMF 0 audio for control/navigation keys (green, red, d-pad, soft keys)", () => {
    createdOscillators.length = 0;
    const greenHandle = playKeypadTone("GREEN", KEYPAD_TONE_TYPES.DTMF, 4);
    expect(createdOscillators.length).toBe(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(941, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1336, 0);
    greenHandle.stop();

    createdOscillators.length = 0;
    const upHandle = playKeypadTone("UP", KEYPAD_TONE_TYPES.DTMF, 4);
    expect(createdOscillators.length).toBe(2);
    expect(createdOscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(941, 0);
    expect(createdOscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(1336, 0);
    upHandle.stop();
  });

  test("returns null when keypad tone is OFF", () => {
    const handle = playKeypadTone("5", KEYPAD_TONE_TYPES.OFF);
    expect(handle).toBeNull();
  });

  test("plays SMS notification tone sequence", () => {
    const handle = playNotificationTone(MESSAGE_ALERT_TYPES.STANDARD, 4);
    expect(createdOscillators.length).toBeGreaterThan(0);
    handle.stop();
  });

  test("plays Nokia tune ringtone", () => {
    const handle = playRingtone(RINGTONE_TYPES.NOKIA_TUNE, 4, false);
    expect(createdOscillators.length).toBe(13); // 13 notes in Nokia tune sequence
    handle.stop();
  });

  test("plays Nokia alarm tone", () => {
    const handle = playAlarmTone(ALARM_TONE_TYPES.NOKIA_ALARM, 4, false);
    expect(createdOscillators.length).toBe(4);
    handle.stop();
  });

  test("plays pre-decoded AudioBuffer with createBufferSource", () => {
    const mockBuffer = { duration: 1.5 };
    const handle = playBuffer(mockBuffer, 4, false);
    expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
    expect(createdBufferSources.length).toBe(1);
    expect(createdBufferSources[0].buffer).toBe(mockBuffer);
    expect(createdBufferSources[0].start).toHaveBeenCalledWith(0);
    handle.stop();
    expect(createdBufferSources[0].stop).toHaveBeenCalled();
  });

  test("preloadSound decodes ArrayBuffer into memory", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    });

    const buffer = await preloadSound("test_key", "test.mp3");
    expect(global.fetch).toHaveBeenCalledWith("test.mp3");
    expect(mockAudioContext.decodeAudioData).toHaveBeenCalled();
    expect(buffer).toEqual({ duration: 1.0 });
  });

  test("stopAllSounds stops and clears active sounds", () => {
    const h1 = playRingtone(RINGTONE_TYPES.NOKIA_TUNE, 4, true);
    const h2 = playAlarmTone(ALARM_TONE_TYPES.NOKIA_ALARM, 4, true);
    expect(() => stopAllSounds()).not.toThrow();
  });
});
