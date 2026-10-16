import { forwardRef, useImperativeHandle, useState } from 'react';
import { APPEARANCES } from './appearanceStorage';
import MiniscreenClock from '@/components/MiniscreenClock';
import KeyboardColorFeature from './KeyboardColorFeature';
import { useRef } from 'react';

const CustomizationFeature = forwardRef(({ appearance, onChange, onExit, currentTime, keyboardColor = 'black', onKeyboardColorChange }, ref) => {
  const [colorsOpen, setColorsOpen] = useState(false);
  const colorRef = useRef(null);
  const [selected, setSelected] = useState(APPEARANCES.indexOf(appearance));
  const [message, setMessage] = useState('');
  const choose = (value) => {
    setSelected(APPEARANCES.indexOf(value));
    setMessage(onChange(value) ? '' : 'Applied for now. Storage is unavailable.');
  };
  useImperativeHandle(ref, () => ({
    handleKey(key) {
      if (colorsOpen) return colorRef.current?.handleKey(key) ?? false;
      if (['UP', 'LEFT', 'DOWN', 'RIGHT', '2', '4', '6', '8'].includes(key)) {
        const step = ['UP', 'LEFT', '2', '4'].includes(key) ? -1 : 1;
        setSelected(index => (index + step + 3) % 3); return true;
      }
      if (['SELECT', 'SEND', 'GREEN', '5', 'SOFT_CENTER'].includes(key)) { if (selected === 2) setColorsOpen(true); else choose(APPEARANCES[selected]); return true; }
      if (['SOFT_RIGHT', 'HASH', 'BACK'].includes(key)) { onExit(); return true; }
      return false;
    },
  }));
  if (colorsOpen) return <KeyboardColorFeature ref={colorRef} color={keyboardColor} onChange={onKeyboardColorChange} currentTime={currentTime} onExit={() => setColorsOpen(false)} />;
  return <div className="lcd-screen lcd-list-screen customization-screen" data-testid="screen-customization">
    <MiniscreenClock currentTime={currentTime} />
    <div className="customization-heading">Customization</div>
    <p className="customization-description">Choose your phone</p>
    <div className="customization-choices" role="radiogroup" aria-label="Phone appearance">
      {APPEARANCES.map((value, index) => <button key={value} type="button" role="radio"
        aria-checked={appearance === value} data-testid={`appearance-${value}`}
        className={`customization-choice ${selected === index ? 'is-focused' : ''}`}
        onClick={() => choose(value)}>
        <span className={`customization-preview customization-preview--${value}`} aria-hidden="true" />
        <span>{value === 'nokia' ? 'Nokia Original' : 'Sidephone Classic'}</span>
        <span className="customization-check" aria-hidden="true">{appearance === value ? '✓' : '○'}</span>
      </button>)}
      <button type="button" className={`customization-choice ${selected === 2 ? 'is-focused' : ''}`} onClick={() => { setSelected(2); setColorsOpen(true); }} data-testid="open-keyboard-color">Keyboard color <span className="customization-check">›</span></button>
    </div>
    <p className="customization-message" role="status">{message || 'Switch back any time.'}</p>
    <div className="lcd-list-softkeys"><span>↑ ↓</span><button type="button" onClick={() => selected === 2 ? setColorsOpen(true) : choose(APPEARANCES[selected])}>{selected === 2 ? 'Open' : 'Apply'}</button><button type="button" onClick={onExit}>Back</button></div>
  </div>;
});
export default CustomizationFeature;
