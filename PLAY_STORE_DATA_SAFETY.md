# Google Play Data Safety Declaration

## Nokia Launcher — release reviewed 19 August 2026

### Data Safety form answer

Select **No** for “Does your app collect or share any of the required user data types?” for this exact release. Nokia Launcher does not transmit user data off the device and does not share data with third parties.

### On-device data handling

- The launcher reads installed-app names, icons, package names, and launch activities only to display and open apps on the device. This inventory remains on-device and is never sold, shared, or used for analytics or advertising.
- The optional Nokia System Keyboard processes text locally to enter it into the app selected by the user. It does not store or transmit keyboard input.
- The release requests no location, contacts, notification, overlay, phone, storage, camera, microphone, or advertising-ID permissions.

### Play Console declarations required before submission

- **App visibility:** Declare `QUERY_ALL_PACKAGES` and explain that Nokia Launcher requires broad app visibility solely to list and launch installed apps, its core functionality. Do not use installed-app inventory for analytics, advertising, or sharing.
- **Data safety:** Reconfirm this answer against the final signed AAB and every included SDK. Any future analytics, crash reporting, account, network, or data-collection feature requires a new assessment and updated disclosure.
- **Developer verification:** Register `com.nokialauncher` to the verified developer account before the applicable rollout deadline.

### Privacy policy

The in-app policy is available at `/privacy`. Before submitting, publish the same policy at a stable, public HTTPS URL and enter that URL in Play Console.

**Last updated:** 19 August 2026
