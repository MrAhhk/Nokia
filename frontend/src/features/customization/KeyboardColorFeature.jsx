import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import MiniscreenClock from '@/components/MiniscreenClock';
import { KEYBOARD_COLORS } from './keyboardColorStorage';

const KeyboardColorFeature = forwardRef(({ color = 'black', onChange, onExit, currentTime }, ref) => {
  const [selected, setSelected] = useState(Math.max(0, KEYBOARD_COLORS.indexOf(color)));
  const [message, setMessage] = useState('');
  const busy = useRef(false);
  const choose = async value => {
    if (busy.current) return;
    busy.current = true;
    setMessage('Saving…');
    setSelected(KEYBOARD_COLORS.indexOf(value));
    try { setMessage(await onChange(value) ? 'Saved.' : 'Applied here. Could not save everywhere.'); }
    catch { setMessage('Could not save. Try again.'); }
    finally { busy.current = false; }
  };
  useImperativeHandle(ref, () => ({ handleKey(key) {
    const step = { UP: -3, '2': -3, DOWN: 3, '8': 3, LEFT: -1, '4': -1, RIGHT: 1, '6': 1 }[key];
    if (step) { setSelected(index => (index + step + 9) % 9); return true; }
    if (['SELECT', 'SEND', 'GREEN', '5', 'SOFT_CENTER'].includes(key)) { choose(KEYBOARD_COLORS[selected]); return true; }
    if (['BACK', 'HASH', 'SOFT_RIGHT'].includes(key)) { onExit(); return true; }
    return false;
  } }));
  return <section className="lcd-screen lcd-list-screen keyboard-color-screen" data-testid="screen-keyboard-color">
    <MiniscreenClock currentTime={currentTime} />
    <h2 className="customization-heading">Keyboard color</h2>
    <div className="keyboard-color-grid" role="radiogroup" aria-label="Keyboard color">
      {KEYBOARD_COLORS.map((value, index) => <button type="button" role="radio" key={value}
        aria-checked={color === value} aria-label={value} data-color={value}
        className={`keyboard-color-option ${selected === index ? 'is-focused' : ''}`} onClick={() => choose(value)}>
        <span className="keyboard-color-swatch" aria-hidden="true" />
        <span>{value}{color === value ? ' ✓' : ''}</span>
      </button>)}
    </div>
    <p className="keyboard-color-message" role="status">{message || 'Keys & frame. Choose your color.'}</p>
    <footer className="lcd-list-softkeys"><span>↑ ↓ ← →</span><button onClick={() => choose(KEYBOARD_COLORS[selected])}>Apply</button><button onClick={onExit}>Back</button></footer>
  </section>;
});
export default KeyboardColorFeature;
