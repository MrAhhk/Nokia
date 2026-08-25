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
import { triggerHaptic } from "../../lib/launcherApps";

let audioCtx = null;
const activeSoundStoppers = new Set();
const audioBufferCache = new Map();
let activeKeypadStopper = null;
let suspendTimer = null;

// Dense dual-pulse mechanical tactile vibration pattern for keys (35ms pulse, 10ms gap, 45ms sustain)
export const KEYPAD_HAPTIC_PATTERN = Object.freeze([0, 35, 10, 45]);

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
  }
  suspendTimer = setTimeout(() => {
    if (activeSoundStoppers.size === 0 && audioCtx && audioCtx.state === "running") {
      audioCtx.suspend?.().catch(() => {});
    }
  }, 2000);
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
  if (vibrate) {
    triggerHaptic(KEYPAD_HAPTIC_PATTERN);
  }

  if (toneType === KEYPAD_TONE_TYPES.OFF) return null;

  // Monophonic voice stealing: stop any previous ongoing key tone so keystrokes never overlap and distort
  if (activeKeypadStopper) {
    try {
      activeKeypadStopper();
    } catch (_e) {}
    activeKeypadStopper = null;
  }

  let handle = null;

  // 1. Nokia Button Click Mode
  if (toneType === KEYPAD_TONE_TYPES.CLICK) {
    const buffer = audioBufferCache.get("key_click");
    handle = buffer
      ? playBuffer(buffer, volume, false, true)
      : playTone([2000, 2600], 14, volumeToGain(volume) * 0.8, "triangle", true);
  } else if (toneType === KEYPAD_TONE_TYPES.BEEP) {
    // 2. Beep Mode
    const buffer = audioBufferCache.get("key_beep");
    handle = buffer
      ? playBuffer(buffer, volume, false, true)
      : playTone(1000, 35, volumeToGain(volume), "square", true);
  } else {
    // 3. DTMF Mode (Default) - Single stream with baked Nokia button click sound
    let dtmfKey = "default";
    if (key === "*") dtmfKey = "star";
    else if (key === "#") dtmfKey = "hash";
    else if (/^[0-9]$/.test(String(key))) dtmfKey = String(key);
    else if (key === "END" || key === "SEND" || key === "SELECT" || key === "UP" || key === "DOWN" || key === "LEFT" || key === "RIGHT") {
      dtmfKey = "default";
    }

    const dtmfBuffer =
      audioBufferCache.get(`dtmf_${dtmfKey}`) ||
      audioBufferCache.get("dtmf_default") ||
      audioBufferCache.get("key_click");

    if (dtmfBuffer) {
      handle = playBuffer(dtmfBuffer, volume, false, true);
    } else {
      // Fallback to dual-tone synthesis if buffer not ready
      const freqs = DTMF_FREQUENCIES[key] || [941, 1477];
      handle = playTone(freqs, 50, volumeToGain(volume), "triangle", true);
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
    const buffer = audioBufferCache.get("sms_ascending");
    audioHandle = buffer ? playBuffer(buffer, volume, false) : playSequence(NOKIA_ASCENDING_SEQUENCE, volume, false, "triangle");
  } else if (toneType === MESSAGE_ALERT_TYPES.STANDARD) {
    const buffer = audioBufferCache.get("sms_standard");
    audioHandle = buffer ? playBuffer(buffer, volume, false) : playSequence(NOKIA_SMS_SEQUENCE, volume, false, "square");
  } else if (toneType === MESSAGE_ALERT_TYPES.SPECIAL) {
    const buffer = audioBufferCache.get("sms_special");
    audioHandle = buffer ? playBuffer(buffer, volume, false) : playSequence(NOKIA_SPECIAL_SEQUENCE, volume, false, "square");
  } else if (toneType === MESSAGE_ALERT_TYPES.BEEP) {
    const buffer = audioBufferCache.get("sms_beep");
    audioHandle = buffer ? playBuffer(buffer, volume, false) : playTone(NOTES.E6, 60, volumeToGain(volume), "square");
  }

  const originalStop = audioHandle?.stop;
  return {
    stop: () => {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
    },
  };
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

  const buffer = audioBufferCache.get(toneType);
  const audioHandle = buffer
    ? playBuffer(buffer, volume, loop)
    : (() => {
        if (toneType === RINGTONE_TYPES.RING_RING) {
          return playSequence([[440, 400, 100], [440, 400, 1200]], volume, loop, "triangle");
        }
        if (toneType === RINGTONE_TYPES.LOW_BEEP) {
          return playSequence([[NOTES.E5, 120, 80], [NOTES.B4, 160, 1000]], volume, loop, "square");
        }
        return playSequence(NOKIA_TUNE_SEQUENCE, volume, loop, "square");
      })();

  const originalStop = audioHandle?.stop;
  return {
    stop: () => {
      if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
      }
      // Cancel any ongoing vibration
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
    },
  };
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
    const buffer = audioBufferCache.get("pulse");
    audioHandle = buffer
      ? playBuffer(buffer, volume, loop)
      : playSequence([[NOTES.G6, 80, 50], [NOTES.A6, 80, 50], [NOTES.C7, 140, 600]], volume, loop, "square");
  } else if (toneType === ALARM_TONE_TYPES.NOKIA_ALARM) {
    const buffer = audioBufferCache.get("nokia_alarm");
    audioHandle = buffer
      ? playBuffer(buffer, volume, loop)
      : playSequence(NOKIA_ALARM_SEQUENCE, volume, loop, "square");
  } else if (toneType === ALARM_TONE_TYPES.BEEP) {
    const buffer = audioBufferCache.get("alarm_beep");
    audioHandle = buffer
      ? playBuffer(buffer, volume, loop)
      : playSequence([[NOTES.A6, 120, 880]], volume, loop, "square");
  }

  const originalStop = audioHandle?.stop;
  return {
    stop: () => {
      if (vibrationInterval) {
        clearInterval(vibrationInterval);
        vibrationInterval = null;
      }
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try { navigator.vibrate(0); } catch (_e) {}
      }
      originalStop?.();
    },
  };
};

/**
 * Stop all active ongoing audio loops / tones and release audio hardware
 */
export const stopAllSounds = () => {
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
