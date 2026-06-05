# Google Play Store Data Safety Disclosure
## Nokia Launcher - May 2026 Compliance

### Data Collection Summary

**Does your app collect or share any of the required user data types?**
Yes

---

## Data Types Collected

### 1. Personal Information

#### Contact Info (Optional)
**Collected:** Yes (only with user permission via Contact Picker)
**Purpose:** 
- App functionality (displaying selected contacts in launcher)
- Personalization

**Collection Method:**
- User selects individual contacts through Android Contact Picker API
- Complies with April 2026 Google Play contacts policy
- Never accesses entire contact list

**Data Handling:**
- Not shared with third parties
- Can be deleted upon user request
- Not used for advertising

---

### 2. Location

#### Approximate Location (Optional)
**Collected:** Yes (only with user permission)
**Purpose:**
- App functionality (location-based features)
- Personalization

**Collection Method:**
- One-time access via Android location button (May 2026 policy compliant)
- Not used for background tracking
- No geofencing

**Data Handling:**
- Not shared with third parties
- Not used for advertising
- User can deny or revoke at any time

---

### 3. App Activity

#### App Interactions
**Collected:** Yes
**Purpose:**
- Analytics
- App functionality improvement
- Personalization

**Data Includes:**
- Page views and navigation patterns
- App launches
- Feature usage
- Button clicks and interactions

**Data Handling:**
- Anonymous and aggregated
- Not shared with third parties
- Not used for advertising
- Cannot be deleted (anonymized)

---

### 4. Device or Other IDs

#### Device ID
**Collected:** Yes
**Purpose:**
- Analytics
- Fraud prevention
- App functionality

**Data Handling:**
- Not shared with third parties
- Not used for advertising
- Cannot be deleted (required for app function)

---

## Data Security Practices

### Encryption
- **Data in transit:** Encrypted using HTTPS/TLS
- **Data at rest:** Encrypted using Android's built-in encryption

### Data Deletion
Users can request deletion of:
- Selected contact information
- Location data
- User preferences and settings

Method: Through app settings or by contacting privacy@nokialauncher.app

### Independent Security Review
- Security best practices followed
- Regular security audits conducted
- Compliant with Google Play security requirements

---

## Privacy Policy

Full privacy policy available at:
- **In-app:** Settings → Privacy Policy
- **Online:** https://nokialauncher.app/privacy

---

## Compliance Notes

### May 2026 Google Play Policy Updates

✅ **Contacts Permission (April 15, 2026):**
- Uses Android Contact Picker API exclusively
- No broad contacts access requested
- Individual contact selection only

✅ **Location Permission (May 2026):**
- Implements location button for one-time access
- No continuous background tracking
- Uses Geolocation API (not deprecated geofencing for foreground services)

✅ **Data Safety Disclosure:**
- Complete and accurate disclosure
- All SDK behaviors documented
- Third-party data sharing: None

✅ **Target API Level:**
- Targets Android API 34 (Android 14)
- Compatible with Android 16 granular permissions

✅ **No Self-Updates:**
- App updates only through Google Play Store
- No APK downloads or self-modification
- Compliant with Device and Network Abuse policy

---

## Contact

For data safety inquiries:
- **Email:** privacy@nokialauncher.app
- **Data Protection Officer:** dpo@nokialauncher.app

---

**Last Updated:** June 5, 2026
**App Version:** 1.0.0
**Compliance Review Date:** June 5, 2026
