import "./toneSetup.css";

const ToneSetupPrompt = ({ busy, message, onAccept, onSkip }) => (
  <section className="lcd-screen tone-setup" data-testid="tone-setup">
    <header className="tone-setup__header">
      <span>YOUR PHONE, YOUR SOUND</span>
      <span>OPTIONAL</span>
    </header>

    <div className="tone-setup__body">
      <div className="tone-setup__intro">
        <span className="tone-setup__symbol" aria-hidden="true">♫</span>
        <h2>A familiar sound.</h2>
        <p>Bring Nokia tones to your calls, messages and alarms.</p>
      </div>

    <div className="tone-setup__tones" aria-label="Phone sounds to set">
      <span><i aria-hidden="true" />Calls</span>
      <span><i aria-hidden="true" />Messages</span>
      <span><i aria-hidden="true" />Alarms</span>
    </div>

    <p className="tone-setup__status" role="status">
      {message || "Android will ask for access to change system sounds. You can keep your current sounds instead."}
    </p>
    </div>

    <div className="tone-setup__choices">
      <button
        type="button"
        data-tone-choice="accept"
        disabled={busy}
        onClick={onAccept}
      >
        {busy ? "Setting…" : "Set Nokia tones"}
      </button>
      <button
        type="button"
        data-tone-choice="skip"
        disabled={busy}
        onClick={onSkip}
      >
        Not now
      </button>
    </div>

    <footer className="tone-setup__softkeys">
      <span>Set</span>
      <span>Not now</span>
    </footer>
  </section>
);

export default ToneSetupPrompt;
