import "./toneSetup.css";

const ToneSetupPrompt = ({ busy, message, onAccept, onSkip }) => (
  <section className="lcd-screen tone-setup" data-testid="tone-setup">
    <header className="tone-setup__header">
      <strong>Set Nokia tones?</strong>
      <span>FIRST SETUP</span>
    </header>

    <p className="tone-setup__intro">Use Nokia Launcher sounds for:</p>

    <div className="tone-setup__tones" aria-label="Phone sounds to set">
      <span><i aria-hidden="true" />Calls</span>
      <span><i aria-hidden="true" />Messages</span>
      <span><i aria-hidden="true" />Alarms</span>
    </div>

    <p className="tone-setup__status" role="status">
      {message || "Android will ask for one access setting."}
    </p>

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
