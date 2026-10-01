# Nokia Launcher: development entry point

Applies to this frontend and Android subtree. Inherit the workspace rules.

## Before changing code

1. Read [ARCHITECTURE.md](ARCHITECTURE.md), then run `npm run trace -- <symptom-or-feature>`.
2. Open only the returned owners, relevant tests, and applicable workspace guardrails.
3. Inspect staged, unstaged, and untracked work. Never absorb another task's changes into a commit or overwrite a newer device build.
4. State the expected behavior, observed failure, owning module, and invariant being restored.

## Extension rules

- Extend the existing feature before creating another controller, store, key interpreter, or native bridge.
- `Keypad` is shared by Home and IME. Semantic interpretation belongs to `domain/keyGrammar.js`; text timing belongs to `domain/multiTapComposer.js`.
- New feature UI/state/commands/tests go in `src/features/<feature>/`. Register the real files in `docs/architecture/modules.json`.
- Cross-feature navigation remains in `NokiaLauncher`. Keep new business rules out of this controller and `Screen`.
- Reach native launcher operations through `lib/launcherApps.js`; Play Integrity uses `lib/playIntegrity.js`. The existing IME/audio adapters are named exceptions in the module map, not permission to add direct bridge access elsewhere.
- Pure rules accept their inputs. They must not import React, UI modules, Capacitor, or read browser globals. Existing menu storage defaults are documented debt; do not copy them.
- Native controllers own Android resources. Define create/start/pause/stop/destroy and late-callback behavior before adding asynchronous work.
- Bound stream reads before allocation. Decode photos at the target display size off the main thread. Never put message text, phone numbers, tokens, or image data in performance logs.
- Remote content must never enter the privileged keyboard WebView. Keep resource policy tests and the bridge's allowlist together.

## Before handing off

- For Recent Calls or native bridge changes, read [the recovery contract](../../docs/reports/2026-09-17-recent-calls-recovery.md). Preserve existing bridge exports and helper wiring; previous extension work removed messaging safeguards while builds stayed green.

- Run `npm run check:architecture` and affected behavior tests. Follow workspace Android/device verification rules for native changes.
- Update module ownership and the relevant decision when a seam changes. Use [the feature contract](docs/architecture/FEATURE_TEMPLATE.md).
- State what was tested, what remains unknown, and the exact build/device used. Build success is not physical-device acceptance.
- Commit only your stable changes. If shared uncommitted edits prevent isolation, provide a baseline-relative patch and the concrete blocker.

## Release packaging invariant

- Build release artifacts with `npm run build:android:release`. It rebuilds web assets, cleans Android intermediates, and verifies the AAB's embedded manifest against actual DEX class definitions. A successful Gradle build alone is insufficient: version5 (1.2.1) was found with declared Activities absent from DEX.
- This verifier supports single-base AABs only. Dynamic-feature manifests/DEX are not verified; extend the gate before adding such modules.
- Never upload the historical `android/app/release/app-release.aab`. Use the verified output under `android/app/build/outputs/bundle/release/`, record its SHA256/version, and complete device acceptance separately. Do not add keep rules or SplitCompat without evidence that shrinking or dynamic features are responsible.

The structure in ARCHITECTURE.md distinguishes implemented modules from planned extractions. Do not create empty abstractions or perform a bulk folder move to make a diagram look finished.
