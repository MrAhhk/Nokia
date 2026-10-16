package com.nokialauncher.billing;

import org.junit.Test;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingPolicy.*;

/** Deterministic async boundary tests, synthetic normalized evidence; no SDK/payment proof. */
public class BillingControllerTest {
    @Test public void detachedRestoreDropsQueuedAcknowledgementButContinuesVerification() {
        Fixture f = new Fixture(); f.initialize(); List<String> acknowledgements = new ArrayList<>();
        BillingController.Handle handle = f.controller.restore(snapshot -> fail("Detached completion"), acknowledgements::add);
        f.actor.drain(); handle.close(); f.ui.drain();
        assertTrue(acknowledgements.isEmpty()); assertEquals(1, f.provider.restores.size());
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full);
    }
    @Test public void restoreAcknowledgesSameOperationForJoinersBeforeHungProviderCompletes() {
        Fixture f = new Fixture(); f.initialize(); List<String> acknowledgements = new ArrayList<>();
        List<BillingSnapshot> completions = new ArrayList<>();
        f.controller.restore(completions::add, acknowledgements::add);
        f.controller.restore(completions::add, acknowledgements::add);
        f.actor.drain(); f.ui.drain();
        String id = f.controller.snapshot().operation.id;
        assertNotNull(id); assertEquals(java.util.Arrays.asList(id, id), acknowledgements);
        assertEquals(1, f.provider.restores.size()); assertTrue(completions.isEmpty());
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE); f.settle();
        assertEquals(2, completions.size()); assertTrue(f.controller.snapshot().access.full);
    }
    private static final String OWNER = "customer-config";
    private static class Queue implements Executor {
        final ArrayDeque<Runnable> tasks = new ArrayDeque<>();
        boolean reject;
        int capacity = Integer.MAX_VALUE;
        public void execute(Runnable task) {
            if (reject || tasks.size() >= capacity) throw new RejectedExecutionException("full");
            tasks.add(task);
        }
        void drain() { int bound = 1000; while (!tasks.isEmpty()) { if (--bound == 0) fail("Recursive scheduling"); tasks.remove().run(); } }
    }
    private static class FakeProvider implements BillingController.Provider {
        final List<BillingController.Callback> calls = new ArrayList<>();
        final List<BillingController.Callback> restores = new ArrayList<>();
        public void fetchCurrent(BillingController.Callback callback) { calls.add(callback); }
        public void restoreCurrent(BillingController.Callback callback) { restores.add(callback); }
        void reply(int index, BillingController.Record record, Issue failure) { calls.get(index).complete(record, failure); }
    }
    private static class Disk implements BillingController.Storage {
        StoreRecord cached; boolean failWrite, failLoad; int writes;
        public StoreRecord load() throws Exception { if (failLoad) throw new Exception("unknown"); return cached; }
        public boolean save(StoreRecord record) { writes++; if (failWrite) return false; cached = record; return true; }
    }
    private static class Timer implements BillingController.Scheduler {
        static class Task implements BillingController.Cancellation {
            final Runnable callback; final long delay; boolean canceled;
            Task(Runnable callback, long delay) { this.callback = callback; this.delay = delay; }
            public void cancel() { canceled = true; }
            void fire() { callback.run(); } // deliberately permits late canceled OS callbacks
        }
        final List<Task> tasks = new ArrayList<>();
        public BillingController.Cancellation schedule(Runnable callback, long delay) {
            Task task = new Task(callback, delay); tasks.add(task); return task;
        }
        Task last() { return tasks.get(tasks.size() - 1); }
    }
    private static class Fixture {
        final Queue actor = new Queue(), diskQueue = new Queue(), ui = new Queue();
        final List<BillingController.CatalogCallback> catalogCalls = new ArrayList<>();
        final FakeProvider provider = new FakeProvider(); final Disk disk = new Disk(); final Timer timer = new Timer();
        long elapsed = 10; String boot = "boot";
        final BillingController controller = new BillingController(OWNER, "process-2", provider, disk,
                new BillingController.Time() {
                    public String bootToken() { return boot; }
                    public long elapsedRealtimeMs() { return elapsed; }
                }, actor, diskQueue, ui, new Legacy(LegacyStatus.INELIGIBLE, true), null, timer, catalogCalls::add);
        final BillingController.Handle foreground = controller.attach(snapshot -> {});
        void initialize() { controller.initialize(); settle(); }
        void settle() { actor.drain(); diskQueue.drain(); actor.drain(); ui.drain(); }
        void refresh() { controller.refresh(snapshot -> {}); actor.drain(); }
        void reply(int index, boolean lifetime) { provider.reply(index, remote(OWNER, lifetime), Issue.NONE); settle(); }
    }
    private static BillingController.Record remote(String owner, boolean lifetime) {
        return new BillingController.Record(owner, new Store(Verification.REMOTE, 100L, lifetime,
                false, null, RenewState.UNKNOWN, null, false, null), null);
    }
    private static StoreRecord cache(long sequence, boolean lifetime) {
        return new StoreRecord(remote(OWNER, lifetime).store, OWNER, sequence, null, true);
    }
    private static RevenueCatCatalog plans() throws Exception {
        return RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                RevenueCatCatalogTest.subscription(Plan.MONTHLY), RevenueCatCatalogTest.subscription(Plan.YEARLY),
                RevenueCatCatalogTest.lifetime(RevenueCatCatalogTest.PRICE)), RevenueCatCatalogTest.CONFIG);
    }
    @Test public void catalogIsExplicitCoalescedAndFailureReplacesCardsWithoutErasingRights() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.refresh(); f.reply(0, true);
        assertTrue(f.catalogCalls.isEmpty());
        List<BillingSnapshot> replies = new ArrayList<>();
        f.controller.refreshCatalog(replies::add); f.controller.refreshCatalog(replies::add); f.actor.drain();
        assertEquals(1, f.catalogCalls.size());
        long before = f.controller.snapshot().sequence;
        RevenueCatCatalog actual = plans(); f.catalogCalls.get(0).complete(actual); f.settle();
        assertEquals(2, replies.size()); assertTrue(f.controller.snapshot().sequence > before);
        assertEquals(3, f.controller.snapshot().catalog.size());
        assertEquals(RevenueCatCatalogTest.PRICE.getFormatted(), f.controller.snapshot().catalog.get(0).priceText);
        assertFalse(f.controller.snapshot().capabilities.checkout); assertTrue(f.controller.snapshot().access.full);
        int writes = f.disk.writes;
        f.controller.refreshCatalog(replies::add); f.actor.drain();
        f.catalogCalls.get(1).complete(null); f.settle();
        for (CatalogItem item : f.controller.snapshot().catalog) { assertFalse(item.available); assertEquals("", item.priceText); }
        assertTrue(f.controller.snapshot().access.full); assertEquals(writes, f.disk.writes);
        // Old first callback cannot replace the failed newer catalog; fresh explicit retry works.
        f.catalogCalls.get(0).complete(actual); f.settle(); assertFalse(f.controller.snapshot().catalog.get(0).available);
        f.controller.refreshCatalog(replies::add); f.actor.drain(); f.catalogCalls.get(2).complete(actual); f.settle();
        assertTrue(f.controller.snapshot().catalog.get(0).available);
    }
    @Test public void catalogCompletionSurvivesSaturatedActorAndUiDetach() throws Exception {
        Fixture f = new Fixture(); f.initialize();
        BillingController.Handle request = f.controller.refreshCatalog(value -> fail("Detached UI")); f.actor.drain();
        request.close(); f.foreground.close(); f.actor.drain();
        f.actor.capacity = 1; f.controller.reevaluateCache();
        f.catalogCalls.get(0).complete(plans()); f.actor.drain(); f.ui.drain();
        assertTrue(f.controller.snapshot().catalog.get(0).available);
        f.actor.capacity = Integer.MAX_VALUE;
        f.controller.refreshCatalog(value -> {}); f.actor.drain(); assertEquals(2, f.catalogCalls.size());
    }
    @Test public void liveCatalogBindingOverflowRejectsExplicitlyAndDetachedSlotsCanBeReused() throws Exception {
        Fixture f = new Fixture(); f.initialize(); List<BillingController.Handle> handles = new ArrayList<>();
        List<BillingSnapshot> results = new ArrayList<>();
        for (int i = 0; i < 64; i++) handles.add(f.controller.refreshCatalog(results::add));
        assertThrows(RejectedExecutionException.class, () -> f.controller.refreshCatalog(results::add));
        f.actor.drain(); assertEquals(1, f.catalogCalls.size());
        handles.get(0).close(); f.controller.refreshCatalog(results::add); f.actor.drain();
        assertEquals(1, f.catalogCalls.size());
        f.catalogCalls.get(0).complete(plans()); f.settle(); assertEquals(64, results.size());
        // Completion releases all reservations even when consumers do not close their handles.
        f.controller.refreshCatalog(results::add); f.actor.drain(); assertEquals(2, f.catalogCalls.size());
    }
    @Test public void catalogFailureCannotCompleteRestoreOrOverwriteExistingStorageIssue() {
        Fixture f = new Fixture(); f.disk.failLoad = true; f.initialize();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        f.controller.restore(value -> {}); f.actor.drain();
        String operation = f.controller.snapshot().operation.id;
        f.controller.refreshCatalog(value -> {}); f.actor.drain();
        f.catalogCalls.get(0).complete(null); f.settle();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        assertEquals(OperationState.RESTORING, f.controller.snapshot().operation.state);
        assertEquals(operation, f.controller.snapshot().operation.id);
        assertEquals(1, f.provider.restores.size()); assertEquals(0, f.disk.writes);
    }
    @Test public void catalogSnapshotExpiryRetainsLatestPresentationAndReservedSequence() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, new BillingController.Record(OWNER,
                new Store(Verification.REMOTE, 100L, false, true, 200L, RenewState.ON, null, false, null),
                new ClockAnchor(100L, 10L, "boot", TimeProvenance.SIGNED_REMOTE_REQUEST_TIME)), Issue.NONE); f.settle();
        f.controller.refreshCatalog(value -> {}); f.actor.drain(); f.catalogCalls.get(0).complete(plans()); f.settle();
        long current = f.controller.snapshot().sequence; f.elapsed = 111;
        assertEquals(current + 1, f.controller.snapshot().sequence);
        assertTrue(f.controller.snapshot().catalog.get(0).available); assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void restoreSupersedesHungFetchAndCompletesItsWaitersWithoutMoreFetches() {
        Fixture f = new Fixture(); f.initialize(); List<BillingSnapshot> refreshed = new ArrayList<>();
        f.controller.refresh(refreshed::add); f.actor.drain();
        List<BillingSnapshot> restored = new ArrayList<>();
        f.controller.restore(restored::add); f.controller.restore(restored::add); f.actor.drain();
        assertEquals(OperationState.RESTORING, f.controller.snapshot().operation.state);
        java.util.UUID.fromString(f.controller.snapshot().operation.id);
        assertFalse(f.controller.snapshot().capabilities.restore);
        assertFalse(f.controller.snapshot().capabilities.checkout);
        assertTrue(f.controller.snapshot().capabilities.nativeRecovery);
        assertEquals(1, f.provider.restores.size()); assertEquals(1, f.provider.calls.size());
        f.elapsed += 60_000; f.controller.reevaluateCache(); f.settle();
        assertEquals(OperationState.RESTORING, f.controller.snapshot().operation.state);
        assertFalse(f.controller.snapshot().access.full); // no invented timeout success
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE); f.settle();
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
        assertEquals(2, restored.size()); assertEquals(1, refreshed.size());
        assertTrue(f.disk.cached.store.lifetimeActive); assertTrue(f.controller.snapshot().capabilities.restore);
        for (int i = 0; i < 64; i++) f.controller.refresh(snapshot -> {});
        f.actor.drain(); assertEquals(1, f.provider.calls.size());
        f.provider.reply(0, remote(OWNER, false), Issue.NONE); f.settle();
        f.controller.notifyProvider(remote(OWNER, false), 1); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertTrue(f.disk.cached.store.lifetimeActive);
        assertEquals(1, f.disk.writes);
    }
    @Test public void restoreObserversAreBoundedAndDuplicatesCannotApplyOrCancelNewRestore() {
        Fixture f = new Fixture(); f.initialize(); List<BillingSnapshot> results = new ArrayList<>();
        for (int i = 0; i < 80; i++) f.controller.restore(results::add);
        f.actor.drain(); assertEquals(1, f.provider.restores.size());
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE);
        f.provider.restores.get(0).complete(remote(OWNER, false), Issue.NONE); f.settle();
        assertEquals(64, results.size()); assertEquals(1, f.disk.writes);
        f.controller.restore(snapshot -> {}); f.actor.drain();
        String nextId = f.controller.snapshot().operation.id;
        f.provider.restores.get(0).complete(null, Issue.PROVIDER); f.settle();
        assertEquals(nextId, f.controller.snapshot().operation.id);
        f.provider.restores.get(1).complete(null, Issue.OFFLINE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(Issue.OFFLINE, f.controller.snapshot().issue);
    }
    @Test public void restoreDetachKeepsVerifiedPersistenceAndFailuresPreservePaidCache() {
        Fixture f = new Fixture(); f.disk.cached = cache(8, true); f.initialize();
        List<BillingSnapshot> results = new ArrayList<>();
        BillingController.Handle handle = f.controller.restore(results::add); f.actor.drain(); handle.close();
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE); f.settle();
        assertTrue(results.isEmpty()); assertEquals(9, f.disk.cached.requestSequence);
        f.controller.restore(snapshot -> {}); f.actor.drain();
        f.provider.restores.get(1).complete(remote(OWNER, false), Issue.OFFLINE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertTrue(f.disk.cached.store.lifetimeActive);
        assertEquals(Issue.OFFLINE, f.controller.snapshot().issue); assertEquals(1, f.disk.writes);
        f.controller.restore(snapshot -> {}); f.actor.drain();
        Store device = new Store(Verification.DEVICE, null, false, false, null, RenewState.UNKNOWN, null, false, null);
        f.provider.restores.get(2).complete(new BillingController.Record(OWNER, device, null), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(Issue.VERIFICATION, f.controller.snapshot().issue);
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
    }
    @Test public void restoreWaitsForCacheSequenceAndNeverResolvesUncertainPurchase() {
        Queue actor = new Queue(), diskQueue = new Queue(), ui = new Queue();
        FakeProvider provider = new FakeProvider(); Disk disk = new Disk(); disk.cached = cache(500, true);
        BillingAttempt attempt = BillingAttempt.prepare("purchase-attempt", OWNER, Plan.LIFETIME, "lifetime", null,
                100, java.util.Collections.singleton("old-right"))
                .recordUnresolved("purchase-attempt", BillingAttempt.State.UNCERTAIN);
        BillingController controller = new BillingController(OWNER, "process", provider, disk,
                new BillingController.Time() {
                    public String bootToken() { return "boot"; }
                    public long elapsedRealtimeMs() { return 10; }
                }, actor, diskQueue, ui, new Legacy(LegacyStatus.INELIGIBLE, true), attempt, new Timer());
        controller.restore(snapshot -> {}); actor.drain(); assertTrue(provider.restores.isEmpty());
        assertEquals(OperationState.RESTORING, controller.snapshot().operation.state);
        diskQueue.drain(); actor.drain(); assertEquals(1, provider.restores.size());
        provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE);
        actor.drain(); diskQueue.drain(); actor.drain(); ui.drain();
        assertTrue(controller.snapshot().access.full); assertEquals(501, disk.cached.requestSequence);
        assertEquals("purchase-attempt", controller.snapshot().unresolvedPurchase.id);
        assertEquals(PurchaseStage.UNCERTAIN, controller.snapshot().unresolvedPurchase.stage);
        assertEquals(BillingAttempt.State.UNCERTAIN, attempt.state);
    }
    @Test public void fullActorCannotDropRestoreResultAndStorageFailureStillAllowsRetry() {
        Fixture f = new Fixture(); f.initialize(); f.actor.capacity = 1; f.disk.failWrite = true;
        f.controller.restore(snapshot -> {}); f.actor.drain(); f.controller.reevaluateCache();
        f.provider.restores.get(0).complete(remote(OWNER, true), Issue.NONE); // reserved completion lane
        f.actor.drain(); assertTrue(f.controller.snapshot().access.full);
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
        f.settle(); assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        f.disk.failWrite = false; f.controller.retryPersistence(); f.settle();
        assertTrue(f.disk.cached.store.lifetimeActive); assertEquals(Issue.NONE, f.controller.snapshot().issue);
    }
    @Test public void functionalProviderWithoutRestoreReportsExplicitUnsupportedIssue() {
        Fixture f = new Fixture();
        BillingController controller = new BillingController(OWNER, "process", callback -> {}, f.disk,
                new BillingController.Time() {
                    public String bootToken() { return "boot"; }
                    public long elapsedRealtimeMs() { return 10; }
                }, f.actor, f.diskQueue, f.ui, new Legacy(LegacyStatus.INELIGIBLE, true), null, f.timer);
        controller.restore(snapshot -> {}); f.settle();
        assertEquals(Issue.PROVIDER, controller.snapshot().issue);
        assertEquals(OperationState.IDLE, controller.snapshot().operation.state);
        assertFalse(controller.snapshot().access.full);
    }
    @Test public void hungFetchCoalescesAndLeavesRecoveryReachable() {
        Fixture f = new Fixture(); f.initialize(); List<BillingSnapshot> results = new ArrayList<>();
        f.controller.refresh(results::add); f.controller.refresh(results::add); f.actor.drain();
        assertEquals(1, f.provider.calls.size()); assertTrue(results.isEmpty());
        assertTrue(f.controller.snapshot().capabilities.restore);
        assertTrue(f.controller.snapshot().capabilities.nativeRecovery);
        f.provider.reply(0, remote(OWNER, true), Issue.NONE); f.settle();
        assertEquals(2, results.size()); assertTrue(results.get(0).access.full);
        assertEquals(1, f.provider.calls.size());
    }
    @Test public void nativeSealRetryUpdatesPersistenceOnActorWithoutLosingPaidAccess() {
        Fixture f = new Fixture(); f.initialize(); f.refresh(); f.reply(0, true);
        f.controller.updateSealedLegacy(new Legacy(LegacyStatus.ELIGIBLE, false), () -> {}); f.settle();
        // The initial durable ineligible decision is immutable, even to a later native retry.
        assertEquals(LegacyStatus.INELIGIBLE, f.controller.snapshot().legacy.status);
        Queue actor = new Queue(), disk = new Queue(), ui = new Queue();
        BillingController controller = new BillingController(OWNER, "retry-process", f.provider, f.disk,
                new BillingController.Time() {
                    public String bootToken() { return "boot"; }
                    public long elapsedRealtimeMs() { return 10; }
                }, actor, disk, ui, new Legacy(LegacyStatus.ELIGIBLE, false), null, f.timer);
        final int[] applied = {0};
        controller.updateSealedLegacy(new Legacy(LegacyStatus.ELIGIBLE, true), () -> applied[0]++);
        assertFalse(controller.snapshot().legacy.persisted); actor.drain();
        assertEquals(1, applied[0]); assertTrue(controller.snapshot().legacy.persisted);
        assertTrue(controller.snapshot().access.full);
        controller.updateSealedLegacy(new Legacy(LegacyStatus.NEEDS_RECOVERY, false), () -> applied[0]++); actor.drain();
        assertEquals(2, applied[0]); assertEquals(LegacyStatus.ELIGIBLE, controller.snapshot().legacy.status);
        assertTrue(controller.snapshot().access.full);
    }
    @Test public void newRightIsVisibleBeforeDiskAndSurvivesWriteFailure() {
        Fixture f = new Fixture(); f.initialize(); f.disk.failWrite = true; f.refresh();
        f.provider.reply(0, remote(OWNER, true), Issue.NONE); f.actor.drain();
        assertEquals(0, f.disk.writes); assertTrue(f.controller.snapshot().access.full);
        f.settle(); assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        assertTrue(f.controller.snapshot().access.full); assertTrue(f.controller.snapshot().capabilities.restore);
    }
    @Test public void verifiedRevokeSurvivesWriteFailureAndOlderCallback() {
        Fixture f = new Fixture(); f.disk.cached = cache(80, true); f.initialize();
        assertTrue(f.controller.snapshot().access.full); f.disk.failWrite = true; f.refresh();
        f.provider.reply(0, remote(OWNER, false), Issue.NONE); f.actor.drain();
        assertFalse(f.controller.snapshot().access.full); f.settle();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue); assertTrue(f.disk.cached.store.lifetimeActive);
        f.provider.reply(0, remote(OWNER, true), Issue.NONE); f.settle();
        assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void restartSeedsCachedSequenceBeforeIssuingNewRequest() {
        Fixture f = new Fixture(); f.disk.cached = cache(900, true);
        f.controller.refresh(snapshot -> {}); f.settle(); assertEquals(1, f.provider.calls.size());
        f.reply(0, false); assertFalse(f.controller.snapshot().access.full);
        assertEquals(901, f.disk.cached.requestSequence);
    }
    @Test public void deviceAndNetworkFailuresRetainTrustedLifetime() {
        Fixture f = new Fixture(); f.disk.cached = cache(2, true); f.initialize(); f.refresh();
        f.provider.reply(0, new BillingController.Record(OWNER, new Store(Verification.DEVICE, null,
                false, false, null, RenewState.UNKNOWN, null, false, null), null), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(Issue.VERIFICATION, f.controller.snapshot().issue);
        assertEquals(0, f.disk.writes); f.refresh(); f.provider.reply(1, null, Issue.OFFLINE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(Issue.OFFLINE, f.controller.snapshot().issue);
    }
    @Test public void wrongOwnerAndStaleListenerCannotResurrectOrFetchRecursively() {
        Fixture f = new Fixture(); f.initialize(); f.refresh(); f.reply(0, true); f.refresh(); f.reply(1, false);
        long revision = f.controller.snapshot().sequence;
        f.controller.notifyProvider(remote(OWNER, true), 1);
        f.controller.notifyProvider(remote(OWNER, true), 999); f.settle();
        assertEquals(revision, f.controller.snapshot().sequence); assertFalse(f.controller.snapshot().access.full);
        f.controller.notifyProvider(remote("other-customer", true), 2); f.settle();
        assertEquals(Issue.VERIFICATION, f.controller.snapshot().issue);
        assertFalse(f.controller.snapshot().access.full);
        assertEquals(2, f.provider.calls.size());
    }
    @Test public void validResultAfterUiGoneStillPersistsAndLatestAttachGetsRights() {
        Fixture f = new Fixture(); f.initialize(); List<BillingSnapshot> old = new ArrayList<>();
        BillingController.Handle attachment = f.controller.attach(old::add);
        BillingController.Handle completion = f.controller.refresh(old::add); f.actor.drain();
        attachment.close(); completion.close(); f.reply(0, true); assertTrue(old.isEmpty());
        assertTrue(f.disk.cached.store.lifetimeActive); List<BillingSnapshot> latest = new ArrayList<>();
        f.controller.attach(latest::add); f.settle(); assertEquals(1, latest.size());
        assertSame(f.controller.snapshot(), latest.get(0)); assertEquals("process-2", latest.get(0).controllerEpoch);
    }
    @Test public void throwingObserverDoesNotBlockRightsOrOtherObservers() {
        Fixture f = new Fixture(); f.initialize(); List<BillingSnapshot> results = new ArrayList<>();
        f.controller.attach(snapshot -> { throw new IllegalStateException("UI failed"); });
        f.controller.attach(results::add); f.refresh(); f.reply(0, true);
        assertTrue(f.controller.snapshot().access.full); assertTrue(results.get(results.size() - 1).access.full);
        assertEquals(1, f.disk.writes);
    }
    @Test public void unknownCachePreservesRecoveryAndUserPersistenceRetryCoalesces() {
        Fixture f = new Fixture(); f.disk.failLoad = true; f.initialize();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue); assertTrue(f.controller.snapshot().capabilities.restore);
        f.disk.failWrite = true; f.refresh(); f.reply(0, true); f.disk.failWrite = false;
        f.controller.retryPersistence(); f.controller.retryPersistence(); f.actor.drain(); f.settle();
        assertEquals(2, f.disk.writes); assertEquals(Issue.NONE, f.controller.snapshot().issue);
    }
    @Test public void unanchoredSubscriptionCannotBecomeOfflineGrant() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        Store active = new Store(Verification.REMOTE, 100L, false, true, 500L, RenewState.ON, Plan.MONTHLY, false, null);
        f.provider.reply(0, new BillingController.Record(OWNER, active, null), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full);
        f.controller.reevaluateCache(); f.settle(); assertFalse(f.controller.snapshot().access.full);
        assertEquals(Verification.REMOTE, f.controller.snapshot().store.verification);
    }
    @Test public void rejectedLoadDoesNotLatchInitializationOrBlockExplicitFetch() {
        Fixture f = new Fixture(); f.diskQueue.reject = true;
        f.controller.initialize(); f.actor.drain();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        assertTrue(f.controller.snapshot().capabilities.restore);
        f.controller.initialize(); f.refresh();
        assertEquals(1, f.provider.calls.size());
        f.diskQueue.reject = false; f.reply(0, true);
        assertTrue(f.controller.snapshot().access.full); assertEquals(1, f.disk.writes);
    }
    @Test public void rejectedSaveAndRetryPreserveMemoryAndRemainRetryable() {
        Fixture f = new Fixture(); f.initialize(); f.refresh(); f.diskQueue.reject = true;
        f.provider.reply(0, remote(OWNER, true), Issue.NONE); f.actor.drain();
        assertTrue(f.controller.snapshot().access.full); assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        assertEquals(0, f.disk.writes);
        f.controller.retryPersistence(); f.actor.drain();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue); assertTrue(f.controller.snapshot().access.full);
        f.diskQueue.reject = false; f.controller.retryPersistence(); f.settle();
        assertEquals(1, f.disk.writes); assertEquals(Issue.NONE, f.controller.snapshot().issue);
    }
    @Test public void rejectedDeliveryCannotAbortPersistenceAndLaterAttachGetsLatest() {
        Fixture f = new Fixture(); f.initialize(); f.ui.reject = true;
        f.controller.attach(snapshot -> {}); f.refresh(); f.reply(0, true);
        assertEquals(1, f.disk.writes); assertTrue(f.disk.cached.store.lifetimeActive);
        assertTrue(f.controller.snapshot().access.full);
        f.ui.reject = false; List<BillingSnapshot> snapshots = new ArrayList<>();
        f.controller.attach(snapshots::add); f.settle();
        assertEquals(1, snapshots.size()); assertSame(f.controller.snapshot(), snapshots.get(0));
    }
    @Test public void wrongOwnerClearsFreshSubscriptionDecisionButKeepsTrustedCache() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        Store active = new Store(Verification.REMOTE, 100L, false, true, 500L, RenewState.ON, Plan.MONTHLY, false, null);
        f.provider.reply(0, new BillingController.Record(OWNER, active, null), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full); f.refresh();
        f.provider.reply(1, remote("other-customer", true), Issue.NONE); f.settle();
        assertEquals(Issue.VERIFICATION, f.controller.snapshot().issue);
        assertFalse(f.controller.snapshot().access.full);
        assertTrue(f.controller.snapshot().store.subscriptionActive);
        assertSame(active, f.disk.cached.store); assertEquals(1, f.disk.writes);
    }
    @Test public void listenerCannotPreemptCanonicalCallbackOrMintFreshSubscription() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        Store active = new Store(Verification.REMOTE, 100L, false, true, 500L, RenewState.ON, Plan.MONTHLY, false, null);
        BillingController.Record record = new BillingController.Record(OWNER, active, null);
        f.controller.notifyProvider(record, 1); f.settle();
        assertFalse(f.controller.snapshot().access.full); assertEquals(0, f.disk.writes);
        assertEquals(1, f.provider.calls.size());
        f.provider.reply(0, record, Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(1, f.disk.writes);
        f.controller.reevaluateCache(); f.settle(); f.refresh();
        f.provider.reply(1, null, Issue.OFFLINE); f.settle();
        f.controller.notifyProvider(record, 2); f.settle();
        assertFalse(f.controller.snapshot().access.full);
        assertFalse(f.controller.snapshot().capabilities.checkout);
        assertEquals(2, f.provider.calls.size());
    }
    @Test public void fullActorCannotDropCacheLoadCompletion() {
        Fixture f = new Fixture(); f.actor.drain(); // finish foreground binding before constraining request capacity
        f.disk.cached = cache(80, true); f.actor.capacity = 1;
        f.controller.initialize(); f.actor.drain();
        f.controller.reevaluateCache(); // fills the actual actor queue before disk callback
        f.diskQueue.drain(); assertEquals(1, f.actor.tasks.size());
        f.actor.drain(); assertTrue(f.controller.snapshot().access.full);
        f.refresh(); assertEquals(1, f.provider.calls.size());
        f.reply(0, false); assertFalse(f.controller.snapshot().access.full);
        assertEquals(81, f.disk.cached.requestSequence);
    }
    @Test public void fullActorCannotDropVerifiedRevokeOrLatchFetch() {
        Fixture f = new Fixture(); f.disk.cached = cache(2, true); f.initialize();
        f.actor.capacity = 1; f.refresh(); f.controller.reevaluateCache();
        f.provider.reply(0, remote(OWNER, false), Issue.NONE); // wake is rejected, completion retained
        f.actor.drain(); assertFalse(f.controller.snapshot().access.full);
        f.settle(); assertFalse(f.disk.cached.store.lifetimeActive);
        f.refresh(); assertEquals(2, f.provider.calls.size());
        f.reply(1, true); assertTrue(f.controller.snapshot().access.full);
    }
    @Test public void fullActorCannotLoseSaveFailureOrPermanentlyBlockRetry() {
        Fixture f = new Fixture(); f.initialize(); f.actor.capacity = 1; f.disk.failWrite = true;
        f.refresh(); f.provider.reply(0, remote(OWNER, true), Issue.NONE); f.actor.drain();
        assertTrue(f.controller.snapshot().access.full);
        f.controller.reevaluateCache(); // existing accepted actor work must drain reserved completion
        f.diskQueue.drain(); f.actor.drain();
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue); assertTrue(f.controller.snapshot().access.full);
        f.disk.failWrite = false; f.controller.retryPersistence(); f.settle();
        assertEquals(2, f.disk.writes); assertEquals(Issue.NONE, f.controller.snapshot().issue);
        assertTrue(f.disk.cached.store.lifetimeActive);
    }

    private static BillingController.Record subscription(boolean lifetime, Long expiry, ClockAnchor anchor) {
        return new BillingController.Record(OWNER, new Store(Verification.REMOTE, 100L, lifetime,
                true, expiry, RenewState.ON, Plan.MONTHLY, false, null), anchor);
    }
    private static ClockAnchor anchor(String boot) {
        return new ClockAnchor(100, 10, boot, TimeProvenance.SIGNED_REMOTE_REQUEST_TIME);
    }
    @Test public void deadlineRevokesBeforeOneForegroundRenewalCheck() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        assertEquals(400, f.timer.last().delay); assertTrue(f.controller.snapshot().access.full);
        f.elapsed = 410; f.timer.last().fire(); f.settle();
        assertFalse(f.controller.snapshot().access.full); assertEquals(2, f.provider.calls.size());
        assertTrue(f.controller.snapshot().store.subscriptionActive); // provider evidence stays intact
        f.provider.reply(1, new BillingController.Record(OWNER,
                new Store(Verification.REMOTE, 500L, false, true, 900L, RenewState.ON,
                        Plan.MONTHLY, false, null),
                new ClockAnchor(500, 410, "boot", TimeProvenance.SIGNED_REMOTE_REQUEST_TIME)), Issue.NONE);
        f.settle(); assertTrue(f.controller.snapshot().access.full);
        assertEquals(400, f.timer.last().delay);
    }
    @Test public void delayedCallbackReadDeniesAtExactDeadlineAndReservesSequence() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        BillingSnapshot before = f.controller.snapshot(); f.elapsed = 409;
        assertSame(before, f.controller.snapshot()); f.elapsed = 410;
        BillingSnapshot expired = f.controller.snapshot(); assertFalse(expired.access.full);
        assertEquals(before.sequence + 1, expired.sequence);
        f.timer.last().fire(); f.settle();
        assertTrue(f.controller.snapshot().sequence > expired.sequence);
        assertEquals(2, f.provider.calls.size());
    }
    @Test public void failedRenewalCheckDoesNotGrantGraceOrRetryOnRepeatedWake() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        Timer.Task old = f.timer.last(); f.elapsed = 410; old.fire(); f.settle();
        assertEquals(2, f.provider.calls.size());
        f.provider.reply(1, null, Issue.PROVIDER); f.settle();
        for (int i = 0; i < 100; i++) old.fire();
        f.settle(); assertEquals(2, f.provider.calls.size());
        assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void expiryJoinsExistingFetchAndDoesNotStartParallelRequest() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        f.refresh(); f.elapsed = 410; f.timer.last().fire(); f.settle();
        assertEquals(2, f.provider.calls.size()); assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void detachedOrRebootedExpiryNeverStartsRenewalFetch() {
        Fixture detached = new Fixture(); detached.initialize(); detached.refresh();
        detached.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); detached.settle();
        Timer.Task old = detached.timer.last(); detached.foreground.close(); detached.settle();
        detached.elapsed = 410; old.fire(); detached.settle();
        assertEquals(1, detached.provider.calls.size()); assertFalse(detached.controller.snapshot().access.full);

        Fixture rebooted = new Fixture(); rebooted.initialize(); rebooted.refresh();
        rebooted.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); rebooted.settle();
        rebooted.boot = "new-boot"; rebooted.elapsed = 410; rebooted.timer.last().fire(); rebooted.settle();
        assertEquals(1, rebooted.provider.calls.size()); assertFalse(rebooted.controller.snapshot().access.full);
    }
    @Test public void obsoleteExpiryCannotRevokeReplacementLifetimeAndCompletionIsBounded() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        Timer.Task old = f.timer.last(); f.refresh(); f.reply(1, true);
        assertTrue(old.canceled); long revision = f.controller.snapshot().sequence;
        f.elapsed = 500; for (int i = 0; i < 100; i++) old.fire(); f.settle();
        assertEquals(revision, f.controller.snapshot().sequence); assertTrue(f.controller.snapshot().access.full);
        assertEquals(2, f.provider.calls.size());
    }
    @Test public void fullActorRetainsExactlyOneExpiryCompletion() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        f.actor.capacity = 1; f.controller.retryPersistence(); f.elapsed = 410;
        Timer.Task task = f.timer.last(); for (int i = 0; i < 100; i++) task.fire();
        assertEquals(1, f.actor.tasks.size()); assertFalse(f.controller.snapshot().access.full);
        f.settle(); assertFalse(f.controller.snapshot().access.full); assertEquals(2, f.provider.calls.size());
    }
    @Test public void missingBootUsesFiniteSignedDeadlineButRestartCacheRequiresRecovery() {
        Fixture f = new Fixture(); f.boot = null; f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor(null)), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(400, f.timer.last().delay);
        f.elapsed = 410; assertFalse(f.controller.snapshot().access.full);
        Fixture restarted = new Fixture(); restarted.disk.cached = f.disk.cached; restarted.initialize();
        assertFalse(restarted.controller.snapshot().access.full);
    }
    @Test public void rebootAndElapsedRollbackCannotExtendSubscription() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); f.settle();
        f.boot = "other-boot"; assertFalse(f.controller.snapshot().access.full);
        f.controller.reevaluateCache(); f.settle(); assertFalse(f.controller.snapshot().access.full);
        Fixture rollback = new Fixture(); rollback.initialize(); rollback.refresh();
        rollback.provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); rollback.settle();
        rollback.elapsed = 9; assertFalse(rollback.controller.snapshot().access.full);
    }
    @Test public void nullAnchorLiveDecisionIsBoundedAndLifetimeSurvives() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.provider.reply(0, subscription(true, null, null), Issue.NONE); f.settle();
        assertTrue(f.controller.snapshot().access.sources.contains(Source.SUBSCRIPTION));
        assertEquals(BillingController.UNANCHORED_LIVE_MS, f.timer.last().delay);
        f.elapsed += BillingController.UNANCHORED_LIVE_MS;
        assertFalse(f.controller.snapshot().access.sources.contains(Source.SUBSCRIPTION));
        assertTrue(f.controller.snapshot().access.sources.contains(Source.STORE_LIFETIME));
        f.timer.last().fire(); f.settle(); assertTrue(f.controller.snapshot().access.full);
    }
    @Test public void longDeadlineSaturatesWithoutWrappingOrImmediateExpiry() {
        Fixture f = new Fixture(); f.initialize(); f.refresh();
        f.elapsed = Long.MAX_VALUE - 10;
        ClockAnchor clock = new ClockAnchor(0, f.elapsed, "boot", TimeProvenance.SIGNED_REMOTE_REQUEST_TIME);
        f.provider.reply(0, subscription(false, 500L, clock), Issue.NONE); f.settle();
        assertEquals(10, f.timer.last().delay);
        assertTrue(f.controller.snapshot().access.full);
        f.elapsed = Long.MAX_VALUE; assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void expiredSubscriptionPreservesSealedLegacyGrant() {
        Queue actor = new Queue(), diskQueue = new Queue(), ui = new Queue();
        FakeProvider provider = new FakeProvider(); Disk disk = new Disk(); Timer timer = new Timer();
        long[] elapsed = {10};
        BillingController controller = new BillingController(OWNER, "legacy-process", provider, disk,
                new BillingController.Time() {
                    public String bootToken() { return "boot"; }
                    public long elapsedRealtimeMs() { return elapsed[0]; }
                }, actor, diskQueue, ui, new Legacy(LegacyStatus.ELIGIBLE, true), null, timer);
        controller.initialize(); actor.drain(); diskQueue.drain(); actor.drain();
        controller.refresh(snapshot -> {}); actor.drain();
        provider.reply(0, subscription(false, 500L, anchor("boot")), Issue.NONE); actor.drain();
        elapsed[0] = 410;
        assertTrue(controller.snapshot().access.full);
        assertEquals(java.util.Collections.singletonList(Source.LEGACY_DEVICE), controller.snapshot().access.sources);
        assertEquals(1, provider.calls.size());
    }

    @Test public void detachCancelsTimerReadStillExpiresAndAttachDoesNotClearBoundedLiveGrant() {
        Fixture f = new Fixture(); f.boot = null; f.initialize(); f.refresh();
        f.provider.reply(0, subscription(false, 500L, anchor(null)), Issue.NONE); f.settle();
        Timer.Task first = f.timer.last(); f.foreground.close(); f.settle();
        assertTrue(first.canceled); assertTrue(f.controller.snapshot().access.full);
        BillingController.Handle next = f.controller.attach(snapshot -> {}); f.settle();
        assertTrue(f.controller.snapshot().access.full); assertEquals(400, f.timer.last().delay);
        next.close(); f.settle(); f.elapsed = 410;
        assertFalse(f.controller.snapshot().access.full); assertEquals(1, f.provider.calls.size());
    }

}
