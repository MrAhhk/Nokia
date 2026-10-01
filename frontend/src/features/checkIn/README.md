# One-week check-in

First run with this feature records one local timestamp, including existing users after update. On a subsequent Home visit/focus/visibility event after seven elapsed days, show once, after onboarding and tone setup, outside dialing/search. No timer, background work, network, usage permission, analytics, or stored answer.

`checkInState` persists `shown: true` before opening. Keep `nokia-launcher.week-check-in.v1` stable across app updates. Closing, answering, cancelling sharing or leaving for Play must never reset it. Malformed/blocked storage suppresses the optional prompt. Clearing app data is a new local installation state. This measures elapsed time, not seven active-use days.

`useWeekCheckIn` owns eligibility subscriptions; `WeekCheckIn` lazily renders inside the existing LCD and receives semantic keypad intents. Keep both Review and Share available regardless of answer, including before answering. The existing Settings action router exposes those actions permanently.

`launcherApps` is the only frontend bridge owner. Native `openAppReview` opens the official Play listing with a browser fallback; Play controls whether/how the user can write a review. It does not guarantee a review composer. `shareApp` opens Android's text chooser with a public app link; it never sends a message or claims sharing completed.

Do not add another Activity, WebView, review SDK, parallel key interpreter, or repeating reminder. Preserve all unrelated LauncherAppsPlugin messaging/lifecycle methods. Tests cover week boundary, once-only persistence, corrupt storage, onboarding deferral, blocked underlying keypad, equal actions, and bridge routing. Real chooser/store availability and physical performance require device checks.

Reference: https://developer.android.com/distribute/marketing-tools/linking-to-google-play
