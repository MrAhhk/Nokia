import { useEffect, useRef, useState } from 'react';
import { acceptAccessibilityDisclosure } from '@/lib/launcherApps';
import { ACCESSIBILITY_DISCLOSURE_VERSION } from './accessibilityDisclosure';

export default function AccessibilityHomeNotice({ onDismiss }) {
  const alive = useRef(true);
  const opening = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const enable = async () => {
    if (opening.current) return;
    opening.current = true; setBusy(true); setError('');
    try {
      await acceptAccessibilityDisclosure(ACCESSIBILITY_DISCLOSURE_VERSION);
      if (alive.current) onDismiss();
    } catch {
      if (alive.current) setError('Couldn’t open settings. Try again.');
    } finally {
      opening.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <section className="onboarding-handoff accessibility-home-notice" data-home-notice
    data-testid="accessibility-home-notice" aria-label="Enable Accessibility">
    <strong>Keypad access.</strong>
    <p>Accessibility reads foreground apps and screen text/controls for keypad navigation, Recents, screen lock and Dumb Mode blocking—even off-screen. On-device only; no screen-history storage or sharing. Optional. Enable means consent and opens Android settings.</p>
    {error && <p role="status">{error}</p>}
    <div><button disabled={busy} onClick={enable}>{busy ? 'Opening…' : 'Enable'}</button>
      <button autoFocus data-notice-dismiss disabled={busy} onClick={onDismiss}>Later</button></div>
  </section>;
}
