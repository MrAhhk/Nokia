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
import { openSystemSetting, triggerHaptic } from "@/lib/launcherApps";
import "./sound.css";

const ALL_SOUND_ROWS = Object.freeze([
  ...SOUND_MENU_SECTIONS,
  { id: "android_sound", label: "Android sound settings", isAction: true },
]);

const SoundFeature = forwardRef(({ onExit }, ref) => {
  const [settings, setSettings] = useState(() => loadSoundSettings());
  const [selectedIndex, setSelectedIndex] = useState(0);
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
    setSettings((prev) => {
      const nextVal = moveSettingValue(settingKey, prev[settingKey], direction);
      const nextSettings = { ...prev, [settingKey]: nextVal };
      saveSoundSettings(nextSettings);
      playPreviewForSetting(settingKey, nextVal, nextSettings.volume, nextSettings.vibrate);
      return nextSettings;
    });
  }, [playPreviewForSetting]);

  const handleRowClick = useCallback((index) => {
    setSelectedIndex(index);
    const row = ALL_SOUND_ROWS[index];
    if (!row) return;

    if (row.isAction) {
      openSystemSetting("sound").catch((err) =>
        console.error("Error opening sound settings:", err)
      );
      return;
    }

    updateSetting(row.key, "next");
  }, [updateSetting]);

  const handleKey = useCallback((key) => {
    if (key === "END" || key === "#") {
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
          openSystemSetting("sound").catch((err) =>
            console.error("Error opening sound settings:", err)
          );
        } else {
          updateSetting(currentRow.key, "next");
        }
      }
    }
  }, [onExit, selectedIndex, updateSetting]);

  useImperativeHandle(ref, () => ({ handleKey }), [handleKey]);

  return (
    <div className="lcd-screen sound-screen" data-testid="sound-feature">
      {/* Top LCD Header */}
      <div className="lcd-sound__header">
        <span>Tones</span>
        <span>Vol {settings.volume}</span>
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
        <span>Change</span>
        <span>Back</span>
      </div>
    </div>
  );
});

SoundFeature.displayName = "SoundFeature";

export default SoundFeature;
