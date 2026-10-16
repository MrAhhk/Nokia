import Keypad from './Keypad';
import { SidephoneShell } from '@/features/customization/SidephoneHardware';
import './NokiaLauncher.css';
import './CalmMiniscreen.css';
import '@/features/customization/font.css';
import '@/features/customization/keyboardColors.css';

// The existing launcher frame, shared without mounting launcher data writers.
// Geometry, artwork and the physical keypad remain owned by their existing CSS.
export default function NokiaFrame({ children, appearance = 'nokia', phoneName = 'Nokia', font = 'classic', keyboardColor = 'black', guideId, onKeypadPress }) {
  return <div className="nokia-launcher h-full w-full flex flex-col overflow-hidden select-none" data-testid="nokia-launcher" data-appearance={appearance} data-font={font} data-keyboard-color={keyboardColor} data-guide={guideId}>
    <div className="nokia-shell-rim" aria-hidden="true" />
    {appearance === 'sidephone' && <SidephoneShell />}
    <div className="nokia-launcher__screen h-1/2 w-full relative flex flex-col">{children}</div>
    <div className="nokia-wordmark" aria-label={phoneName}>
      {phoneName.toLowerCase() === 'nokia' ? <svg viewBox="0 0 300 52" aria-hidden="true">
        <path fill="currentColor" fillRule="evenodd" d="M0 0H13L43 34V0H55V52H42L12 18V52H0ZM75 0H112Q123 0 123 11V41Q123 52 112 52H75Q64 52 64 41V11Q64 0 75 0ZM78 11Q76 11 76 14V38Q76 41 79 41H108Q111 41 111 38V14Q111 11 108 11ZM133 0H145V21L171 0H189L158 25L190 52H172L145 29V52H133ZM198 0H210V52H198ZM244 0H263L300 52H284L277 41H231L224 52H209ZM238 30H269L254 8Z" />
      </svg> : <span className="nokia-wordmark__name">{phoneName}</span>}
    </div>
    <div className="nokia-launcher__keypad h-1/2 w-full flex items-center justify-center">
      <Keypad variant="launcher" appearance={appearance} onKeypadPress={onKeypadPress} />
    </div>
  </div>;
}
