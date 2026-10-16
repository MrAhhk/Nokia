package com.nokialauncher.billing;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingController.PurchaseOutcome;

/** Native request/lifecycle fixture; no real Activity/Play/device acceptance claim. */
public class BillingPurchaseHostTest {
    static final class Surface implements BillingPurchaseHost.Surface {
        boolean live = true; int closed;
        public boolean alive() { return live; }
        public void close() { live = false; closed++; }
    }
    static final class Fixture {
        final BillingCheckoutTest.Queue main = new BillingCheckoutTest.Queue(), disk = new BillingCheckoutTest.Queue();
        final List<PurchaseOutcome> outcomes = new ArrayList<>();
        final List<BillingController.PurchaseCallback> purchases = new ArrayList<>();
        final RevenueCatCatalog.Selection selection;
        BillingAttempt durable; String openedId, capability;
        int opened; boolean allowed = true, finalAllowed = true, failBuyer, failOpen, failRead, failGate;
        Runnable gateAction;
        final BillingPurchaseHost host;
        Fixture() throws Exception {
            RevenueCatCatalog catalog = RevenueCatCatalog.map(RevenueCatCatalogTest.offerings("main",
                    RevenueCatCatalogTest.subscription(Plan.MONTHLY), RevenueCatCatalogTest.subscription(Plan.YEARLY),
                    RevenueCatCatalogTest.lifetime(RevenueCatCatalogTest.PRICE)), RevenueCatCatalogTest.CONFIG);
            selection = catalog.resolve(Plan.MONTHLY, catalog.items.get(0).catalogRevision);
            assertNotNull(selection);
            durable = prepared("attempt");
            host = new BillingPurchaseHost("owner", new BillingController.AttemptJournal() {
                public BillingAttempt load() throws Exception { if (failRead) throw new Exception("unknown"); return durable; }
                public boolean save(BillingAttempt next, BillingAttempt prior) { throw new AssertionError("Host cannot write journal"); }
            }, main, disk, () -> true, () -> {
                if (failGate) throw new IllegalStateException("unknown lock");
                if (gateAction != null) { Runnable action = gateAction; gateAction = null; action.run(); }
                return allowed;
            }, entry -> { if (!finalAllowed) return false; entry.run(); return true; }, (id, token) -> {
                opened++; openedId = id; capability = token;
                if (failOpen) throw new IllegalStateException("start uncertain");
            }, (surface, fresh, callback) -> {
                assertSame(selection, fresh); assertTrue(surface.alive());
                assertEquals(BillingAttempt.State.PREPARED, durable.state);
                purchases.add(callback);
                if (failBuyer) throw new IllegalStateException("SDK may have launched");
            });
        }
        BillingAttempt prepared(String id) { return BillingAttempt.prepare(id, "owner", selection.plan,
                selection.productId, selection.basePlanId, 100, Collections.emptySet()); }
        void launch() { host.launch(selection, "attempt", outcomes::add); disk.drain(); main.drain(); }
        long attach(Surface surface) { return host.attach(surface, openedId, capability); }
    }
    @Test public void proofPrecedesWindowAndResumedGenerationPrecedesSdk() throws Exception {
        Fixture f = new Fixture(); f.host.launch(f.selection, "attempt", f.outcomes::add);
        assertEquals(0, f.opened); f.main.drain(); assertEquals(0, f.opened);
        f.disk.drain(); assertEquals(0, f.opened); f.main.drain(); assertEquals(1, f.opened);
        Surface s = new Surface(); long lease = f.attach(s); assertTrue(lease > 0);
        assertTrue(f.purchases.isEmpty()); f.host.resume(s, lease); f.main.drain();
        assertEquals(1, f.purchases.size()); assertTrue(f.outcomes.isEmpty());
    }
    @Test public void unknownOrMissingJournalNeverOpensWindow() throws Exception {
        for (boolean unreadable : new boolean[]{false, true}) {
            Fixture f = new Fixture(); f.failRead = unreadable; f.durable = null; f.launch();
            assertEquals(0, f.opened); assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
        }
    }
    @Test public void wrongOwnerOrAttemptOrResolvedJournalDeniesWindow() throws Exception {
        Fixture wrongOwner = new Fixture(); wrongOwner.durable = BillingAttempt.prepare("attempt", "other",
                wrongOwner.selection.plan, wrongOwner.selection.productId, wrongOwner.selection.basePlanId, 100, Collections.emptySet());
        Fixture wrongId = new Fixture(); wrongId.durable = wrongId.prepared("other");
        Fixture resolved = new Fixture(); resolved.durable = resolved.durable.definitiveUserCancel("attempt");
        for (Fixture f : new Fixture[]{wrongOwner, wrongId, resolved}) {
            f.launch(); assertEquals(0, f.opened); assertEquals(PurchaseOutcome.NOT_LAUNCHED, f.outcomes.get(0));
        }
    }
    @Test public void invalidIntentOrDuplicateWindowCannotAcquireGeneration() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface s = new Surface();
        assertEquals(0, f.host.attach(s, "attempt", "forged"));
        assertEquals(0, f.host.attach(s, "other", f.capability));
        long lease = f.attach(s); assertTrue(lease > 0);
        assertEquals(0, f.attach(new Surface()));
        f.host.resume(s, lease); f.main.drain(); assertEquals(1, f.purchases.size());
    }
    @Test public void pauseBeforeDispatchSuppressesSdkUntilRealResume() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface s = new Surface(); long lease = f.attach(s);
        f.host.resume(s, lease); f.host.pause(s, lease); f.main.drain(); assertTrue(f.purchases.isEmpty());
        f.host.resume(s, lease); f.main.drain(); assertEquals(1, f.purchases.size());
        f.host.pause(s, lease); f.host.resume(s, lease); f.main.drain(); assertEquals(1, f.purchases.size());
    }
    @Test public void recreationBeforeSdkKeepsRequestAndInvalidatesOldGeneration() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface old = new Surface(); long oldLease = f.attach(old);
        f.host.resume(old, oldLease); f.host.pause(old, oldLease); f.host.detach(old, oldLease, true);
        Surface replacement = new Surface(); long nextLease = f.attach(replacement); assertTrue(nextLease > oldLease);
        f.main.drain(); assertTrue(f.purchases.isEmpty());
        f.host.resume(old, oldLease); f.host.resume(replacement, nextLease); f.main.drain();
        assertEquals(1, f.purchases.size()); assertTrue(f.outcomes.isEmpty());
    }
    @Test public void lockChangeImmediatelyBeforeSdkIsNotLaunchedNeverCancellation() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface s = new Surface(); long lease = f.attach(s);
        f.host.resume(s, lease); f.allowed = false; f.main.drain(); assertTrue(f.purchases.isEmpty());
        assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
    }
    @Test public void optimisticDryReadCannotBypassFinalNativeAuthorization() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface s = new Surface(); long lease = f.attach(s);
        assertTrue(f.host.nativeGate()); f.finalAllowed = false;
        f.host.resume(s, lease); f.main.drain(); assertTrue(f.purchases.isEmpty());
        assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
    }
    @Test public void destroyedUiAfterSdkDoesNotCancelNativeCompletionOrRelaunch() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface old = new Surface(); long lease = f.attach(old);
        f.host.resume(old, lease); f.main.drain(); f.host.pause(old, lease); f.host.detach(old, lease, false);
        assertTrue(f.outcomes.isEmpty()); Surface next = new Surface(); long nextLease = f.attach(next);
        f.host.resume(next, nextLease); f.main.drain(); assertEquals(1, f.purchases.size());
        f.purchases.get(0).complete(PurchaseOutcome.COMPLETED); f.purchases.get(0).complete(PurchaseOutcome.CANCELED);
        f.main.drain(); assertEquals(Collections.singletonList(PurchaseOutcome.COMPLETED), f.outcomes);
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state); assertEquals(1, next.closed);
    }
    @Test public void sdkEntryThrowNeverRetriesAndNeverClearsJournal() throws Exception {
        Fixture f = new Fixture(); f.failBuyer = true; f.launch(); Surface s = new Surface(); long lease = f.attach(s);
        f.host.resume(s, lease); f.main.drain(); f.host.resume(s, lease); f.main.drain();
        assertEquals(1, f.purchases.size()); assertEquals(Collections.singletonList(PurchaseOutcome.UNCERTAIN), f.outcomes);
        assertEquals(BillingAttempt.State.PREPARED, f.durable.state);
        f.purchases.get(0).complete(PurchaseOutcome.COMPLETED); assertEquals(1, f.outcomes.size());
    }
    @Test public void mainOrDiskRejectionDeliversNativeCompletion() throws Exception {
        Fixture disk = new Fixture(); disk.disk.reject = true; disk.launch();
        Fixture main = new Fixture(); main.main.reject = true; main.host.launch(main.selection, "attempt", main.outcomes::add); main.disk.drain();
        for (Fixture f : new Fixture[]{disk, main}) {
            assertEquals(0, f.opened); assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
        }
    }
    @Test public void startThrowAndNonRecreationDestructionProveNoSdkEntry() throws Exception {
        Fixture open = new Fixture(); open.failOpen = true; open.launch(); assertEquals(PurchaseOutcome.NOT_LAUNCHED, open.outcomes.get(0));
        Fixture lost = new Fixture(); lost.launch(); Surface s = new Surface(); long lease = lost.attach(s);
        lost.host.detach(s, lease, false); lost.main.drain(); assertTrue(lost.purchases.isEmpty());
        assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), lost.outcomes);
    }
    @Test public void processRecreationHasNoRequestAndDuplicateAttemptNeverLaunchesTwice() throws Exception {
        Fixture fresh = new Fixture(); assertEquals(0, fresh.host.attach(new Surface(), "attempt", "restored"));
        Fixture f = new Fixture(); f.launch();
        try { f.host.launch(f.selection, "attempt", f.outcomes::add); fail("busy"); } catch (IllegalStateException expected) { }
        Surface s = new Surface(); long lease = f.attach(s); f.host.detach(s, lease, false); f.main.drain();
        try { f.host.launch(f.selection, "attempt", f.outcomes::add); fail("reused"); } catch (IllegalStateException expected) { }
        assertEquals(1, f.opened);
    }
    @Test public void throwingLockPredicateFailsClosedAndReleasesNativeRequest() throws Exception {
        Fixture f = new Fixture(); f.failGate = true; assertFalse(f.host.nativeGate()); f.launch();
        assertEquals(0, f.opened); assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
        f.failGate = false; f.durable = f.prepared("next");
        f.host.launch(f.selection, "next", f.outcomes::add); f.disk.drain(); f.main.drain(); assertEquals(1, f.opened);
    }
    @Test public void repeatedResumeIsBoundedAndRecreationResumeRequalifiesGeneration() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface old = new Surface(); long lease = f.attach(old);
        for (int i = 0; i < 100; i++) f.host.resume(old, lease);
        assertEquals(1, f.main.tasks.size());
        f.host.pause(old, lease); f.host.detach(old, lease, true);
        Surface next = new Surface(); long nextLease = f.attach(next); f.host.resume(next, nextLease);
        assertEquals(1, f.main.tasks.size()); f.main.drain(); assertEquals(1, f.purchases.size());
    }
    @Test public void weakHomeOpenerCanRebindAfterHomeRecreationWithoutRecreatingHost() {
        List<Surface> opened = new ArrayList<>();
        BillingPurchaseHost.WindowOpener<Surface> opener = new BillingPurchaseHost.WindowOpener<>(
                Surface::alive, (home, id, capability) -> opened.add(home));
        Surface old = new Surface(); opener.bind(old); opener.open("one", "capability"); old.live = false;
        try { opener.open("two", "capability"); fail("Destroyed Home"); } catch (IllegalStateException expected) { }
        Surface next = new Surface(); opener.bind(next); opener.open("two", "capability");
        assertEquals(2, opened.size()); assertSame(next, opened.get(1));
    }
    @Test public void homeUnbindUsesIdentityAndMissingHomeCannotOpen() {
        List<Surface> opened = new ArrayList<>();
        BillingPurchaseHost.WindowOpener<Surface> opener = new BillingPurchaseHost.WindowOpener<>(
                Surface::alive, (home, id, capability) -> opened.add(home));
        assertFalse(opener.bound()); Surface old = new Surface(), next = new Surface();
        opener.bind(old); opener.bind(next); opener.unbind(old); assertTrue(opener.bound());
        opener.open("attempt", "capability"); assertSame(next, opened.get(0));
        opener.unbind(next); assertFalse(opener.bound());
        try { opener.open("attempt", "capability"); fail("Missing Home"); } catch (IllegalStateException expected) { }
        assertEquals(1, opened.size());
    }
    @Test public void normalHomePauseAfterWindowLaunchDoesNotAbortResumedBillingEntry() throws Exception {
        Fixture f = new Fixture(); List<Surface> opened = new ArrayList<>();
        BillingPurchaseHost.WindowOpener<Surface> opener = new BillingPurchaseHost.WindowOpener<>(
                Surface::alive, (home, id, capability) -> {
                    opened.add(home); f.openedId = id; f.capability = capability;
                });
        BillingPurchaseHost host = new BillingPurchaseHost("owner", new BillingController.AttemptJournal() {
            public BillingAttempt load() { return f.durable; }
            public boolean save(BillingAttempt next, BillingAttempt prior) { throw new AssertionError("host cannot save"); }
        }, f.main, f.disk, () -> true, () -> f.allowed, opener,
                (surface, selection, callback) -> f.purchases.add(callback));
        Surface home = new Surface(); opener.bind(home); assertTrue(host.nativeGate());
        host.launch(f.selection, "attempt", f.outcomes::add); f.disk.drain(); f.main.drain();
        assertEquals(Collections.singletonList(home), opened);
        // Android pauses the original Home as BillingActivity takes the foreground.
        opener.unbind(home); assertFalse(host.nativeGate());
        Surface payment = new Surface(); long lease = host.attach(payment, f.openedId, f.capability);
        host.resume(payment, lease); f.main.drain(); host.resume(payment, lease); f.main.drain();
        assertEquals(1, f.purchases.size()); assertTrue(f.outcomes.isEmpty());
        f.purchases.get(0).complete(PurchaseOutcome.COMPLETED); f.main.drain();
        assertEquals(Collections.singletonList(PurchaseOutcome.COMPLETED), f.outcomes);
    }
    @Test public void oldCallbackCloseNeverClosesNewRequestGeneration() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface old = new Surface(); long lease = f.attach(old);
        f.host.resume(old, lease); f.main.drain(); f.purchases.get(0).complete(PurchaseOutcome.COMPLETED);
        f.durable = f.prepared("next"); f.host.launch(f.selection, "next", f.outcomes::add);
        f.disk.drain();
        // Drain old finish followed by new open, then attach the next authorized window.
        f.main.drain(); Surface next = new Surface(); long nextLease = f.attach(next);
        assertTrue(nextLease > lease); f.host.resume(next, nextLease); f.main.drain();
        f.purchases.get(0).complete(PurchaseOutcome.CANCELED); f.main.drain();
        assertEquals(0, next.closed); assertEquals(2, f.purchases.size());
    }
    @Test public void terminalBeforeEntryClaimCannotAbortThenStillCallSdk() throws Exception {
        Fixture f = new Fixture(); f.launch(); Surface s = new Surface(); long lease = f.attach(s);
        // Simulate terminal no-entry proof landing between final gate and entry claim.
        f.gateAction = () -> f.host.detach(s, lease, false);
        f.host.resume(s, lease); f.main.drain();
        assertTrue(f.purchases.isEmpty());
        assertEquals(Collections.singletonList(PurchaseOutcome.NOT_LAUNCHED), f.outcomes);
    }
}
