import { privacySections } from './privacyContent';

const PrivacyPolicy = () => (
  <main className="min-h-screen bg-black text-white p-6 font-mono" data-testid="privacy-policy-page">
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 border-b border-white/20 pb-4">Nokia Launcher Privacy Policy</h1>
      <p className="text-sm text-white/60 mb-8">Last updated: 12 October 2026 · Policy version 2.1</p>
      {privacySections.map(([heading, text], index) => (
        <section className="mb-8" key={heading}>
          <h2 className="text-xl font-bold mb-4">{index + 1}. {heading}</h2>
          <p className="text-white/80 leading-relaxed whitespace-pre-line">{text}</p>
        </section>
      ))}
      <nav className="flex flex-wrap gap-5 text-sm underline" aria-label="Privacy resources">
        <a href="mailto:mr.ahhk142857@gmail.com">Privacy contact</a>
        <a href="https://www.revenuecat.com/privacy">RevenueCat privacy</a>
        <a href="https://policies.google.com/privacy">Google privacy</a>
        <a href="/about">About</a>
      </nav>
    </div>
  </main>
);
export default PrivacyPolicy;
