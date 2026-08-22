# REGRESSION REPORT

## Run: 2026-08-22 — Built-in mini-screen browser and Home search entry
**Change type:** Feature merge  
**Files changed:** Browser React feature and tests, launcher routing, LauncherApps adapter/plugin, native browser controller, Home search semantics  
**Triggered by:** User requested that the built-in browser be accessible through the Home search box.

### Flows tested

| Flow | Result | Notes |
|---|---|---|
| Home Search touch → browser | ✅ Pass | Verified on connected physical Android device; Google loaded inside the mini-screen. |
| Home Search D-pad selection → browser | ✅ Pass | Selected Search from the initial Phone focus and opened it with the center key. |
| Browser red key → Home | ✅ Pass | Native WebView was removed and the launcher Home restored without a blank screen. |
| Browser touch controls and viewport | ✅ Pass | Address field, menu, page viewport, forward, reload, address focus, and external-open controls rendered inside the mini-screen. |
| Browser address and keypad command behavior | ✅ Pass | Jest covers URL/search resolution, dangerous-scheme rejection, lifecycle bridge calls, and finite keypad commands. |
| Existing launcher, clock, camera, settings, and domain tests | ✅ Pass | Full Jest suite: 14 suites, 45 tests. |
| Production web build | ✅ Pass | `npm run build` completed successfully. |
| Capacitor asset copy | ✅ Pass | `npx cap copy android` completed successfully. |
| Android debug APK | ✅ Pass | `:app:assembleDebug --no-daemon` completed successfully after correcting one compile-time border-width type mismatch. |
| Physical-device runtime log | ✅ Pass | No Nokia Launcher crash or WebView exception observed during entry, page load, D-pad entry, and exit checks. |

### Verdict
**SAFE TO MERGE**

Device note: verified on the connected Android handset identified by ADB on 2026-08-22. Website rendering remains dependent on the handset's Android System WebView and network connectivity.
