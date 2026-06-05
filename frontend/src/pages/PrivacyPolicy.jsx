const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono" data-testid="privacy-policy-page">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 border-b border-white/20 pb-4">Privacy Policy</h1>
        <p className="text-sm text-white/60 mb-8">Last Updated: June 5, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">1. Introduction</h2>
          <p className="text-white/80 leading-relaxed">
            Nokia Launcher ("we," "our," or "the App") is committed to protecting your privacy. 
            This Privacy Policy explains how we collect, use, and safeguard your information when 
            you use our mobile application in compliance with Google Play Store policies effective 
            May 2026.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">2. Information We Collect</h2>
          <div className="space-y-4 text-white/80">
            <div>
              <h3 className="font-semibold text-white mb-2">2.1 Contact Information (Optional)</h3>
              <p className="leading-relaxed">
                With your explicit permission, we may access your contacts using the Android Contact 
                Picker API. We only access individual contacts you select—never your entire contact 
                list—in compliance with Google Play's April 2026 contacts policy update.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.2 Location Data (Optional)</h3>
              <p className="leading-relaxed">
                If you grant permission, we may access your device location for one-time use through 
                the Android location button. We do not continuously track your location or use 
                geofencing unless you explicitly enable location-based features.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.3 Device Information</h3>
              <p className="leading-relaxed">
                We collect basic device information including device model, operating system version, 
                and app version to ensure compatibility and improve performance.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">2.4 Usage Data</h3>
              <p className="leading-relaxed">
                We collect anonymous usage statistics such as app launches, feature usage, and 
                interaction patterns to improve the user experience.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>To provide and maintain the launcher functionality</li>
            <li>To display your selected contacts when you choose to access them</li>
            <li>To provide location-based features when requested</li>
            <li>To improve app performance and user experience</li>
            <li>To send important updates about the app (if you opt-in)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">4. Data Sharing and Disclosure</h2>
          <p className="text-white/80 leading-relaxed mb-4">
            We do not sell, trade, or rent your personal information to third parties. We may share 
            information only in the following circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>With your explicit consent</li>
            <li>To comply with legal obligations</li>
            <li>To protect our rights, privacy, safety, or property</li>
            <li>In connection with a merger, sale, or acquisition (with prior notice)</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">5. Data Security</h2>
          <p className="text-white/80 leading-relaxed">
            We implement industry-standard security measures to protect your information. All data 
            is encrypted in transit and at rest. However, no method of transmission over the internet 
            is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">6. Your Rights</h2>
          <p className="text-white/80 leading-relaxed mb-4">You have the right to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Revoke permissions at any time through device settings</li>
            <li>Opt-out of data collection features</li>
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