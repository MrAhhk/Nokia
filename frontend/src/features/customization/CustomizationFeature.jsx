import { forwardRef, useImperativeHandle, useState } from 'react';
import { APPEARANCES } from './appearanceStorage';

const CustomizationFeature = forwardRef(({ appearance, onChange, onExit }, ref) => {
  const [selected, setSelected] = useState(APPEARANCES.indexOf(appearance));
  const [message, setMessage] = useState('');
  const choose = (value) => {
    setSelected(APPEARANCES.indexOf(value));
    setMessage(onChange(value) ? '' : 'Applied for now. Storage is unavailable.');
  };
  useImperativeHandle(ref, () => ({
    handleKey(key) {
      if (['UP', 'LEFT', 'DOWN', 'RIGHT', '2', '4', '6', '8'].includes(key)) {
        setSelected(index => 1 - index); return true;
      }
      if (['SELECT', 'SEND', 'GREEN', '5'].includes(key)) { choose(APPEARANCES[selected]); return true; }
      if (['SOFT_RIGHT', 'HASH', 'BACK'].includes(key)) { onExit(); return true; }
      return false;
    },
  }));
  return <div className="lcd-screen lcd-list-screen customization-screen" data-testid="screen-customization">
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
    </div>
    <p className="customization-message" role="status">{message || 'Switch back any time.'}</p>
    <div className="lcd-list-softkeys"><span>↑ ↓</span><button type="button" onClick={() => choose(APPEARANCES[selected])}>Apply</button><button type="button" onClick={onExit}>Back</button></div>
  </div>;
});
export default CustomizationFeature;
