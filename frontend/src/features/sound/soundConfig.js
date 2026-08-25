// Pure configuration of authentic Nokia audio frequencies, note sequences, and tone catalogues.

// DTMF Frequency Matrix (Row x Column)
export const DTMF_FREQUENCIES = Object.freeze({
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
});

export const KEYPAD_TONE_TYPES = Object.freeze({
  DTMF: "dtmf",
  CLICK: "click",
  BEEP: "beep",
  OFF: "off",
});

export const MESSAGE_ALERT_TYPES = Object.freeze({
  STANDARD: "standard",
  SPECIAL: "special",
  ASCENDING: "ascending",
  BEEP: "beep",
  OFF: "off",
});

export const RINGTONE_TYPES = Object.freeze({
  NOKIA_TUNE_SERIES30: "nokia_tune_series30",
  NOKIA_TUNE: "nokia_tune",
  RING_RING: "ring_ring",
  LOW_BEEP: "low_beep",
  MOZART_40: "mozart_40",
  FUR_ELISE: "fur_elise",
  GRANDE_VALSE: "grande_valse",
  BADINERIE: "badinerie",
  ENTERTAINER: "entertainer",
  NOKIA_TUNE_2013: "nokia_tune_2013",
  SLOW_COFFEE: "slow_coffee",
  BREEZE: "breeze",
  KARIMBA: "karimba",
  CADENZA: "cadenza",
  EARRING: "earring",
  SPIRALS: "spirals",
  BRIKABRAK: "brikabrak",
  TUMBLER: "tumbler",
  OFF: "off",
});

export const ALARM_TONE_TYPES = Object.freeze({
  PULSE: "pulse",
  NOKIA_ALARM: "nokia_alarm",
  BEEP: "beep",
  OFF: "off",
});

// Note definitions (Hz)
export const NOTES = Object.freeze({
  C4: 261.63,
  CS4: 277.18,
  D4: 293.66,
  DS4: 311.13,
  E4: 329.63,
  F4: 349.23,
  FS4: 369.99,
  G4: 392.00,
  GS4: 415.30,
  A4: 440.00,
  AS4: 466.16,
  B4: 493.88,
  C5: 523.25,
  CS5: 554.37,
  D5: 587.33,
  DS5: 622.25,
  E5: 659.25,
  F5: 698.46,
  FS5: 739.99,
  G5: 783.99,
  GS5: 830.61,
  A5: 880.00,
  B5: 987.77,
  C6: 1046.50,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760.00,
  C7: 2093.00,
});

// Iconic Nokia Tune (Francisco Tárrega's Grande Valse) melody sequence: [note, durationMs, pauseAfterMs]
export const NOKIA_TUNE_SEQUENCE = Object.freeze([
  [NOTES.E5, 125, 25],
  [NOTES.D5, 125, 25],
  [NOTES.FS4, 250, 40],
  [NOTES.GS4, 250, 40],
  [NOTES.CS5, 125, 25],
  [NOTES.B4, 125, 25],
  [NOTES.D4, 250, 40],
  [NOTES.E4, 250, 40],
  [NOTES.B4, 125, 25],
  [NOTES.A4, 125, 25],
  [NOTES.CS4, 250, 40],
  [NOTES.E4, 250, 40],
  [NOTES.A4, 450, 80],
]);

// Classic Nokia SMS Tone (Morse code for "SMS": ... -- ...)
export const NOKIA_SMS_SEQUENCE = Object.freeze([
  [NOTES.E6, 70, 70],
  [NOTES.E6, 70, 70],
  [NOTES.E6, 70, 160],
  [NOTES.E6, 180, 70],
  [NOTES.E6, 180, 160],
  [NOTES.E6, 70, 70],
  [NOTES.E6, 70, 70],
  [NOTES.E6, 70, 0],
]);

// Nokia Special SMS Tone
export const NOKIA_SPECIAL_SEQUENCE = Object.freeze([
  [NOTES.A5, 90, 40],
  [NOTES.CS5, 90, 40],
  [NOTES.E5, 90, 40],
  [NOTES.A5, 240, 100],
  [NOTES.A5, 90, 40],
  [NOTES.E5, 90, 40],
  [NOTES.CS5, 90, 40],
  [NOTES.A4, 280, 0],
]);

// Ascending Notification Tone
export const NOKIA_ASCENDING_SEQUENCE = Object.freeze([
  [NOTES.A5, 80, 30],
  [NOTES.C6, 80, 30],
  [NOTES.E6, 80, 30],
  [NOTES.A6, 180, 0],
]);

// Nokia Alarm Sequence (dual-pulse cadence)
export const NOKIA_ALARM_SEQUENCE = Object.freeze([
  [NOTES.A6, 90, 60],
  [NOTES.A6, 90, 180],
  [NOTES.A6, 90, 60],
  [NOTES.A6, 90, 350],
]);

export const DEFAULT_SOUND_SETTINGS = Object.freeze({
  soundMode: "normal", // "normal" | "silent" | "beep"
  volume: 4, // 1 to 5
  keypadTone: KEYPAD_TONE_TYPES.DTMF,
  ringtone: RINGTONE_TYPES.NOKIA_TUNE_SERIES30, // Nokia 3310 Remaster (Default)
  messageAlert: MESSAGE_ALERT_TYPES.ASCENDING, // Ascending (Default)
  alarmTone: ALARM_TONE_TYPES.PULSE, // Pulse (Default)
  vibrate: true, // Vibrating on (Default)
});

export const SOUND_ASSET_PATHS = Object.freeze({
  // Official Nokia Mechanical Button Click & Keypad sounds
  key_click: "./sounds/key_click.mp3",
  key_tick: "./sounds/key_tick.mp3",
  key_beep: "./sounds/modern/modern_beep.mp3",

  // Modern Clean Sampled DTMF Touch Tones
  dtmf_0: "./sounds/dtmf/0.wav",
  dtmf_1: "./sounds/dtmf/1.wav",
  dtmf_2: "./sounds/dtmf/2.wav",
  dtmf_3: "./sounds/dtmf/3.wav",
  dtmf_4: "./sounds/dtmf/4.wav",
  dtmf_5: "./sounds/dtmf/5.wav",
  dtmf_6: "./sounds/dtmf/6.wav",
  dtmf_7: "./sounds/dtmf/7.wav",
  dtmf_8: "./sounds/dtmf/8.wav",
  dtmf_9: "./sounds/dtmf/9.wav",
  dtmf_star: "./sounds/dtmf/star.wav",
  dtmf_hash: "./sounds/dtmf/hash.wav",
  dtmf_default: "./sounds/dtmf/default.wav",

  // Modern Remastered Notifications
  sms_standard: "./sounds/modern/sms_arrival.mp3",
  sms_special: "./sounds/sms_standard.mp3",
  sms_ascending: "./sounds/sms_ascending.mp3",
  sms_beep: "./sounds/modern/modern_beep.mp3",

  // Official Modern Remastered Ringtones
  nokia_tune_series30: "./sounds/modern/nokia_tune_series30.mp3",
  nokia_tune: "./sounds/modern/nokia_tune_2018.mp3",
  ring_ring: "./sounds/ring_atria.mp3",
  low_beep: "./sounds/ring_low.mp3",
  mozart_40: "./sounds/modern/ring_mozart_40.mp3",
  fur_elise: "./sounds/modern/ring_fur_elise.mp3",
  grande_valse: "./sounds/modern/ring_grande_valse.mp3",
  badinerie: "./sounds/modern/ring_badinerie.mp3",
  entertainer: "./sounds/modern/ring_entertainer.mp3",
  nokia_tune_2013: "./sounds/modern/nokia_tune_2013.mp3",
  slow_coffee: "./sounds/modern/ring_slow_coffee.mp3",
  breeze: "./sounds/modern/ring_breeze.mp3",
  karimba: "./sounds/modern/ring_karimba.mp3",
  cadenza: "./sounds/modern/ring_cadenza.mp3",
  earring: "./sounds/modern/ring_earring.mp3",
  spirals: "./sounds/modern/ring_spirals.mp3",
  brikabrak: "./sounds/modern/ring_brikabrak.mp3",
  tumbler: "./sounds/modern/ring_tumbler.mp3",

  // Modern Remastered Alarms
  pulse: "./sounds/alarm_ascending.mp3",
  nokia_alarm: "./sounds/alarm_timer.mp3",
  alarm_beep: "./sounds/modern/modern_beep.mp3",
});

export const SOUND_SETTINGS_CATALOG = Object.freeze({
  ringtone: [
    { id: RINGTONE_TYPES.NOKIA_TUNE_SERIES30, label: "Nokia 3310 Remaster" },
    { id: RINGTONE_TYPES.NOKIA_TUNE, label: "Nokia tune (Modern)" },
    { id: RINGTONE_TYPES.RING_RING, label: "Ring ring" },
    { id: RINGTONE_TYPES.LOW_BEEP, label: "Low beep" },
    { id: RINGTONE_TYPES.MOZART_40, label: "Mozart 40" },
    { id: RINGTONE_TYPES.FUR_ELISE, label: "Für Elise" },
    { id: RINGTONE_TYPES.GRANDE_VALSE, label: "The Waltz" },
    { id: RINGTONE_TYPES.BADINERIE, label: "Badinerie" },
    { id: RINGTONE_TYPES.ENTERTAINER, label: "Entertainer" },
    { id: RINGTONE_TYPES.NOKIA_TUNE_2013, label: "Nokia tune (Poly)" },
    { id: RINGTONE_TYPES.SLOW_COFFEE, label: "Slow coffee" },
    { id: RINGTONE_TYPES.BREEZE, label: "Breeze" },
    { id: RINGTONE_TYPES.KARIMBA, label: "Karimba" },
    { id: RINGTONE_TYPES.CADENZA, label: "Cadenza" },
    { id: RINGTONE_TYPES.EARRING, label: "Earring" },
    { id: RINGTONE_TYPES.SPIRALS, label: "Spirals" },
    { id: RINGTONE_TYPES.BRIKABRAK, label: "Brikabrak" },
    { id: RINGTONE_TYPES.TUMBLER, label: "Tumbler" },
    { id: RINGTONE_TYPES.OFF, label: "Off" },
  ],
  keypadTone: [
    { id: KEYPAD_TONE_TYPES.DTMF, label: "DTMF tone" },
    { id: KEYPAD_TONE_TYPES.CLICK, label: "Click" },
    { id: KEYPAD_TONE_TYPES.BEEP, label: "Beep" },
    { id: KEYPAD_TONE_TYPES.OFF, label: "Off" },
  ],
  messageAlert: [
    { id: MESSAGE_ALERT_TYPES.ASCENDING, label: "Ascending" },
    { id: MESSAGE_ALERT_TYPES.STANDARD, label: "Standard (SMS)" },
    { id: MESSAGE_ALERT_TYPES.SPECIAL, label: "Special" },
    { id: MESSAGE_ALERT_TYPES.BEEP, label: "Beep" },
    { id: MESSAGE_ALERT_TYPES.OFF, label: "Off" },
  ],
  alarmTone: [
    { id: ALARM_TONE_TYPES.PULSE, label: "Pulse" },
    { id: ALARM_TONE_TYPES.NOKIA_ALARM, label: "Nokia alarm" },
    { id: ALARM_TONE_TYPES.BEEP, label: "Beep" },
    { id: ALARM_TONE_TYPES.OFF, label: "Off" },
  ],
  volume: [
    { id: 1, label: "Level 1" },
    { id: 2, label: "Level 2" },
    { id: 3, label: "Level 3" },
    { id: 4, label: "Level 4" },
    { id: 5, label: "Level 5" },
  ],
  vibrate: [
    { id: true, label: "On" },
    { id: false, label: "Off" },
  ],
});

// Custom synchronized vibration waveforms for each ringtone (melody rhythm sync)
export const RINGTONE_VIBRATION_PATTERNS = Object.freeze({
  [RINGTONE_TYPES.NOKIA_TUNE_SERIES30]: [0, 125, 25, 125, 25, 250, 40, 250, 40, 125, 25, 125, 25, 250, 40, 250, 40, 125, 25, 125, 25, 250, 40, 250, 40, 450, 800],
  [RINGTONE_TYPES.NOKIA_TUNE]: [0, 130, 30, 130, 30, 260, 45, 260, 45, 130, 30, 130, 30, 260, 45, 260, 45, 130, 30, 130, 30, 260, 45, 260, 45, 480, 800],
  [RINGTONE_TYPES.MOZART_40]: [0, 100, 50, 100, 50, 220, 100, 100, 50, 100, 50, 220, 100, 100, 50, 100, 50, 350, 700],
  [RINGTONE_TYPES.FUR_ELISE]: [0, 110, 40, 110, 40, 110, 40, 110, 40, 110, 40, 110, 40, 110, 40, 110, 40, 300, 800],
  [RINGTONE_TYPES.GRANDE_VALSE]: [0, 200, 100, 100, 100, 100, 200, 200, 100, 100, 100, 100, 400, 800],
  [RINGTONE_TYPES.BADINERIE]: [0, 80, 40, 80, 40, 80, 40, 80, 40, 160, 80, 80, 40, 80, 40, 80, 40, 250, 600],
  [RINGTONE_TYPES.ENTERTAINER]: [0, 90, 50, 90, 50, 90, 50, 200, 100, 150, 80, 150, 80, 350, 750],
  [RINGTONE_TYPES.NOKIA_TUNE_2013]: [0, 120, 30, 120, 30, 240, 50, 240, 50, 120, 30, 120, 30, 240, 50, 450, 700],
  [RINGTONE_TYPES.SLOW_COFFEE]: [0, 250, 150, 150, 150, 250, 200, 350, 900],
  [RINGTONE_TYPES.BREEZE]: [0, 180, 100, 180, 100, 350, 200, 180, 100, 350, 800],
  [RINGTONE_TYPES.KARIMBA]: [0, 100, 60, 100, 60, 200, 80, 100, 60, 200, 80, 300, 700],
  [RINGTONE_TYPES.CADENZA]: [0, 80, 40, 80, 40, 80, 40, 80, 40, 220, 100, 350, 800],
  [RINGTONE_TYPES.EARRING]: [0, 140, 70, 140, 70, 280, 140, 280, 800],
  [RINGTONE_TYPES.SPIRALS]: [0, 120, 60, 120, 60, 120, 60, 240, 120, 360, 800],
  [RINGTONE_TYPES.BRIKABRAK]: [0, 90, 50, 90, 50, 180, 90, 90, 50, 180, 90, 270, 600],
  [RINGTONE_TYPES.TUMBLER]: [0, 150, 80, 150, 80, 300, 150, 300, 800],
  [RINGTONE_TYPES.RING_RING]: [0, 400, 200, 400, 1200],
  [RINGTONE_TYPES.LOW_BEEP]: [0, 250, 1000],
});

// Custom synchronized vibration waveforms for each alarm tone
export const ALARM_VIBRATION_PATTERNS = Object.freeze({
  [ALARM_TONE_TYPES.PULSE]: [0, 150, 80, 150, 80, 150, 80, 150, 450],
  [ALARM_TONE_TYPES.NOKIA_ALARM]: [0, 90, 60, 90, 180, 90, 60, 90, 400],
  [ALARM_TONE_TYPES.BEEP]: [0, 250, 250, 250, 250, 250, 500],
});

// Custom synchronized vibration waveforms for each message alert
export const MESSAGE_VIBRATION_PATTERNS = Object.freeze({
  [MESSAGE_ALERT_TYPES.ASCENDING]: [0, 80, 30, 80, 30, 80, 30, 180],
  [MESSAGE_ALERT_TYPES.STANDARD]: [0, 70, 70, 70, 70, 70, 160, 180, 70, 180, 160, 70, 70, 70, 70, 70],
  [MESSAGE_ALERT_TYPES.SPECIAL]: [0, 90, 40, 90, 40, 90, 40, 240, 100, 90, 40, 90, 40, 90, 40, 280],
  [MESSAGE_ALERT_TYPES.BEEP]: [0, 120, 80, 120],
});
