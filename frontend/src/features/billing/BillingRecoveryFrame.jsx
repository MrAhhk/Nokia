import { useCallback, useRef, useState } from 'react';
import NokiaFrame from '@/components/NokiaFrame';
import { loadAppearance } from '@/features/customization/appearanceStorage';
import { loadSoundSettings } from '@/features/sound/soundStorage';
import { playKeypadTone } from '@/features/sound/nokiaAudioEngine';

// Presentation only. The bootstrap retains every independent native escape.
export default function BillingRecoveryFrame({ children }) {
  const [appearance] = useState(loadAppearance);
  const panel = useRef(null);
  const focused = useRef(null);
  const handleKey = useCallback(key => {
    const settings = loadSoundSettings();
    playKeypadTone(key, settings.keypadTone, settings.volume, settings.vibrate);
    const controls = [...(panel.current?.querySelectorAll('button:not(:disabled)') || [])];
    if (!controls.length) return;
    const selectTarget = target => {
      focused.current?.removeAttribute('data-billing-focused');
      focused.current = target;
      target?.setAttribute('data-billing-focused', 'true');
      target?.focus();
    };
    if (['BACK', 'SOFT_RIGHT', 'HOME', 'END'].includes(key)) {
      selectTarget(panel.current.querySelector('.billing-bootstrap__actions button'));
    } else if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(key)) {
      const index = controls.indexOf(controls.includes(focused.current) ? focused.current : document.activeElement);
      const delta = ['UP', 'LEFT'].includes(key) ? -1 : 1;
      const target = controls[(index + delta + controls.length) % controls.length];
      selectTarget(target); target.scrollIntoView?.({ block: 'nearest' });
    } else if (['SELECT', 'SOFT_LEFT'].includes(key)) {
      const target = controls.includes(focused.current) ? focused.current : controls.includes(document.activeElement) ? document.activeElement : controls[0];
      target.click();
    }
  }, []);
  return <NokiaFrame appearance={appearance} onKeypadPress={handleKey}>
    <div className="billing-recovery-frame lcd-screen" ref={panel} onFocusCapture={event => {
      if (event.target.tagName === 'BUTTON') {
        focused.current?.removeAttribute('data-billing-focused');
        focused.current = event.target;
        event.target.setAttribute('data-billing-focused', 'true');
      }
    }}>{children}</div>
  </NokiaFrame>;
}
