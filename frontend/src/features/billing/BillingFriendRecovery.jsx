import { useCallback, useRef, useState } from 'react';
import NokiaFrame from '@/components/NokiaFrame';
import DumbModeFeature from '@/features/dumbMode/DumbModeFeature';
import { loadAppearance } from '@/features/customization/appearanceStorage';
import { loadSoundSettings } from '@/features/sound/soundStorage';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';

// Existing offline obligations survive access expiry. This route never mounts
// LauncherApp, scans installed apps, creates pairings or starts a new lock.
export default function BillingFriendRecovery({ onExit }) {
  const [appearance] = useState(loadAppearance);
  const feature = useRef(null);
  const handleKey = useCallback(key => {
    const settings = loadSoundSettings();
    playKeypadTone(key, settings.keypadTone, settings.volume, settings.vibrate);
    return feature.current?.handleKey(key);
  }, []);
  return <NokiaFrame appearance={appearance} onKeypadPress={handleKey}>
    <DumbModeFeature ref={feature} recoveryOnly onExit={onExit} />
  </NokiaFrame>;
}
