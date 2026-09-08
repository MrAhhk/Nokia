import {
  DTMF_FREQUENCIES,
  KEYPAD_TONE_TYPES,
  MESSAGE_ALERT_TYPES,
  RINGTONE_TYPES,
  ALARM_TONE_TYPES,
  NOKIA_TUNE_SEQUENCE,
  NOKIA_SMS_SEQUENCE,
  NOKIA_SPECIAL_SEQUENCE,
  NOKIA_ASCENDING_SEQUENCE,
  NOKIA_ALARM_SEQUENCE,
  NOTES,
  SOUND_ASSET_PATHS,
  RINGTONE_VIBRATION_PATTERNS,
  ALARM_VIBRATION_PATTERNS,
  MESSAGE_VIBRATION_PATTERNS,
} from "./soundConfig";
import { triggerHaptic, playNativeKeypadTone, triggerKeyHaptic } from "../../lib/launcherApps";

let audioCtx = null;
const activeSoundStoppers = new Set();
const activeCompositeStoppers = new Set();
const pendingSoundStoppers = new Set();
const audioBufferCache = new Map();
let activeKeypadStopper = null;
let suspendTimer = null;

// Crisp single-pulse mechanical tactile vibration pattern for keys (60ms authentic Nokia tactile thud)
export const KEYPAD_HAPTIC_PATTERN = Object.freeze([0, 60]);

export const _resetAudioContext = () => {
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  if (audioCtx) {
    try {
      audioCtx.close?.();
    } catch (_e) {}
  }
  audioCtx = null;
  audioBufferCache.clear();
};

export const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        audioCtx = new AudioContextClass();
      } catch (_e) {
        audioCtx = null;
      }
    }
  }
  return audioCtx;
};

const ensureAudioContextRunning = () => {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  if (ctx.state === "suspended") {
    ctx.resume?.().catch(() => {});
  }
  return ctx;
};

const scheduleContextSuspend = () => {
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  // AudioContext is kept active to avoid 20-50ms waking latency on Android.
  // When app pauses, pauseAudioEngine() cleanly suspends AudioContext.
};

/**
 * Preload a single sound asset into decoded AudioBuffer in memory
 */
export const preloadSound = async (soundKey, url) => {
  if (typeof window === "undefined" || !url) return null;
  if (audioBufferCache.has(soundKey)) return audioBufferCache.get(soundKey);

  const ctx = getAudioContext();
  if (!ctx || typeof ctx.decodeAudioData !== "function") return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuffer, resolve, reject);
    });
    audioBufferCache.set(soundKey, audioBuffer);
    return audioBuffer;
  } catch (_e) {
    return null;
  }
};

/**
 * Preload all sound assets once on initialization
 */
export const preloadAllSounds = () => {
  if (typeof window === "undefined") return;

  Object.entries(SOUND_ASSET_PATHS).forEach(([key, path]) => {
    preloadSound(key, path).catch(() => {});
  });
};

/**
 * Preload critical keypad audio immediately so keystrokes have zero decode/fetch latency
 */
export const preloadKeypadAudio = () => {
  if (typeof window === "undefined") return;
  const keypadKeys = [
    "nokia_button_click",
    "key_beep",
    "dtmf_default",
    "dtmf_star",
    "dtmf_hash",
    ..."0123456789".split("").map((d) => `dtmf_${d}`),
  ];
  keypadKeys.forEach((key) => {
    const path = SOUND_ASSET_PATHS[key];
    if (path) preloadSound(key, path).catch(() => {});
  });
};

const playAssetOnDemand = (soundKey, volume, loop, fallbackFactory, isTransient = false) => {
  const assetPath = SOUND_ASSET_PATHS[soundKey];
  const cachedBuffer = audioBufferCache.get(soundKey);
  let innerHandle = null;
  let cancelled = false;

  const stop = () => {
    cancelled = true;
    pendingSoundStoppers.delete(stop);
    innerHandle?.stop?.();
  };

  if (cachedBuffer) {
    innerHandle = playBuffer(cachedBuffer, volume, loop, isTransient);
    return { stop };
  }

  if (!assetPath || typeof fetch !== "function") {
    innerHandle = fallbackFactory();
    return { stop };
  }

  pendingSoundStoppers.add(stop);
  preloadSound(soundKey, assetPath).then((buffer) => {
    pendingSoundStoppers.delete(stop);
    if (cancelled) return;
    innerHandle = buffer
      ? playBuffer(buffer, volume, loop, isTransient)
      : fallbackFactory();
  });

  return { stop };
};

// Convert volume level 1-5 to clear audible gain value (0.08 to 0.45)
export const volumeToGain = (volume = 4) => {
  const clamped = Math.min(Math.max(volume, 1), 5);
  return (clamped / 5) * 0.45;
};

/**
 * Play a pre-decoded AudioBuffer with 0ms latency, zero filters, and auto-release
 */
export const playBuffer = (buffer, volume = 4, loop = false, isTransient = false) => {
  const ctx = ensureAudioContextRunning();
  if (!ctx || !buffer) return null;

  let sourceNode = null;
  let gainNode = null;
  let isStopped = false;

  const cleanup = () => {
    if (isStopped) return;
    isStopped = true;
    try {
      sourceNode?.stop?.();
      sourceNode?.disconnect?.();
      gainNode?.disconnect?.();
    } catch (_err) {}
    if (!isTransient) {
      activeSoundStoppers.delete(stop);
    }
    scheduleContextSuspend();
  };

  const stop = cleanup;

  try {
    sourceNode = ctx.createBufferSource?.();
    gainNode = ctx.createGain?.();
    if (!sourceNode || !gainNode) return null;

    sourceNode.buffer = buffer;
    sourceNode.loop = loop;

    const gainValue = volumeToGain(volume);
    if (gainNode.gain) {
      gainNode.gain.value = gainValue;
    }

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => {
      cleanup();
    };

    if (!isTransient) {
      activeSoundStoppers.add(stop);
    }
    sourceNode.start(0);
  } catch (_e) {
    return null;
  }

  return { stop };
};

/**
 * Play a short dual-tone or single tone with clean anti-pop envelope (fallback)
 */
export const playTone = (frequencies, durationMs = 50, gainValue = 0.25, type = "triangle", isTransient = false) => {
  const ctx = ensureAudioContextRunning();
  if (!ctx) return null;

  const gainNode = ctx.createGain?.();
  if (!gainNode || !gainNode.gain) return null;

  const now = ctx.currentTime || 0;
  const durationSec = durationMs / 1000;
  const freqArray = Array.isArray(frequencies) ? frequencies : [frequencies];
  const perOscGain = Math.max(0.001, gainValue / Math.max(1, freqArray.length));

  try {
    // 3ms attack ramp to avoid clicks
    gainNode.gain.setValueAtTime?.(0.0001, now);
    gainNode.gain.linearRampToValueAtTime?.(perOscGain, now + 0.003);
    // Exponential release decay to eliminate DC pop
    gainNode.gain.setValueAtTime?.(perOscGain, now + Math.max(0.005, durationSec - 0.008));
    gainNode.gain.exponentialRampToValueAtTime?.(0.0001, now + durationSec);
  } catch (_e) {
    try {
      gainNode.gain.value = perOscGain;
    } catch (_err) {}
  }

  gainNode.connect?.(ctx.destination);

  const oscillators = [];

  const stop = () => {
    try {
      oscillators.forEach((osc) => {
        osc.stop?.();
        osc.disconnect?.();
      });
      gainNode.disconnect?.();
    } catch (_err) {}
    if (!isTransient) {
      activeSoundStoppers.delete(stop);
    }
    scheduleContextSuspend();
  };

  freqArray.forEach((freq) => {
    const osc = ctx.createOscillator?.();
    if (!osc) return;
    osc.type = type;
    osc.frequency?.setValueAtTime?.(freq, now);
    osc.connect?.(gainNode);
    osc.start?.(now);
    osc.stop?.(now + durationSec + 0.01);
    oscillators.push(osc);
  });

  if (!isTransient) {
    activeSoundStoppers.add(stop);
  }
  setTimeout(() => {
    stop();
  }, durationMs + 25);

  return { stop };
};

/**
 * Play keypad tone based on setting (DTMF, Click, Beep, Off)
 * Uses integrated authentic Nokia button click sound, monophonic voice stealing, and dense haptic vibration.
 */
export const playKeypadTone = (key, toneType = KEYPAD_TONE_TYPES.DTMF, volume = 4, vibrate = true) => {
  if (toneType === KEYPAD_TONE_TYPES.OFF) {
    if (vibrate) {
      triggerKeyHaptic(60).catch(() => {});
    }
    return null;
  }

  // Monophonic voice stealing: stop any previous ongoing key tone so keystrokes never overlap and distort
  if (activeKeypadStopper) {
    try {
      activeKeypadStopper();
    } catch (_e) {}
    activeKeypadStopper = null;
  }

  // 1. Android Native ToneGenerator & Haptic (0ms Hardware Audio & Haptic)
  if (typeof window !== "undefined" && window.Capacitor?.Plugins?.LauncherApps?.playKeypadTone) {
    if (toneType === KEYPAD_TONE_TYPES.DTMF) {
      playNativeKeypadTone(key, 200, vibrate).catch(() => {});
      return { stop: () => {} };
    }
  }

  if (vibrate) {
    triggerKeyHaptic(60).catch(() => {});
  }

  let handle = null;

  // 2. Nokia Button Click Mode
  if (toneType === KEYPAD_TONE_TYPES.CLICK) {
    handle = playAssetOnDemand(
      "nokia_button_click",
      volume,
      false,
      () => playTone([2000, 2600], 14, volumeToGain(volume) * 0.8, "triangle", true),
      true,
    );
  } else if (toneType === KEYPAD_TONE_TYPES.BEEP) {
    // 3. Beep Mode
    handle = playAssetOnDemand(
      "key_beep",
      volume,
      false,
      () => playTone(1000, 35, volumeToGain(volume), "square", true),
      true,
    );
  } else {
    // 4. DTMF Mode (Default Web/Preview) - 200ms warm DTMF tone
    const isDtmfDigit = /^[0-9]$/.test(String(key));
    const isStar = key === "*" || key === "STAR";
    const isHash = key === "#" || key === "HASH";
    const isNav =
      key === "GREEN" ||
      key === "CALL" ||
      key === "SEND" ||
      key === "END" ||
      key === "RED" ||
      key === "HOME" ||
      key === "SOFT_LEFT" ||
      key === "SOFT_RIGHT" ||
      key === "GOTO" ||
      key === "BACK" ||
      key === "DELETE" ||
      key === "UP" ||
      key === "DOWN" ||
      key === "LEFT" ||
      key === "RIGHT" ||
      key === "SELECT" ||
      key === "TAB";

    if (isDtmfDigit || isStar || isHash || isNav) {
      let dtmfKey = "default";
      let normKey = String(key);
      if (isStar) {
        dtmfKey = "star";
        normKey = "*";
      } else if (isHash) {
        dtmfKey = "hash";
        normKey = "#";
      } else if (isNav) {
        // Navigator + D-pad sound = sound of button 0
        dtmfKey = "0";
        normKey = "0";
      } else if (isDtmfDigit) {
        dtmfKey = String(key);
        normKey = String(key);
      }

      handle = playAssetOnDemand(
        `dtmf_${dtmfKey}`,
        volume,
        false,
        () => {
          const freqs = DTMF_FREQUENCIES[normKey] || [941, 1336];
          return playTone(freqs, 200, volumeToGain(volume), "triangle", true);
        },
        true,
      );
    }
  }

  if (handle?.stop) {
    activeKeypadStopper = handle.stop;
  }

  return handle;
};

/**
 * Schedule and play a melody sequence (fallback synth)
 */
export const playSequence = (sequence, volume = 4, loop = false, oscType = "square") => {
  const ctx = ensureAudioContextRunning();
  if (!ctx || !sequence || sequence.length === 0) return { stop: () => {} };

  const baseGain = volumeToGain(volume);
  let isStopped = false;
  let loopTimeout = null;

  const gainNode = ctx.createGain?.();
  if (!gainNode) return { stop: () => {} };
  gainNode.connect?.(ctx.destination);

  const oscillators = [];

  const cleanup = () => {
    isStopped = true;
    if (loopTimeout) clearTimeout(loopTimeout);
    oscillators.forEach((osc) => {
      try {
        osc.stop?.();
        osc.disconnect?.();
      } catch (_e) {}
    });
    try {
      gainNode.disconnect?.();
    } catch (_e) {}
    activeSoundStoppers.delete(stop);
    scheduleContextSuspend();
  };

  const stop = cleanup;

  const startPlayback = () => {
    if (isStopped) return;
    const startTime = Math.max((ctx.currentTime || 0) + 0.01, 0.01);
    let accumulatedTime = startTime;

    sequence.forEach(([freq, durMs, pauseMs]) => {
      if (isStopped) return;
      const durSec = durMs / 1000;
      const pauseSec = pauseMs / 1000;

      if (freq > 0) {
        const osc = ctx.createOscillator?.();
        if (!osc) return;
        osc.type = oscType;
        osc.frequency?.setValueAtTime?.(freq, accumulatedTime);

        const noteGain = ctx.createGain?.();
        if (noteGain && noteGain.gain) {
          noteGain.gain.setValueAtTime?.(baseGain, accumulatedTime);
          noteGain.gain.setValueAtTime?.(0.0001, accumulatedTime + durSec);

          osc.connect?.(noteGain);
          noteGain.connect?.(gainNode);
        } else {
          osc.connect?.(gainNode);
        }

        osc.start?.(accumulatedTime);
        osc.stop?.(accumulatedTime + durSec + 0.01);
        oscillators.push(osc);
      }

      accumulatedTime += durSec + pauseSec;
    });

    const totalDurationMs = (accumulatedTime - startTime) * 1000;

    if (loop && !isStopped) {
      loopTimeout = setTimeout(() => {
        if (!isStopped) startPlayback();
      }, totalDurationMs + 400);
    } else {
      setTimeout(() => {
        if (!loop && !isStopped) cleanup();
      }, totalDurationMs + 100);
    }
  };

  activeSoundStoppers.add(stop);
  startPlayback();

  return { stop };
};

/**
 * Play notification / SMS alert tone with vibration support
 */
export const playNotificationTone = (toneType = MESSAGE_ALERT_TYPES.ASCENDING, volume = 4, vibrate = true) => {
  if (toneType === MESSAGE_ALERT_TYPES.OFF) return { stop: () => {} };

  stopAllSounds();

  if (vibrate) {
    const pattern = MESSAGE_VIBRATION_PATTERNS[toneType] || [0, 80, 30, 80, 30, 80, 30, 180];
    triggerHaptic(pattern);
  }

  let audioHandle = null;

  if (toneType === MESSAGE_ALERT_TYPES.ASCENDING) {
    audioHandle = playAssetOnDemand("sms_ascending", volume, false, () => playSequence(NOKIA_ASCENDING_SEQUENCE, volume, false, "triangle"));
  } else if (toneType === MESSAGE_ALERT_TYPES.STANDARD) {
    audioHandle = playAssetOnDemand("sms_standard", volume, false, () => playSequence(NOKIA_SMS_SEQUENCE, volume, false, "square"));
  } else if (toneType === MESSAGE_ALERT_TYPES.SPECIAL) {
    audioHandle = playAssetOnDemand("sms_special", volume, false, () => playSequence(NOKIA_SPECIAL_SEQUENCE, volume, false, "square"));
  } else if (toneType === MESSAGE_ALERT_TYPES.BEEP) {
    audioHandle = playAssetOnDemand("sms_beep", volume, false, () => playTone(NOTES.E6, 60, volumeToGain(volume), "square"));
  }

  const originalStop = audioHandle?.stop;
  const stop = () => {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
      activeCompositeStoppers.delete(stop);
  };
  activeCompositeStoppers.add(stop);
  return { stop };
};

/**
 * Play Ringtone / Calling Sound with continuous vibration that loops alongside audio
 */
export const playRingtone = (toneType = RINGTONE_TYPES.NOKIA_TUNE_SERIES30, volume = 4, loop = false, vibrate = true) => {
  if (toneType === RINGTONE_TYPES.OFF) return { stop: () => {} };

  stopAllSounds();

  let vibrationInterval = null;

  if (vibrate) {
    const pattern = RINGTONE_VIBRATION_PATTERNS[toneType] || [0, 125, 25, 125, 25, 250, 40, 250, 40, 125, 25, 125, 25, 250, 40, 250, 40, 450, 800];
    triggerHaptic(pattern);

    if (loop) {
      const cycleDuration = pattern.reduce((sum, v) => sum + v, 0);
      if (cycleDuration > 0) {
        vibrationInterval = setInterval(() => {
          triggerHaptic(pattern);
        }, cycleDuration);
      }
    }
  }

  const audioHandle = playAssetOnDemand(toneType, volume, loop, () => {
        if (toneType === RINGTONE_TYPES.RING_RING) {
          return playSequence([[440, 400, 100], [440, 400, 1200]], volume, loop, "triangle");
        }
        if (toneType === RINGTONE_TYPES.LOW_BEEP) {
          return playSequence([[NOTES.E5, 120, 80], [NOTES.B4, 160, 1000]], volume, loop, "square");
        }
        return playSequence(NOKIA_TUNE_SEQUENCE, volume, loop, "square");
      });

  const originalStop = audioHandle?.stop;
  const stop = () => {
      if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
      }
      // Cancel any ongoing vibration
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
      activeCompositeStoppers.delete(stop);
  };
  activeCompositeStoppers.add(stop);
  return { stop };
};

/**
 * Play Alarm Tone with continuous vibration that loops alongside audio
 */
export const playAlarmTone = (toneType = ALARM_TONE_TYPES.PULSE, volume = 4, loop = false, vibrate = true) => {
  if (toneType === ALARM_TONE_TYPES.OFF) return { stop: () => {} };

  stopAllSounds();

  let vibrationInterval = null;

  if (vibrate) {
    const pattern = ALARM_VIBRATION_PATTERNS[toneType] || [0, 150, 80, 150, 80, 150, 80, 150, 450];
    triggerHaptic(pattern);

    if (loop) {
      const cycleDuration = pattern.reduce((sum, v) => sum + v, 0);
      if (cycleDuration > 0) {
        vibrationInterval = setInterval(() => {
          triggerHaptic(pattern);
        }, cycleDuration);
      }
    }
  }

  let audioHandle = null;

  if (toneType === ALARM_TONE_TYPES.PULSE) {
    audioHandle = playAssetOnDemand("pulse", volume, loop, () => playSequence([[NOTES.G6, 80, 50], [NOTES.A6, 80, 50], [NOTES.C7, 140, 600]], volume, loop, "square"));
  } else if (toneType === ALARM_TONE_TYPES.NOKIA_ALARM) {
    audioHandle = playAssetOnDemand("nokia_alarm", volume, loop, () => playSequence(NOKIA_ALARM_SEQUENCE, volume, loop, "square"));
  } else if (toneType === ALARM_TONE_TYPES.BEEP) {
    audioHandle = playAssetOnDemand("alarm_beep", volume, loop, () => playSequence([[NOTES.A6, 120, 880]], volume, loop, "square"));
  }

  const originalStop = audioHandle?.stop;
  const stop = () => {
      if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
      activeCompositeStoppers.delete(stop);
  };
  activeCompositeStoppers.add(stop);
  return { stop };
};

/**
 * Stop all active ongoing audio loops / tones and release audio hardware
 */
export const stopAllSounds = () => {
  activeCompositeStoppers.forEach((stopFn) => {
    try { stopFn(); } catch (_e) {}
  });
  activeCompositeStoppers.clear();
  pendingSoundStoppers.forEach((stopFn) => stopFn());
  pendingSoundStoppers.clear();
  if (activeKeypadStopper) {
    try { activeKeypadStopper(); } catch (_e) {}
    activeKeypadStopper = null;
  }
  activeSoundStoppers.forEach((stopFn) => {
    try {
      stopFn();
    } catch (_e) {}
  });
  activeSoundStoppers.clear();
  scheduleContextSuspend();
};

export const pauseAudioEngine = () => {
  stopAllSounds();
  if (suspendTimer) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
  if (audioCtx && audioCtx.state === "running") {
    audioCtx.suspend?.().catch(() => {});
  }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(0); } catch (_e) {}
  }
};
