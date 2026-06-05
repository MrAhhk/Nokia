const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-black text-white p-6 font-mono" data-testid="terms-of-service-page">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 border-b border-white/20 pb-4">Terms of Service</h1>
        <p className="text-sm text-white/60 mb-8">Last Updated: June 5, 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">1. Acceptance of Terms</h2>
          <p className="text-white/80 leading-relaxed">
            By downloading, installing, or using Nokia Launcher ("the App"), you agree to be bound 
            by these Terms of Service. If you do not agree to these terms, do not use the App.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">2. License Grant</h2>
          <p className="text-white/80 leading-relaxed mb-4">
            We grant you a limited, non-exclusive, non-transferable, revocable license to use the 
            App for personal, non-commercial purposes, subject to these Terms.
          </p>
          <p className="text-white/80 leading-relaxed">
            You may not:
          </p>
          <ul className="list-disc list-inside space-y-2 text-white/80 mt-2">
            <li>Modify, reverse engineer, or decompile the App</li>
            <li>Remove any proprietary notices or labels</li>
            <li>Use the App for any illegal purpose</li>
            <li>Attempt to gain unauthorized access to any part of the App</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">3. User Responsibilities</h2>
          <p className="text-white/80 leading-relaxed mb-4">You agree to:</p>
          <ul className="list-disc list-inside space-y-2 text-white/80">
            <li>Provide accurate information when required</li>
            <li>Maintain the security of your device</li>
            <li>Use the App in compliance with all applicable laws and regulations</li>
            <li>Not use the App to harm others or interfere with their use of the App</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">4. Permissions and Data</h2>
          <p className="text-white/80 leading-relaxed">
            The App may request various device permissions (contacts, location, etc.). By granting 
            these permissions, you authorize the App to access the relevant data as described in 
            our Privacy Policy. You can revoke permissions at any time through your device settings.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">5. App Updates and Modifications</h2>
          <p className="text-white/80 leading-relaxed">
            We reserve the right to modify, suspend, or discontinue any aspect of the App at any 
            time. Updates may be delivered through the Google Play Store. Continued use after 
            updates constitutes acceptance of the modified App.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">6. Disclaimer of Warranties</h2>
          <p className="text-white/80 leading-relaxed">
            THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, 
            INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR 
            PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE APP WILL BE ERROR-FREE OR 
            UNINTERRUPTED.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">7. Limitation of Liability</h2>
          <p className="text-white/80 leading-relaxed">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, 
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR 
            REVENUES, WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, 
            OR OTHER INTANGIBLE LOSSES RESULTING FROM YOUR USE OF THE APP.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">8. Indemnification</h2>
          <p className="text-white/80 leading-relaxed">
            You agree to indemnify and hold harmless Nokia Launcher and its affiliates from any 
            claims, damages, losses, liabilities, and expenses arising from your use of the App 
            or violation of these Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">9. Termination</h2>
          <p className="text-white/80 leading-relaxed">
            We may terminate or suspend your access to the App immediately, without prior notice, 
            if you breach these Terms. Upon termination, you must cease all use of the App and 
            delete it from your device.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">10. Governing Law</h2>
          <p className="text-white/80 leading-relaxed">
            These Terms are governed by and construed in accordance with the laws of [Your 
            Jurisdiction], without regard to conflict of law principles. Any disputes shall be 
            resolved in the courts of [Your Jurisdiction].
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">11. Changes to Terms</h2>
          <p className="text-white/80 leading-relaxed">
            We reserve the right to modify these Terms at any time. We will notify users of 
            material changes through the App or via email. Continued use after changes constitutes 
            acceptance of the modified Terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold mb-4">12. Contact Information</h2>
          <p className="text-white/80 leading-relaxed">
            For questions about these Terms, please contact us at:
          </p>
          <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded">
            <p className="text-white">Email: legal@nokialauncher.app</p>
            <p className="text-white">Address: [Your Company Address]</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default TermsOfService;