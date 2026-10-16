# First-run guide

Four large, finite pages: welcome, Dumb Mode accountability, keys, Home setup. The real LCD and shared keypad stay mounted. Only copy scrolls; footer actions remain fixed. OnboardingPreview is static and never reads authentication material or requests permissions.

Progress stays under `nokia-launcher.onboarding`. Schema 2 persists stable step IDs. Completed legacy records stay complete; unfinished legacy navigation/typing resumes at keys, defaults/permissions/setup at Home setup. Invalid data starts at welcome. useOnboarding owns progress and the session-only finished marker.

OnboardingGuide owns presentation, safe optional practice, focus navigation and settings links through launcherApps. Centre/Green selects, arrows move focus, right softkey goes Back, Red exits (ends practice first). Practice cannot launch, call, send or lock. Custom Dumb Mode steps and the full-LCD Messages picker remain supported.

Set Home app explicitly arms one settings-return verification. The native systemSettingReturned event covers Android WebViews that do not emit focus/visibility. Blur/hidden also marks departure; focus/visible consumes the arm once and reads getDumbModeState.defaultLauncherAvailable. Check again is explicit. No idle visibility polling; generation checks discard late results after navigation/unmount. Failure never prevents Use for now.

NokiaLauncher owns the lazy Dumb Mode handoff. Screen accepts a presentation-only homeNotice slot replacing the carrier/date panel during the post-guide session. Home clock, shortcuts and menu stay usable. Later/action dismisses the card; it does not recur on restart or show during active locks, dialer/search or unresolved state. Tone setup and week check-in defer for this session, preserving stored eligibility.

Evidence: docs/reports/2026-10-02-onboarding-redesign. LauncherAppsPlugin emits a single systemSettingReturned event only after an explicit Home-settings departure and resume. Native authentication, Home task routing, camera and accessibility rules are unchanged.

DefaultLauncherNotice uses the existing subscribed native defaultLauncherAvailable field. Confirmed false shows a large Home card after onboarding; true/unknown/error never triggers it. Later dismisses for the current session; settings opens only explicitly and native role updates remove it automatically. The notice has priority over the post-guide Dumb Mode card and supports keypad focus/selection/dismissal. No additional role polling or startup read.
