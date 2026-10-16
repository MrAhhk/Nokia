# Billing integration boundary

Current implementation: strict immutable JS DTO/input contract, native rights policy and DTO, pinned native RevenueCat adapter/configuration and public SDK normalizer/provider transport, authenticated bounded storage and strict cache codec/controller storage adapter, typed purchase journal with authenticated codec and compare-and-swap persistence, catalog revision fingerprint, and async controller with foreground expiry and immutable deadline reads. Startup and explicit Restore now connect through the process-owned BillingRuntime, existing native bridge and strict launcherApps facade. Checkout implementation is present; remaining release acceptance is tracked separately from source completeness.

Foreground subscription expiry (2026-10-09): the native actor revokes access at the
signed deadline, then requests current provider evidence once for that accepted
period when subscription was the only access source. It joins an existing fetch,
does not interfere with an interactive operation, and skips detached observers,
clock rollback/reboot, Lifetime and sealed gifts. No local grace, purchase retry,
or idle polling is introduced. A delayed/failed provider renewal still requires
the existing explicit Check/Restore recovery; the one-shot fetch is not a promise
that provider propagation is instantaneous. Play-device acceptance of this source
change remains separate from unit-test success.

Release packaging runs `verifyBillingReleaseConfiguration` before `preReleaseBuild`.
Disabled rollout allows absent public setup; enabled rollout rejects missing/invalid
Google public key, catalog identities, duplicate products or duplicate base plans.
This validates local shape only; it cannot certify actual Console permissions,
prices, credentials, cohort eligibility or store behavior. Run
`python scripts/test_billing_release_guard.py` only while `android/billing.properties`
is absent. It uses temporary synthetic public values, tests actual Gradle execution
and dependency wiring with configuration cache, restores absence, and publishes nothing.

The early legacy capture script reads two bounded historical keys and exports classifications only. It is packaged synchronously before the bundle with the coupled startup gate. Native `BILLING_ROLLOUT_ENABLED` defaults to false, so the current development launcher bypasses sealing and SDK initialization. An empty capture is not proof of a new installation: archived Play code 8 has these keys, but the older code 5 artifact does not. Current Play cohort coverage remains a release gate.

The descriptor-based consumer serializes inspected immutable evidence for `LegacyGrantStore`. The native store preserves an authenticated first decision, including recovery; later onboarding writers cannot change it. Released rules come from native release evidence, never the bridge. Known current onboarding can coexist with recognized historical check-in, but cannot establish eligibility by itself. Neither JSON validation nor frozen objects authenticate capture provenance: the bootstrap still must retain this launch's pre-writer evidence and handle collisions as recovery.

Native owns money and rights. JS selects presentation from native access/capabilities and cannot grant rights, infer expiration, supply arbitrary products/prices, clear an unresolved journal, or cancel a subscription itself.

The actual source map is `docs/architecture/modules.json`; use `npm run trace -- billing`. Requirements and remaining release gates are in `S:/Money Printer/docs/superpowers/plans/2026-10-02-monetization-master-implementation.md`; execution evidence is under `docs/reports/2026-10-02-monetization-implementation` at workspace root.

## Verification

`RevenueCatCatalog` maps the pinned public Google models into all three cards and retains the exact allowlisted product/base option natively. It rejects ambiguous or unsupported configurations, trials/introductory phases, prepaid/installment options and a missing explicit offering; it does not fall back to SDK default offers. Price/currency/period and the offering/package identity contribute to the revision. The mapper is connected to explicit runtime catalog fetching; checkout remains incomplete. `available` describes valid catalog details, not permission to charge. Tests construct actual SDK models; the Play JSON constructor uses test-only reflection and a narrowly scoped `TextUtils.isEmpty` implementation on JVM. No private SDK call or model shim enters production.

Lifetime additionally requires one actual Play purchase option with an explicit identity/token, no exposed rental/preorder/offer terms, corroborated store price, and matching singular details that the pinned public RC/Play flow will launch. Missing classic option metadata stays unavailable. Its revision binds the actual purchase-option ID. Play's hidden auto-pay metadata cannot be classified through the pinned public getters; the simple single permanent BUY Console configuration and actual purchase remain external gates.

Support details are an explicit read-only export through the Home-only facade. It exposes cached anonymous support ID (when available), native version and selected state enums, not the receipt, purchase token, operation ID or owner fingerprint. It cannot initialize SDK or send a message. Recovery displays selectable text for the user to share privately; WebView copy interaction remains a device gate.

- Focused JS contract tests include executing native Java DTO/policy serialization; Java/javac must be available on PATH (use repository Android Studio JBR setup).
- `:app:testDebugUnitTest --tests 'com.nokialauncher.billing.*'` covers synthetic policy/controller inputs, actual JVM AES/GCM fault tests and typed journal safety. It does not verify RevenueCat/Play transactions, Android Keystore or AtomicFile behavior on device.
- Android Lint/build/architecture checks and provider/device probes have separate scopes. SDK callback success, CustomerInfo.requestDate, a local full flag or an empty purchase list do not establish fresh verified payment evidence.

No production paywall, tester grant, subscription cancellation, payment or publication is enabled by these isolated modules.

Manage subscription is a provider-independent recovery action through the existing facade and Home-only bridge. It opens the official general Google Play subscriptions page (`https://play.google.com/store/account/subscriptions`), preferring the Play app and falling back to a browser after a launch failure. It accepts no URL or product from JS; an `opened` acknowledgement reports a launch only. Runtime `manage` capability describes this destination, including configuration recovery, rather than ownership of a subscription.

`BillingManagementReturn` arms only after a successful launch and requires a real pause then resume. Within ten monotonic minutes it consumes once and refreshes only an existing SDK-ready runtime; ordinary Home resumes do no billing work. Longer visits, process/plugin teardown or unavailable SDK require explicit Retry. Closing the UI Request on pause/destruction detaches completion without cancelling verification or persistence. Returning never establishes cancellation or changes rights by itself; verified provider snapshots remain authoritative. Device Play/browser routing and real subscription management remain unverified.

Restore is explicit user input, separate from the single startup current fetch. It can proceed while that fetch hangs, supersedes older evidence, and keeps an uncertain purchase journal unchanged. Closing a UI lease does not cancel rights verification or persistence. The current facade resolves a validated final BillingView; operation events report native busy state. Immediate operation-ID acknowledgement, complete payment management UI and real configured-store restore acceptance remain M06/M08/device gates. Rollout remains false.

This older final-view Restore contract is superseded by the 2026-10-05 bridge integration:
`restoreBillingPurchases` and `purchaseBillingPlan` resolve a strictly validated
`{ operationId }` after actor acceptance, before provider/payment completion. Rejected
intents reject the RPC; coalesced Restore calls receive the same native operation ID.
Closing the UI lease removes both completion and acknowledgement references, never
native processing. Latest snapshots/events alone determine access. Bootstrap reads the
latest snapshot after Restore acknowledgement and keeps native RESTORING visible and
disabled; acknowledgement cannot mount Home. `reconcileBillingPurchase` returns only
`{ requested: true }` for explicit no-charge journal recovery.

Purchase takes only exact typed plan/catalog revision/immediate-charge consent; Lifetime
requires affirmative consent in both facade and native parser. Runtime also checks its
current local seal, journal knowledge and native checkout capability, which remains false
until the complete UI/provider/device/release gates pass. Copying config or calling the
bridge directly does not enable checkout. No arbitrary product, token or URL is accepted.


Explicit catalog presentation (2026-10-03): Home-only, no-input `refreshBillingCatalog`
uses the existing facade validation and bridge leases. It requires an already available
SDK session and never configures billing, refreshes catalog at idle startup, launches
checkout, changes access, or resolves a purchase journal. `RevenueCatCatalogProvider`
calls public `getOfferings` through the adapter; this SDK path may serve cache-backed
product details and does not prove fresh charge terms. Three cards remain visible with
unavailable/empty prices until fetched or after failure. No fabricated USD fallback.
The existing controller actor coalesces one catalog request and at most 64 UI bindings;
its non-dropping completion lane applies one callback even under queue saturation and
after UI teardown. Duplicate/old callbacks cannot replace a newer result. Catalog
replacement republishes both current and one-shot expiry projections with new reserved
sequences. Raw native selections never cross the bridge. Checkout capability stays
false pending purchase-owner integration, exact revision reconfirmation, durable
journal, and remaining provider/device gates.

`RevenueCatCheckoutPreflight` is a native-only, unactivated checkout preparation seam.
Its production transport calls the adapter's public SDK `getProducts` with the two
configured product IDs, avoiding the Offerings cache. It accepts only a prior native
catalog, plan and shown revision. Fresh Google products receive the prior validated
offering/package context through public `copyWithPresentedOfferingContext`, then pass
the existing strict catalog mapper. Missing/ambiguous/unsupported rows and transport
failure yield unavailable; changed full revisions yield a fresh reconfirmation catalog
with no ready selection. Unqueried/absent cards never retain old ProductDetails. Only
an unchanged valid revision returns the fresh native selection. First terminal callback
wins, including failures; duplicate callbacks cannot replace it. Future purchase-owner
integration must enforce actor/lifecycle freshness, rights checks and journal-before-
launch. This class itself never writes a journal, launches payment or grants rights.

`RevenueCatReceiptMapper` is an unactivated native evidence seam. It owns a direct
FETCH_CURRENT callback and calls the existing normalizer before minting immutable
record/baseline/dated-receipt evidence. Subscription IDs use the public store transaction
identifier; Lifetime IDs use the public RevenueCat transaction identifier. Prefixes keep
these producer namespaces separate. Missing/duplicate/oversized configured identities
fail verification rather than disappearing from the baseline. Only a matching active
configured entitlement can yield a dated receipt. No raw CustomerInfo, receipt, token
or order reaches JS or logs. Exposed IDs do not prove complete Play history or pending
inventory; no absence proves pending cancellation. Future serialized checkout must
correlate the signed preparation time with the receipt date in addition to checking
baseline/owner/plan, and must persist rights before resolving the attempt. This seam
currently grants nothing, writes nothing and launches nothing.

Qualified receipt results now provide a native preparation factory that retains the
signed response timestamp, exposed baseline and stable owner and checks the selected
product/base plan/offering configuration. The actor still owns final rights, lock,
obligation, freshness and durable-write checks before launch. Reconciliation accepts
only an unresolved matching-owner attempt, a later signed fetch and exactly one new
matching receipt whose purchase date is strictly later than preparation. Old/equal-time
or multiple matching candidates remain unresolved. Production callers must prepare
through this qualified factory; generic BillingAttempt.prepare inputs do not establish
signed-time provenance. Rights persistence must precede resolved-journal persistence.

The optional `BillingController.CheckoutDependencies` seam integrates those native
producers in the existing actor. Runtime now injects the actual native producers and
shared authenticated journal; checkout capability and rollout remain false, with no
purchase bridge API. It loads the authenticated journal on the serialized disk
worker, performs one fresh qualified rights fetch, publishes and persists those rights,
then checks conservative subscription obligations and directly requeries charge terms.
A changed revision publishes reconfirmation without creating a journal. An unchanged
selection creates a fresh native UUID and durably CAS-writes PREPARED before the injected
host transport can launch. Host/lock safety is checked again after each asynchronous
boundary. Local legacy, Lifetime, unknown journal, unresolved attempt and interactive
Restore block new checkout. Subscription replacement is unavailable; existing expired
rows whose terminal obligations cannot be proved also remain blocked pending provider
probe/support liveness evidence.

Transport outcomes are cancellation, pending, uncertain or a signal to query current
receipts. Only definitive SDK cancellation resolves canceled. Callback completion never
grants rights by itself: qualified direct fetch applies rights, waits for their exact
durable write, then CAS-resolves the journal using the dated receipt mapper. Empty,
old/equal-time and ambiguous receipts retain the barrier. Pending/uncertain releases the
interactive operation so explicit Restore remains available. Startup reconciles once;
explicit `reconcilePurchase` retries without charging and reloads unknown journal-write
outcomes before proceeding. UI detach does not cancel native work; completions share
the actor's non-dropping lane. No polling or automatic purchase retry is added.

`BillingCheckoutTest` covers actual public SDK fixtures and ordering/failure boundaries;
`RevenueCatPurchaseErrorTest` maps every pinned SDK error conservatively. The unconnected
adapter purchase method uses the exact native base option, no default offer, and a live
main-thread Activity. The native host below supplies an unactivated foreground transport.
The live Controller continuation can durably abort an exact PREPARED attempt before
calling transport; native host NOT_LAUNCHED can prove no SDK entry after transport is
called. Startup/recovery never derives this proof from PREPARED. Complete pending
inventory/cancellation, subscription-history terminal obligations, cross-device overlap,
Activity lifecycle and real sandbox/device payments remain unproven. These modules are
source/JVM seams, not payment-ready production behavior.

`BillingPurchaseHost` is an application-owned transport resource for the existing
Controller, paired with a non-exported plain `BillingActivity`. It creates no Home,
Capacitor bridge or WebView. Runtime connects its native factory without enabling purchase
capability or rollout. The main-only factory accepts application Context and no Home;
the existing eligible packaged `MainActivity` is bound weakly on its main-thread lifecycle.
Only weak window references are retained. The Intent contains the attempt UUID and a random
opaque native capability; selections, product tokens and callbacks stay native. Process
death loses the live request and its capability authority; a recreated Activity finishes
without reconstructing checkout. The durable journal remains Controller-owned.

Transport re-reads matching owner/plan/product/base-plan PREPARED evidence on the existing
billing disk worker before opening a window. One retained request and one coalesced resume
dispatch are allowed. Main-thread RESUMED state and an exact Activity generation are
checked immediately before SDK entry; recreation requalifies its new generation and a
duplicate Activity cannot steal an existing live window. An immutable request's `entered`
flag flips before calling the actual adapter. Before entry, a live native request can
signal NOT_LAUNCHED to the Controller's exact PREPARED abort/CAS path. After entry, thrown
launches stay UNCERTAIN, UI pause/destruction never means cancellation, and recreation
never charges again. Only the adapter error classifier establishes user cancellation.
SDK success discards raw models and signals COMPLETED for separate qualified receipt
verification and durable rights/journal ordering. Duplicate callbacks are ignored; an old
callback cannot close a newer checkout's window. Native completion survives UI teardown
and main/disk submission rejection has an explicit completion path.

The production factory now binds to `DumbModeController`'s private `DumbModeLaunchGate`.
It starts denied during bootstrap; only a successful durable-state load and app refresh
can establish global OFF. Activation reserves the gate before persistence, then performs
disk/Keystore work outside the mutex. Successful activation commits ACTIVE; an ambiguous
write failure commits actual ERROR and conservatively protects selected apps, requiring
authoritative restart recovery. Successful durable friend/legacy unlock alone commits
OFF. Setup, cancellation and per-app essential exceptions do not change this authority.
The actor predicate is a dry check. Final main-thread authorization encloses the host's
entry claim and immediate synchronous SDK invocation under the same mutex as activation
reservation/state commit. No disk, scans or network wait runs under that mutex; lock order
is mode gate then request mutex. This orders SDK entry against activation without pausing
the friend lock or creating a payment-lifetime exemption. Restore is independently owned
and does not require this purchase-only gate. No lock exception engine, polling, SDK/config
initialization from Activity or automatic checkout retry is added. Provider obligations
and physical-device/sandbox acceptance remain open gates; rollout is false.

`BillingRuntime.NativeDependencies` retains one SDK session, constructs the real receipt
mapper and direct product preflight, and shares one `BillingAttemptStorage` between
bootstrap loading, Controller CAS writes and host proof reads on the same disk worker.
Its `CheckoutResources` posts main-only host creation without waiting for the main thread
from SDK configuration. Missing, queued, rejected or failed construction denies the dry
gate; explicit Retry can retry failed construction without creating another installed
host, reconfiguring SDK or automatically charging. Lifecycle binding never starts SDK,
provider or resource construction. The holder and host both retain weak Home references;
pause/destroy unbind only the exact Activity so an older teardown cannot clear a newer
Home. Resume discovers only an already existing runtime and checks the same packaged
bridge authority as native billing calls. A missing resource can report proven no entry
only for a live transport call; it never clears a preexisting journal on its own.

`BillingRuntimeTest` exercises nonblocking background preparation, main dispatch and
construction failures, explicit retry, duplicate preparation rejection, delayed latest
Home binding, pause/recreation ordering and main-thread requirements. These fixtures do
not prove actual Android Activity scheduling or store behavior.

`BillingPurchaseHostTest` exercises actual public SDK selections with pure window fixtures:
journal/owner proof, capability and generation rejection, resume/pause coalescing,
recreation, weak Home rebinding, throwing lock gates, queue rejection, SDK-entry failure,
late/duplicate callbacks and no-launch liveness. These fixtures do not establish Android
foreground acceptance. Device acceptance still requires exactly one live Home instance,
Home-return blank-frame checks, screenshot-free p50/tail latency and retained keypad
input on the exact APK, plus payment-window rotation/background/death and real store
callback/recovery tests. No device installation or payment is performed in this slice.

`DumbModeLaunchGateTest` verifies loading/error fail-closed behavior, activation reservation
while worker I/O is stalled, and serialization against synchronous SDK entry. The host
fixture also verifies that an optimistic actor dry read cannot bypass final authorization.
