package com.nokialauncher.billing;

import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingPolicy.*;

/** Synthetic normalized evidence only: no receipt, provider, Android or real purchase assertions. */
public class BillingPolicyTest {
    @Test public void productRejectionAllowsNewIntentOnlyWithAllExistingGates() {
        StoreRecord empty = record(100, false, false, null);
        for (Issue issue : Issue.values()) {
            BillingSnapshot result = snapshot("process-1", 1, GENERATION,
                    new Legacy(LegacyStatus.INELIGIBLE, true), empty, "boot-1", 10,
                    Operation.idle(), null, false, true, true, issue, CATALOG);
            assertEquals(issue == Issue.NONE || issue == Issue.PRODUCT_UNAVAILABLE,
                    result.capabilities.checkout);
            assertFalse(result.access.full);
        }
        assertFalse(snapshot("process-1", 1, GENERATION,
                new Legacy(LegacyStatus.INELIGIBLE, true), empty, "boot-1", 10,
                Operation.idle(), null, false, false, true,
                Issue.PRODUCT_UNAVAILABLE, CATALOG).capabilities.checkout);
        assertFalse(snapshot("process-1", 1, GENERATION,
                new Legacy(LegacyStatus.INELIGIBLE, true), empty, "boot-1", 10,
                Operation.idle(), new UnresolvedPurchase("attempt", Plan.MONTHLY, PurchaseStage.UNCERTAIN),
                false, true, true, Issue.PRODUCT_UNAVAILABLE, CATALOG).capabilities.checkout);
    }
    private static final String GENERATION = "customer-config-1";
    private static final List<CatalogItem> CATALOG = Collections.singletonList(
            new CatalogItem(Plan.LIFETIME, "Lifetime", "$5.55", "one time", true, "catalog-1"));
    private StoreRecord record(long date, boolean lifetime, boolean subscription, Long expiry) {
        return new StoreRecord(new Store(Verification.REMOTE, date, lifetime, subscription, expiry,
                RenewState.UNKNOWN, subscription ? Plan.MONTHLY : null, false, null), GENERATION, date,
                new ClockAnchor(date, 10, "boot-1", TimeProvenance.SIGNED_REMOTE_BODY_TIME), true);
    }
    private BillingSnapshot view(LegacyStatus legacy, StoreRecord record, String boot, long elapsed,
            Operation operation, UnresolvedPurchase unresolved, boolean interactive, Issue issue) {
        return snapshot("process-1", 1, GENERATION, new Legacy(legacy, true), record, boot, elapsed,
                operation, unresolved, interactive, false, true, issue, CATALOG);
    }
    private BillingSnapshot view(LegacyStatus legacy, StoreRecord record, long elapsed) {
        return view(legacy, record, "boot-1", elapsed, Operation.idle(), null, false, Issue.NONE);
    }
    @Test public void freshInstallAndUnknownLegacyNeverManufactureGrant() {
        assertFalse(view(LegacyStatus.INELIGIBLE, null, 10).access.full);
        assertFalse(view(LegacyStatus.NEEDS_RECOVERY, null, 10).access.full);
        assertFalse(view(LegacyStatus.NEEDS_RECOVERY, record(100, false, false, null), 10).capabilities.checkout);
    }
    @Test public void unionKeepsEverySourceAndRefundRemovesOnlyItsSource() {
        assertEquals(Arrays.asList(Source.LEGACY_DEVICE, Source.STORE_LIFETIME, Source.SUBSCRIPTION),
                view(LegacyStatus.ELIGIBLE, record(100, true, true, 200L), 10).access.sources);
        assertEquals(Collections.singletonList(Source.SUBSCRIPTION),
                view(LegacyStatus.INELIGIBLE, record(101, false, true, 200L), 10).access.sources);
        assertEquals(Collections.singletonList(Source.LEGACY_DEVICE),
                view(LegacyStatus.ELIGIBLE, record(100, false, false, 90L), 10).access.sources);
    }
    @Test public void exactExpiryAndInactiveHoldCannotGrant() {
        assertTrue(view(LegacyStatus.INELIGIBLE, record(100, false, true, 200L), 109).access.full);
        assertFalse(view(LegacyStatus.INELIGIBLE, record(100, false, true, 200L), 110).access.full);
        assertFalse(view(LegacyStatus.INELIGIBLE, record(100, false, false, 200L), 10).access.full);
        assertFalse(view(LegacyStatus.INELIGIBLE, record(100, false, true, null), 10).access.full);
    }
    @Test public void rebootOrUnavailableBootProofRequiresOnlineForSubscriptionOnly() {
        StoreRecord subscription = record(100, false, true, 200L);
        assertFalse(view(LegacyStatus.INELIGIBLE, subscription, "boot-2", 10, Operation.idle(), null, false, Issue.OFFLINE).access.full);
        assertFalse(view(LegacyStatus.INELIGIBLE, subscription, null, 10, Operation.idle(), null, false, Issue.OFFLINE).access.full);
        assertTrue(view(LegacyStatus.INELIGIBLE, record(100, true, true, 200L), "boot-2", 10, Operation.idle(), null, false, Issue.OFFLINE).access.full);
        assertTrue(view(LegacyStatus.ELIGIBLE, subscription, "boot-2", 10, Operation.idle(), null, false, Issue.OFFLINE).access.full);
    }
    @Test public void elapsedRollbackOverflowAndMissingAnchorAreUntrusted() {
        assertNull(trustedNow(new ClockAnchor(100, 10, "boot", TimeProvenance.SIGNED_REMOTE_BODY_TIME), "boot", 9));
        assertNull(trustedNow(new ClockAnchor(Long.MAX_VALUE, 10, "boot", TimeProvenance.SIGNED_REMOTE_BODY_TIME), "boot", 11));
        assertNull(trustedNow(new ClockAnchor(100, 10, null, TimeProvenance.SIGNED_REMOTE_BODY_TIME), null, 11));
        assertNull(trustedNow(null, "boot", 10));
        // wall clock is deliberately not an input; only same-boot elapsed delta advances time.
        assertEquals(Long.valueOf(105), trustedNow(new ClockAnchor(100, 10, "boot", TimeProvenance.SIGNED_REMOTE_BODY_TIME), "boot", 15));
    }
    @Test public void corruptedCacheAndDeviceOrUnverifiedDataCannotGrant() {
        StoreRecord remote = record(100, true, true, 200L);
        assertFalse(view(LegacyStatus.INELIGIBLE, new StoreRecord(remote.store, GENERATION, 100, remote.clock, false), 10).access.full);
        for (Verification verification : Arrays.asList(Verification.DEVICE, Verification.UNVERIFIED)) {
            StoreRecord incoming = new StoreRecord(new Store(verification, null, true, true, 200L,
                    RenewState.UNKNOWN, Plan.MONTHLY, false, null), GENERATION, 101, null, true);
            assertFalse(view(LegacyStatus.INELIGIBLE, incoming, 10).access.full);
            assertSame(remote, accept(remote, incoming, GENERATION).record);
        }
    }
    @Test public void failuresStaleConflictsAndOldGenerationPreserveTrustedRecord() {
        StoreRecord previous = record(100, true, false, null);
        assertSame(previous, accept(previous, null, GENERATION).record);
        assertEquals(Acceptance.STALE, accept(previous, record(99, false, false, null), GENERATION).acceptance);
        assertEquals(Acceptance.CONFLICT, accept(previous, record(100, false, false, null), GENERATION).acceptance);
        StoreRecord other = new StoreRecord(record(101, false, false, null).store, "old-owner", 101, null, true);
        assertEquals(Acceptance.WRONG_GENERATION, accept(previous, other, GENERATION).acceptance);
        assertSame(previous, accept(previous, other, GENERATION).record);
        assertNull(accept(previous, null, "new-owner").record);
        StoreRecord revoke = record(101, false, false, null);
        assertSame(revoke, accept(previous, revoke, GENERATION).record);
    }
    @Test public void deviceRequestDateDoesNotOrderRevokeOrCreateClockAuthority() {
        StoreRecord previous = record(100, true, false, null);
        StoreRecord revoke = new StoreRecord(record(10, false, false, null).store, GENERATION, 101, null, true);
        assertSame(revoke, accept(previous, revoke, GENERATION).record);
        StoreRecord live = new StoreRecord(record(100, false, true, 200L).store, GENERATION, 102, null, true);
        assertFalse(view(LegacyStatus.INELIGIBLE, live, 10).access.full);
        BillingSnapshot fresh = snapshot("process", 1, GENERATION, new Legacy(LegacyStatus.INELIGIBLE, true), live,
                null, 10, Operation.idle(), null, false, true, true, Issue.NONE, CATALOG);
        assertTrue(fresh.access.full);
        assertEquals(Collections.singletonList(Source.SUBSCRIPTION), fresh.access.sources);
        BillingSnapshot elapsedExpiry = snapshot("process", 2, GENERATION, new Legacy(LegacyStatus.INELIGIBLE, true),
                record(100, false, true, 200L), "boot-1", 110, Operation.idle(), null, false, true, true, Issue.NONE, CATALOG);
        assertFalse(elapsedExpiry.access.full);
    }
    @Test public void diskFailureDoesNotRevokeLiveRemoteOrLegacyDecision() {
        BillingSnapshot result = view(LegacyStatus.INELIGIBLE, record(100, true, false, null), "boot-1", 10,
                Operation.idle(), null, false, Issue.STORAGE);
        assertTrue(result.access.full); assertFalse(result.capabilities.checkout);
        BillingSnapshot legacy = snapshot("process", 0, GENERATION, new Legacy(LegacyStatus.ELIGIBLE, false), null,
                null, 0, Operation.idle(), null, false, false, false, Issue.STORAGE, Collections.emptyList());
        assertTrue(legacy.access.full); assertFalse(legacy.legacy.persisted);
    }
    @Test public void pendingUncertainAndPreparedBlockNewPurchaseButAllowSequentialRestore() {
        for (PurchaseStage stage : PurchaseStage.values()) {
            UnresolvedPurchase unresolved = new UnresolvedPurchase("purchase-1", Plan.LIFETIME, stage);
            BillingSnapshot result = view(LegacyStatus.INELIGIBLE, record(100, false, false, null), "boot-1", 10,
                    Operation.idle(), unresolved, false, Issue.PENDING);
            assertFalse(result.capabilities.checkout); assertTrue(result.capabilities.restore);
            assertSame(unresolved, result.unresolvedPurchase);
            assertTrue(result.capabilities.existingFriendRecovery); assertTrue(result.capabilities.nativeRecovery);
        }
    }
    @Test public void openPlaySheetOrSdkOperationPreventsSecondInteractiveFlow() {
        StoreRecord record = record(100, false, false, null);
        assertFalse(view(LegacyStatus.INELIGIBLE, record, "boot-1", 10, Operation.idle(), null, true, Issue.NONE).capabilities.restore);
        for (OperationState state : Arrays.asList(OperationState.CHECKING, OperationState.CHECKOUT, OperationState.RESTORING)) {
            BillingSnapshot result = view(LegacyStatus.INELIGIBLE, record, "boot-1", 10,
                    new Operation("operation", state, Plan.LIFETIME), null, false, Issue.NONE);
            assertFalse(result.capabilities.checkout); assertFalse(result.capabilities.restore);
        }
    }
    private LifetimeDecision lifetime(List<SubscriptionObligation> subscriptions) {
        return lifetimeCheckout(false, null, false, true, true, false, LegacyStatus.INELIGIBLE, subscriptions);
    }
    private SubscriptionObligation obligation(SubscriptionState state, boolean off) {
        return new SubscriptionObligation(state, SubscriptionScope.CURRENT, off, false);
    }
    @Test public void lifetimeRequiresKnownRenewalStoppedAndImmediateChargeConfirmation() {
        assertEquals(LifetimeDecision.CONFIRM_IMMEDIATE_CHARGE, lifetime(Collections.emptyList()));
        assertEquals(LifetimeDecision.REFRESH, lifetime(null));
        assertEquals(LifetimeDecision.CONFIRM_IMMEDIATE_CHARGE, lifetime(Collections.singletonList(obligation(SubscriptionState.CANCELED_UNEXPIRED, true))));
        for (SubscriptionState state : Arrays.asList(SubscriptionState.ACTIVE, SubscriptionState.GRACE, SubscriptionState.HOLD,
                SubscriptionState.PAUSED, SubscriptionState.UNKNOWN)) {
            assertEquals(LifetimeDecision.MANAGE_PLAY, lifetime(Collections.singletonList(obligation(state, true))));
        }
        assertEquals(LifetimeDecision.MANAGE_PLAY, lifetime(Arrays.asList(obligation(SubscriptionState.CANCELED_UNEXPIRED, true), obligation(SubscriptionState.ACTIVE, false))));
    }
    @Test public void provenTerminalHistoryAllowsLivenessButClaimedHistoryDoesNot() {
        assertEquals(LifetimeDecision.CONFIRM_IMMEDIATE_CHARGE, lifetime(Collections.singletonList(
                new SubscriptionObligation(SubscriptionState.EXPIRED, SubscriptionScope.HISTORY, false, true))));
        assertEquals(LifetimeDecision.MANAGE_PLAY, lifetime(Collections.singletonList(
                new SubscriptionObligation(SubscriptionState.EXPIRED, SubscriptionScope.HISTORY, false, false))));
        assertEquals(LifetimeDecision.MANAGE_PLAY, lifetime(Collections.singletonList(null)));
    }
    @Test public void legacyGiftExistingLifetimeAndUnresolvedNeverRebuy() {
        assertEquals(LifetimeDecision.GIFT_PORTABILITY, lifetimeCheckout(false, null, false, true, true, false, LegacyStatus.ELIGIBLE, Collections.emptyList()));
        assertEquals(LifetimeDecision.ALREADY_OWNED, lifetimeCheckout(false, null, false, true, true, true, LegacyStatus.INELIGIBLE, Collections.emptyList()));
        assertEquals(LifetimeDecision.WAIT, lifetimeCheckout(false, new UnresolvedPurchase("pending", Plan.MONTHLY, PurchaseStage.PENDING), false,
                true, true, false, LegacyStatus.INELIGIBLE, Collections.emptyList()));
        assertEquals(LifetimeDecision.REFRESH, lifetimeCheckout(false, null, false, false, true, false, LegacyStatus.INELIGIBLE, Collections.emptyList()));
        assertEquals(LifetimeDecision.REFRESH, lifetimeCheckout(false, null, false, true, false, false, LegacyStatus.INELIGIBLE, Collections.emptyList()));
    }
    @Test public void outcomeTaxonomyDistinguishesCancelPendingAndUncertainty() {
        assertEquals(OperationState.CANCELED, outcome(Outcome.USER_CANCELED).state);
        assertNull(outcome(Outcome.USER_CANCELED).journalStage);
        assertEquals(PurchaseStage.PENDING, outcome(Outcome.PENDING).journalStage);
        assertEquals(PurchaseStage.UNCERTAIN, outcome(Outcome.NETWORK_UNCERTAIN).journalStage);
        assertEquals(PurchaseStage.UNCERTAIN, outcome(Outcome.RECEIPT_POST_UNCERTAIN).journalStage);
        assertEquals(PurchaseStage.UNCERTAIN, outcome(Outcome.VERIFICATION).journalStage);
        assertTrue(outcome(Outcome.PRODUCT_UNAVAILABLE).catalogUnavailable);
        assertEquals(Issue.PROVIDER, outcome(Outcome.CONFIGURATION).issue);
    }
    @Test public void dtoUsesExactMasterFieldsAndDetachesSerializedLists() {
        BillingSnapshot result = view(LegacyStatus.ELIGIBLE, record(100, true, true, 200L), 10);
        Map<String, Object> map = result.toMap();
        assertEquals(Arrays.asList("schema", "controllerEpoch", "sequence", "legacy", "access", "capabilities", "operation", "unresolvedPurchase", "store", "issue", "catalog"),
                Arrays.asList(map.keySet().toArray(new String[0])));
        assertEquals("remote", ((Map<?, ?>) map.get("store")).get("verification"));
        assertEquals("eligible", ((Map<?, ?>) map.get("legacy")).get("status"));
        ((List<?>) ((Map<?, ?>) map.get("access")).get("sources")).clear();
        assertEquals(3, result.access.sources.size());
        try { result.access.sources.clear(); fail("Mutable source list"); } catch (UnsupportedOperationException expected) {}
    }
    @Test public void invalidMetadataCannotBecomeGrantOrCheckout() {
        try { new Store(Verification.DEVICE, 100L, true, false, null, RenewState.UNKNOWN, null, false, null); fail(); } catch (IllegalArgumentException expected) {}
        try { new StoreRecord(Store.unknown(), GENERATION, 1, new ClockAnchor(99, 1, "boot", TimeProvenance.SIGNED_REMOTE_BODY_TIME), true); fail(); } catch (IllegalArgumentException expected) {}
        try { snapshot("process", -1, GENERATION, new Legacy(LegacyStatus.ELIGIBLE, true), null, null, 0,
                Operation.idle(), null, false, false, false, Issue.NONE, CATALOG); fail(); } catch (IllegalArgumentException expected) {}
        try { new CatalogItem(Plan.MONTHLY, "Monthly", "", "month", true, "catalog"); fail(); } catch (IllegalArgumentException expected) {}
        assertFalse(new CatalogItem(Plan.MONTHLY, "Monthly", "", "", false, "catalog").available);
        try { new CatalogItem(Plan.MONTHLY, "Monthly", " ", "", false, "catalog"); fail(); } catch (IllegalArgumentException expected) {}
        try { new CatalogItem(Plan.MONTHLY, "Monthly", "$1.99", " ", true, "catalog"); fail(); } catch (IllegalArgumentException expected) {}
        try { snapshot("process", 1, GENERATION, new Legacy(LegacyStatus.INELIGIBLE, true), record(100, false, false, null), "boot-1", 10,
                Operation.idle(), null, false, true, false, Issue.NONE, Arrays.asList(CATALOG.get(0), CATALOG.get(0))); fail(); } catch (IllegalArgumentException expected) {}
    }
}
