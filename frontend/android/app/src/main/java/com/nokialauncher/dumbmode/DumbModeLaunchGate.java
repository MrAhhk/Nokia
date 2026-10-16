package com.nokialauncher.dumbmode;

import java.util.Objects;

/** Tiny process authority owned by DumbModeController. Never run storage or scans here.
 * The mutex orders activation reservation against immediate synchronous SDK entry,
 * not the lifetime of a payment. Only a proved global OFF can authorize entry.
 */
public final class DumbModeLaunchGate {
    enum State { LOADING, OFF, ACTIVATING, ACTIVE, ERROR }
    private State state = State.LOADING;

    synchronized void commit(State next, Runnable memoryCommit) {
        Objects.requireNonNull(memoryCommit).run();
        state = Objects.requireNonNull(next);
    }
    synchronized void reserveActivation() {
        if (state != State.OFF) throw new IllegalStateException("dumb_mode_not_off");
        state = State.ACTIVATING;
    }
    public synchronized boolean allowsPaymentLaunch() { return state == State.OFF; }

    /** Action must perform immediate SDK entry only; no asynchronous authorization lease. */
    public synchronized boolean runPaymentLaunchIfAllowed(Runnable entry) {
        Objects.requireNonNull(entry);
        if (state != State.OFF) return false;
        entry.run();
        return true;
    }
}
