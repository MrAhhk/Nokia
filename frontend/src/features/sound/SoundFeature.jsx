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
import { SOUND_ASSET_PATHS } from "./soundConfig";
import {
  applySystemTone,
  getSystemToneAccess,
  openSystemSetting,
  requestSystemToneAccess,
  triggerHaptic,
} from "@/lib/launcherApps";
import "./sound.css";

const ALL_SOUND_ROWS = Object.freeze([
  ...SOUND_MENU_SECTIONS,
  { id: "apply_ringtone", label: "Use as phone ringtone", toneType: "ringtone", isAction: true },
  { id: "apply_notification", label: "Use as phone notification", toneType: "notification", isAction: true },
  { id: "apply_alarm", label: "Use as phone alarm", toneType: "alarm", isAction: true },
  { id: "android_sound", label: "Android sound settings", isAction: true },
]);

const SoundFeature = forwardRef(({ onExit }, ref) => {
  const [settings, setSettings] = useState(() => loadSoundSettings());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [systemAccess, setSystemAccess] = useState({ supported: false, granted: false });
  const [systemStatus, setSystemStatus] = useState("App tones only");
  const previewHandleRef = useRef(null);
  const rowRefs = useRef([]);

  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [selectedIndex]);

  // Stop sounds on unmount
  useEffect(() => {
    return () => {
      stopAllSounds();
    };
  }, []);

  const refreshSystemAccess = useCallback(() => {
    Promise.resolve(getSystemToneAccess())
      .then((access) => setSystemAccess(access || { supported: false, granted: false }))
      .catch(() => setSystemAccess({ supported: false, granted: false }));
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
      previewHandleRef.current = playKeypadTone("5", "dtmf", value, false);
    } else if (key === "vibrate") {
      if (value) {
        triggerHaptic([100, 50, 100]);
      }
    }
  }, []);

  const updateSetting = useCallback((settingKey, direction) => {
    const nextVal = moveSettingValue(settingKey, settings[settingKey], direction);
    const nextSettings = { ...settings, [settingKey]: nextVal };
    setSettings(nextSettings);
    saveSoundSettings(nextSettings);
    playPreviewForSetting(settingKey, nextVal, nextSettings.volume, nextSettings.vibrate);
  }, [playPreviewForSetting, settings]);

  const runAction = useCallback(async (row) => {
    stopAllSounds();
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
    if (!assetPath || selectedTone === "off") {
      setSystemStatus("Choose a tone first");
      return;
    }
    setSystemStatus("Applying…");
    const result = await applySystemTone(
      row.toneType,
      assetPath,
      getOptionLabel(settingKey, selectedTone),
    );
    setSystemStatus(result?.success
      ? `${row.toneType === "ringtone" ? "Ringtone" : row.toneType === "notification" ? "Notification" : "Alarm"} applied`
      : "Could not apply tone");
  }, [settings]);

  const handleRowClick = useCallback((index) => {
    setSelectedIndex(index);
    const row = ALL_SOUND_ROWS[index];
    if (!row) return;

    if (row.isAction) {
      runAction(row).catch(() => setSystemStatus("Could not open tone setting"));
      return;
    }

    updateSetting(row.key, "next");
  }, [runAction, updateSetting]);

  const handleKey = useCallback((key) => {
    if (key === "BACK" || key === "END" || key === "#") {
      stopAllSounds();
      onExit?.();
      return;
    }

    if (key === "UP" || key === "2") {
      setSelectedIndex((idx) => moveSoundMenuIndex(idx, "up", ALL_SOUND_ROWS.length));
      return;
    }

    if (key === "DOWN" || key === "8") {
      setSelectedIndex((idx) => moveSoundMenuIndex(idx, "down", ALL_SOUND_ROWS.length));
      return;
    }

    const currentRow = ALL_SOUND_ROWS[selectedIndex];

    if (key === "LEFT" || key === "4") {
      if (currentRow && !currentRow.isAction) {
        updateSetting(currentRow.key, "prev");
      }
      return;
    }

    if (key === "RIGHT" || key === "6") {
      if (currentRow && !currentRow.isAction) {
        updateSetting(currentRow.key, "next");
      }
      return;
    }

    if (key === "SELECT" || key === "5" || key === "SEND") {
      if (currentRow) {
        if (currentRow.isAction) {
          runAction(currentRow).catch(() => setSystemStatus("Could not open tone setting"));
        } else {
          updateSetting(currentRow.key, "next");
        }
      }
    }
  }, [onExit, runAction, selectedIndex, updateSetting]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  return (
    <div className="lcd-screen sound-screen" data-testid="sound-feature">
      {/* Top LCD Header */}
      <div className="lcd-sound__header">
        <div>
          <strong>Sound</strong>
          <small>{systemAccess.granted ? "PHONE TONES READY" : systemStatus}</small>
        </div>
        <div className="lcd-sound__meter" aria-label={`Volume ${settings.volume} of 5`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <i key={level} className={level <= settings.volume ? "is-on" : ""} />
          ))}
        </div>
      </div>

      {/* Settings List */}
      <div className="lcd-sound__list" data-testid="sound-settings-list">
        {ALL_SOUND_ROWS.map((row, idx) => {
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

          const valueLabel = getOptionLabel(row.key, settings[row.key]);

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
              <span className="lcd-sound__value">
                {isSelected && <span className="lcd-sound__arrows">◀</span>}
                <span>{valueLabel}</span>
                {isSelected && <span className="lcd-sound__arrows">▶</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer Softkey Labels */}
      <div className="lcd-sound__footer">
        <span>{ALL_SOUND_ROWS[selectedIndex]?.isAction ? "Select" : "Change"}</span>
        <span>{systemStatus}</span>
        <span>Back</span>
      </div>
    </div>
  );
});

SoundFeature.displayName = "SoundFeature";

export default SoundFeature;
