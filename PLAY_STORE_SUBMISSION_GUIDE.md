# Google Play Store Submission Guide
## Nokia Launcher - May 2026 Policy Compliance

---

## ✅ Pre-Submission Checklist

### 1. App Compliance Status

#### API Level Requirements ✓
- **Target SDK:** Android API 34 (Android 14)
- **Min SDK:** Android API 22 (Android 5.1)
- **Compile SDK:** Android API 34
- **Status:** ✅ Compliant with 2026 requirements (within 1 year of latest release)

#### Contacts Permission (April 2026 Policy) ✓
- **Implementation:** Android Contact Picker API
- **Access Level:** Individual contact selection only (no broad access)
- **Compliance Date:** April 15, 2026
- **Status:** ✅ Fully compliant - uses recommended Contact Picker

#### Location Permission (May 2026 Policy) ✓
- **Implementation:** Capacitor Geolocation plugin with one-time access
- **Location Button:** Supported via Android location button
- **Background Tracking:** None (one-time access only)
- **Geofencing:** Not used (deprecated for foreground services)
- **Status:** ✅ Fully compliant with May 2026 updates

#### Self-Update Policy ✓
- **Update Mechanism:** Google Play Store only
- **No APK Downloads:** Confirmed
- **No Code Injection:** Confirmed (no dex/JAR/.so from external sources)
- **Status:** ✅ Compliant

---

## 📋 Required Documentation

### 1. Privacy Policy ✓
- **Location:** `/privacy` route in app
- **Online URL:** Required for Play Console
- **Content:** Complete disclosure of data collection practices
- **File:** `/app/frontend/src/pages/PrivacyPolicy.jsx`

### 2. Terms of Service ✓
- **Location:** `/terms` route in app
- **Content:** Usage terms, license grant, user responsibilities
- **File:** `/app/frontend/src/pages/TermsOfService.jsx`

### 3. Data Safety Disclosure ✓
- **File:** `/app/PLAY_STORE_DATA_SAFETY.md`
- **Status:** Complete and accurate
- **Last Updated:** June 5, 2026

---

## 🔧 Build Instructions

### Generate Production APK

```bash
cd /app/frontend

# 1. Build React app
yarn build

# 2. Sync with Capacitor
npx cap sync android

# 3. Open in Android Studio
npx cap open android

# 4. In Android Studio:
# - Build → Generate Signed Bundle / APK
# - Select "Android App Bundle" (AAB format required for Play Store)
# - Create/use keystore
# - Build release bundle

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

### Generate Keystore (First Time Only)

```bash
keytool -genkey -v -keystore nokia-launcher-release.keystore \\
  -alias nokia-launcher \\
  -keyalg RSA -keysize 2048 -validity 10000

# Store keystore securely!
# You'll need: keystore password, key alias, key password
```

---

## 📝 Play Console Configuration

### 1. App Details

**App Name:** Nokia Launcher

**Short Description:**
Minimalist retro Nokia 3310-style launcher with T9 navigation and modern features.

**Full Description:**
Experience the nostalgia of Nokia 3310 with modern Android functionality. Nokia Launcher brings back the classic numeric keypad navigation with T9 input, pure black minimalist design, and intelligent app categorization.

**Features:**
• Classic Nokia 3310 aesthetic with modern functionality
• T9 numeric keypad navigation (2↑, 8↓, 5 select, # back)
• Intelligent app categorization (important vs entertainment apps)
• Minimalist dark black design with zero distractions
• Retro brutalist interface with instant response
• One-handed operation perfect for nostalgia lovers

**Category:** Personalization > Launchers

**Tags:** launcher, nokia, retro, minimalist, t9, keyboard, classic, 3310

### 2. Graphics Assets Required

#### Screenshots (Required - at least 2, max 8)
- **Phone:** 1080x1920 or 1440x2560 (16:9)
- Show: Home screen, App list, Navigation in action

#### Feature Graphic (Required)
- **Size:** 1024x500
- **Content:** Nokia Launcher branding with keypad visual

#### App Icon (Required)
- **Size:** 512x512
- **Format:** 32-bit PNG with alpha
- **Design:** Nokia-inspired icon with numeric keypad

#### Promo Video (Optional)
- **Length:** 30 seconds - 2 minutes
- **Content:** Demonstrate T9 navigation and app features

### 3. Store Listing

**Contact Details:**
- **Email:** support@nokialauncher.app
- **Website:** https://nokialauncher.app
- **Phone:** [Optional but recommended]

**Privacy Policy URL:**
- https://nokialauncher.app/privacy (or your domain)

---

## 🔒 Data Safety Section

### Data Collection Declaration

**Personal Info:**
- ☑️ Contact info (via Contact Picker - optional)
  - Purpose: App functionality, Personalization
  - Sharing: No
  - Can be deleted: Yes

**Location:**
- ☑️ Approximate location (optional)
  - Purpose: App functionality, Personalization  
  - Sharing: No
  - Can be deleted: Yes

**App Activity:**
- ☑️ App interactions
  - Purpose: Analytics, App functionality
  - Sharing: No
  - Can be deleted: No (anonymized)

**Device or Other IDs:**
- ☑️ Device ID
  - Purpose: Analytics, Fraud prevention
  - Sharing: No
  - Can be deleted: No (required for function)

**Data Security:**
- ✅ Data encrypted in transit (HTTPS/TLS)
- ✅ Data encrypted at rest (Android encryption)
- ✅ Users can request data deletion
- ✅ Committed to Google Play Families Policy: No

---

## 🎯 Content Rating

### IARC Questionnaire Answers

**Violence:** None
**Sexuality:** None
**Drugs:** None  
**Gambling:** None
**Language:** None
**Controlled Substances:** None
**Discrimination:** None

**Expected Rating:** EVERYONE (all markets)

---

## 🚀 Release Management

### Version Strategy

**Initial Release:**
- Version Code: 1
- Version Name: 1.0.0

**Update Cycle:**
- Bug fixes: Patch version (1.0.1)
- Features: Minor version (1.1.0)
- Major changes: Major version (2.0.0)

### Testing Tracks

**Internal Testing:**
- Limited to team members
- Used for initial validation

**Closed Testing:**
- Share link with beta testers
- Gather feedback before public release

**Open Testing:**
- Optional public beta
- Validate with larger audience

**Production:**
- Full public release
- Staged rollout recommended (10% → 50% → 100%)

---

## ⚠️ Common Rejection Reasons (2026)

### 1. Contacts Permission Violation
- ❌ Requesting READ_CONTACTS without using Contact Picker
- ✅ **Our Status:** Uses Contact Picker API only

### 2. Location Permission Issues  
- ❌ Background location without valid use case
- ❌ Not using location button for one-time access
- ✅ **Our Status:** One-time access with location button

### 3. Data Safety Mismatch
- ❌ Actual data collection differs from declared
- ✅ **Our Status:** Accurate disclosure matches implementation

### 4. Outdated Target API
- ❌ Targeting API level more than 1 year old
- ✅ **Our Status:** Targeting API 34 (current as of 2026)

### 5. Self-Update Mechanism
- ❌ Downloading APKs or updating outside Play Store
- ✅ **Our Status:** No self-update mechanism

---

## 📧 Support & Compliance

### Support Channels
- **Email:** support@nokialauncher.app
- **Privacy:** privacy@nokialauncher.app
- **Legal:** legal@nokialauncher.app

### Policy Compliance Contact
- **DPO:** dpo@nokialauncher.app
- **Response Time:** Within 48 hours

---

## 🔄 Post-Launch

### Monitoring
- Watch Play Console for policy violations
- Monitor crash reports and ANRs
- Track user reviews and ratings

### Updates
- Address policy changes within 30 days
- Keep target SDK updated annually
- Maintain Data Safety accuracy

### Resources
- **Play Console:** https://play.google.com/console
- **Policy Center:** https://support.google.com/googleplay/android-developer/
- **Policy Updates:** Subscribe to Android Developers blog

---

## ✅ Final Checklist Before Submission

- [ ] APK/AAB signed with release keystore
- [ ] Version code and name incremented
- [ ] Privacy Policy accessible online
- [ ] Data Safety declaration complete and accurate
- [ ] Store listing text proofread
- [ ] All required graphics uploaded (screenshots, icon, feature graphic)
- [ ] Content rating questionnaire completed
- [ ] Contact information verified
- [ ] Test on multiple devices and Android versions
- [ ] All May 2026 policy requirements met
- [ ] Backup of keystore stored securely

---

**Last Updated:** June 5, 2026
**Next Policy Review:** October 2026 (or when Google announces updates)
