# Google Play Data Safety Declaration

## Nokia Launcher — integrity integration review 22 August 2026

### Data Safety form answer

Do **not** reuse the earlier blanket “No off-device transmission” answer without reassessment. When invoked, Play Integrity transmits encrypted app, license, device-attestation, Play Protect, and app-environment signals to Google Play and the app backend for verification. The current backend processes decoded verdicts ephemerally and does not persist them. Complete the Play Console form against the final deployed behavior and Google’s current ephemeral-processing guidance.

### On-device data handling

- The launcher reads installed-app names, icons, package names, and launch activities only to display and open apps on the device. This inventory remains on-device and is never sold, shared, or used for analytics or advertising.
- The optional Nokia System Keyboard processes text locally to enter it into the app selected by the user. It does not store or transmit keyboard input.
- Sound preferences (tone choice, launcher volume, keypad feedback, and vibration preference) are stored locally in WebView storage and are not transmitted. On its first Android launch, the app offers a dismissible setup for the packaged ringtone, notification sound, and alarm. Nothing changes until the user selects “Set Nokia tones” and explicitly grants Android’s “modify system settings” access. The same user-triggered actions remain available in Sound settings. On Android 10+, the app copies only the selected packaged tone into MediaStore and makes it the requested device default. It does not read shared media or request broad storage access.
- Play Integrity does not add a runtime permission. The final permission declaration must still be generated from the signed AAB; the current manifest separately contains camera, microphone, network, phone, audio-policy, notification-policy, and installed-app visibility permissions for existing product features.

### Play Integrity processing

- Always processed by Google Play when requested: request hash, app metadata, Play license status, and device attestation information.
- Processed when environment details are enabled: app-activity signals used to detect capturing/controlling/overlay risks and device information used for Play Protect status.
- The backend receives decoded verdict categories and Android SDK version, validates them in memory, and currently does not store them.
- Play Integrity must not be used for device fingerprinting or user/device tracking.

### Play Console declarations required before submission

- **App visibility:** Declare `QUERY_ALL_PACKAGES` and explain that Nokia Launcher requires broad app visibility solely to list and launch installed apps, its core functionality. Do not use installed-app inventory for analytics, advertising, or sharing.
- **Data safety:** Include Play Integrity and its ephemeral backend verification in the form assessment. Reconfirm against the final signed AAB, server logging/retention, and every included SDK.
- **Developer verification:** Register `com.nokialauncher` to the verified developer account before the applicable rollout deadline.

### Privacy policy

The in-app policy is available at `/privacy`. Before submitting, publish the same policy at a stable, public HTTPS URL and enter that URL in Play Console.

**Last updated:** 25 August 2026
