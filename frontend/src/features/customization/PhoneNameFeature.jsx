import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import MiniscreenClock from '@/components/MiniscreenClock';
import { createMultiTapComposer } from '@/domain/multiTapComposer';
import { NOKIA_MULTI_TAP_CYCLES } from '@/domain/keyGrammar';
import { DEFAULT_PHONE_NAME, PHONE_NAME_LIMIT } from './phoneNameStorage';

const PhoneNameFeature = forwardRef(({ name, currentTime, onSave, onExit }, ref) => {
  const [draft, setDraft] = useState(name), [pending, setPending] = useState(''), [error, setError] = useState('');
  const value = useRef(name), composer = useRef(null);
  const update = text => { value.current = Array.from(text).slice(0, PHONE_NAME_LIMIT).join(''); setDraft(value.current); setError(''); };
  useEffect(() => {
    composer.current = createMultiTapComposer({ cycles: NOKIA_MULTI_TAP_CYCLES, delay: 650,
      onPreview: setPending, onCommit: character => update(value.current + character) });
    return () => composer.current?.dispose();
  }, []);
  const save = () => { composer.current?.commit(); if (!onSave(value.current)) setError('Could not save. Try again.'); };
  const remove = () => { if (!composer.current?.cancelPending()) update(Array.from(value.current).slice(0, -1).join('')); };
  useImperativeHandle(ref, () => ({ handleKey(key) {
    if (['SOFT_RIGHT', 'BACK', 'HASH'].includes(key)) { composer.current?.reset(); onExit(); return true; }
    if (['SELECT', 'SEND', 'GREEN', 'SOFT_CENTER'].includes(key)) { save(); return true; }
    if (['SOFT_LEFT', 'BACKSPACE', 'DELETE'].includes(key)) { remove(); return true; }
    if (['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(key)) return true;
    return composer.current?.press(key) || false;
  } }));
  return <section className="lcd-screen phone-name-screen" data-testid="screen-phone-name">
    <MiniscreenClock currentTime={currentTime} />
    <h2 className="customization-heading">Phone name</h2>
    <div className="phone-name-body">
      <label htmlFor="phone-name-input">Name your phone</label>
      <input id="phone-name-input" value={draft + pending} maxLength={PHONE_NAME_LIMIT} placeholder={DEFAULT_PHONE_NAME}
        readOnly inputMode="none" tabIndex={-1} aria-describedby="phone-name-help"
        onPointerDown={event => event.preventDefault()} onFocus={event => event.target.blur()} />
      <p id="phone-name-help">Use the Nokia keypad to type. Leave blank to use Nokia.</p>
      {error && <p role="alert">{error}</p>}
    </div>
    <footer className="lcd-list-softkeys"><button type="button" onClick={remove}>Delete</button><button type="button" onClick={save}>Save</button><button type="button" onClick={onExit}>Back</button></footer>
  </section>;
});
export default PhoneNameFeature;
