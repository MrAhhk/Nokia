import { forwardRef, useImperativeHandle, useState } from 'react';
import MiniscreenClock from '@/components/MiniscreenClock';
import { FONTS } from './fontStorage';

const FontFeature = forwardRef(({ font, currentTime, onChange, onExit }, ref) => {
  const [selected, setSelected] = useState(FONTS.indexOf(font));
  const [message, setMessage] = useState('');
  const choose = value => {
    setSelected(FONTS.indexOf(value));
    setMessage(onChange(value) ? '' : 'Applied for now. Storage is unavailable.');
  };
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if (['UP', 'DOWN', 'LEFT', 'RIGHT', '2', '4', '6', '8'].includes(key)) { setSelected(index => 1 - index); return true; }
    if (['SELECT', 'SEND', 'GREEN', '5', 'SOFT_CENTER'].includes(key)) { choose(FONTS[selected]); return true; }
    if (['SOFT_RIGHT', 'HASH', 'BACK'].includes(key)) { onExit(); return true; }
    return false;
  } }));
  return <section className="lcd-screen lcd-list-screen font-screen" data-testid="screen-font">
    <MiniscreenClock currentTime={currentTime} />
    <h2 className="customization-heading">Font</h2>
    <div className="font-choices" role="radiogroup" aria-label="LCD font">
      {FONTS.map((value, index) => <button key={value} type="button" role="radio" aria-checked={font === value}
        className={`lcd-list-row ${selected === index ? 'is-selected' : ''}`} onClick={() => choose(value)}>
        <span>{value === 'vt323' ? 'VT323 · Pixel' : 'Classic · Original'}</span>
        <span aria-hidden="true">{font === value ? '✓' : '○'}</span>
      </button>)}
      <p className="font-sample">Nokia 12:34<br />Điện thoại · Tin nhắn</p>
      <p role="status">{message || 'LCD text only. Works offline.'}</p>
    </div>
    <footer className="lcd-list-softkeys"><span>↑ ↓</span><button onClick={() => choose(FONTS[selected])}>Apply</button><button onClick={onExit}>Back</button></footer>
  </section>;
});
export default FontFeature;
