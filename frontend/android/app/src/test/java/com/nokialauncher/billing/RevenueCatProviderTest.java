package com.nokialauncher.billing;

import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import com.revenuecat.purchases.VerificationResult;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** SDK transport injection; no actual network, SDK initialization or Play payment. */
public class RevenueCatProviderTest {
    private static class Time implements BillingController.Time {
        String boot = "boot"; long elapsed = 100;
        public String bootToken() { return boot; }
        public long elapsedRealtimeMs() { return elapsed; }
    }
    @Test public void restoreUsesExplicitTransportAndRequiresRemoteVerification() throws Exception {
        Time time = new Time(); AtomicReference<ReceiveCustomerInfoCallback> restore = new AtomicReference<>();
        AtomicReference<ReceiveCustomerInfoCallback> fresh = new AtomicReference<>();
        AtomicInteger fetches = new AtomicInteger();
        RevenueCatProvider provider = new RevenueCatProvider(callback -> { fetches.incrementAndGet(); fresh.set(callback); }, restore::set,
                RevenueCatNormalizerTest.CONFIG, "owner", time);
        assertNull(restore.get());
        AtomicReference<Issue> issue = new AtomicReference<>();
        provider.restoreCurrent((record, failure) -> { assertNull(record); issue.set(failure); });
        restore.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        assertNull(issue.get()); assertEquals(1, fetches.get());
        fresh.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED_ON_DEVICE));
        assertEquals(Issue.VERIFICATION, issue.get());
        AtomicReference<BillingController.Record> verified = new AtomicReference<>();
        provider.restoreCurrent((record, failure) -> { verified.set(record); assertEquals(Issue.NONE, failure); });
        restore.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        assertNull(verified.get());
        fresh.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        assertNotNull(verified.get()); assertEquals(Verification.REMOTE, verified.get().store.verification);
    }
    @Test public void cachedRestoreNeverReanchorsRightsWhenFollowingCurrentFetchFails() throws Exception {
        AtomicReference<ReceiveCustomerInfoCallback> restore = new AtomicReference<>(), fresh = new AtomicReference<>();
        AtomicInteger calls = new AtomicInteger(), results = new AtomicInteger();
        RevenueCatProvider provider = new RevenueCatProvider(callback -> { calls.incrementAndGet(); fresh.set(callback); },
                restore::set, RevenueCatNormalizerTest.CONFIG, "owner", new Time());
        provider.restoreCurrent((record, issue) -> { results.incrementAndGet(); assertNull(record); assertEquals(Issue.OFFLINE, issue); });
        ReceiveCustomerInfoCallback cached = restore.get();
        cached.onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        cached.onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        assertEquals(1, calls.get()); assertEquals(0, results.get());
        fresh.get().onError(new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"));
        assertEquals(1, results.get());
    }
    @Test public void capturesRequestStartAndDeliversOnlyOnce() throws Exception {
        Time time = new Time(); AtomicReference<ReceiveCustomerInfoCallback> sdk = new AtomicReference<>();
        RevenueCatProvider provider = new RevenueCatProvider(sdk::set, RevenueCatNormalizerTest.CONFIG, "owner", time);
        AtomicInteger count = new AtomicInteger(); AtomicReference<BillingController.Record> record = new AtomicReference<>();
        provider.fetchCurrent((value, issue) -> { count.incrementAndGet(); record.set(value); assertEquals(Issue.NONE, issue); });
        time.elapsed = 1000;
        sdk.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        sdk.get().onError(new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"));
        assertEquals(1, count.get()); assertEquals(100, record.get().clock.elapsedRealtimeMs);
    }
    @Test public void unverifiedIsFailureWithNoManufacturedRevoke() throws Exception {
        Time time = new Time(); AtomicReference<ReceiveCustomerInfoCallback> sdk = new AtomicReference<>();
        RevenueCatProvider provider = new RevenueCatProvider(sdk::set, RevenueCatNormalizerTest.CONFIG, "owner", time);
        AtomicReference<Issue> result = new AtomicReference<>();
        provider.fetchCurrent((value, issue) -> { assertNull(value); result.set(issue); });
        sdk.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED_ON_DEVICE));
        assertEquals(Issue.VERIFICATION, result.get());
    }
    @Test public void omittedKnownSubscriptionPreservesTrustedControllerCacheUntilValidEmptyRevoke() throws Exception {
        Time time = new Time(); AtomicReference<ReceiveCustomerInfoCallback> sdk = new AtomicReference<>();
        RevenueCatProvider provider = new RevenueCatProvider(sdk::set, RevenueCatNormalizerTest.CONFIG, "owner", time);
        BillingSnapshot.Store grant = new BillingSnapshot.Store(Verification.REMOTE, RevenueCatNormalizerTest.REMOTE,
                false, true, RevenueCatNormalizerTest.REMOTE + 10000, RenewState.ON, Plan.MONTHLY, false, null);
        BillingPolicy.StoreRecord cached = new BillingPolicy.StoreRecord(grant, "owner", 1,
                new BillingPolicy.ClockAnchor(RevenueCatNormalizerTest.REMOTE, 100, "boot",
                        BillingPolicy.TimeProvenance.SIGNED_REMOTE_REQUEST_TIME), true);
        AtomicInteger writes = new AtomicInteger();
        BillingController.Storage storage = new BillingController.Storage() {
            public BillingPolicy.StoreRecord load() { return cached; }
            public boolean save(BillingPolicy.StoreRecord record) { writes.incrementAndGet(); return true; }
        };
        BillingController controller = new BillingController("owner", "process", provider, storage, time,
                Runnable::run, Runnable::run, Runnable::run, new Legacy(LegacyStatus.INELIGIBLE, true), null);
        controller.initialize(); assertTrue(controller.snapshot().access.full);
        controller.refresh(snapshot -> {});
        sdk.get().onReceived(RevenueCatNormalizerTest.omittedKnownSubscription("sub:monthly", false));
        assertEquals(Issue.VERIFICATION, controller.snapshot().issue);
        assertTrue(controller.snapshot().access.full); assertEquals(0, writes.get());
        controller.refresh(snapshot -> {});
        sdk.get().onReceived(RevenueCatNormalizerTest.empty(VerificationResult.VERIFIED));
        assertEquals(Issue.NONE, controller.snapshot().issue);
        assertFalse(controller.snapshot().access.full); assertEquals(1, writes.get());
    }
    @Test public void networkAndInitiationFailuresRemainExplicit() {
        Time time = new Time();
        RevenueCatProvider offline = new RevenueCatProvider(callback -> callback.onError(
                new PurchasesError(PurchasesErrorCode.NetworkError, "fixture")), RevenueCatNormalizerTest.CONFIG, "owner", time);
        offline.fetchCurrent((record, issue) -> { assertNull(record); assertEquals(Issue.OFFLINE, issue); });
        RevenueCatProvider failed = new RevenueCatProvider(callback -> { throw new IllegalStateException("fixture"); },
                RevenueCatNormalizerTest.CONFIG, "owner", time);
        failed.fetchCurrent((record, issue) -> { assertNull(record); assertEquals(Issue.PROVIDER, issue); });
    }
    @Test public void completionRejectionIsNotSilentlyReclassified() {
        RevenueCatProvider provider = new RevenueCatProvider(callback -> callback.onError(
                new PurchasesError(PurchasesErrorCode.NetworkError, "fixture")), RevenueCatNormalizerTest.CONFIG, "owner", new Time());
        assertThrows(java.util.concurrent.RejectedExecutionException.class, () -> provider.fetchCurrent((record, issue) -> {
            throw new java.util.concurrent.RejectedExecutionException("delivery shutdown");
        }));
    }
}
