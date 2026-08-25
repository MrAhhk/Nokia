# REGRESSION REPORT

## Run: 2026-08-25 — Sound safety, performance, and Play surface audit
**Change type:** Sound feature hardening and dependency-risk reduction
**Triggered by:** User requested a full Sound-screen check, optimization, device-safety review, and Play readiness review.

### Findings and verification

| Flow | Result | Notes |
|---|---|---|
| Internal Sound route and controls | ✅ Automated pass | Settings routing, D-pad/touch rows, value cycling, preview calls, and selection scrolling are covered by Jest. |
| App-local settings | ✅ Pass | Saving preferences no longer changes Android defaults or opens special-permission UI. |
| Permission minimization | ✅ Pass | Removed `WRITE_SETTINGS`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE`, and `WRITE_EXTERNAL_STORAGE`; `VIBRATE` remains for local feedback. |
| Key feedback performance | ✅ Pass | Settings are cached and each event chooses one bounded vibration bridge. The audio catalogue is no longer decoded at module startup. |
| Native vibration safety | ✅ Pass | Patterns are capped at 20 entries/1000 ms each, amplitude is reduced, and interaction feedback uses `USAGE_ASSISTANCE_SONIFICATION`. |
| Clock alarm preference | ✅ Pass | Alarm preview now respects the saved vibration setting without a duplicate browser vibration call. |
| Audio asset provenance | ✅ Release-safe packaging | 64 unverified files (18.6 MB) were preserved under ignored `audio-assets-unverified/` and removed from packaged public assets. Synthesized fallbacks remain. |
| Jest regression | ✅ Pass | 31 suites, 95 tests. |
| Production web build | ✅ Pass | `npm run build`. |
| Capacitor sync | ✅ Pass | `npx cap sync android`. |
| Android tests and APK | ✅ Pass | `testDebugUnitTest assembleDebug`. |
| Production dependency audit | ✅ Pass | `npm audit --omit=dev`: 0 known vulnerabilities after removing unused Axios, updating React Router, and pinning patched `fast-uri`. |
| Development tool audit | ⚠️ Follow-up | 39 advisories remain in legacy CRA/Capacitor build tooling; these packages are no longer production dependencies. Eliminating them requires a separately tested toolchain migration/Capacitor major upgrade. |
| Emulator install/start/crash smoke | ✅ Pass | Debug APK installed; launcher reached RESUMED, visible, and drawn state with no fatal exception in recent logcat. |
| Physical sound/haptic/latency | ⚠️ Pending | Only `emulator-5554` was connected. Real vibration quality and the mandatory physical-device latency floor are not claimed. |

### Verdict
**RUNTIME AND BUILD HARDENED; PHYSICAL SOUND/HAPTIC SIGN-OFF STILL REQUIRED BEFORE RELEASE.**

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

## Run: 2026-08-22 — Mini-browser tabs, LCD chrome, and Nokia keypad input
**Change type:** Browser interaction and visual-system extension
**Files changed:** Browser keypad composer and tests, React/native command bridge, native WebView controller
**Triggered by:** User requested browser tabs, homescreen-matched top/bottom chrome, and keypad text entry without a modern soft keyboard.

### Flows tested

| Flow | Result | Notes |
|---|---|---|
| Finite tabs | ✅ Pass | Native controller compiles with up to four state-preserving WebView tabs; tab create, select, and close paths are implemented. |
| LCD browser chrome | ✅ Pass | Native top bar, bottom bar, progress track, border, and tab badge use the homescreen LCD palette (`#9da84d`, `#a8b358`, `#858f3f`). |
| Nokia multi-tap input | ✅ Pass | Jest verifies preview/cycle/commit behavior, space, backspace, tab menu, and exit commands. |
| Native address/page input bridge | ✅ Pass | Android Java compilation verifies address editing and focused-WebView `InputConnection` paths without JavaScript injection. |
| Modern soft-keyboard suppression | ⚠️ Device check pending | Address input disables soft-keyboard display and WebView focus repeatedly hides the IME. The handset disconnected before final runtime confirmation. |
| Existing launcher, browser, clock, camera, settings, Snake, and domain tests | ✅ Pass | Full Jest suite: 19 suites, 59 tests. |
| Production web build | ✅ Pass | `npm run build` completed successfully. |
| Capacitor asset copy | ✅ Pass | `npx cap copy android` completed successfully. |
| Android debug APK | ✅ Pass | `:app:assembleDebug --no-daemon` completed successfully. |
| Physical-device install/runtime | ⚠️ Blocked | ADB reported no connected devices; no runtime claim is made for tab popup or webpage-field typing. |

### Verdict
**BUILD SAFE; DEVICE SMOKE TEST PENDING**

The tab cap intentionally follows the product North Star: useful multitasking without turning the mini-browser into an unbounded attention surface.

## Run: 2026-08-22 — Snake board sizing and rapid-turn repair
**Change type:** Bug fix
**Files changed:** Snake layout CSS, Canvas renderer and resize test, deterministic engine and rapid-turn test
**Triggered by:** Physical-device screenshots showed the board collapsed to 38px, an overflowing level panel, distorted Canvas pixels, and dropped rapid direction input.

### Flows tested

| Flow | Result | Notes |
|---|---|---|
| Home → Settings → Snake | ✅ Pass | Verified on the physical CPH2237; Snake remains the first Settings row above Display. |
| Snake layout at 390×844 | ✅ Pass | Browser regression measured a 345×269px board, contained 250×84px overlay, and matching 345×269 Canvas backing size. |
| Physical-device board and overlay | ✅ Pass | ADB screenshot confirms the board fills the LCD and the pause panel no longer overflows. |
| Physical-device snake rendering | ✅ Pass | ADB screenshot confirms readable grid-sized snake segments and food inside the expanded board. |
| Canvas resize synchronization | ✅ Pass | Jest verifies the backing dimensions follow a displayed-size change without requiring a game-state update. |
| Rapid UP → LEFT input | ✅ Pass | Engine test verifies both turns execute across consecutive movement ticks instead of discarding LEFT. |
| Existing launcher, browser, clock, camera, settings, and domain tests | ✅ Pass | Full Jest suite: 24 suites, 68 tests. |
| Production web build | ✅ Pass | Fresh standalone `npm run build` completed with exit code 0. |
| Capacitor asset copy | ✅ Pass | `npx cap copy android` refreshed the packaged web assets. |
| Android debug APK | ✅ Pass | App-local `assembleDebug --no-daemon` completed successfully. |
| Physical-device install | ✅ Pass | Targeted ADB install to serial `IB8XFY5DFMKBROGQ` returned `Success`. |
| Device runtime log | ⚠️ Pass with vendor note | No AndroidRuntime crash or WebView exception. ColorOS logs nonfatal `GPUAUX Null anb` messages during Canvas redraws. |

### Verdict
**SAFE TO MERGE AND INSTALLED ON PHYSICAL DEVICE**

## Run: 2026-08-25 — Restored on-demand sounds and system-tone apply
**Change type:** Sound restoration, battery optimization, UI refinement, and explicit system integration
**Files changed:** Sound UI/engine/tests, launcher lifecycle hooks, native tone bridge, Android manifest, packaged sound assets, Play disclosures
**Triggered by:** User requested the sound library restored without background battery use, a clearer Nokia-style Sound screen, original keypad feedback, and one-time access for applying ringtone/alarm tones.

### Flows tested

| Flow | Result | Notes |
|---|---|---|
| Packaged sound restoration | ✅ Pass | 64 local sound files (18,619,232 bytes) are packaged again. Provenance is recorded separately; undocumented MP3 rights remain a release blocker. |
| On-demand audio loading | ✅ Pass | The engine fetches/decodes only the selected sound or pressed keypad sample. No catalogue preload runs at startup. |
| Background battery behavior | ✅ Automated pass | Hiding/unmounting the launcher stops pending/active sounds, repeating vibration, timers, and suspends WebAudio. No service, wake lock, polling loop, or persistent executor was added. |
| Nokia keypad sample selection | ✅ Automated pass | Exact-key lazy loading is covered; pressing `5` requests only `sounds/dtmf/5.wav`, with a synthesized fallback if decoding fails. |
| Sound-screen UI | ✅ Build pass; physical visual pending | Compact olive LCD rows, static five-segment volume meter, touch/D-pad action rows, selection inversion, and status feedback compile successfully. The connected phone was locked before screenshot inspection. |
| One-time system access | ✅ Native build pass | `WRITE_SETTINGS` opens only after explicit Apply. One special-access grant covers both ringtone and alarm; Android 10+ is supported. |
| System ringtone/alarm apply safety | ✅ Static and native build pass | Only a validated packaged asset is inserted, only its exact app-owned previous URI may be deleted, and user media is never enumerated. |
| Full Jest regression | ✅ Pass | 32 suites, 103 tests. |
| Production web build | ✅ Pass | Fresh `npm run build` completed successfully. |
| Capacitor Android sync | ✅ Pass | Fresh `npx cap sync android` completed successfully. |
| Android tests and APK | ✅ Pass | `testDebugUnitTest assembleDebug`; debug APK is 27,709,938 bytes. |
| Physical-device install | ✅ Pass | Fresh APK installed successfully on connected OPPO CPH2237. |
| Physical sound/haptic/system-tone sign-off | ⚠️ Pending | The phone was asleep and locked. No lock-screen bypass was attempted, and the test did not change the real system ringtone/alarm. |

### Verdict
**BUILD SAFE AND INSTALLED; UNLOCKED-PHONE AUDIO/UI SIGN-OFF AND MP3 RIGHTS EVIDENCE REMAIN BEFORE RELEASE.**
