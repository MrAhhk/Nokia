# Maintenance and trace-back

## A short debugging path

1. `git status --short` to see staged/unstaged/untracked work; establish the patch's baseline.
2. `npm run trace -- <feature-or-symptom>` for owners and tests. Read the smallest causal path.
3. Capture expected/actual behavior and first broken invariant. Separate permission, data, UI, bridge and hardware failures.
4. Add a discriminating behavior check. Fix at the owner; do not compensate in another layer.
5. Run affected tests, architecture check, and the required web/native/device checks. Keep screenshots outside frame timing windows.
6. Update the map if ownership changes. Hand off exact evidence and rollback, including unverified behavior.

## Verification commands

Run from `app/frontend`:

```powershell
npm run trace -- camera
npm run check:architecture
npm test -- --watchAll=false --runInBand
npm run build
npx cap copy android
# From android/, using the configured Android Studio JBR and SDK:
./gradlew.bat :app:testDebugUnitTest :app:assembleDebug --no-daemon
```

The root `scripts/android_launcher_perf.py` exercises Home/Settings and reports Android frame percentiles. Its `home_ms` includes ADB dispatch plus the configured settle delay: **it is not a render latency measurement**. Count live `Hist` Activity records, not stale orientation-history records. A zero-frame sample is inconclusive. Record exact APK identity and inspect current installed version before installing; do not downgrade another active task's build.

For keypad changes, retain 20 rapid inputs in order and verify the real InputConnection where relevant. For image work, exercise a high-resolution photo, gallery open/close and background/resume. For resource recovery, deliberately terminate the test renderer in a controlled test host and check recovery and release. Unit/static checks do not substitute for these tests.

## Incremental roadmap

| Order | Work | Required invariant / completion evidence |
| --- | --- | --- |
| 1 | Finish physical verification of the audit patches | Correct keyboard asset loading/input; browser renderer recovery; sampled gallery rendering. Current audit's install was blocked by a newer build on the device. |
| 2 | Extract message identity and state rules | No ambiguous contact-name resolution, no message claimed delivered from enqueue success, failed sends retain recoverable content. Tests before moves. |
| 3 | Move message rendering into `features/messages` | Launcher owns navigation only; keep existing keypad and miniscreen visuals. |
| 4 | Extract native SMS/contact operations | Stable `launcherApps` facade; bounded executor/queries, cancellation and exact recipient identity. |
| 5 | Separate native camera resource lifecycle from catalog/decoding as needed | Late provider/thumbnail callbacks cannot revive or mutate a closed/newer session. No rejected executor work escapes into UI callbacks. |
| 6 | Modernize the build toolchain separately | Resolve remaining dev-tool audit findings through compatible upgrades/migration, not blind `npm audit fix --force`. |

## Known debt and scope limits

- `NokiaLauncher`, `Screen`, `launcherApps` and the native plugin remain large. The map documents them; this is not a completed architecture rewrite.
- Existing direct bridge access in the audio engine/IME and a capability read in the launcher are explicit checker exceptions. They are not examples for new features.
- `launcherMenus` still has browser-storage default parameters; extract storage only with matching behavior coverage.
- Static checks catch known patterns and stale map paths, not all dynamic imports, lifecycle races, secrets, or third-party vulnerabilities.
- The optional backend's shared preferences endpoints have no authentication or user partitioning in source. Do not expose them as a multi-user service without an explicit access model; deployment was not tested in this audit.
- FileProvider path scope and notification cache/image memory budget need separate end-to-end tightening. Avoid claiming that one stream-size cap bounds the whole cache.

## Evidence and ownership

Each module entry lists files, behavior tests, search aliases, and a trace. Update an entry when moving an owner or adding a new feature. Keep historical results in reports; do not copy old measurements into current acceptance. Record what is implemented, what is planned, and what is device-unverified separately.
