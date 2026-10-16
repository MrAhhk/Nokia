package com.nokialauncher.billing;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.EntitlementInfo;
import com.revenuecat.purchases.EntitlementInfos;
import com.revenuecat.purchases.OwnershipType;
import com.revenuecat.purchases.PeriodType;
import com.revenuecat.purchases.VerificationResult;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingPolicy.*;

/** Synthetic fixtures through actual public 10.24.0 CustomerInfo/EntitlementInfo getters.
 * They prove mapping, not RevenueCat/Play sandbox propagation, verification or charging.
 */
public class RevenueCatNormalizerTest {
    static final BillingProviderConfig CONFIG = new BillingProviderConfig("goog_public", "sub", "monthly",
            "yearly", "lifetime", "main");
    static final long REMOTE = 1700000000000L;
    private final RevenueCatNormalizer normalizer = new RevenueCatNormalizer(CONFIG);

    static String iso(long time) { return java.time.Instant.ofEpochMilli(time).toString(); }
    static JSONObject subscription() throws Exception {
        return new JSONObject().put("purchase_date", iso(REMOTE - 1000))
                .put("original_purchase_date", iso(REMOTE - 1000)).put("expires_date", iso(REMOTE + 10000))
                .put("store", "play_store").put("is_sandbox", true).put("period_type", "normal")
                .put("product_plan_identifier", "monthly");
    }
    static EntitlementInfo entitlement(String id, String product, String plan, Date expiry,
            boolean sdkActive, boolean renew, Date unsub, Date issue,
            com.revenuecat.purchases.Store store, VerificationResult verification) {
        return new EntitlementInfo(id, sdkActive, renew, PeriodType.NORMAL, new Date(REMOTE - 1000),
                new Date(REMOTE - 1000), expiry, store, product, plan, true, unsub, issue,
                OwnershipType.PURCHASED, new JSONObject(), verification);
    }
    static EntitlementInfo sub(boolean sdkActive, long expiry, boolean renew, Date unsub, Date issue) {
        return entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "sub", "monthly", new Date(expiry),
                sdkActive, renew, unsub, issue, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED);
    }
    static CustomerInfo info(Map<String, EntitlementInfo> entitlements, VerificationResult verification,
            JSONObject subscriptions, JSONObject nonSubscriptions, long requestTime, long bodyTime) throws Exception {
        JSONObject body = new JSONObject().put("request_date", iso(bodyTime)).put("subscriber",
                new JSONObject().put("subscriptions", subscriptions).put("non_subscriptions", nonSubscriptions));
        return new CustomerInfo(new EntitlementInfos(entitlements, verification), Collections.emptyMap(),
                Collections.emptyMap(), new Date(requestTime), 3, new Date(REMOTE - 100000),
                "anonymous-fixture", null, null, body);
    }
    static CustomerInfo empty(VerificationResult result) throws Exception {
        return info(Collections.emptyMap(), result, new JSONObject(), new JSONObject(), REMOTE, REMOTE);
    }
    /** Public post-parser shape proven by CustomerInfoFactory.parseSubscriptionInfos source:
     * failed subscription parsing can omit a record while the separately parsed dates retain it.
     * No private factory call or malformed parser execution/Android Log mock is needed here.
     */
    static CustomerInfo omittedKnownSubscription(String key, boolean purchaseMap) throws Exception {
        JSONObject body = new JSONObject().put("subscriber", new JSONObject()
                .put("subscriptions", new JSONObject()).put("non_subscriptions", new JSONObject()));
        Map<String, Date> known = Collections.singletonMap(key, new Date(purchaseMap ? REMOTE - 1000 : REMOTE + 10000));
        return new CustomerInfo(new EntitlementInfos(Collections.emptyMap(), VerificationResult.VERIFIED),
                purchaseMap ? Collections.emptyMap() : known, purchaseMap ? known : Collections.emptyMap(),
                new Date(REMOTE), 3, new Date(REMOTE - 100000), "anonymous-fixture", null, null, body);
    }
    private BillingController.Record normalize(CustomerInfo info) {
        return normalizer.normalizeCurrent(info, "owner", "boot", 100, "boot", 100);
    }
    private CustomerInfo withSub(EntitlementInfo sub, JSONObject details) throws Exception {
        return info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, sub),
                VerificationResult.VERIFIED, new JSONObject().put("sub", details), new JSONObject(), REMOTE, REMOTE);
    }
    private void rejected(CustomerInfo info) {
        assertThrows(IllegalArgumentException.class, () -> normalize(info));
    }
    @Test public void verifiedEmptyIsAuthoritativeRevokeWithSignedClock() throws Exception {
        BillingController.Record record = normalize(empty(VerificationResult.VERIFIED));
        assertEquals(Verification.REMOTE, record.store.verification);
        assertFalse(record.store.lifetimeActive); assertFalse(record.store.subscriptionActive);
        assertEquals(TimeProvenance.SIGNED_REMOTE_REQUEST_TIME, record.clock.provenance);
        assertEquals("owner", record.ownerEpoch);
    }
    @Test public void deviceAndFailedAndNotRequestedCannotGrantOrRevoke() throws Exception {
        rejected(empty(VerificationResult.VERIFIED_ON_DEVICE));
        rejected(empty(VerificationResult.FAILED)); rejected(empty(VerificationResult.NOT_REQUESTED));
    }
    @Test public void sdkActiveFlagDoesNotDecideSubscriptionAccess() throws Exception {
        assertTrue(normalize(withSub(sub(false, REMOTE + 10000, true, null, null), subscription())).store.subscriptionActive);
        assertFalse(normalize(withSub(sub(true, REMOTE - 1, true, null, null), subscription())).store.subscriptionActive);
    }
    @Test public void signed304HeaderReanchorsInsteadOfOldBodyDate() throws Exception {
        CustomerInfo info = info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT,
                sub(true, REMOTE - 1, true, null, null)), VerificationResult.VERIFIED,
                new JSONObject().put("sub", subscription()), new JSONObject(), REMOTE, REMOTE - 100000);
        BillingController.Record result = normalize(info);
        assertEquals(REMOTE, result.clock.remoteTimeMs); assertFalse(result.store.subscriptionActive);
    }
    @Test public void networkDelayConsumesExpiryFromRequestStart() throws Exception {
        CustomerInfo info = withSub(sub(true, REMOTE + 500, true, null, null), subscription());
        BillingController.Record result = normalizer.normalizeCurrent(info, "owner", "boot", 100, "boot", 1000);
        assertEquals(100, result.clock.elapsedRealtimeMs); assertFalse(result.store.subscriptionActive);
    }
    @Test public void changedBootOrReversedElapsedRejectsClock() throws Exception {
        CustomerInfo info = empty(VerificationResult.VERIFIED);
        assertThrows(IllegalArgumentException.class, () -> normalizer.normalizeCurrent(info, "owner", "old", 100, "new", 101));
        assertThrows(IllegalArgumentException.class, () -> normalizer.normalizeCurrent(info, "owner", "boot", 100, "boot", 99));
    }
    @Test public void unknownBootStillAllowsFreshInProcessEvidenceWithoutPersistentTrustedTime() throws Exception {
        BillingController.Record result = normalizer.normalizeCurrent(empty(VerificationResult.VERIFIED),
                "owner", null, 100, null, 500);
        assertEquals(Verification.REMOTE, result.store.verification);
        assertNull(result.clock.bootToken); assertNull(trustedNow(result.clock, null, 500));
    }
    @Test public void graceUsesEntitlementExpiryAndLeavesRenewalUnknown() throws Exception {
        Date issue = new Date(REMOTE - 500);
        JSONObject details = subscription().put("expires_date", iso(REMOTE - 100))
                .put("grace_period_expires_date", iso(REMOTE + 5000)).put("billing_issues_detected_at", iso(issue.getTime()));
        Store store = normalize(withSub(sub(false, REMOTE + 5000, false, null, issue), details)).store;
        assertTrue(store.subscriptionActive); assertTrue(store.billingProblem);
        assertEquals(Long.valueOf(REMOTE + 5000), store.expiresAtMs); assertEquals(RenewState.UNKNOWN, store.renewState);
    }
    @Test public void canceledUnexpiredConsistentEvidenceDescribesRenewalOff() throws Exception {
        Date unsub = new Date(REMOTE - 500);
        Store store = normalize(withSub(sub(true, REMOTE + 10000, false, unsub, null),
                subscription().put("unsubscribe_detected_at", iso(unsub.getTime())))).store;
        assertTrue(store.subscriptionActive); assertEquals(RenewState.OFF, store.renewState);
    }
    @Test public void contradictoryCancellationRemainsUnknown() throws Exception {
        Store store = normalize(withSub(sub(true, REMOTE + 10000, false, new Date(REMOTE - 500), null), subscription())).store;
        assertEquals(RenewState.UNKNOWN, store.renewState);
    }
    @Test public void laterConfiguredHistoryCannotConfirmRenewalOffForAnExpiredEntitlement() throws Exception {
        long expired = REMOTE - 500;
        Date unsub = new Date(REMOTE - 750);
        JSONObject details = subscription().put("expires_date", iso(expired))
                .put("unsubscribe_detected_at", iso(unsub.getTime()));
        JSONObject body = new JSONObject().put("subscriber", new JSONObject()
                .put("subscriptions", new JSONObject().put("sub", details))
                .put("non_subscriptions", new JSONObject()));
        CustomerInfo value = new CustomerInfo(new EntitlementInfos(Collections.singletonMap(
                RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, sub(false, expired, false, unsub, null)),
                VerificationResult.VERIFIED), Collections.singletonMap("sub:yearly", new Date(REMOTE + 50000)),
                Collections.emptyMap(), new Date(REMOTE), 3, new Date(REMOTE - 100000),
                "anonymous-fixture", null, null, body);
        Store store = normalize(value).store;
        assertFalse(store.subscriptionActive); assertEquals(RenewState.UNKNOWN, store.renewState);
    }
    @Test public void pausedAndRefundedDoNotGrantOrInferTerminalHistory() throws Exception {
        EntitlementInfo sub = sub(true, REMOTE + 10000, true, null, null);
        Store paused = normalize(withSub(sub, subscription().put("auto_resume_date", iso(REMOTE + 50000)))).store;
        assertFalse(paused.subscriptionActive); assertEquals(RenewState.UNKNOWN, paused.renewState);
        Store refund = normalize(withSub(sub, subscription().put("refunded_at", iso(REMOTE - 500)))).store;
        assertFalse(refund.subscriptionActive); assertEquals(RenewState.UNKNOWN, refund.renewState);
    }
    @Test public void missingConfiguredDetailsIsMalformedNotRevoke() throws Exception {
        rejected(info(Collections.singletonMap(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT,
                sub(true, REMOTE + 10000, true, null, null)), VerificationResult.VERIFIED,
                new JSONObject(), new JSONObject(), REMOTE, REMOTE));
    }
    @Test public void omittedKnownSubscriptionInEitherPublicDateMapCannotRevoke() throws Exception {
        for (String key : new String[] { "sub", "sub:monthly", "sub:yearly" }) {
            rejected(omittedKnownSubscription(key, true));
            rejected(omittedKnownSubscription(key, false));
        }
        rejected(omittedKnownSubscription("sub:unconfigured", false));
    }
    @Test public void wrongProductPlanStoreAndVerificationRejected() throws Exception {
        for (EntitlementInfo value : new EntitlementInfo[] {
            entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "wrong", "monthly", new Date(REMOTE + 100),
                    true, true, null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED),
            entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "sub", "unknown", new Date(REMOTE + 100),
                    true, true, null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED),
            entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "sub", "monthly", new Date(REMOTE + 100),
                    true, true, null, null, com.revenuecat.purchases.Store.PROMOTIONAL, VerificationResult.VERIFIED),
            entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "sub", "monthly", new Date(REMOTE + 100),
                    true, true, null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED_ON_DEVICE)
        }) rejected(withSub(value, subscription()));
    }
    @Test public void nullExpirySubscriptionRejected() throws Exception {
        rejected(withSub(entitlement(RevenueCatNormalizer.SUBSCRIPTION_ENTITLEMENT, "sub", "monthly", null,
                true, true, null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED), subscription()));
    }
    @Test public void oversizeEntitlementMapRejectedBeforeTraversal() throws Exception {
        Map<String, EntitlementInfo> map = new HashMap<>();
        EntitlementInfo value = sub(true, REMOTE + 10000, true, null, null);
        for (int i = 0; i < 257; i++) map.put("other" + i, value);
        rejected(info(map, VerificationResult.VERIFIED, new JSONObject(), new JSONObject(), REMOTE, REMOTE));
    }
    private EntitlementInfo lifetime(Date expiry) {
        return entitlement(RevenueCatNormalizer.LIFETIME_ENTITLEMENT, "lifetime", null, expiry, false, true,
                null, null, com.revenuecat.purchases.Store.PLAY_STORE, VerificationResult.VERIFIED);
    }
    private JSONObject transactions(String store, long date) throws Exception {
        return new JSONObject().put("lifetime", new JSONArray().put(new JSONObject().put("id", "txn-fixture")
                .put("purchase_date", iso(date)).put("store", store)));
    }
    @Test public void lifetimeRequiresMatchingPlayNonSubscriptionTransaction() throws Exception {
        Map<String, EntitlementInfo> map = Collections.singletonMap(RevenueCatNormalizer.LIFETIME_ENTITLEMENT, lifetime(null));
        CustomerInfo valid = info(map, VerificationResult.VERIFIED, new JSONObject(), transactions("play_store", REMOTE - 1000), REMOTE, REMOTE);
        assertTrue(normalize(valid).store.lifetimeActive);
        rejected(info(map, VerificationResult.VERIFIED, new JSONObject(), new JSONObject(), REMOTE, REMOTE));
        rejected(info(map, VerificationResult.VERIFIED, new JSONObject(), transactions("app_store", REMOTE - 1000), REMOTE, REMOTE));
        rejected(info(map, VerificationResult.VERIFIED, new JSONObject(), transactions("play_store", REMOTE - 2000), REMOTE, REMOTE));
    }
    @Test public void transactionAloneDoesNotGrantLifetimeAndFiniteLifetimeIsMalformed() throws Exception {
        assertFalse(normalize(info(Collections.emptyMap(), VerificationResult.VERIFIED, new JSONObject(),
                transactions("play_store", REMOTE - 1000), REMOTE, REMOTE)).store.lifetimeActive);
        rejected(info(Collections.singletonMap(RevenueCatNormalizer.LIFETIME_ENTITLEMENT, lifetime(new Date(REMOTE + 1))),
                VerificationResult.VERIFIED, new JSONObject(), transactions("play_store", REMOTE - 1000), REMOTE, REMOTE));
    }
    @Test public void validExpiredLifetimeRecordRevokesWithoutInventingRefundState() throws Exception {
        Store store = normalize(info(Collections.singletonMap(RevenueCatNormalizer.LIFETIME_ENTITLEMENT,
                lifetime(new Date(REMOTE - 1))), VerificationResult.VERIFIED, new JSONObject(),
                new JSONObject(), REMOTE, REMOTE)).store;
        assertFalse(store.lifetimeActive); assertEquals(Verification.REMOTE, store.verification);
    }
}
