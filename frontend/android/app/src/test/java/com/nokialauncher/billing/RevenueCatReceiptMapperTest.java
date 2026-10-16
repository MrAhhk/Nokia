package com.nokialauncher.billing;

import com.revenuecat.purchases.*;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import java.util.*;
import org.json.*;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.RevenueCatNormalizerTest.*;

public class RevenueCatReceiptMapperTest {
    static final class Fixture {
        ReceiveCustomerInfoCallback pending;
        int completions;
        Issue issue;
        RevenueCatReceiptMapper.Result result;
        final RevenueCatReceiptMapper subject = new RevenueCatReceiptMapper(callback -> pending = callback,
                CONFIG, "owner", new BillingController.Time() {
                    public String bootToken() { return "boot"; }
                    public long elapsedRealtimeMs() { return 100; }
                });
        void start() { subject.fetchCurrent((value, error) -> { completions++; result = value; issue = error; }); }
        void receive(CustomerInfo info) { pending.onReceived(info); }
    }
    static CustomerInfo subscriptionInfo(boolean active, String id) throws Exception {
        long expires = active ? REMOTE + 10000 : REMOTE - 500;
        JSONObject row = subscription().put("expires_date", iso(expires));
        if (id != null) row.put("store_transaction_id", id);
        return info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT,
                sub(active, expires, true, null, null)), VerificationResult.VERIFIED,
                new JSONObject().put("sub", row), new JSONObject(), REMOTE, REMOTE);
    }
    static JSONObject transaction(String id, long date) throws Exception {
        return new JSONObject().put("id", id).put("purchase_date", iso(date)).put("store", "play_store");
    }
    static CustomerInfo lifetimeInfo(JSONArray rows, boolean granted) throws Exception {
        Map<String, EntitlementInfo> rights = granted ? Collections.singletonMap(RevenueCatNormalizer.LIFETIME_ENTITLEMENT,
                entitlement(RevenueCatNormalizer.LIFETIME_ENTITLEMENT, "lifetime", null, null,
                        true, false, null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED))
                : Collections.emptyMap();
        return info(rights, VerificationResult.VERIFIED, new JSONObject(), new JSONObject().put("lifetime", rows), REMOTE, REMOTE);
    }
    @Test public void emptyVerifiedInventoryHasNoReceiptAndCannotResolveAttempt() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(empty(VerificationResult.VERIFIED));
        assertEquals(Issue.NONE, f.issue); assertTrue(f.result.baselineIds.isEmpty()); assertTrue(f.result.receipts.isEmpty());
        BillingAttempt a = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null, REMOTE, Collections.emptySet());
        assertTrue(a.reconcile(null).unresolved());
    }
    @Test public void activeSubscriptionUsesExactStoreNamespaceAndDatedReceipt() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(subscriptionInfo(true, "GPA.fixture"));
        assertEquals(Issue.NONE, f.issue); assertEquals(Collections.singleton("rc10:play-sub:GPA.fixture"), f.result.baselineIds);
        assertEquals(1, f.result.receipts.size()); assertEquals(REMOTE - 1000, f.result.receipts.get(0).purchaseDateMs);
        assertEquals(Plan.MONTHLY, f.result.receipts.get(0).receipt.plan);
        assertEquals("monthly", f.result.receipts.get(0).receipt.basePlanId);
    }
    @Test public void inactiveSubscriptionContributesBaselineButNoCompletion() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(subscriptionInfo(false, "old"));
        assertEquals(Issue.NONE, f.issue); assertEquals(1, f.result.baselineIds.size()); assertTrue(f.result.receipts.isEmpty());
    }
    @Test public void expiredSubscriptionRepurchaseResolvesWithNewVerifiedOrderButNotOldHistory() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(subscriptionInfo(false, "old-order"));
        assertEquals(Issue.NONE, f.issue);
        BillingAttempt prepared = BillingAttempt.prepare("repurchase", "owner", Plan.MONTHLY,
                "sub", "monthly", REMOTE, f.result.baselineIds);
        long purchased = REMOTE + 1000, response = REMOTE + 2000, expiry = REMOTE + 10000;
        JSONObject row = subscription().put("store_transaction_id", "new-order")
                .put("purchase_date", iso(purchased)).put("original_purchase_date", iso(purchased));
        EntitlementInfo entitlement = new EntitlementInfo(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT,
                true, true, PeriodType.NORMAL, new Date(purchased), new Date(purchased), new Date(expiry),
                com.revenuecat.purchases.Store.PLAY_STORE, "sub", "monthly", true, null, null,
                OwnershipType.PURCHASED, new JSONObject(), VerificationResult.VERIFIED);
        f.start(); f.receive(info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, entitlement),
                VerificationResult.VERIFIED, new JSONObject().put("sub", row), new JSONObject(), response, response));
        assertEquals(Issue.NONE, f.issue);
        BillingAttempt completed = f.result.reconcileAttempt(prepared);
        assertEquals(BillingAttempt.State.COMPLETED, completed.state);
        assertEquals("rc10:play-sub:new-order", completed.resolvedTransactionId);
        // Reusing an old order cannot resolve the attempt even with a later signed response.
        row.put("store_transaction_id", "old-order");
        f.start(); f.receive(info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, entitlement),
                VerificationResult.VERIFIED, new JSONObject().put("sub", row), new JSONObject(), response, response));
        assertEquals(Issue.NONE, f.issue);
        assertSame(prepared, f.result.reconcileAttempt(prepared));
    }
    @Test public void missingSubscriptionIdentityRejectsInsteadOfOmittingHistory() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(subscriptionInfo(false, null));
        assertNull(f.result); assertEquals(Issue.VERIFICATION, f.issue);
    }
    @Test public void lifetimeUsesServerTransactionIdAndAllExposedHistory() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(lifetimeInfo(new JSONArray()
                .put(transaction("old", REMOTE - 10000)).put(transaction("new", REMOTE - 1000)), true));
        assertEquals(Issue.NONE, f.issue); assertEquals(2, f.result.baselineIds.size());
        assertEquals(1, f.result.receipts.size()); assertEquals("rc10:non-sub:new", f.result.receipts.get(0).receipt.transactionId);
        BillingAttempt old = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null,
                REMOTE - 2000, f.result.baselineIds);
        assertTrue(old.reconcile(f.result.receipts.get(0).receipt).unresolved());
        assertThrows(UnsupportedOperationException.class, () -> f.result.baselineIds.clear());
        assertThrows(UnsupportedOperationException.class, () -> f.result.receipts.clear());
    }
    @Test public void duplicateOrOversizedIdsFailClosed() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(lifetimeInfo(new JSONArray()
                .put(transaction("same", REMOTE - 1000)).put(transaction("same", REMOTE - 1000)), true));
        assertNull(f.result); assertEquals(Issue.VERIFICATION, f.issue);
        f.start(); f.receive(lifetimeInfo(new JSONArray().put(transaction(String.join("", Collections.nCopies(128, "x")), REMOTE - 1000)), true));
        assertNull(f.result); assertEquals(Issue.VERIFICATION, f.issue);
    }
    @Test public void failureAndDuplicateCallbacksCannotMintOrReplaceEvidence() throws Exception {
        Fixture f = new Fixture(); f.start(); f.pending.onError(new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"));
        f.receive(empty(VerificationResult.VERIFIED)); assertEquals(1, f.completions); assertNull(f.result);
        f.start(); f.receive(empty(VerificationResult.VERIFIED)); f.pending.onError(null);
        assertEquals(2, f.completions); assertEquals(Issue.NONE, f.issue);
    }
    @Test public void unverifiedPayloadNeverProducesReceiptEvidence() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(empty(VerificationResult.NOT_REQUESTED));
        assertNull(f.result); assertEquals(Issue.VERIFICATION, f.issue);
    }
    @Test public void signedPreparationFactoryRetainsOwnerBaselineAndServerTime() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(empty(VerificationResult.VERIFIED));
        RevenueCatCatalog catalog = RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                RevenueCatCatalogTest.subscription(Plan.MONTHLY),
                RevenueCatCatalogTest.lifetime(RevenueCatCatalogTest.PRICE)), RevenueCatCatalogTest.CONFIG);
        RevenueCatCatalog.Selection selection = catalog.resolve(Plan.MONTHLY,
                catalog.items.get(Plan.MONTHLY.ordinal()).catalogRevision);
        BillingAttempt prepared = f.result.prepareAttempt("op", selection);
        assertEquals(REMOTE, prepared.startedAtMs); assertEquals("owner", prepared.ownerEpoch);
        assertEquals(f.result.baselineIds, prepared.baselineIds);
        assertThrows(IllegalArgumentException.class, () -> f.result.prepareAttempt("op",
                catalog.resolve(Plan.LIFETIME, catalog.items.get(Plan.LIFETIME.ordinal()).catalogRevision)));
    }
    @Test public void oldReceiptOmittedFromBaselineStillCannotCompleteNewAttempt() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(lifetimeInfo(new JSONArray().put(transaction("old", REMOTE - 1000)), true));
        BillingAttempt prepared = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null,
                REMOTE - 500, Collections.emptySet());
        assertSame(prepared, f.result.reconcileAttempt(prepared));
        BillingAttempt equalDate = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null,
                REMOTE - 1000, Collections.emptySet());
        assertSame(equalDate, f.result.reconcileAttempt(equalDate));
    }
    @Test public void uniqueNewDatedReceiptCompletesOnlyMatchingOwnerAndPlan() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(lifetimeInfo(new JSONArray().put(transaction("new", REMOTE - 1000)), true));
        BillingAttempt prepared = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null,
                REMOTE - 2000, Collections.emptySet());
        BillingAttempt completed = f.result.reconcileAttempt(prepared);
        assertEquals(BillingAttempt.State.COMPLETED, completed.state);
        assertSame(completed, f.result.reconcileAttempt(completed));
        BillingAttempt other = BillingAttempt.prepare("op", "other", Plan.LIFETIME, "lifetime", null,
                REMOTE - 2000, Collections.emptySet());
        assertSame(other, f.result.reconcileAttempt(other));
        BillingAttempt subscription = BillingAttempt.prepare("op", "owner", Plan.MONTHLY, "sub", "monthly",
                REMOTE - 2000, Collections.emptySet());
        assertSame(subscription, f.result.reconcileAttempt(subscription));
    }
    @Test public void multipleNewMatchingReceiptsRemainUnresolved() throws Exception {
        Fixture f = new Fixture(); f.start(); f.receive(lifetimeInfo(new JSONArray()
                .put(transaction("one", REMOTE - 1000)).put(transaction("two", REMOTE - 1000)), true));
        BillingAttempt prepared = BillingAttempt.prepare("op", "owner", Plan.LIFETIME, "lifetime", null,
                REMOTE - 2000, Collections.emptySet());
        assertSame(prepared, f.result.reconcileAttempt(prepared));
    }
}
