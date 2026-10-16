package com.nokialauncher.billing;

/** Plugin-session, monotonic one-shot guard. No timer, SDK or entitlement authority. */
public final class BillingManagementReturn {
    private static final long WINDOW_MS = 10 * 60 * 1000L;
    private long openedAt;
    private boolean armed, paused;

    public void opened(long elapsedMs) { openedAt = elapsedMs; armed = true; paused = false; }
    public void pause() { if (armed) paused = true; }
    /** A rejected UI subscription must not abort Android resume or retain an old arm. */
    public boolean bindAndResume(long elapsedMs, Runnable bindUi) {
        try { bindUi.run(); } catch (RuntimeException unavailable) { /* Retry can attach later. */ }
        return resume(elapsedMs);
    }
    public boolean resume(long elapsedMs) {
        if (!armed || !paused) return false;
        boolean timely = elapsedMs >= openedAt && elapsedMs - openedAt <= WINDOW_MS;
        clear();
        return timely;
    }
    public void clear() { armed = false; paused = false; }
}
