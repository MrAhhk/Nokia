package com.nokialauncher.billing;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

public class BillingAttemptTest {
    private BillingAttempt lifetime() {
        return BillingAttempt.prepare("purchase-1", "customer-config", Plan.LIFETIME,
                "launcher_lifetime", null, 100, new HashSet<>(Arrays.asList("old-transaction")));
    }
    @Test public void unavailableRejectionCannotClearAnotherPendingOrUncertainAttempt() {
        BillingAttempt a = lifetime();
        assertSame(a, a.rejectUnavailableProduct("other"));
        BillingAttempt rejected = a.rejectUnavailableProduct(a.id);
        assertFalse(rejected.unresolved()); assertNull(rejected.barrier());
        assertFalse(BillingAttempt.fromMap(rejected.toMap()).unresolved());
        for (BillingAttempt.State state : new BillingAttempt.State[] { BillingAttempt.State.PENDING, BillingAttempt.State.UNCERTAIN }) {
            BillingAttempt unresolved = a.recordUnresolved(a.id, state);
            assertSame(unresolved, unresolved.rejectUnavailableProduct(a.id));
        }
    }
    @Test public void noLaunchAbortOnlyAcceptsExactPreparedNativeIntent() {
        BillingAttempt prepared = lifetime();
        assertSame(prepared, prepared.abortUnlaunchedPreparation("other"));
        BillingAttempt canceled = prepared.abortUnlaunchedPreparation("purchase-1");
        assertEquals(BillingAttempt.State.CANCELED, canceled.state); assertNull(canceled.barrier());
        assertSame(canceled, canceled.abortUnlaunchedPreparation("purchase-1"));
        BillingAttempt pending = prepared.recordUnresolved("purchase-1", BillingAttempt.State.PENDING);
        assertSame(pending, pending.abortUnlaunchedPreparation("purchase-1"));
        BillingAttempt uncertain = prepared.recordUnresolved("purchase-1", BillingAttempt.State.UNCERTAIN);
        assertSame(uncertain, uncertain.abortUnlaunchedPreparation("purchase-1"));
    }
    private BillingAttempt.Receipt receipt(String id, Plan plan, String product, String basePlan, Verification verification) {
        return new BillingAttempt.Receipt("customer-config", id, plan, product, basePlan, verification);
    }
    @Test public void preparedCrashPreservesBarrierWithoutLaunchingPurchase() {
        BillingAttempt attempt = BillingAttempt.fromMap(lifetime().toMap());
        assertEquals(PurchaseStage.PREPARED, attempt.barrier().stage);
        assertTrue(attempt.unresolved());
    }
    @Test public void oldRightsAndOtherPlanReceiptsDoNotCompletePurchase() {
        BillingAttempt a = lifetime();
        assertSame(a, a.reconcile(receipt("old-transaction", Plan.LIFETIME, "launcher_lifetime", null, Verification.REMOTE)));
        assertSame(a, a.reconcile(receipt("new-sub", Plan.MONTHLY, "launcher_sub", "monthly", Verification.REMOTE)));
        assertSame(a, a.reconcile(null));
    }
    @Test public void deviceOrUnverifiedReceiptDoesNotResolveNewCharge() {
        BillingAttempt a = lifetime();
        for (Verification v : Arrays.asList(Verification.DEVICE, Verification.UNVERIFIED))
            assertSame(a, a.reconcile(receipt("new-lifetime", Plan.LIFETIME, "launcher_lifetime", null, v)));
    }
    @Test public void wrongOwnerOrProductDoesNotResolveJournal() {
        BillingAttempt a = lifetime();
        assertSame(a, a.reconcile(new BillingAttempt.Receipt("other-account", "new", Plan.LIFETIME, "launcher_lifetime", null, Verification.REMOTE)));
        assertSame(a, a.reconcile(receipt("new", Plan.LIFETIME, "wrong", null, Verification.REMOTE)));
    }
    @Test public void exactNewReceiptResolvesOnceAfterRestartWithoutOperationId() {
        BillingAttempt a = BillingAttempt.fromMap(lifetime().toMap());
        BillingAttempt.Receipt r = receipt("new-lifetime", Plan.LIFETIME, "launcher_lifetime", null, Verification.REMOTE);
        BillingAttempt completed = a.reconcile(r);
        assertEquals(BillingAttempt.State.COMPLETED, completed.state); assertNull(completed.barrier());
        assertSame(completed, completed.reconcile(r));
        assertEquals("new-lifetime", BillingAttempt.fromMap(completed.toMap()).resolvedTransactionId);
    }
    @Test public void pendingAndUncertainRetainSamePurchaseIdentity() {
        BillingAttempt a = lifetime().recordUnresolved("purchase-1", BillingAttempt.State.PENDING);
        assertEquals(PurchaseStage.PENDING, a.barrier().stage);
        a = a.recordUnresolved("purchase-1", BillingAttempt.State.UNCERTAIN);
        assertEquals(PurchaseStage.UNCERTAIN, a.barrier().stage);
        assertSame(a, a.definitiveUserCancel("restore-operation"));
        assertSame(a, a.recordUnresolved("restore-operation", BillingAttempt.State.PENDING));
    }
    @Test public void terminalCancelDoesNotTurnIntoAnotherPurchaseOnLatePending() {
        BillingAttempt a = lifetime().definitiveUserCancel("purchase-1");
        assertNull(a.barrier()); assertEquals(BillingAttempt.State.CANCELED, a.state);
        assertSame(a, a.recordUnresolved("purchase-1", BillingAttempt.State.PENDING));
        // A later remotely proven purchase is still recognized; money is never hidden by UI cancellation.
        assertEquals(BillingAttempt.State.COMPLETED,
                a.reconcile(receipt("new", Plan.LIFETIME, "launcher_lifetime", null, Verification.REMOTE)).state);
    }
    @Test public void basePlanChangeRequiresExactExpectedPlan() {
        BillingAttempt a = BillingAttempt.prepare("sub-1", "customer-config", Plan.YEARLY,
                "launcher_sub", "yearly", 100, Collections.emptySet());
        assertSame(a, a.reconcile(receipt("new", Plan.YEARLY, "launcher_sub", "monthly", Verification.REMOTE)));
        assertEquals(BillingAttempt.State.COMPLETED,
                a.reconcile(receipt("new", Plan.YEARLY, "launcher_sub", "yearly", Verification.REMOTE)).state);
    }
    @Test public void corruptOrInjectedJournalCannotManufactureResolution() {
        Map<String, Object> data = lifetime().toMap(); data.put("schema", 99);
        expectInvalid(data); data = lifetime().toMap(); data.put("token", "not-accepted"); expectInvalid(data);
        data = lifetime().toMap(); data.put("state", "COMPLETED"); expectInvalid(data);
        data = lifetime().toMap(); data.put("startedAtMs", 1.5); expectInvalid(data);
        data = lifetime().toMap(); data.put("baselineIds", Arrays.asList("a", "a")); expectInvalid(data);
    }
    private void expectInvalid(Map<String, Object> data) {
        try { BillingAttempt.fromMap(data); fail("Accepted corrupt journal"); } catch (IllegalArgumentException expected) {}
    }
}
