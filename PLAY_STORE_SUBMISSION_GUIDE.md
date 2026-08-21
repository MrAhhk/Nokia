# Nokia Launcher — Play release checklist

**Package:** `com.nokialauncher`  
**Display name:** Nokia Launcher  
**Version:** 1.0.0 (version code 1)  
**Release review:** 19 August 2026

## Build configuration

- `compileSdk` and `targetSdk` are Android 16 / API 36. This meets Google Play's requirement for new apps and updates beginning 31 August 2026.
- Build and upload a signed Android App Bundle (`.aab`); do not ship an APK as the Play production artifact.
- Keep the release signing key under the developer's control and increment `versionCode` for every subsequent upload.

## Required Play Console actions

1. Complete the **App visibility** declaration for `QUERY_ALL_PACKAGES`. State that it is indispensable to Nokia Launcher's core purpose: displaying and launching installed apps. Do not use this inventory for analytics, advertising, sale, or sharing.
2. Complete **Data safety** using [PLAY_STORE_DATA_SAFETY.md](PLAY_STORE_DATA_SAFETY.md), after checking the final signed bundle and every included SDK.
3. Provide a public, stable HTTPS privacy-policy URL matching the in-app `/privacy` policy.
4. Complete the app-content, content-rating, ads, target-audience, and account-deletion questions accurately for the released feature set.
5. Register `com.nokialauncher` to the verified developer account before the applicable Android developer-verification rollout deadline.

## Final verification

- Test the signed AAB on Android 16 and a supported older Android release.
- Verify launcher selection, installed-app listing, app launching, calling via the system dialer, and enabling/using the optional Nokia System Keyboard.
- Confirm no feature reintroduces location, contacts, notification, overlay, direct-call, or AccessibilityService permissions without a new policy and Data safety review.
- Confirm the store listing makes the optional keyboard clear and does not claim Nokia affiliation or use protected branding without authorization.

This checklist prepares the project for submission; a valid signing key, verified developer account, public privacy-policy URL, and Play Console declarations must be supplied by the publisher.
