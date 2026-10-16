package com.nokialauncher.billing;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingRuntime.*;
import static com.nokialauncher.billing.BillingStore.FileKind;

/** Real native seal/cache/journal with deterministic actor/delivery and SDK configuration seams. */
public class BillingRuntimeTest {
    @Test public void freshInstallMetadataDoesNotClassifyUpdatesClockReversalOrMissingPackageEvidence() {
        assertTrue(BillingRuntime.freshInstallMetadata(12, 12, 100, 100));
        assertFalse(BillingRuntime.freshInstallMetadata(12, 12, 100, 200));
        assertFalse(BillingRuntime.freshInstallMetadata(12, 12, 200, 100));
        assertFalse(BillingRuntime.freshInstallMetadata(11, 12, 100, 100));
        assertFalse(BillingRuntime.freshInstallMetadata(12, 12, 0, 0));
    }
    @Test public void checkoutProjectionRequiresNativePolicyKnownJournalDurableSealAndActorAdmission() {
        BillingSnapshot ready = new BillingSnapshot("epoch", 1,
                new Legacy(LegacyStatus.INELIGIBLE, true), new Access(Collections.emptyList()),
                new Capabilities(true, true, true), Operation.idle(), null, Store.unknown(),
                Issue.NONE, Collections.emptyList());
        assertTrue(BillingRuntime.commandCapabilities(ready, false, true, true).capabilities.checkout);
        assertFalse(BillingRuntime.commandCapabilities(ready, false, true, false).capabilities.checkout);
        BillingSnapshot unknown = BillingRuntime.commandCapabilities(ready, true, true, true);
        assertFalse(unknown.capabilities.checkout);
        assertTrue(unknown.capabilities.restore);
        assertEquals(Issue.STORAGE, unknown.issue);
        BillingSnapshot deniedByActor = BillingRuntime.commandCapabilities(ready, false, true, false);
        assertFalse(BillingRuntime.commandCapabilities(deniedByActor, false, true, true).capabilities.checkout);
        BillingSnapshot unsealed = new BillingSnapshot("epoch", 2,
                new Legacy(LegacyStatus.INELIGIBLE, false), ready.access, ready.capabilities,
                ready.operation, null, ready.store, Issue.NONE, ready.catalog);
        assertFalse(BillingRuntime.commandCapabilities(unsealed, false, true, true).capabilities.checkout);
        assertSame(ready.access, BillingRuntime.commandCapabilities(ready, false, true, true).access);
    }
    static final class Home { }
    static final class Resource implements BillingRuntime.HomeResource<Home> {
        final BillingPurchaseHost.WindowOpener<Home> opener = new BillingPurchaseHost.WindowOpener<>(
                home -> true, (home, id, capability) -> {});
        int launches;
        boolean lockAllowed = true, bindFailure;
        public void bindHome(Home home) { if (bindFailure) throw new IllegalStateException("binding unavailable"); opener.bind(home); }
        public void unbindHome(Home home) { opener.unbind(home); }
        public boolean nativeGate() { return opener.bound() && lockAllowed; }
        public void launch(RevenueCatCatalog.Selection selection, String id, BillingController.PurchaseCallback callback) { launches++; }
    }
    @Test public void backgroundPreparationReturnsWhileMainConstructionAndHomeBindingArePending() throws Exception {
        Queue main = new Queue(); Resource host = new Resource(); AtomicInteger creations = new AtomicInteger();
        CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        Home home = new Home(); resources.bindHome(home);
        Thread configure = new Thread(() -> resources.prepare(() -> { creations.incrementAndGet(); return host; }));
        configure.start(); configure.join(1000); assertFalse("Bootstrap must not wait for main", configure.isAlive());
        assertEquals(0, creations.get()); assertFalse(resources.nativeGate()); assertEquals(1, main.tasks.size());
        resources.retry(); resources.retry(); assertEquals(1, main.tasks.size());
        main.drain(); assertEquals(1, creations.get()); assertTrue(resources.nativeGate());
        assertEquals(0, host.launches); host.lockAllowed = false; assertFalse(resources.nativeGate());
        resources.retry(); main.drain(); assertEquals(1, creations.get());
    }
    @Test public void lifecycleBeforePreparationNeverConstructsOrQueuesResources() {
        Queue main = new Queue(); CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        Home home = new Home(); resources.bindHome(home); resources.unbindHome(home); resources.retry();
        assertTrue(main.tasks.isEmpty()); assertFalse(resources.nativeGate());
        List<BillingController.PurchaseOutcome> outcomes = new ArrayList<>();
        resources.launch(null, "attempt", outcomes::add);
        assertEquals(Collections.singletonList(BillingController.PurchaseOutcome.NOT_LAUNCHED), outcomes);
    }
    @Test public void dispatchAndConstructionFailureRecoverOnlyOnExplicitRetry() {
        Queue main = new Queue(); Resource host = new Resource(); AtomicInteger creations = new AtomicInteger();
        CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        main.reject = true;
        resources.prepare(() -> { if (creations.incrementAndGet() == 1) throw new IllegalStateException("create unavailable"); return host; });
        assertEquals(0, creations.get()); assertFalse(resources.nativeGate());
        main.reject = false; resources.bindHome(new Home()); assertTrue(main.tasks.isEmpty());
        resources.retry(); main.drain(); assertEquals(1, creations.get()); assertFalse(resources.nativeGate());
        assertTrue(main.tasks.isEmpty()); resources.retry(); resources.retry(); main.drain();
        assertEquals(2, creations.get()); assertTrue(resources.nativeGate()); assertEquals(0, host.launches);
        try { resources.prepare(() -> host); fail("One factory per owner"); } catch (IllegalStateException expected) { }
    }
    @Test public void pendingConstructionUsesLatestHomeAndOldPauseCannotReleaseIt() {
        Queue main = new Queue(); Resource host = new Resource();
        CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        Home old = new Home(), next = new Home(); resources.bindHome(old); resources.prepare(() -> host);
        resources.bindHome(next); resources.unbindHome(old); main.drain(); assertTrue(resources.nativeGate());
        resources.unbindHome(next); assertFalse(resources.nativeGate());
        resources.bindHome(old); assertTrue(resources.nativeGate());
    }
    @Test public void pauseBeforeConstructionKeepsHostUnavailableUntilExplicitHomeResume() {
        Queue main = new Queue(); Resource host = new Resource();
        CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        Home home = new Home(); resources.bindHome(home); resources.prepare(() -> host); resources.unbindHome(home);
        main.drain(); assertFalse(resources.nativeGate()); resources.bindHome(home); assertTrue(resources.nativeGate());
        assertEquals(0, host.launches);
    }
    @Test public void installedResourceSurvivesBindingFailureWithoutDuplicateConstruction() {
        Queue main = new Queue(); Resource host = new Resource(); host.bindFailure = true;
        AtomicInteger creations = new AtomicInteger(); CheckoutResources<Home> resources = new CheckoutResources<>(main, () -> true);
        Home home = new Home(); resources.bindHome(home); resources.prepare(() -> { creations.incrementAndGet(); return host; });
        main.drain(); assertFalse(resources.nativeGate()); resources.retry(); main.drain(); assertEquals(1, creations.get());
        host.bindFailure = false; resources.bindHome(home); assertTrue(resources.nativeGate());
    }
    @Test public void mainRequirementIsAppliedToBindingUnbindingAndConstruction() {
        Queue main = new Queue(); Resource host = new Resource(); AtomicInteger creations = new AtomicInteger();
        java.util.concurrent.atomic.AtomicBoolean onMain = new java.util.concurrent.atomic.AtomicBoolean(false);
        CheckoutResources<Home> resources = new CheckoutResources<>(main, onMain::get);
        Home home = new Home();
        try { resources.bindHome(home); fail("main only"); } catch (IllegalStateException expected) { }
        try { resources.unbindHome(home); fail("main only"); } catch (IllegalStateException expected) { }
        resources.prepare(() -> { creations.incrementAndGet(); return host; }); main.drain();
        assertEquals(0, creations.get()); assertFalse(resources.nativeGate());
        onMain.set(true); resources.bindHome(home); resources.retry(); main.drain();
        assertEquals(1, creations.get()); assertTrue(resources.nativeGate());
    }
    @Test public void optionalNativeCheckoutSessionReconcilesDurableAttemptWithoutLaunching() throws Exception {
        Fixture f = new Fixture(); AtomicInteger qualifiedFetches = new AtomicInteger();
        f.bootstrapJournalFailure = true;
        AtomicInteger recoveryFailures = new AtomicInteger(1);
        BillingAttemptStorage journal = new BillingAttemptStorage(f.store, "owner");
        BillingAttempt prepared = BillingAttempt.prepare("operation", "owner", Plan.MONTHLY, "sub", "monthly",
                RevenueCatNormalizerTest.REMOTE - 2000, Collections.emptySet());
        assertTrue(journal.save(prepared, null));
        com.revenuecat.purchases.CustomerInfo paid = RevenueCatReceiptMapperTest.subscriptionInfo(true, "new");
        RevenueCatReceiptMapper mapper = new RevenueCatReceiptMapper(callback -> {
            qualifiedFetches.incrementAndGet(); callback.onReceived(paid);
        }, RevenueCatNormalizerTest.CONFIG, "owner", f.time);
        f.checkout = new BillingController.CheckoutDependencies(callback -> {
            if (recoveryFailures.getAndDecrement() > 0) callback.complete(null, Issue.OFFLINE);
            else mapper.fetchCurrent(callback);
        },
                (catalog, plan, revision, callback) -> fail("Startup must not prepare checkout"),
                new BillingController.AttemptJournal() {
                    public BillingAttempt load() throws Exception { return journal.load(); }
                    public boolean save(BillingAttempt next, BillingAttempt prior) { return journal.save(next, prior); }
                }, (selection, id, callback) -> fail("Startup must not charge"), () -> false);
        f.runtime.start(OLD); f.boot.drain();
        assertTrue(f.runtime.read().journalUnknown);
        for (int i = 0; i < 5; i++) f.flush();
        assertEquals(0, qualifiedFetches.get()); assertEquals(BillingAttempt.State.PREPARED, journal.load().state);
        assertFalse(f.runtime.read().journalUnknown);
        assertEquals(BootstrapIssue.NONE, f.runtime.read().bootstrapIssue);
        assertNotNull(f.runtime.snapshot().unresolvedPurchase);
        f.runtime.reconcilePurchase();
        for (int i = 0; i < 5; i++) f.flush();
        assertEquals(1, qualifiedFetches.get()); assertEquals(BillingAttempt.State.COMPLETED, journal.load().state);
        assertNull(f.runtime.snapshot().unresolvedPurchase); assertTrue(f.runtime.snapshot().access.full);
        assertFalse(f.runtime.snapshot().capabilities.checkout); // Presentation remains explicitly disabled.
        f.runtime.start(OLD); f.boot.drain(); f.flush(); assertEquals(1, qualifiedFetches.get());
        f.runtime.reconcilePurchase(); f.flush(); assertEquals(1, qualifiedFetches.get());
    }
    @Test public void supportExportDoesNotInitializeSealFetchOrSdk() {
        Fixture f = new Fixture();
        assertTrue(f.runtime.supportSummary("1.2.6").contains("Support ID: unavailable"));
        assertEquals(0, f.seals.get()); assertEquals(0, f.configurations.get()); assertEquals(0, f.fetches.get());
        assertTrue(f.boot.tasks.isEmpty()); assertTrue(f.actor.tasks.isEmpty());
    }
    @Test public void supportStateContainsOnlySelectedStatusWithoutJournalOrOwnerIdentity() {
        Fixture f = new Fixture(); f.runtime.start(OLD); f.boot.drain(); f.flush();
        String text = f.runtime.supportSummary("1.2.6");
        assertTrue(text.contains("Legacy: eligible")); assertTrue(text.contains("Access: full"));
        assertFalse(text.contains("owner")); assertFalse(text.contains("controllerEpoch"));
        assertTrue(text.length() < 2048);
    }
    private static final String EMPTY = "{\"version\":1,\"coverage\":\"unknown\",\"readStatus\":\"complete\","
            + "\"onboarding\":{\"classification\":\"missing\"},\"checkIn\":{\"classification\":\"missing\"}}";
    private static final String OLD = "{\"version\":1,\"coverage\":\"unknown\",\"readStatus\":\"complete\","
            + "\"onboarding\":{\"classification\":\"historical_valid\",\"completed\":false},"
            + "\"checkIn\":{\"classification\":\"missing\"}}";
    private static final class Queue implements Executor {
        final ArrayDeque<Runnable> tasks = new ArrayDeque<>();
        boolean reject;
        @Override public synchronized void execute(Runnable runnable) {
            if (reject) throw new RejectedExecutionException("Worker unavailable"); tasks.add(runnable);
        }
        void runOne() { Runnable task; synchronized (this) { task = tasks.remove(); } task.run(); }
        void drain() { for (int i = 0; i < 1000; i++) { synchronized (this) { if (tasks.isEmpty()) return; } runOne(); } fail("Unbounded queue"); }
    }
    private static final class Disk implements BillingStore.Files {
        final Map<FileKind, byte[]> bytes = new EnumMap<>(FileKind.class);
        boolean failRead, failWrite;
        @Override public boolean exists(FileKind kind) { return bytes.containsKey(kind); }
        @Override public InputStream open(FileKind kind) throws Exception {
            if (failRead) throw new IOException("Read unavailable");
            return new ByteArrayInputStream(bytes.get(kind));
        }
        @Override public void replace(FileKind kind, byte[] data) throws Exception {
            if (failWrite) throw new IOException("Write unavailable"); bytes.put(kind, data.clone());
        }
    }
    private static final class Keys implements BillingStore.Crypto {
        SecretKey key;
        @Override public SecretKey key(boolean create) throws Exception {
            if (key == null && create) key = KeyGenerator.getInstance("AES").generateKey(); return key;
        }
    }
    private static final class Fixture implements Dependencies {
        final Disk files = new Disk(); final BillingStore store = new BillingStore(files, new Keys());
        final Queue boot = new Queue(), actor = new Queue(), disk = new Queue(), ui = new Queue();
        final BillingRuntime runtime = new BillingRuntime(this, boot, ui);
        final AtomicInteger seals = new AtomicInteger(), configurations = new AtomicInteger(), fetches = new AtomicInteger();
        final BillingController.Time time = new BillingController.Time() {
            @Override public String bootToken() { return "boot"; }
            @Override public long elapsedRealtimeMs() { return 100; }
        };
        boolean configured = true, configureFailure, checkoutEnabled;
        boolean bootstrapJournalFailure;
        String owner = "owner"; String captured;
        BillingController.Callback providerCallback, restoreCallback;
        final List<BillingController.CatalogCallback> catalogCalls = new ArrayList<>();
        BillingController.CheckoutDependencies checkout;
        CountDownLatch configureStarted, configureRelease;
        @Override public Legacy seal(String capture) {
            seals.incrementAndGet(); captured = capture;
            return new LegacyGrantStore(store).sealCapturedBeforeWriters(capture,
                    new LegacyGrantStore.ReleasedRules("code8-evidence-v1", true, true, false)).trustedSealedState();
        }
        @Override public boolean configured() { return configured; }
        @Override public boolean checkoutEnabled() { return checkoutEnabled; }
        @Override public Session configure() throws Exception {
            configurations.incrementAndGet();
            if (configureStarted != null) { configureStarted.countDown(); if (!configureRelease.await(2, TimeUnit.SECONDS)) throw new IOException("Test hung"); }
            if (configureFailure) throw new IOException("SDK unavailable");
            return new Session(owner, new BillingController.Provider() {
                public void fetchCurrent(BillingController.Callback callback) { fetches.incrementAndGet(); providerCallback = callback; }
                public void restoreCurrent(BillingController.Callback callback) { restoreCallback = callback; }
            },
                    new BillingCacheStorage(store, owner), time, () -> {
                        if (bootstrapJournalFailure) throw new IOException("Bootstrap journal unavailable");
                        return new BillingAttemptStorage(store, owner).load();
                    },
                    actor, disk, catalogCalls::add, checkout);
        }
        void initialize(String capture) { runtime.start(capture); boot.drain(); flush(); }
        void flush() { actor.drain(); disk.drain(); actor.drain(); ui.drain(); actor.drain(); }
    }
    private static BillingProviderConfig config() {
        return new BillingProviderConfig("goog_fixture", "subscription", "monthly", "yearly", "lifetime", "default");
    }
    @Test public void catalogRequiresReadySdkAndDoesNotFetchDuringBootstrapOrLocalReads() throws Exception {
        Fixture f = new Fixture();
        assertThrows(IllegalStateException.class, () -> f.runtime.refreshCatalog(value -> {}));
        assertEquals(0, f.configurations.get());
        f.initialize(OLD); assertTrue(f.catalogCalls.isEmpty());
        assertEquals(3, f.runtime.snapshot().catalog.size());
        List<BillingSnapshot> replies = new ArrayList<>();
        BillingRuntime.Request detached = f.runtime.refreshCatalog(value -> fail("Detached"));
        f.runtime.refreshCatalog(replies::add); f.actor.drain(); detached.close();
        assertEquals(1, f.catalogCalls.size());
        f.catalogCalls.get(0).complete(RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                RevenueCatCatalogTest.subscription(Plan.MONTHLY)), RevenueCatCatalogTest.CONFIG)); f.flush();
        assertEquals(1, replies.size()); assertTrue(replies.get(0).catalog.get(0).available);
        assertTrue(replies.get(0).access.full); assertFalse(replies.get(0).capabilities.checkout);
        f.runtime.snapshot(); f.flush(); assertEquals(1, f.catalogCalls.size());
    }
    @Test public void configurationRecoveryCannotStartCatalogOrConfigureAgain() {
        Fixture f = new Fixture(); f.configured = false; f.initialize(OLD);
        assertThrows(IllegalStateException.class, () -> f.runtime.refreshCatalog(value -> {}));
        assertTrue(f.catalogCalls.isEmpty()); assertEquals(0, f.configurations.get());
        assertTrue(f.runtime.snapshot().access.full);
        for (CatalogItem item : f.runtime.snapshot().catalog) assertFalse(item.available);
    }
    @Test public void explicitRestoreWhileStartupFetchHangsPublishesAndPersistsVerifiedRights() throws Exception {
        Fixture f = new Fixture(); f.initialize(EMPTY);
        assertNull(f.restoreCallback); assertTrue(f.runtime.snapshot().capabilities.restore);
        List<BillingSnapshot> replies = new ArrayList<>();
        f.runtime.restore(replies::add); f.actor.drain(); f.ui.drain();
        assertEquals(OperationState.RESTORING, f.runtime.snapshot().operation.state);
        assertFalse(f.runtime.snapshot().capabilities.restore);
        f.restoreCallback.complete(new BillingController.Record(f.owner, paid(f.owner).store, null), Issue.NONE);
        f.flush();
        assertEquals(1, replies.size()); assertTrue(replies.get(0).access.full);
        assertTrue(new BillingCacheStorage(f.store, f.owner).load().store.lifetimeActive);
        f.providerCallback.complete(null, Issue.OFFLINE); f.flush();
        assertTrue(f.runtime.snapshot().access.full); assertEquals(Issue.NONE, f.runtime.snapshot().issue);
    }
    @Test public void acknowledgedRestoreReleasesUiWhileVerifiedRightsStillPersist() throws Exception {
        Fixture f = new Fixture(); f.initialize(EMPTY);
        List<String> accepted = new ArrayList<>(); AtomicInteger completions = new AtomicInteger();
        BillingController.Handle handle = f.runtime.restore(value -> completions.incrementAndGet(), accepted::add);
        f.actor.drain(); f.ui.drain();
        assertEquals(1, accepted.size()); assertEquals(f.runtime.snapshot().operation.id, accepted.get(0));
        assertEquals(OperationState.RESTORING, f.runtime.snapshot().operation.state);
        assertEquals(0, completions.get()); assertFalse(f.runtime.snapshot().access.full);
        handle.close();
        f.restoreCallback.complete(new BillingController.Record(f.owner, paid(f.owner).store, null), Issue.NONE);
        f.flush();
        assertEquals(0, completions.get()); assertTrue(f.runtime.snapshot().access.full);
        assertTrue(new BillingCacheStorage(f.store, f.owner).load().store.lifetimeActive);
    }
    @Test public void acknowledgedRestoreJoinsSameOperationAndDetachSuppressesUndeliveredAck() {
        Fixture f = new Fixture(); f.initialize(EMPTY);
        List<String> first = new ArrayList<>(), joined = new ArrayList<>(), detached = new ArrayList<>();
        f.runtime.restore(value -> {}, first::add);
        f.runtime.restore(value -> {}, joined::add);
        BillingController.Handle gone = f.runtime.restore(value -> fail("detached UI"), detached::add);
        gone.close(); f.actor.drain(); f.ui.drain();
        assertEquals(1, first.size()); assertEquals(first, joined); assertTrue(detached.isEmpty());
        assertNotNull(f.restoreCallback); assertEquals(OperationState.RESTORING, f.runtime.snapshot().operation.state);
    }
    @Test public void explicitBridgeCommandsCannotConfigureBeforeBootstrapOrBypassClosedPurchaseGate() throws Exception {
        Fixture f = new Fixture(); AtomicInteger acknowledgements = new AtomicInteger();
        assertThrows(IllegalStateException.class, () -> f.runtime.restore(value -> {}, id -> acknowledgements.incrementAndGet()));
        assertThrows(IllegalStateException.class, f.runtime::reconcilePurchase);
        assertThrows(IllegalArgumentException.class, () -> f.runtime.purchase(Plan.LIFETIME, "revision", false,
                value -> {}, id -> acknowledgements.incrementAndGet()));
        assertEquals(0, f.configurations.get()); assertEquals(0, f.seals.get()); assertTrue(f.boot.tasks.isEmpty());
        f.initialize(EMPTY); f.runtime.refreshCatalog(value -> {}); f.actor.drain();
        f.catalogCalls.get(0).complete(RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                RevenueCatCatalogTest.subscription(Plan.MONTHLY)), RevenueCatCatalogTest.CONFIG)); f.flush();
        assertTrue(f.runtime.snapshot().catalog.get(0).available);
        String revision = f.runtime.snapshot().catalog.get(0).catalogRevision;
        IllegalStateException rejected = assertThrows(IllegalStateException.class, () -> f.runtime.purchase(Plan.MONTHLY, revision, false,
                value -> {}, id -> acknowledgements.incrementAndGet()));
        assertEquals("billing_checkout_disabled", rejected.getMessage());
        assertFalse(f.runtime.snapshot().capabilities.checkout); assertTrue(f.actor.tasks.isEmpty());
        assertEquals(0, acknowledgements.get()); assertNull(f.runtime.snapshot().unresolvedPurchase);
    }
    @Test public void configuredRuntimeExposesActorCheckoutOnlyAfterCatalogAndQualifiedRightsArrive() throws Exception {
        Fixture f = new Fixture(); f.checkoutEnabled = true;
        assertTrue(f.store.write(FileKind.LEGACY,
                "{\"schema\":1,\"status\":\"ineligible\",\"ruleVersion\":\"test-established-cohort\"}"));
        f.initialize(EMPTY);
        assertFalse(f.runtime.snapshot().capabilities.checkout);
        f.runtime.refreshCatalog(value -> {}); f.actor.drain();
        f.catalogCalls.get(0).complete(RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                RevenueCatCatalogTest.subscription(Plan.MONTHLY)), RevenueCatCatalogTest.CONFIG));
        f.flush();
        assertFalse(f.runtime.snapshot().capabilities.checkout);
        Store noPurchase = new Store(Verification.REMOTE, 1000L, false, false, null,
                RenewState.OFF, null, false, null);
        f.providerCallback.complete(new BillingController.Record("owner", noPurchase,
                new BillingPolicy.ClockAnchor(1000, 100, "boot",
                        BillingPolicy.TimeProvenance.SIGNED_REMOTE_REQUEST_TIME)), Issue.NONE);
        f.flush();
        assertTrue(f.runtime.snapshot().capabilities.checkout);
        assertFalse(f.runtime.snapshot().access.full);
        f.checkoutEnabled = false;
        assertFalse(f.runtime.snapshot().capabilities.checkout);
    }
    @Test public void workerRejectionAfterSdkConfigurationDisablesRestoreButRetainsLegacy() {
        Fixture f = new Fixture(); f.actor.reject = true;
        f.runtime.start(OLD); f.boot.drain(); f.ui.drain();
        assertFalse(f.runtime.read().sdkAvailable);
        assertTrue(f.runtime.snapshot().access.full);
        assertFalse(f.runtime.snapshot().capabilities.restore);
        assertThrows(IllegalStateException.class, () -> f.runtime.restore(value -> {}));
    }
    private static BillingPolicy.StoreRecord paid(String owner) {
        return new BillingPolicy.StoreRecord(new Store(Verification.REMOTE, 1000L, true, false, null,
                RenewState.UNKNOWN, null, false, null), owner, 1, null, true);
    }
    @Test public void missingSnapshotIsBootstrapNotAccessDenial() {
        Fixture f = new Fixture();
        assertEquals(Phase.NOT_STARTED, f.runtime.read().phase); assertNull(f.runtime.snapshot());
        f.runtime.start(EMPTY);
        assertEquals(Phase.SEALING, f.runtime.read().phase); assertFalse(f.runtime.read().writersMayStart());
        assertNull(f.runtime.snapshot()); assertEquals(0, f.configurations.get());
    }
    @Test public void localSealIsVisibleBeforeSdkAndNetworkWithHangingConfiguration() throws Exception {
        Fixture f = new Fixture();
        f.configureStarted = new CountDownLatch(1); f.configureRelease = new CountDownLatch(1);
        f.runtime.start(OLD);
        Thread worker = new Thread(f.boot::drain); worker.start();
        try {
            assertTrue(f.configureStarted.await(1, TimeUnit.SECONDS));
            assertEquals(Phase.LOCAL_SEALED, f.runtime.read().phase);
            assertTrue(f.runtime.snapshot().access.full); assertTrue(f.runtime.read().writersMayStart());
            assertTrue(f.files.bytes.containsKey(FileKind.LEGACY)); assertEquals(0, f.fetches.get());
            f.runtime.start(EMPTY); // A new UI cannot replace the retained first capture.
        } finally { f.configureRelease.countDown(); worker.join(2000); }
        assertFalse(worker.isAlive()); f.flush();
        assertTrue(f.runtime.snapshot().access.full); assertEquals(OLD, f.captured); assertEquals(1, f.fetches.get());
    }
    @Test public void missingConfigPreservesOldRightsAndNeverConfiguresProvider() {
        Fixture f = new Fixture(); f.configured = false; f.initialize(OLD);
        assertEquals(Phase.RECOVERY, f.runtime.read().phase); assertEquals(BootstrapIssue.CONFIGURATION, f.runtime.read().bootstrapIssue);
        assertTrue(f.runtime.snapshot().access.full); assertEquals(0, f.configurations.get()); assertEquals(0, f.fetches.get());
        assertTrue(f.runtime.snapshot().capabilities.manage);
    }
    @Test public void sdkFailureDoesNotRevokeSealedLegacy() {
        Fixture f = new Fixture(); f.configureFailure = true; f.initialize(OLD);
        assertEquals(BootstrapIssue.PROVIDER, f.runtime.read().bootstrapIssue); assertTrue(f.runtime.snapshot().access.full);
        assertTrue(f.runtime.snapshot().legacy.persisted); assertFalse(f.runtime.snapshot().capabilities.checkout);
    }
    @Test public void emptyEvidenceNeverMintsFreshOrFullUnderIncompleteReleasedRules() {
        Fixture f = new Fixture(); f.initialize(EMPTY);
        assertEquals(LegacyStatus.NEEDS_RECOVERY, f.runtime.snapshot().legacy.status);
        assertFalse(f.runtime.snapshot().access.full); assertFalse(f.runtime.snapshot().capabilities.checkout);
        assertTrue(f.runtime.snapshot().capabilities.restore); assertTrue(f.runtime.snapshot().capabilities.manage);
        assertSame(f.runtime.checkoutRecovery().snapshot.legacy, f.runtime.snapshot().legacy);
    }
    @Test public void firstCaptureCannotBeReplacedByLaterHistoricalCapture() {
        Fixture f = new Fixture(); f.runtime.start(EMPTY); f.runtime.start(OLD); f.boot.drain(); f.flush(); f.runtime.start(OLD);
        assertEquals(EMPTY, f.captured); assertEquals(1, f.seals.get()); assertEquals(1, f.configurations.get());
        assertFalse(f.runtime.snapshot().access.full); assertEquals(1, f.fetches.get());
    }
    @Test public void concurrentStartInitializesExactlyOnce() throws Exception {
        Fixture f = new Fixture(); CountDownLatch go = new CountDownLatch(1); List<Thread> threads = new ArrayList<>();
        for (int i = 0; i < 16; i++) { Thread thread = new Thread(() -> {
            try { go.await(); f.runtime.start(OLD); } catch (InterruptedException e) { throw new AssertionError(e); }
        }); threads.add(thread); thread.start(); }
        go.countDown(); for (Thread thread : threads) thread.join(1000);
        f.boot.drain(); f.flush();
        assertEquals(1, f.seals.get()); assertEquals(1, f.configurations.get()); assertEquals(1, f.fetches.get());
    }
    @Test public void corruptAttemptIsExplicitUnknownAndBytesSurviveRefresh() {
        Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.ATTEMPT, "{}"));
        byte[] original = f.files.bytes.get(FileKind.ATTEMPT).clone(); f.initialize(EMPTY);
        assertTrue(f.runtime.read().journalUnknown); assertEquals(Issue.STORAGE, f.runtime.snapshot().issue);
        assertFalse(f.runtime.snapshot().capabilities.checkout);
        f.providerCallback.complete(new BillingController.Record("owner", paid("owner").store, null), Issue.NONE); f.flush();
        assertTrue(f.runtime.snapshot().access.full); assertTrue(f.runtime.read().journalUnknown);
        assertEquals(Issue.STORAGE, f.runtime.snapshot().issue); assertArrayEquals(original, f.files.bytes.get(FileKind.ATTEMPT));
    }
    @Test public void wrongOwnerJournalAndCacheArePreservedWithRecoveryNotReset() throws Exception {
        Fixture f = new Fixture();
        BillingAttempt wrong = BillingAttempt.prepare("purchase", "previous-owner", Plan.LIFETIME, "lifetime", null, 10, Collections.emptySet());
        assertTrue(f.store.write(FileKind.ATTEMPT, new BillingAttemptCodec().encode(wrong)));
        assertTrue(f.store.write(FileKind.ACCESS, new BillingCacheCodec().encode(paid("previous-owner"))));
        byte[] journal = f.files.bytes.get(FileKind.ATTEMPT).clone(), cache = f.files.bytes.get(FileKind.ACCESS).clone();
        f.initialize(EMPTY); assertTrue(f.runtime.read().journalUnknown); assertFalse(f.runtime.snapshot().access.full);
        f.providerCallback.complete(new BillingController.Record("owner", paid("owner").store, null), Issue.NONE); f.flush();
        assertTrue(f.runtime.snapshot().access.full); assertEquals(Issue.STORAGE, f.runtime.snapshot().issue);
        assertArrayEquals(journal, f.files.bytes.get(FileKind.ATTEMPT)); assertArrayEquals(cache, f.files.bytes.get(FileKind.ACCESS));
    }
    @Test public void readFailureDoesNotBecomeMissingLegacyOrAttempt() throws Exception {
        Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.LEGACY, "{\"schema\":1,\"status\":\"eligible\",\"ruleVersion\":\"old\"}"));
        assertTrue(f.store.write(FileKind.ATTEMPT, new BillingAttemptCodec().encode(BillingAttempt.prepare("p", "owner",
                Plan.LIFETIME, "lifetime", null, 10, Collections.emptySet()))));
        byte[] previous = f.files.bytes.get(FileKind.LEGACY).clone(); f.files.failRead = true; f.initialize(EMPTY);
        assertEquals(LegacyStatus.NEEDS_RECOVERY, f.runtime.snapshot().legacy.status); assertFalse(f.runtime.read().writersMayStart());
        assertTrue(f.runtime.read().journalUnknown); assertEquals(Issue.STORAGE, f.runtime.snapshot().issue);
        assertArrayEquals(previous, f.files.bytes.get(FileKind.LEGACY));
    }
    @Test public void pendingJournalBarrierIsExposedWithoutInventingResolution() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = BillingAttempt.prepare("p", "owner", Plan.YEARLY,
                "subscription", "yearly", 10, Collections.emptySet()).recordUnresolved("p", BillingAttempt.State.PENDING);
        assertTrue(f.store.write(FileKind.ATTEMPT, new BillingAttemptCodec().encode(a))); f.initialize(EMPTY);
        assertFalse(f.runtime.read().journalUnknown); assertEquals(PurchaseStage.PENDING, f.runtime.snapshot().unresolvedPurchase.stage);
        assertFalse(f.runtime.snapshot().capabilities.checkout); assertEquals("p", f.runtime.snapshot().unresolvedPurchase.id);
    }
    @Test public void eligibleWriteFailurePreservesSessionAndFreshWriteFailureKeepsWritersBlocked() {
        Fixture old = new Fixture(); old.files.failWrite = true; old.initialize(OLD);
        assertTrue(old.runtime.snapshot().access.full); assertTrue(old.runtime.read().writersMayStart());
        assertFalse(old.runtime.snapshot().legacy.persisted); assertEquals(Issue.STORAGE, old.runtime.snapshot().issue);
        Fixture empty = new Fixture(); empty.files.failWrite = true; empty.initialize(EMPTY);
        assertFalse(empty.runtime.snapshot().access.full); assertFalse(empty.runtime.read().writersMayStart());
    }
    @Test public void closedSubscriberGetsNoQueuedOrLateSdkCallbacksAndNewUiReadsLatest() {
        Fixture f = new Fixture(); AtomicInteger abandoned = new AtomicInteger();
        BillingRuntime.Handle handle = f.runtime.subscribe(state -> abandoned.incrementAndGet());
        f.runtime.start(EMPTY); handle.close(); f.boot.drain(); f.flush(); assertEquals(0, abandoned.get());
        f.providerCallback.complete(new BillingController.Record("owner", paid("owner").store, null), Issue.NONE); f.flush();
        assertEquals(0, abandoned.get()); assertTrue(f.runtime.snapshot().access.full);
        List<State> delivered = new ArrayList<>(); BillingRuntime.Handle fresh = f.runtime.subscribe(delivered::add); f.flush();
        assertTrue(delivered.get(delivered.size() - 1).snapshot.access.full); fresh.close();
    }
    @Test public void subscriberQueueIsBoundedAndCoalescesBootstrapTransitions() {
        Fixture f = new Fixture(); List<BillingRuntime.Handle> handles = new ArrayList<>();
        for (int i = 0; i < 64; i++) handles.add(f.runtime.subscribe(state -> {}));
        try { f.runtime.subscribe(state -> {}); fail("Unbounded subscribers"); } catch (RejectedExecutionException expected) { }
        f.runtime.start(OLD); f.boot.drain(); assertTrue(f.ui.tasks.size() <= 65); // 64 subscribers + one core initial delivery.
        for (BillingRuntime.Handle handle : handles) handle.close(); f.flush();
        BillingRuntime.Handle next = f.runtime.subscribe(state -> {}); next.close();
    }
    @Test public void rejectedBootstrapDoesNotInventLocalDecisionOrGrant() {
        Fixture f = new Fixture(); BillingRuntime runtime = new BillingRuntime(f, task -> { throw new RejectedExecutionException(); }, f.ui);
        runtime.start(OLD); assertEquals(Phase.RECOVERY, runtime.read().phase);
        assertEquals(BootstrapIssue.WORKER, runtime.read().bootstrapIssue); assertNull(runtime.snapshot());
        assertFalse(runtime.read().localDecisionSealed); assertEquals(0, f.seals.get());
    }
    @Test public void repeatedInitializeAfterFirstWorkerRejectionRetainsOriginalCaptureAndRecovers() {
        Fixture f = new Fixture(); f.boot.reject = true;
        f.runtime.start(OLD); assertNull(f.runtime.snapshot());
        f.boot.reject = false;
        f.runtime.start(EMPTY);
        assertEquals(Phase.SEALING, f.runtime.read().phase);
        f.boot.drain(); f.flush();
        assertEquals(OLD, f.captured); assertEquals(1, f.seals.get());
        assertTrue(f.runtime.snapshot().access.full); assertTrue(f.runtime.snapshot().legacy.persisted);
        assertEquals(1, f.configurations.get());
    }
    @Test public void stableOwnerIncludesEveryConfigurationFieldAndSdkIdentity() {
        BillingProviderConfig base = config(); String owner = ownerIdentity(base, "$RCAnonymousID:fixture");
        assertEquals(owner, ownerIdentity(config(), "$RCAnonymousID:fixture"));
        assertNotEquals(owner, ownerIdentity(base, "$RCAnonymousID:other"));
        String[] values = {base.publicKey, base.subscriptionProduct, base.monthlyPlan, base.yearlyPlan, base.lifetimeProduct, base.offering};
        for (int i = 0; i < values.length; i++) { String[] modified = values.clone(); modified[i] += "X";
            assertNotEquals(owner, ownerIdentity(new BillingProviderConfig(modified[0], modified[1], modified[2], modified[3], modified[4], modified[5]), "$RCAnonymousID:fixture"));
        }
        assertTrue(owner.matches("owner-v1-[0-9a-f]{64}"));
        try { ownerIdentity(base, ""); fail("Missing identity accepted"); } catch (IllegalArgumentException expected) { }
    }
    @Test public void explicitRetryPersistsOriginalEligibleSealWithoutRecreatingCoreOrRevokingPaidRights() {
        Fixture f = new Fixture(); f.files.failWrite = true; f.initialize(OLD);
        f.providerCallback.complete(new BillingController.Record("owner", paid("owner").store, null), Issue.NONE); f.flush();
        String epoch = f.runtime.snapshot().controllerEpoch;
        assertFalse(f.runtime.snapshot().legacy.persisted); assertEquals(2, f.runtime.snapshot().access.sources.size());
        f.files.failWrite = false; List<BillingSnapshot> replies = new ArrayList<>();
        f.runtime.refresh(replies::add); f.runtime.start(EMPTY); f.boot.drain();
        assertTrue(f.runtime.snapshot().access.full); f.flush();
        assertEquals(OLD, f.captured); assertTrue(f.runtime.snapshot().legacy.persisted);
        assertEquals(epoch, f.runtime.snapshot().controllerEpoch); assertEquals(1, f.configurations.get());
        assertEquals(2, f.runtime.snapshot().access.sources.size()); assertEquals(1, replies.size());
        assertTrue(replies.get(0).legacy.persisted); assertEquals(2, f.fetches.get());
    }
    @Test public void retriesCoalesceSdkFailureAndCloseAbandonedCompletion() {
        Fixture f = new Fixture(); f.configureFailure = true; f.initialize(OLD);
        f.configureFailure = false; List<BillingSnapshot> replies = new ArrayList<>(); AtomicInteger abandoned = new AtomicInteger();
        BillingRuntime.Request closed = f.runtime.refresh(value -> abandoned.incrementAndGet()); closed.close();
        f.runtime.refresh(replies::add); f.runtime.refresh(replies::add);
        assertEquals(1, f.boot.tasks.size()); assertTrue(f.runtime.snapshot().access.full);
        f.boot.drain(); f.flush();
        assertEquals(2, f.configurations.get()); assertEquals(1, f.seals.get()); assertEquals(1, f.fetches.get());
        assertEquals(2, replies.size()); assertEquals(0, abandoned.get());
        assertTrue(f.runtime.snapshot().access.full); assertEquals(Phase.SDK_READY, f.runtime.read().phase);
    }
    @Test public void missingConfigurationRetryReturnsLocalRecoveryThenCanConfigureOnLaterExplicitRetry() {
        Fixture f = new Fixture(); f.configured = false; f.initialize(EMPTY);
        List<BillingSnapshot> replies = new ArrayList<>(); f.runtime.refresh(replies::add); f.boot.drain(); f.flush();
        assertEquals(1, replies.size()); assertFalse(replies.get(0).access.full);
        assertEquals(BootstrapIssue.CONFIGURATION, f.runtime.read().bootstrapIssue); assertEquals(0, f.configurations.get());
        f.configured = true; f.runtime.refresh(replies::add); f.boot.drain(); f.flush();
        assertEquals(2, replies.size()); assertEquals(1, f.configurations.get()); assertEquals(1, f.seals.get());
    }
    @Test public void retryStillCannotReplaceCorruptMarkerOrEraseEstablishedEligibleSession() {
        Fixture f = new Fixture(); f.files.failWrite = true; f.initialize(OLD);
        f.files.failWrite = false; f.files.bytes.put(FileKind.LEGACY, new byte[]{1, 2, 3});
        f.runtime.refresh(value -> {}); f.boot.drain(); f.flush();
        assertTrue(f.runtime.snapshot().access.full); assertFalse(f.runtime.snapshot().legacy.persisted);
        assertEquals(Issue.STORAGE, f.runtime.snapshot().issue); assertArrayEquals(new byte[]{1, 2, 3}, f.files.bytes.get(FileKind.LEGACY));
    }
    @Test public void retrySealWriteRecoveryUnblocksWritersWithoutMintingGiftFromLaterCapture() {
        Fixture f = new Fixture(); f.files.failWrite = true; f.initialize(EMPTY);
        assertFalse(f.runtime.read().writersMayStart()); f.runtime.start(OLD); f.files.failWrite = false;
        f.runtime.refresh(value -> {}); f.boot.drain(); f.flush();
        assertEquals(EMPTY, f.captured); assertTrue(f.runtime.read().writersMayStart());
        assertTrue(f.runtime.snapshot().legacy.persisted); assertFalse(f.runtime.snapshot().access.full);
        assertEquals(LegacyStatus.NEEDS_RECOVERY, f.runtime.snapshot().legacy.status);
    }
    @Test public void bootstrapRetryJoinersAreBoundedWhileSdkInitializationHangs() throws Exception {
        Fixture f = new Fixture(); f.configureStarted = new CountDownLatch(1); f.configureRelease = new CountDownLatch(1);
        f.runtime.start(OLD); Thread worker = new Thread(f.boot::drain); worker.start();
        List<BillingRuntime.Request> requests = new ArrayList<>();
        try {
            assertTrue(f.configureStarted.await(1, TimeUnit.SECONDS));
            for (int i = 0; i < 64; i++) requests.add(f.runtime.refresh(value -> {}));
            try { f.runtime.refresh(value -> {}); fail("Unbounded retry joiners"); } catch (RejectedExecutionException expected) { }
            for (BillingRuntime.Request request : requests) request.close();
        } finally { f.configureRelease.countDown(); worker.join(2000); }
        f.flush(); assertEquals(1, f.configurations.get()); assertEquals(1, f.fetches.get());
    }
    @Test public void actorRejectionAfterSealAppliedCompletesRetryAndKeepsOwnerAndAccess() {
        Fixture f = new Fixture(); f.files.failWrite = true; f.initialize(OLD);
        String epoch = f.runtime.snapshot().controllerEpoch; f.files.failWrite = false;
        List<BillingSnapshot> replies = new ArrayList<>(); f.runtime.refresh(replies::add); f.boot.drain();
        f.actor.reject = true; f.actor.drain(); f.ui.drain();
        assertEquals(1, replies.size()); assertTrue(replies.get(0).access.full); assertTrue(replies.get(0).legacy.persisted);
        assertTrue(f.runtime.read().sdkAvailable); assertEquals(BootstrapIssue.WORKER, f.runtime.read().bootstrapIssue);
        assertEquals(epoch, f.runtime.snapshot().controllerEpoch); assertEquals(1, f.configurations.get());
        f.actor.reject = false; f.runtime.refresh(value -> {}); f.actor.drain();
        assertEquals(1, f.fetches.get()); // Joins the still in-flight initial provider call.
    }
}
