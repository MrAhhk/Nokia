# Nokia Launcher - Android Build Instructions

## Overview
This project uses **Capacitor 6** to wrap the React web app into a native Android application, compliant with Google Play Store policies as of May 2026.

---

## Prerequisites

### Required Software
- **Node.js:** v20.x or higher (currently using v20.20.2)
- **Yarn:** 1.22.22+
- **Android Studio:** Latest stable version (2026)
- **Java:** JDK 17 or higher
- **Capacitor CLI:** 6.2.1 (installed locally)

### Android SDK Requirements
- **Android SDK Platform:** API 34 (Android 14)
- **Build Tools:** 34.0.0 or higher
- **Target SDK:** API 34
- **Min SDK:** API 22 (Android 5.1)

---

## Project Structure

```
/app/frontend/
├── android/                    # Native Android project
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   └── assets/public/  # Built web assets
│   │   └── build.gradle
│   ├── variables.gradle        # Android SDK versions
│   └── build.gradle
├── build/                      # React production build
├── src/                        # React source code
├── capacitor.config.json       # Capacitor configuration
└── package.json
```

---

## Build Process

### 1. Install Dependencies

```bash
cd /app/frontend
yarn install
```

### 2. Build React App

```bash
yarn build
```

This creates optimized production files in the `build/` directory.

### 3. Sync with Capacitor

```bash
npx cap sync android
```

This copies web assets to Android project and updates native plugins.

### 4. Open in Android Studio

```bash
npx cap open android
```

Or manually open `/app/frontend/android` in Android Studio.

---

## Development Workflow

### Live Reload During Development

```bash
# Terminal 1: Start React dev server
yarn start

# Terminal 2: Run on Android device/emulator
npx cap run android
```

The app will connect to your local dev server for hot reloading.

### Testing Build

```bash
# Build and run release variant
npx cap run android --variant=release
```

---

## Release Build for Play Store

### Step 1: Generate Keystore (First Time Only)

```bash
keytool -genkey -v -keystore release-key.keystore \\
  -alias nokia-launcher-key \\
  -keyalg RSA \\
  -keysize 2048 \\
  -validity 10000
```

**Important:** Store the keystore file and passwords securely! You'll need them for all future updates.

### Step 2: Configure Signing

Create or edit `android/gradle.properties`:

```properties
RELEASE_STORE_FILE=path/to/release-key.keystore
RELEASE_STORE_PASSWORD=your_store_password
RELEASE_KEY_ALIAS=nokia-launcher-key
RELEASE_KEY_PASSWORD=your_key_password
```

Or add to `android/app/build.gradle`:

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("path/to/release-key.keystore")
            storePassword "your_store_password"
            keyAlias "nokia-launcher-key"
            keyPassword "your_key_password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

### Step 3: Build AAB (Android App Bundle)

In Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. Select **Android App Bundle**
3. Choose your keystore and enter passwords
4. Select **release** build variant
5. Click **Finish**

Or via command line:

```bash
cd android
./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab`

### Step 4: Verify Bundle

```bash
# Check bundle contents
bundletool build-apks --bundle=app-release.aab \\
  --output=app-release.apks \\
  --mode=universal

# Extract and inspect
unzip app-release.apks -d extracted/
```

---

## Capacitor Configuration

### capacitor.config.json

```json
{
  "appId": "com.nokialauncher.app",
  "appName": "Nokia Launcher",
  "webDir": "build",
  "bundledWebRuntime": false,
  "android": {
    "allowMixedContent": false,
    "captureInput": true,
    "webContentsDebuggingEnabled": false
  }
}
```

### Plugins Used

- **@capacitor/core:** 6.2.1 - Core Capacitor runtime
- **@capacitor/android:** 6.2.1 - Android platform
- **@capacitor/geolocation:** 6.1.1 - Location services (2026 compliant)

---

## Android Permissions (2026 Compliant)

### Current Permissions in AndroidManifest.xml

```xml
<!-- Required -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Optional - requested at runtime -->
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### Runtime Permission Handling

All sensitive permissions are requested at runtime using Android's permission system:

```javascript
// Example: Request location permission
import { Geolocation } from '@capacitor/geolocation';

const getCurrentPosition = async () => {
  try {
    const coordinates = await Geolocation.getCurrentPosition();
    console.log('Current position:', coordinates);
  } catch (error) {
    console.error('Error getting location', error);
  }
};
```

---

## Compliance Features (May 2026)

### ✅ Contacts Permission
- Implementation: Contact Picker API (when needed)
- Policy: April 15, 2026 update compliant
- Access: Individual contact selection only

### ✅ Location Permission
- Implementation: Capacitor Geolocation with one-time access
- Policy: May 2026 location button requirement
- Usage: No background tracking, no geofencing

### ✅ Target API Level
- Current: API 34 (Android 14)
- Compliance: Within 1 year of latest release
- Min Support: API 22 (Android 5.1+)

### ✅ No Self-Updates
- Updates: Google Play Store only
- No external APK downloads
- No runtime code injection

---

## Troubleshooting

### Build Fails with "SDK not found"

```bash
# Set ANDROID_SDK_ROOT environment variable
export ANDROID_SDK_ROOT=$HOME/Android/Sdk

# Or add to ~/.bashrc or ~/.zshrc
echo 'export ANDROID_SDK_ROOT=$HOME/Android/Sdk' >> ~/.bashrc
```

### Gradle Sync Issues

```bash
# Clear Gradle cache
cd android
./gradlew clean

# Rebuild
./gradlew assembleRelease
```

### Web Assets Not Updating

```bash
# Force sync
yarn build
npx cap sync android --force
```

### App Crashes on Launch

Check logs:

```bash
# View Android logs
npx cap run android --livereload

# Or use adb
adb logcat | grep Capacitor
```

---

## Version Management

### Updating Version for New Release

1. **Update package.json:**
   ```json
   {
     "version": "1.0.1"
   }
   ```

2. **Update android/app/build.gradle:**
   ```gradle
   defaultConfig {
       versionCode 2      // Increment for each release
       versionName "1.0.1" // Match package.json
   }
   ```

3. **Rebuild:**
   ```bash
   yarn build
   npx cap sync android
   # Generate new signed bundle
   ```

---

## Testing Checklist

Before submitting to Play Store:

- [ ] Test on multiple Android versions (API 22-34)
- [ ] Test on different screen sizes (phone, tablet)
- [ ] Verify all permissions work correctly
- [ ] Test offline functionality
- [ ] Check app size (<150MB recommended)
- [ ] Verify no crashes or ANRs
- [ ] Test navigation and all features
- [ ] Verify privacy policy and terms are accessible

---

## Resources

- **Capacitor Docs:** https://capacitorjs.com/docs
- **Android Developer Guide:** https://developer.android.com
- **Play Console:** https://play.google.com/console
- **Policy Updates:** https://support.google.com/googleplay/android-developer/

---

## Support

For build issues or questions:
- **Email:** dev@nokialauncher.app
- **GitHub:** [Your repository URL]

---

**Last Updated:** June 5, 2026
**Capacitor Version:** 6.2.1
**Android Target SDK:** API 34
