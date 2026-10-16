// Illustrations only: no device reads, pairing material or activation.
export default function OnboardingPreview({ kind }) {
  if (kind === "welcome") return <div className="onboarding-preview onboarding-preview--welcome">
    <div><span aria-hidden="true">01</span><strong>Essential tools</strong><small>Calls · Messages · Maps</small></div>
    <div><span aria-hidden="true">02</span><strong>Dumb Mode</strong><small>Less distraction. With a friend's help.</small></div>
  </div>;
  if (kind === "dumb-mode") return <div className="onboarding-preview onboarding-preview--dumb">
    <span className="onboarding-preview__label">EXAMPLE</span>
    <ol><li><b>1</b><span>Choose apps<strong>Block distractions</strong></span></li>
      <li><b>2</b><span>Friend holds code<strong>You keep essential tools</strong></span></li>
      <li><b>3</b><span>Ask to unlock<strong>Enter their eight-digit code</strong></span></li></ol>
  </div>;
  if (kind === "keys") return <div className="onboarding-preview onboarding-preview--keys">
    <div><b aria-hidden="true">↑</b><span>Up<strong>Open Menu</strong></span></div>
    <div><b aria-hidden="true">●</b><span>Centre<strong>Select</strong></span></div>
    <div><b className="onboarding-preview__red">Red</b><span>End key<strong>Return Home</strong></span></div>
  </div>;
  return null;
}
