# Nokia Launcher — Android release build

## Current identity and SDK

- App ID and namespace: `com.nokialauncher`
- App name: `Nokia Launcher`
- Version: `1.0.0` (code `1`)
- `compileSdk` / `targetSdk`: Android 16 / API 36
- Minimum SDK: API 22

## Build the app bundle

From `app/frontend`:

```powershell
yarn build
npx cap sync android
cd android
.\gradlew.bat :app:bundleRelease
```

The bundle is written to `app/build/outputs/bundle/release/app-release.aab`.

## Sign for Google Play

The repository contains no signing key. Copy `android/keystore.properties.example` to `android/keystore.properties`, enter the secure keystore values, and keep both the key and this properties file out of source control. The release build automatically uses those values when the properties file is present.

## Policy-sensitive features

- `QUERY_ALL_PACKAGES` is retained only because listing and launching installed apps is the launcher’s core function. Complete the Play Console App visibility declaration before uploading.
- Nokia System Keyboard is optional, processes text locally, and has no accessibility, overlay, location, contact, notification, or direct-call permission.
- Review [PLAY_STORE_SUBMISSION_GUIDE.md](../PLAY_STORE_SUBMISSION_GUIDE.md) and [PLAY_STORE_DATA_SAFETY.md](../PLAY_STORE_DATA_SAFETY.md) before every submission.
