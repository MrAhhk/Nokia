# First-run guide

Five brief pages occupy the real miniscreen and reuse `lcd-screen` styling. The shared hardware shell and Keypad remain mounted. The Messages exercise uses the existing app chooser; choosing saves a default without launching it. During that exercise the guide returns null: the real picker occupies the entire LCD. Never restore the compact caption or split the miniscreen.

`onboardingState` owns the stable completion key. Finish and Skip persist completion; incomplete progress can resume. App updates must not rename the key or restart a completed guide. Clearing app data can reset it.

`useOnboarding` owns progress; `OnboardingGuide` owns presentation/settings links. All Android access goes through the existing launcherApps facade. Guide button taps and practice keys use nokiaAudioEngine and the user's saved sound/vibration preferences. No autoplay, new audio engine, fake handset or copied Home screenshot.

Native Home resets the chooser session. Practice input never sends, calls, locks or launches apps. Inbox initialization waits until the guide ends. Contacts load on entering Contacts and refresh on focus; failed permission/provider reads must not be cached as successful empty snapshots. Existing Android permission prompts remain under user control.

2026-09-18 concise/full-LCD revision: affected tests 17/17 passed and production web build passed. Physical audio and forced-navigation-bar stability require real-device validation; browser renders do not prove those behaviors.

First-use repair and remaining device checks: [2026-09-18 report](../../../../../docs/reports/2026-09-18-first-use-repair.md).
