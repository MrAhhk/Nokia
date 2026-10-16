package com.nokialauncher.billing;

/** One boot deadline per Home Activity; recovery is terminal until Android creates a new host. */
public final class BillingShellReadiness {
    public static final long BOOT_DEADLINE_MS = 15000L;
    public enum State { NEW, DISABLED, WAITING, HEALTHY, RECOVERY, DESTROYED }
    private State state = State.NEW;

    /** True means the owner must schedule its one deadline. Resume never calls this. */
    public boolean start(boolean rolloutEnabled, boolean bridgePresent) {
        if (state != State.NEW) return false;
        state = !bridgePresent ? State.RECOVERY : rolloutEnabled ? State.WAITING : State.DISABLED;
        return state == State.WAITING;
    }

    public boolean ready(String nativeDocumentUrl, boolean sameWebView) {
        if (!permits(nativeDocumentUrl, sameWebView)
                || (state != State.WAITING && state != State.DISABLED && state != State.HEALTHY)) return false;
        state = State.HEALTHY;
        return true;
    }

    /** A detached terminal renderer cannot authorize commands just because its URL remains local. */
    public boolean permits(String nativeDocumentUrl, boolean sameWebView) {
        return state != State.RECOVERY && state != State.DESTROYED
                && sameWebView && BillingBridgeAuthority.permits(nativeDocumentUrl);
    }

    public boolean deadline() {
        if (state != State.WAITING) return false;
        state = State.RECOVERY;
        return true;
    }

    public boolean rendererGone() {
        if (state == State.RECOVERY || state == State.DESTROYED) return false;
        state = State.RECOVERY;
        return true;
    }

    public boolean isRecovery() { return state == State.RECOVERY; }
    public State state() { return state; }
    public void destroy() { state = State.DESTROYED; }
}
