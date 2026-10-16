package com.nokialauncher.billing;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.VerificationResult;
import com.revenuecat.purchases.interfaces.GetStoreProductsCallback;
import com.revenuecat.purchases.models.Price;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.RevenueCatNormalizerTest.*;

/** Actual pinned public SDK receipt/catalog fixtures; deterministic native actor ordering.
 * No configured provider, Activity, sandbox charge or pending-cancellation inventory proof. */
public class BillingCheckoutTest {
    static CustomerInfo canceledSubscription(long expiry, long detailExpiry, boolean billingIssue) throws Exception {
        long canceled = REMOTE - 750;
        JSONObject details = subscription().put("expires_date", iso(detailExpiry))
                .put("unsubscribe_detected_at", iso(canceled)).put("store_transaction_id", "previous-order");
        if (billingIssue) details.put("billing_issues_detected_at", iso(REMOTE - 600));
        return info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT,
                sub(false, expiry, false, new Date(canceled), billingIssue ? new Date(REMOTE - 600) : null)),
                VerificationResult.VERIFIED, new JSONObject().put("sub", details), new JSONObject(), REMOTE, REMOTE);
    }
    @Test public void canceledExpiredSubscriptionCanRepurchaseAndRetainsOldOrderInDurableBaseline() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain();
        f.reply(0, canceledSubscription(REMOTE - 500, REMOTE - 500, false));
        assertFalse(f.controller.snapshot().access.full);
        assertEquals(1, f.preflights.size());
        f.terms(); assertEquals(1, f.launches.size());
        assertTrue(f.durable.baselineIds.contains("rc10:play-sub:previous-order"));
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
        f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.settle();
        long purchased = REMOTE + 1000, response = REMOTE + 2000, expiry = REMOTE + 10000;
        JSONObject row = subscription().put("store_transaction_id", "repurchased-order")
                .put("purchase_date", iso(purchased));
        com.revenuecat.purchases.EntitlementInfo renewed = new com.revenuecat.purchases.EntitlementInfo(
                RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, true, true,
                com.revenuecat.purchases.PeriodType.NORMAL, new Date(purchased), new Date(REMOTE - 1000),
                new Date(expiry), com.revenuecat.purchases.Store.PLAY_STORE, "sub", "monthly", true,
                null, null, com.revenuecat.purchases.OwnershipType.PURCHASED, new JSONObject(), VerificationResult.VERIFIED);
        f.reply(1, info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, renewed),
                VerificationResult.VERIFIED, new JSONObject().put("sub", row), new JSONObject(), response, response));
        assertEquals(BillingAttempt.State.COMPLETED, f.durable.state);
        assertEquals("rc10:play-sub:repurchased-order", f.durable.resolvedTransactionId);
        assertTrue(f.controller.snapshot().access.full); assertNull(f.controller.snapshot().unresolvedPurchase);
    }
    @Test public void activeCanceledConflictingExpiryAndBillingIssueDoNotAdmitSubscriptionRepurchase() throws Exception {
        for (CustomerInfo value : Arrays.asList(
                canceledSubscription(REMOTE + 10000, REMOTE + 10000, false),
                canceledSubscription(REMOTE - 500, REMOTE + 10000, false),
                canceledSubscription(REMOTE - 500, REMOTE - 500, true))) {
            Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain(); f.reply(0, value);
            assertTrue(f.preflights.isEmpty()); assertTrue(f.launches.isEmpty()); assertNull(f.durable);
        }
    }
    @Test public void detachedCheckoutDropsAcknowledgementBeforeActorOrDeliveryWithoutCancelingNativeIntent() throws Exception {
        for (boolean closeBeforeActor : new boolean[]{true, false}) {
            Fixture f = new Fixture(); f.initialize(); List<String> acknowledgements = new ArrayList<>();
            BillingController.Handle handle = f.controller.purchase(Plan.MONTHLY,
                    f.catalog.items.get(0).catalogRevision, snapshot -> fail("Detached completion"), acknowledgements::add);
            if (!closeBeforeActor) f.actor.drain();
            handle.close(); f.actor.drain(); f.ui.drain();
            assertTrue(acknowledgements.isEmpty()); assertEquals(1, f.fetches.size());
            f.reply(0, emptyAt(REMOTE - 2000)); f.terms(); assertEquals(1, f.launches.size());
        }
    }
    @Test public void checkoutAcknowledgesAcceptedIntentBeforeProviderAndRejectsDuplicateWithoutCharge() throws Exception {
        Fixture f = new Fixture(); f.initialize(); List<String> acknowledgements = new ArrayList<>();
        List<BillingSnapshot> completions = new ArrayList<>();
        BillingController.Handle first = f.controller.purchase(Plan.MONTHLY,
                f.catalog.items.get(0).catalogRevision, completions::add, acknowledgements::add);
        f.actor.drain(); f.ui.drain();
        String id = f.controller.snapshot().operation.id;
        assertNotNull(id); assertEquals(Collections.singletonList(id), acknowledgements);
        assertTrue(completions.isEmpty()); assertEquals(1, f.fetches.size()); assertTrue(f.launches.isEmpty());
        f.controller.purchase(Plan.MONTHLY, f.catalog.items.get(0).catalogRevision,
                snapshot -> {}, acknowledgements::add);
        f.actor.drain(); f.ui.drain();
        assertEquals(Arrays.asList(id, null), acknowledgements); assertEquals(1, f.fetches.size());
        first.close(); f.reply(0, emptyAt(REMOTE - 2000)); f.terms();
        assertEquals(1, f.launches.size()); assertEquals(id, f.durable.id); assertTrue(completions.isEmpty());
    }
    static final class Queue implements Executor {
        final ArrayDeque<Runnable> tasks = new ArrayDeque<>();
        boolean reject;
        int capacity = Integer.MAX_VALUE;
        public void execute(Runnable task) {
            if (reject || tasks.size() >= capacity) throw new RejectedExecutionException("fixture"); tasks.add(task);
        }
        void drain() { int limit = 1000; while (!tasks.isEmpty()) {
            if (--limit == 0) throw new AssertionError("unbounded work"); tasks.remove().run();
        } }
    }
    static final class Fixture {
        final Queue actor = new Queue(), disk = new Queue(), ui = new Queue();
        final List<String> order = new ArrayList<>();
        final List<RevenueCatReceiptMapper.Callback> fetches = new ArrayList<>();
        final List<GetStoreProductsCallback> preflights = new ArrayList<>();
        final List<BillingController.Callback> restores = new ArrayList<>();
        final List<BillingController.PurchaseCallback> launches = new ArrayList<>();
        final BillingController.Time time = new BillingController.Time() {
            public String bootToken() { return "boot"; }
            public long elapsedRealtimeMs() { return 100; }
        };
        RevenueCatCatalog catalog;
        BillingAttempt durable;
        boolean failJournal, failRights, unknownJournal, gate = true, throwLaunch;
        final BillingController controller;
        int completed;
        Fixture() throws Exception { this(null, new Legacy(LegacyStatus.INELIGIBLE, true)); }
        Fixture(BillingAttempt initial, Legacy legacy) throws Exception {
            durable = initial;
            catalog = RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                    RevenueCatCatalogTest.subscription(Plan.MONTHLY), RevenueCatCatalogTest.subscription(Plan.YEARLY),
                    RevenueCatCatalogTest.lifetime(RevenueCatCatalogTest.PRICE)), RevenueCatCatalogTest.CONFIG);
            RevenueCatCheckoutPreflight preflight = new RevenueCatCheckoutPreflight((ids, callback) -> preflights.add(callback),
                    RevenueCatCatalogTest.CONFIG);
            controller = new BillingController("owner", "process", new BillingController.Provider() {
                public void fetchCurrent(BillingController.Callback callback) { }
                public void restoreCurrent(BillingController.Callback callback) { restores.add(callback); }
            }, new BillingController.Storage() {
                public BillingPolicy.StoreRecord load() { return null; }
                public boolean save(BillingPolicy.StoreRecord record) { order.add("rights"); return !failRights; }
            }, time, actor, disk, ui, legacy, initial, (r, delay) -> () -> {}, cb -> cb.complete(catalog),
                    new BillingController.CheckoutDependencies(fetches::add, preflight::prepare,
                            new BillingController.AttemptJournal() {
                public BillingAttempt load() throws Exception { if (unknownJournal) throw new Exception("unknown"); return durable; }
                public boolean save(BillingAttempt next, BillingAttempt prior) {
                    order.add(next.state.name());
                    if (failJournal || (durable == null ? prior != null : prior == null || !durable.toMap().equals(prior.toMap()))) return false;
                    durable = next; return true;
                }
            }, (selection, id, callback) -> {
                order.add("launch"); assertEquals(durable.id, id); assertEquals(BillingAttempt.State.PREPARED, durable.state);
                if (throwLaunch) throw new IllegalStateException("ambiguous launch"); launches.add(callback);
            }, () -> gate));
        }
        void initialize() { controller.initialize(); settle(); controller.refreshCatalog(s -> {}); settle(); }
        void settle() { int limit = 30; do {
            if (--limit == 0) throw new AssertionError("unbounded settlement");
            actor.drain(); disk.drain(); actor.drain(); ui.drain();
        } while (!actor.tasks.isEmpty() || !disk.tasks.isEmpty() || !ui.tasks.isEmpty()); }
        BillingController.Handle purchase() { return controller.purchase(Plan.MONTHLY,
                catalog.items.get(0).catalogRevision, s -> completed++); }
        void reply(int index, CustomerInfo info) {
            RevenueCatReceiptMapper mapper = new RevenueCatReceiptMapper(cb -> cb.onReceived(info), CONFIG, "owner", time);
            mapper.fetchCurrent(fetches.get(index)); settle();
        }
        void terms() throws Exception {
            preflights.get(preflights.size() - 1).onReceived(Arrays.asList(
                    RevenueCatCatalogTest.subscription(Plan.MONTHLY).getProduct().copyWithPresentedOfferingContext(null),
                    RevenueCatCatalogTest.subscription(Plan.YEARLY).getProduct().copyWithPresentedOfferingContext(null)));
            settle();
        }
        void ready() throws Exception { initialize(); purchase(); actor.drain(); reply(0, emptyAt(REMOTE - 2000)); terms(); }
    }
    static CustomerInfo emptyAt(long date) throws Exception {
        return info(Collections.emptyMap(), VerificationResult.VERIFIED, new JSONObject(), new JSONObject(), date, date);
    }
    static BillingAttempt prepared() {
        return BillingAttempt.prepare("prior", "owner", Plan.MONTHLY, "sub", "monthly", REMOTE - 2000, Collections.emptySet());
    }
    @Test public void journalIsDurableBeforeLaunchAndDetachedUiDoesNotCancelProcessing() throws Exception {
        Fixture f = new Fixture(); f.initialize(); BillingController.Handle handle = f.purchase(); f.actor.drain(); handle.close();
        f.reply(0, emptyAt(REMOTE - 2000)); f.terms();
        assertEquals(Arrays.asList("rights", "PREPARED", "launch"), f.order);
        f.launches.get(0).complete(BillingController.PurchaseOutcome.PENDING); f.settle();
        assertEquals(BillingAttempt.State.PENDING, f.durable.state); assertEquals(0, f.completed);
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
        assertFalse(f.controller.snapshot().capabilities.checkout);
    }
    @Test public void failedPreparedWriteNeverLaunchesAndUnknownJournalBlocksNewIntent() throws Exception {
        Fixture f = new Fixture(); f.failJournal = true; f.ready();
        assertTrue(f.launches.isEmpty()); assertNull(f.durable); assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        f.purchase(); f.settle(); assertEquals(1, f.fetches.size());
        f.controller.restore(s -> {}); f.settle(); assertEquals(1, f.restores.size());
    }
    @Test public void failedRightsWriteNeverPreflightsOrLaunches() throws Exception {
        Fixture f = new Fixture(); f.failRights = true; f.initialize(); f.purchase(); f.actor.drain(); f.reply(0, emptyAt(REMOTE - 2000));
        assertTrue(f.preflights.isEmpty()); assertTrue(f.launches.isEmpty());
    }
    @Test public void unavailableProductEndsOnlyItsLiveAttemptWithoutGrantingRights() throws Exception {
        Fixture f = new Fixture(); f.ready();
        f.launches.get(0).complete(BillingController.PurchaseOutcome.PRODUCT_UNAVAILABLE); f.settle();
        assertFalse(f.durable.unresolved()); assertNull(f.controller.snapshot().unresolvedPurchase);
        assertEquals(Issue.PRODUCT_UNAVAILABLE, f.controller.snapshot().issue);
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
        assertFalse(f.controller.snapshot().access.full);
        f.purchase(); f.settle(); assertEquals(2, f.fetches.size());
    }
    @Test public void unavailableRejectionWriteFailureKeepsCheckoutBarrier() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.failJournal = true;
        f.launches.get(0).complete(BillingController.PurchaseOutcome.PRODUCT_UNAVAILABLE); f.settle();
        assertTrue(f.durable.unresolved()); assertFalse(f.controller.snapshot().capabilities.checkout);
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
    }
    @Test public void duplicateIntentAndDuplicateCallbackDoNotLaunchOrResolveTwice() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.purchase(); f.settle(); assertEquals(1, f.fetches.size());
        f.launches.get(0).complete(BillingController.PurchaseOutcome.CANCELED);
        f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.settle();
        assertEquals(BillingAttempt.State.CANCELED, f.durable.state); assertEquals(1, f.fetches.size());
    }
    @Test public void callbackCompletionPersistsVerifiedRightsBeforeReceiptResolution() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.actor.drain();
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
        f.reply(1, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertEquals(Arrays.asList("rights", "PREPARED", "launch", "rights", "COMPLETED"), f.order);
        assertEquals("rc10:play-sub:new", f.durable.resolvedTransactionId); assertTrue(f.controller.snapshot().access.full);
    }
    @Test public void emptyCompletionKeepsBarrierAndRestoreRemainsAvailable() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.actor.drain();
        f.reply(1, emptyAt(REMOTE)); assertTrue(f.durable.unresolved());
        f.controller.restore(s -> {}); f.settle(); assertEquals(1, f.restores.size());
    }
    @Test public void startupReconciliationNeverLaunchesAndMatchesActualDatedReceipt() throws Exception {
        Fixture f = new Fixture(prepared(), new Legacy(LegacyStatus.INELIGIBLE, true)); f.initialize();
        assertEquals(1, f.fetches.size()); f.reply(0, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertEquals(BillingAttempt.State.COMPLETED, f.durable.state); assertTrue(f.launches.isEmpty());
        f.controller.initialize(); f.settle(); assertEquals(1, f.fetches.size());
    }
    @Test public void renewedSubscriptionRejectsCheckoutAfterApplyingItsVerifiedRights() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain();
        f.reply(0, RevenueCatReceiptMapperTest.subscriptionInfo(true, "old"));
        assertTrue(f.controller.snapshot().access.full); assertTrue(f.preflights.isEmpty()); assertNull(f.durable);
    }
    @Test public void localLegacyAndUnknownJournalRejectBeforeProviderRequest() throws Exception {
        Fixture f = new Fixture(null, new Legacy(LegacyStatus.ELIGIBLE, true)); f.initialize(); f.purchase(); f.settle();
        assertTrue(f.fetches.isEmpty());
        Fixture unknown = new Fixture(); unknown.unknownJournal = true; unknown.initialize(); unknown.purchase(); unknown.settle();
        assertTrue(unknown.fetches.isEmpty());
    }
    @Test public void changedPricePublishesReconfirmationWithoutJournalOrLaunch() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain(); f.reply(0, emptyAt(REMOTE - 2000));
        Price changed = new Price("$4.00", 4000000L, "USD");
        f.preflights.get(0).onReceived(Collections.singletonList(RevenueCatCatalogTest.subscription(Plan.MONTHLY,
                Collections.singletonList(RevenueCatCatalogTest.option(Plan.MONTHLY, null,
                Collections.singletonList(RevenueCatCatalogTest.phase(Plan.MONTHLY, changed,
                com.revenuecat.purchases.models.RecurrenceMode.INFINITE_RECURRING)))), changed).getProduct())); f.settle();
        assertEquals("$4.00", f.controller.snapshot().catalog.get(0).priceText); assertNull(f.durable); assertTrue(f.launches.isEmpty());
    }
    @Test public void provenHostLossBeforeTransportDurablyAbortsAndAllowsLaterIntent() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain(); f.reply(0, emptyAt(REMOTE - 2000));
        f.preflights.get(0).onReceived(Collections.singletonList(RevenueCatCatalogTest.subscription(Plan.MONTHLY).getProduct()));
        f.actor.drain(); f.disk.drain(); f.gate = false; f.actor.drain(); f.ui.drain();
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state); assertTrue(f.launches.isEmpty());
        assertNotNull(f.controller.snapshot().unresolvedPurchase);
        f.settle(); assertEquals(BillingAttempt.State.CANCELED, f.durable.state);
        assertNull(f.controller.snapshot().unresolvedPurchase); assertTrue(f.launches.isEmpty());
        f.gate = true; f.purchase(); f.actor.drain(); assertEquals(2, f.fetches.size());
    }
    @Test public void failedNoLaunchAbortRetainsDurableEvidenceUntilExplicitReload() throws Exception {
        Fixture f = new Fixture(); f.initialize(); f.purchase(); f.actor.drain(); f.reply(0, emptyAt(REMOTE - 2000));
        f.preflights.get(0).onReceived(Collections.singletonList(RevenueCatCatalogTest.subscription(Plan.MONTHLY).getProduct()));
        f.actor.drain(); f.disk.drain(); f.gate = false; f.failJournal = true; f.settle();
        assertTrue(f.launches.isEmpty()); assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
        assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        f.gate = true; f.purchase(); f.settle(); assertEquals(1, f.fetches.size());
    }
    @Test public void throwingTransportIsUncertainRatherThanInventedCancellation() throws Exception {
        Fixture f = new Fixture(); f.throwLaunch = true; f.ready(); f.settle();
        assertEquals(BillingAttempt.State.UNCERTAIN, f.durable.state); assertFalse(f.controller.snapshot().access.full);
    }
    @Test public void nativeHostProofOfNoSdkEntryDurablyAbortsWithoutClaimingPayment() throws Exception {
        Fixture f = new Fixture(); f.ready();
        f.launches.get(0).complete(BillingController.PurchaseOutcome.NOT_LAUNCHED); f.settle();
        assertEquals(BillingAttempt.State.CANCELED, f.durable.state);
        assertNull(f.controller.snapshot().unresolvedPurchase); assertFalse(f.controller.snapshot().access.full);
        f.purchase(); f.actor.drain(); assertEquals(2, f.fetches.size());
    }
    @Test public void saturatedActorRetainsCheckoutCompletionAndReleasesInteractiveLock() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.actor.capacity = 1;
        f.controller.reevaluateCache(); // fills public request lane with wrapped actor work
        f.launches.get(0).complete(BillingController.PurchaseOutcome.PENDING);
        f.settle();
        assertEquals(BillingAttempt.State.PENDING, f.durable.state);
        assertEquals(OperationState.IDLE, f.controller.snapshot().operation.state);
    }
    @Test public void bindingOverflowRejectsSynchronouslyAndCompletedBusyBindingsRelease() throws Exception {
        Fixture f = new Fixture(); f.initialize();
        for (int i = 0; i < 64; i++) f.purchase();
        assertThrows(RejectedExecutionException.class, f::purchase);
        f.actor.drain(); f.ui.drain(); assertEquals(63, f.completed);
        f.purchase(); f.settle(); assertEquals(64, f.completed);
        f.fetches.get(0).complete(null, Issue.PROVIDER); f.settle();
        assertEquals(65, f.completed); f.purchase(); f.actor.drain(); assertEquals(2, f.fetches.size());
    }
    @Test public void rightsPersistenceFailureRetainsJournalAndExplicitRetryReconciles() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.failRights = true;
        f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.actor.drain();
        f.reply(1, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertTrue(f.controller.snapshot().access.full); assertTrue(f.durable.unresolved());
        f.failRights = false; f.controller.reconcilePurchase(); f.actor.drain();
        f.reply(2, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertEquals(BillingAttempt.State.COMPLETED, f.durable.state);
    }
    @Test public void failedResolutionCasReloadsJournalBeforeExplicitReconciliation() throws Exception {
        Fixture f = new Fixture(); f.ready(); f.failJournal = true;
        f.launches.get(0).complete(BillingController.PurchaseOutcome.COMPLETED); f.actor.drain();
        f.reply(1, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new")); assertTrue(f.durable.unresolved());
        f.failJournal = false; f.controller.reconcilePurchase(); f.settle();
        assertEquals(3, f.fetches.size()); f.reply(2, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertEquals(BillingAttempt.State.COMPLETED, f.durable.state);
    }
    @Test public void equalTimeReceiptNeverResolvesAndLifetimeOwnershipBlocksFreshSubscription() throws Exception {
        BillingAttempt equal = BillingAttempt.prepare("prior", "owner", Plan.MONTHLY, "sub", "monthly",
                REMOTE - 1000, Collections.emptySet());
        Fixture f = new Fixture(equal, new Legacy(LegacyStatus.INELIGIBLE, true)); f.initialize();
        f.reply(0, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new")); assertTrue(f.durable.unresolved());
        Fixture lifetime = new Fixture(); lifetime.initialize(); lifetime.purchase(); lifetime.actor.drain();
        lifetime.reply(0, RevenueCatReceiptMapperTest.lifetimeInfo(new JSONArray().put(
                RevenueCatReceiptMapperTest.transaction("owned", REMOTE - 1000)), true));
        assertTrue(lifetime.controller.snapshot().access.full); assertTrue(lifetime.preflights.isEmpty());
    }
    @Test public void unknownJournalRetryReloadsWithoutChargingOrInventingEvidence() throws Exception {
        Fixture f = new Fixture(); f.unknownJournal = true; f.initialize();
        f.controller.reconcilePurchase(); f.settle(); assertEquals(Issue.STORAGE, f.controller.snapshot().issue);
        f.unknownJournal = false; f.controller.reconcilePurchase(); f.settle();
        assertTrue(f.fetches.isEmpty()); assertTrue(f.launches.isEmpty());
        f.purchase(); f.actor.drain(); assertEquals(1, f.fetches.size());
    }
    @Test public void restoreBeforeBootstrapDefersExactlyOneQualifiedStartupReconciliation() throws Exception {
        Fixture f = new Fixture(prepared(), new Legacy(LegacyStatus.INELIGIBLE, true));
        f.controller.restore(s -> {}); f.settle();
        assertEquals(1, f.restores.size()); assertTrue(f.fetches.isEmpty()); assertTrue(f.durable.unresolved());
        f.restores.get(0).complete(null, Issue.PROVIDER); f.settle();
        assertEquals(1, f.fetches.size()); assertTrue(f.durable.unresolved());
        f.reply(0, RevenueCatReceiptMapperTest.subscriptionInfo(true, "new"));
        assertEquals(BillingAttempt.State.COMPLETED, f.durable.state); assertTrue(f.launches.isEmpty());
        f.controller.restore(s -> {}); f.settle(); f.restores.get(1).complete(null, Issue.PROVIDER); f.settle();
        assertEquals(1, f.fetches.size());
    }
}
