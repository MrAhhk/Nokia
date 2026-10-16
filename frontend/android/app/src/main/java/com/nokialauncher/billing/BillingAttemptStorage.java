package com.nokialauncher.billing;

import java.io.IOException;
import java.util.Objects;

/** Blocking journal adapter for the serialized billing disk worker. Never launch checkout before save returns true.
 * Missing is null; unreadable/schema/owner failures throw and retain recovery evidence. No reset/delete API.
 */
public final class BillingAttemptStorage {
    private final BillingStore store;
    private final String ownerEpoch;
    private final BillingAttemptCodec codec = new BillingAttemptCodec();
    public BillingAttemptStorage(BillingStore store, String ownerEpoch) {
        this.store = Objects.requireNonNull(store);
        this.ownerEpoch = BillingSnapshot.requiredText(ownerEpoch);
    }

    public BillingAttempt load() throws IOException {
        synchronized (store) {
            BillingStore.ReadResult result = store.read(BillingStore.FileKind.ATTEMPT);
            if (result.status == BillingStore.Status.MISSING) return null;
            if (result.status != BillingStore.Status.PRESENT) throw recovery();
            BillingAttempt attempt = codec.decode(result);
            if (!ownerEpoch.equals(attempt.ownerEpoch)) throw recovery();
            return attempt;
        }
    }

    /** Compare against the snapshot captured BEFORE enqueueing a callback/retry (null means MISSING).
     * New user checkout intent must use a fresh native UUID, never an SDK token or UI request ID.
     * Receipt rights reconciliation is independent: a late receipt for A cannot replace current journal B.
     * This bounded journal does not retain historical IDs; the native owner must never reuse its UUIDs.
     */
    public boolean save(BillingAttempt attempt, BillingAttempt expectedPrevious) {
        synchronized (store) {
            try {
                if (attempt == null || !ownerEpoch.equals(attempt.ownerEpoch)) return false;
                String json = codec.encode(attempt);
                BillingAttempt prior = load();
                if (prior == null ? expectedPrevious != null
                        : expectedPrevious == null || !prior.toMap().equals(expectedPrevious.toMap())) return false;
                if (!allowed(prior, attempt)) return false;
                return store.write(BillingStore.FileKind.ATTEMPT, json);
            } catch (IOException invalidOrUnknown) { return false; }
        }
    }

    private static boolean allowed(BillingAttempt prior, BillingAttempt next) {
        if (prior == null) return next.state == BillingAttempt.State.PREPARED;
        if (!prior.id.equals(next.id))
            return !prior.unresolved() && next.state == BillingAttempt.State.PREPARED;
        if (!prior.ownerEpoch.equals(next.ownerEpoch) || prior.plan != next.plan
                || !prior.productId.equals(next.productId) || !Objects.equals(prior.basePlanId, next.basePlanId)
                || prior.startedAtMs != next.startedAtMs || !prior.baselineIds.equals(next.baselineIds)) return false;
        if (prior.state == BillingAttempt.State.COMPLETED)
            return next.state == BillingAttempt.State.COMPLETED
                    && prior.resolvedTransactionId.equals(next.resolvedTransactionId);
        if (prior.state == BillingAttempt.State.CANCELED)
            return next.state == BillingAttempt.State.CANCELED || next.state == BillingAttempt.State.COMPLETED;
        // PREPARED < PENDING < UNCERTAIN; resolutions are terminal except receipt-backed canceled->completed.
        return next.state.ordinal() >= prior.state.ordinal();
    }
    private static IOException recovery() { return new IOException("Billing attempt requires recovery"); }
}
