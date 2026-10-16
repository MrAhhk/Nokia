package com.nokialauncher.dumbmode;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class DumbModeLaunchGateTest {
    private static void commit(DumbModeLaunchGate gate, DumbModeLaunchGate.State state) { gate.commit(state, () -> {}); }
    @Test public void onlyProvenGlobalOffAllowsEntry() {
        DumbModeLaunchGate gate = new DumbModeLaunchGate(); AtomicInteger launches = new AtomicInteger();
        assertFalse(gate.runPaymentLaunchIfAllowed(launches::incrementAndGet));
        for (DumbModeLaunchGate.State state : DumbModeLaunchGate.State.values()) {
            commit(gate, state);
            assertEquals(state == DumbModeLaunchGate.State.OFF, gate.allowsPaymentLaunch());
            assertEquals(state == DumbModeLaunchGate.State.OFF, gate.runPaymentLaunchIfAllowed(launches::incrementAndGet));
        }
        assertEquals(1, launches.get());
    }
    @Test public void pendingDiskActivationDeniesImmediatelyWithoutWaitingForWorkerIo() throws Exception {
        DumbModeLaunchGate gate = new DumbModeLaunchGate(); commit(gate, DumbModeLaunchGate.State.OFF);
        ExecutorService worker = Executors.newSingleThreadExecutor(); CountDownLatch reserved = new CountDownLatch(1), disk = new CountDownLatch(1);
        try {
            Future<?> activation = worker.submit(() -> {
                gate.reserveActivation(); reserved.countDown();
                try { assertTrue(disk.await(2, TimeUnit.SECONDS)); } catch (InterruptedException failure) { throw new AssertionError(failure); }
                commit(gate, DumbModeLaunchGate.State.ACTIVE);
            });
            assertTrue(reserved.await(2, TimeUnit.SECONDS));
            // This must finish while the disk worker remains stalled, not after its release.
            assertFalse(gate.runPaymentLaunchIfAllowed(() -> fail("Reserved activation")));
            assertFalse(activation.isDone()); disk.countDown(); activation.get(2, TimeUnit.SECONDS);
            assertFalse(gate.allowsPaymentLaunch());
        } finally { disk.countDown(); worker.shutdownNow(); }
    }
    @Test public void activationCannotCommitBetweenAuthorizationAndSynchronousSdkEntry() throws Exception {
        DumbModeLaunchGate gate = new DumbModeLaunchGate(); commit(gate, DumbModeLaunchGate.State.OFF);
        ExecutorService worker = Executors.newSingleThreadExecutor(); AtomicInteger order = new AtomicInteger();
        CountDownLatch attempted = new CountDownLatch(1); final Future<?>[] activation = new Future<?>[1];
        try {
            assertTrue(gate.runPaymentLaunchIfAllowed(() -> {
                activation[0] = worker.submit(() -> {
                    attempted.countDown(); gate.reserveActivation(); assertEquals(1, order.getAndIncrement());
                });
                try { assertTrue(attempted.await(2, TimeUnit.SECONDS)); } catch (InterruptedException failure) { throw new AssertionError(failure); }
                assertFalse(activation[0].isDone()); assertEquals(0, order.getAndIncrement());
            }));
            activation[0].get(2, TimeUnit.SECONDS); assertEquals(2, order.get()); assertFalse(gate.allowsPaymentLaunch());
        } finally { worker.shutdownNow(); }
    }
    @Test public void ambiguousActivationFailureCannotReturnToOffAndSuccessfulUnlockRestoresAuthority() {
        DumbModeLaunchGate gate = new DumbModeLaunchGate(); commit(gate, DumbModeLaunchGate.State.OFF);
        gate.reserveActivation(); commit(gate, DumbModeLaunchGate.State.ERROR);
        assertFalse(gate.allowsPaymentLaunch());
        // Restart starts LOADING and needs durable proof again; no stale OFF lease survives.
        assertFalse(new DumbModeLaunchGate().allowsPaymentLaunch());
        commit(gate, DumbModeLaunchGate.State.ACTIVE); assertFalse(gate.allowsPaymentLaunch());
        commit(gate, DumbModeLaunchGate.State.OFF); assertTrue(gate.allowsPaymentLaunch());
    }
}
