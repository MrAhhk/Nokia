import MiniscreenClock from '@/components/MiniscreenClock';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  SOUND_MENU_SECTIONS,
  getOptionLabel,
  moveSettingValue,
  moveSoundMenuIndex,
} from "./soundState";
import {
  loadSoundSettings,
  saveSoundSettings,
} from "./soundStorage";
import {
  playKeypadTone,
  playNotificationTone,
  playRingtone,
  playAlarmTone,
  stopAllSounds,
} from "./nokiaAudioEngine";
import { SOUND_ASSET_PATHS, DEFAULT_SOUND_SETTINGS } from "./soundConfig";
import {
  applySystemTone,
  getSystemToneAccess,
  openSystemSetting,
  requestSystemToneAccess,
  triggerHaptic,
  syncKeyboardSoundSettings,
} from "@/lib/launcherApps";
import "./sound.css";

const ALL_SOUND_ROWS = Object.freeze([
  ...SOUND_MENU_SECTIONS,
  { id: "apply_ringtone", label: "Use as phone ringtone", toneType: "ringtone", isAction: true },
  { id: "apply_notification", label: "Use as phone notification", toneType: "notification", isAction: true },
  { id: "apply_alarm", label: "Use as phone alarm", toneType: "alarm", isAction: true },
  { id: "android_sound", label: "Android sound settings", isAction: true },
]);

const SWITCH_ROWS = Object.freeze([
  { id: "ringtone", label: "Ringtone", key: "ringtone", toneType: "ringtone", isSwitch: true },
  { id: "messageAlert", label: "Notification", key: "messageAlert", toneType: "notification", isSwitch: true },
  { id: "alarmTone", label: "Alarm", key: "alarmTone", toneType: "alarm", isSwitch: true },
  { id: "keypadTone", label: "Keyboard sound", key: "keypadTone", isSwitch: true },
  { id: "customize", label: "Choose tones & vibration", isAction: true },
  { id: "android_sound", label: "Android sound settings", isAction: true },
]);

const SoundFeature = forwardRef(({ onExit, currentTime }, ref) => {
  const [settings, setSettings] = useState(() => loadSoundSettings());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [customizing, setCustomizing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const aliveRef = useRef(true);
  const rows = customizing ? ALL_SOUND_ROWS : SWITCH_ROWS;
  const [systemAccess, setSystemAccess] = useState({ supported: false, granted: false });
  const [systemStatus, setSystemStatus] = useState("App tones only");
  const previewHandleRef = useRef(null);
  const rowRefs = useRef([]);

  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  // Stop sounds on unmount
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stopAllSounds();
    };
  }, []);

  const refreshSystemAccess = useCallback(() => {
    Promise.resolve(getSystemToneAccess())
      .then((access) => { if (aliveRef.current) setSystemAccess(access || { supported: false, granted: false }); })
      .catch(() => { if (aliveRef.current) setSystemAccess({ supported: false, granted: false }); });
  }, []);

  useEffect(() => {
    refreshSystemAccess();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshSystemAccess();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => document.removeEventListener("visibilitychange", refreshWhenVisible);
  }, [refreshSystemAccess]);

  const playPreviewForSetting = useCallback((key, value, currentVolume, vibrate) => {
    stopAllSounds();
    const volume = key === "volume" ? value : currentVolume;

    if (key === "ringtone") {
      previewHandleRef.current = playRingtone(value, volume, false, vibrate);
    } else if (key === "messageAlert") {
      previewHandleRef.current = playNotificationTone(value, volume, vibrate);
    } else if (key === "keypadTone") {
      previewHandleRef.current = playKeypadTone("5", value, volume, vibrate);
    } else if (key === "alarmTone") {
      previewHandleRef.current = playAlarmTone(value, volume, false, vibrate);
    } else if (key === "volume") {
      // Play a short double beep at selected volume
      previewHandleRef.current = playKeypadTone("5", settings.keypadTone, value, false);
    } else if (key === "vibrate") {
      if (value) {
        triggerHaptic([100, 50, 100]);
      }
    }
  }, [settings.keypadTone]);

  const persistSettings = useCallback(async (nextSettings) => {
    const result = await syncKeyboardSoundSettings(nextSettings);
    if (result?.success === false) throw new Error("Keyboard settings unavailable");
    if (!saveSoundSettings(nextSettings)) {
      await syncKeyboardSoundSettings(settings);
      throw new Error("Could not save sound settings");
    }
    if (aliveRef.current) setSettings(nextSettings);
  }, [settings]);

  const updateSetting = useCallback(async (settingKey, direction) => {
    const nextVal = moveSettingValue(settingKey, settings[settingKey], direction);
    const nextSettings = { ...settings, [settingKey]: nextVal };
    await persistSettings(nextSettings);
    if (aliveRef.current) playPreviewForSetting(settingKey, nextVal, nextSettings.volume, nextSettings.vibrate);
  }, [playPreviewForSetting, settings, persistSettings]);

  const runAction = useCallback(async (row) => {
    stopAllSounds();
    if (row.id === "customize") {
      setCustomizing(true);
      setSelectedIndex(0);
      return;
    }
    if (row.id === "android_sound") {
      await openSystemSetting("sound");
      return;
    }

    const access = await getSystemToneAccess() || { supported: false, granted: false };
    setSystemAccess(access);
    if (!access.supported) {
      setSystemStatus("Use Android sound settings");
      await openSystemSetting("sound");
      return;
    }
    if (!access.granted) {
      await requestSystemToneAccess();
      setSystemStatus("Grant access, then return");
      return;
    }

    const settingKey = row.toneType === "ringtone"
      ? "ringtone"
      : row.toneType === "notification"
        ? "messageAlert"
        : "alarmTone";
    const selectedTone = settings[settingKey];
    const assetPath = SOUND_ASSET_PATHS[
      row.toneType === "notification" ? `sms_${selectedTone}` : selectedTone
    ];
    if (!assetPath && selectedTone !== "off") {
      setSystemStatus("Choose a tone first");
      return;
    }
    setSystemStatus("Applying…");
    const result = await applySystemTone(
      row.toneType,
      selectedTone === "off" ? "off" : assetPath,
      getOptionLabel(settingKey, selectedTone),
    );
    setSystemStatus(result?.success
      ? `${row.toneType === "ringtone" ? "Ringtone" : row.toneType === "notification" ? "Notification" : "Alarm"} applied`
      : "Could not apply tone");
  }, [settings]);

  const toggleSound = useCallback(async (row) => {
    stopAllSounds();
    const current = settings[row.key];
    const next = current === "off"
      ? settings[`${row.key}Previous`] || DEFAULT_SOUND_SETTINGS[row.key] : "off";
    if (row.toneType) {
      const access = await getSystemToneAccess();
      if (access?.supported && !access.granted) {
        await requestSystemToneAccess();
        if (aliveRef.current) setSystemStatus("Allow access, return and try again");
        return;
      }
      if (access?.supported) {
        const path = next === "off" ? "off" : SOUND_ASSET_PATHS[row.toneType === "notification" ? `sms_${next}` : next];
        const result = await applySystemTone(row.toneType, path, getOptionLabel(row.key, next));
        if (!result?.success) throw new Error("Could not change phone sound");
      }
      if (aliveRef.current) setSystemStatus(access?.supported ? "Phone default updated" : "App tones only · phone settings in Android");
    }
    const nextSettings = { ...settings, [row.key]: next };
    if (current !== "off") nextSettings[`${row.key}Previous`] = current;
    await persistSettings(nextSettings);
  }, [settings, persistSettings]);

  const activateRow = useCallback(async (row, direction = "next") => {
    if (busyRef.current || !row) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (row.isSwitch) await toggleSound(row);
      else if (row.isAction) await runAction(row);
      else await updateSetting(row.key, direction);
    } catch (error) {
      if (aliveRef.current) setSystemStatus(error.message || "Could not change sound");
    } finally {
      busyRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }, [toggleSound, runAction, updateSetting]);

  const handleRowClick = useCallback((index) => {
    setSelectedIndex(index);
    const row = rows[index];
    if (!row) return;

    activateRow(row);
  }, [rows, activateRow]);

  const handleKey = useCallback((key) => {
    if (key === "BACK" || key === "END" || key === "#") {
      stopAllSounds();
      if (customizing) { setCustomizing(false); setSelectedIndex(0); return; }
      onExit?.();
      return;
    }

    if (key === "UP" || key === "2") {
      setSelectedIndex((idx) => moveSoundMenuIndex(idx, "up", rows.length));
      return;
    }

    if (key === "DOWN" || key === "8") {
      setSelectedIndex((idx) => moveSoundMenuIndex(idx, "down", rows.length));
      return;
    }

    const currentRow = rows[selectedIndex];

    if (key === "LEFT" || key === "4") {
      if (currentRow && !currentRow.isAction) {
        activateRow(currentRow, "prev");
      }
      return;
    }

    if (key === "RIGHT" || key === "6") {
      if (currentRow && !currentRow.isAction) {
        activateRow(currentRow);
      }
      return;
    }

    if (key === "SELECT" || key === "5" || key === "SEND") {
      if (currentRow) {
        activateRow(currentRow);
      }
    }
  }, [onExit, selectedIndex, activateRow, rows, customizing]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  return (
    <div className="lcd-screen sound-screen" data-testid="sound-feature">
      {/* Top LCD Header */}
      <div className="lcd-sound__header">
        <MiniscreenClock currentTime={currentTime} />
        <div>
          <strong>{customizing ? "Choose tones" : "Sound"}</strong>
          <small>{systemAccess.granted ? "Phone defaults · apps may use their own tones" : "Tap to turn each sound on or off"}</small>
        </div>
        <div className="lcd-sound__meter" aria-label={`Volume ${settings.volume} of 5`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <i key={level} className={level <= settings.volume ? "is-on" : ""} />
          ))}
        </div>
      </div>

      {/* Settings List */}
      <div className="lcd-sound__list" data-testid="sound-settings-list">
        {rows.map((row, idx) => {
          const isSelected = idx === selectedIndex;
          if (row.isAction) {
            return (
              <button
                key={row.id}
                ref={(node) => { rowRefs.current[idx] = node; }}
                type="button"
                className={`lcd-sound__row ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleRowClick(idx)}
                data-testid={`sound-row-${row.id}`}
              >
                <span className="lcd-sound__label">{row.label}</span>
                <span className="lcd-sound__value">▶</span>
              </button>
            );
          }

          const enabled = settings[row.key] !== "off";
          const valueLabel = row.isSwitch ? (enabled ? "On" : "Off") : getOptionLabel(row.key, settings[row.key]);

          return (
            <button
              key={row.id}
              ref={(node) => { rowRefs.current[idx] = node; }}
              type="button"
              className={`lcd-sound__row ${row.isSwitch ? "lcd-sound__switch-row" : ""} ${isSelected ? "is-selected" : ""}`}
              role={row.isSwitch ? "switch" : undefined}
              aria-checked={row.isSwitch ? enabled : undefined}
              aria-disabled={busy}
              onClick={() => handleRowClick(idx)}
              data-testid={`sound-row-${row.id}`}
            >
              <span className="lcd-sound__label">{row.label}</span>
              <span className="lcd-sound__value">
                {isSelected && !row.isSwitch && <span className="lcd-sound__arrows">◀</span>}
                <span>{valueLabel}</span>
                {row.isSwitch && <i className={`lcd-sound__toggle ${enabled ? "is-on" : ""}`} aria-hidden="true" />}
                {isSelected && !row.isSwitch && <span className="lcd-sound__arrows">▶</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Softkey Labels */}
      <div className="lcd-sound__footer">
        <span>{rows[selectedIndex]?.isSwitch ? "Toggle" : rows[selectedIndex]?.isAction ? "Select" : "Change"}</span>
        <span role="status">{busy ? "Saving…" : systemStatus}</span>
        <span>Back</span>
      </div>
    </div>
  );
});

SoundFeature.displayName = "SoundFeature";

export default SoundFeature;
