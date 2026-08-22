const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono" data-testid="privacy-policy-page">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 border-b border-white/20 pb-4">Privacy Policy</h1>
        <p className="text-sm text-white/60 mb-8">Last Updated: August 22, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">1. Introduction</h2>
          <p className="text-white/80 leading-relaxed">
            Nokia Launcher ("we," "our," or "the App") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, and safeguard your information when 
            use our mobile application.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">2. Information We Handle</h2>
          <div className="space-y-4 text-white/80">
            <div>
              <h3 className="font-semibold text-white mb-2">2.1 Installed-app information</h3>
              <p className="leading-relaxed">
                To provide its core launcher function, the App reads the names, icons, package names, 
                and launch activities of apps installed on your device. This information stays on your 
                device and is not sent to us or to third parties.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.2 Keyboard input</h3>
              <p className="leading-relaxed">
                If you enable Nokia System Keyboard in Android settings, the keyboard processes text 
                locally to send it to the app you are typing in. The App does not store, transmit, or 
                use that text for analytics, advertising, or any other purpose.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.3 Play Integrity security checks</h3>
              <p className="leading-relaxed">
                When the App requests a security check, Google Play processes app metadata, licensing,
                device-attestation information, and—when enabled in Play Console—signals about Play
                Protect and apps that could capture, overlay, or control the App. The encrypted result is
                sent to our backend for verification and handled ephemerally for that request. We do not
                use Play Integrity to fingerprint, track, advertise to, or profile users or devices.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.4 Other data collection</h3>
              <p className="leading-relaxed">
                The App does not send installed-app inventory or keyboard input to our backend and does
                not use analytics or advertising SDKs. It does not collect location, contacts, advertising
                identifiers, or keyboard content.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>To provide and maintain the launcher functionality</li>
            <li>To list and open apps installed on your device</li>
            <li>To provide local T9 keyboard input when you explicitly enable the keyboard</li>
            <li>To verify app, device, and environment integrity for security</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">4. Data Sharing and Disclosure</h2>
          <p className="text-white/80 leading-relaxed mb-4">
            We do not sell, trade, or rent personal information. Security checks use Google Play
            Integrity, and an encrypted token is sent to our backend and Google for verification. The App
            has no analytics or advertising SDKs in this release.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">5. Data Security</h2>
          <p className="text-white/80 leading-relaxed">
            Installed-app information and keyboard input remain protected by Android's app sandbox and
            device security controls. Play Integrity requests are encrypted in transit; decoded security
            verdicts are processed for the current request and are not stored by the current backend.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">6. Your Rights</h2>
          <p className="text-white/80 leading-relaxed mb-4">You have the right to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>Stop using the App or uninstall it at any time</li>
            <li>Disable Nokia System Keyboard at any time in Android settings</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">7. Children's Privacy</h2>
          <p className="text-white/80 leading-relaxed">
            Our app is not intended for children under 13. We do not knowingly collect personal 
            information from children. If you believe we have collected data from a child, please 
            contact us immediately.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">8. Changes to This Policy</h2>
          <p className="text-white/80 leading-relaxed">
            We may update this Privacy Policy to reflect changes in our practices or legal requirements. 
            We will notify you of significant changes through the app or via email.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">9. Contact Us</h2>
          <p className="text-white/80 leading-relaxed">
            If you have questions about this Privacy Policy, please contact us at:
          </p>
          <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded">
            <p className="text-white">Email: privacy@nokialauncher.app</p>
            <p className="text-white">Address: [Your Company Address]</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
