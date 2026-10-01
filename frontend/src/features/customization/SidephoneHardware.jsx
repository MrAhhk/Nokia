// Decoration only: all input continues through the shared Keypad.
export function SidephoneShell() {
  return <div className="sidephone-shell" aria-hidden="true">
    <div className="sidephone-glass"><span className="sidephone-earpiece" /></div>
    <span className="sidephone-bottom-seam" />
  </div>;
}

export function SidephoneHandset({ end = false }) {
  return <svg className="sidephone-handset" viewBox="0 0 32 32" aria-hidden="true">
    <path fill="currentColor" d="M8.4 4.2c-1.1-.5-2.3-.2-3 .7L3.2 8c-.8 1.1-.8 2.4-.4 3.8 2.5 8 8.2 13.7 16.3 16.1 1.3.4 2.7.3 3.7-.5l3.1-2.3c.9-.7 1.1-1.9.6-2.9l-2.6-4.1c-.5-.9-1.6-1.3-2.6-.9l-3.6 1.5a18.4 18.4 0 0 1-6.9-6.9l1.4-3.6c.4-1-.1-2.1-1-2.6z" />
    {end && <path d="M5 27 28 4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
  </svg>;
}

export function SidephoneAccessory({ number, letters }) {
  if (number === '0') return <svg className="sidephone-space" viewBox="0 0 32 16" aria-hidden="true"><path d="M2 3v10h28V3" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>;
  if (number === '#') return <small className="sidephone-shift">⌃</small>;
  return <small>{number === '1' ? '?!' : letters}</small>;
}
