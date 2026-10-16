package com.nokialauncher.billing;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Pure rules over adapter-normalized evidence. This class does not verify purchases or call an SDK.
 * Production adapters must prove every input's provenance against the pinned public SDK (M02/M04).
 */
public final class BillingPolicy {
    private BillingPolicy() {}
    public enum TimeProvenance { SIGNED_REMOTE_BODY_TIME, SIGNED_REMOTE_REQUEST_TIME }

    /** Requires independently proven authoritative time. Pinned SDK verified network requestDate
     * comes from a signed server header; cached/listener/device-verified values cannot reanchor time.
     * Production mapping and device fixtures remain M02 gates.
     */
    public static final class ClockAnchor {
        public final long remoteTimeMs, elapsedRealtimeMs; public final String bootToken; public final TimeProvenance provenance;
        public ClockAnchor(long remoteTimeMs, long elapsedRealtimeMs, String bootToken, TimeProvenance provenance) {
            if (remoteTimeMs < 0 || elapsedRealtimeMs < 0) throw new IllegalArgumentException("Invalid clock anchor");
            this.provenance = Objects.requireNonNull(provenance);
            this.remoteTimeMs = remoteTimeMs; this.elapsedRealtimeMs = elapsedRealtimeMs;
            this.bootToken = bootToken == null ? null : requiredText(bootToken);
        }
    }
    /** No wall-clock argument exists: changing the device date cannot extend cached subscription access. */
    public static Long trustedNow(ClockAnchor anchor, String currentBootToken, long elapsedRealtimeMs) {
        if (anchor == null || anchor.bootToken == null || !anchor.bootToken.equals(currentBootToken)
                || elapsedRealtimeMs < anchor.elapsedRealtimeMs) return null;
        long delta = elapsedRealtimeMs - anchor.elapsedRealtimeMs;
        if (delta > Long.MAX_VALUE - anchor.remoteTimeMs) return null;
        return anchor.remoteTimeMs + delta;
    }

    /** Integrity applies to cached records; fresh verified in-memory records remain usable after a disk failure.
     * generation identifies the configured billing/customer owner, NOT an Activity attachment.
     */
    public static final class StoreRecord {
        public final Store store; public final String generation; public final ClockAnchor clock;
        public final long requestSequence;
        public final boolean integrityValid;
        public StoreRecord(Store store, String generation, long requestSequence, ClockAnchor clock, boolean integrityValid) {
            this.store = Objects.requireNonNull(store); this.generation = requiredText(generation);
            if (requestSequence < 0) throw new IllegalArgumentException("Invalid owner request sequence");
            this.requestSequence = requestSequence;
            this.clock = clock; this.integrityValid = integrityValid;
            if (clock != null && store.verification != Verification.REMOTE)
                throw new IllegalArgumentException("Unverified evidence cannot carry trusted anchor");
        }
    }
    public enum Acceptance { ACCEPTED, MISSING, UNTRUSTED, WRONG_GENERATION, STALE, CONFLICT }
    public static final class Update {
        public final StoreRecord record; public final Acceptance acceptance;
        Update(StoreRecord record, Acceptance acceptance) { this.record = record; this.acceptance = acceptance; }
    }
    private static boolean trusted(StoreRecord record, String generation) {
        return record != null && record.integrityValid && record.store.verification == Verification.REMOTE
                && record.store.fetchedAtMs != null && record.generation.equals(generation);
    }
    /** Serialized native request sequence excludes stale callbacks. SDK dates do not order authority.
     * This is not a provider version or proof that Play has propagated an update.
     */
    public static Update accept(StoreRecord previous, StoreRecord incoming, String generation) {
        requiredText(generation);
        StoreRecord retained = trusted(previous, generation) ? previous : null;
        if (incoming == null) return new Update(retained, Acceptance.MISSING);
        if (!incoming.generation.equals(generation)) return new Update(retained, Acceptance.WRONG_GENERATION);
        if (!trusted(incoming, generation)) return new Update(retained, Acceptance.UNTRUSTED);
        if (retained != null) {
            int order = Long.compare(incoming.requestSequence, retained.requestSequence);
            if (order == 0) return new Update(retained, Acceptance.CONFLICT);
            if (order < 0) return new Update(retained, Acceptance.STALE);
        }
        return new Update(incoming, Acceptance.ACCEPTED);
    }

    /** freshRemoteCheck means an accepted fresh remote response for this evaluation, never cache presence.
     * A controller must clear it for subsequent offline/cache evaluations; it is not a durable grant flag.
     */
    public static BillingSnapshot snapshot(String controllerEpoch, long sequence, String generation,
            Legacy legacy, StoreRecord record, String bootToken, long elapsedRealtimeMs,
            Operation operation, UnresolvedPurchase unresolved, boolean interactiveFlowOpen,
            boolean freshRemoteCheck, boolean managementAvailable, Issue issue, List<CatalogItem> catalog) {
        Objects.requireNonNull(legacy); Objects.requireNonNull(operation); Objects.requireNonNull(issue); Objects.requireNonNull(catalog);
        requiredText(generation);
        boolean remote = trusted(record, generation);
        Store store = remote ? record.store : Store.unknown();
        List<Source> sources = new ArrayList<>();
        // The sealed decision can be live in memory while persistence fails. Report persisted separately.
        if (legacy.status == LegacyStatus.ELIGIBLE) sources.add(Source.LEGACY_DEVICE);
        if (remote && store.lifetimeActive) sources.add(Source.STORE_LIFETIME);
        Long now = remote ? trustedNow(record.clock, bootToken, elapsedRealtimeMs) : null;
        // Fresh remote normalized activity is usable live. Offline cache requires proven time and known expiry.
        boolean knownExpired = now != null && store.expiresAtMs != null && now >= store.expiresAtMs;
        if (remote && store.subscriptionActive && !knownExpired && (freshRemoteCheck
                || (now != null && store.expiresAtMs != null && now < store.expiresAtMs)))
            sources.add(Source.SUBSCRIPTION);
        boolean busy = operation.isBusy() || interactiveFlowOpen;
        boolean productAvailable = false; Set<Plan> plans = new HashSet<>();
        for (CatalogItem item : catalog) {
            Objects.requireNonNull(item);
            if (!plans.add(item.key)) throw new IllegalArgumentException("Duplicate catalog plan");
            productAvailable |= item.available;
        }
        // This general capability does not authorize a specific plan: lifetime has additional gates below.
        // A definitive store rejection ends that attempt. It is feedback, not an
        // unresolved-payment barrier; a new intent still performs remote preflight.
        boolean retryableIssue = issue == Issue.NONE || issue == Issue.PRODUCT_UNAVAILABLE;
        boolean checkout = !busy && unresolved == null && remote && freshRemoteCheck && productAvailable
                && !store.lifetimeActive && legacy.status == LegacyStatus.INELIGIBLE && retryableIssue;
        return new BillingSnapshot(controllerEpoch, sequence, legacy, new Access(sources),
                new Capabilities(checkout, !busy, managementAvailable), operation, unresolved, store, issue, catalog);
    }

    public enum SubscriptionState { ACTIVE, GRACE, CANCELED_UNEXPIRED, EXPIRED, HOLD, PAUSED, UNKNOWN }
    public enum SubscriptionScope { CURRENT, HISTORY }
    /** Adapter-derived only: terminalHistoryProven must never be inferred from elapsed expiry alone. */
    public static final class SubscriptionObligation {
        public final SubscriptionState state; public final SubscriptionScope scope;
        public final boolean renewalDisabled, terminalHistoryProven;
        public SubscriptionObligation(SubscriptionState state, SubscriptionScope scope, boolean renewalDisabled, boolean terminalHistoryProven) {
            this.state = Objects.requireNonNull(state); this.scope = Objects.requireNonNull(scope);
            this.renewalDisabled = renewalDisabled; this.terminalHistoryProven = terminalHistoryProven;
        }
    }
    public enum LifetimeDecision { WAIT, ALREADY_OWNED, GIFT_PORTABILITY, REFRESH, MANAGE_PLAY, CONFIRM_IMMEDIATE_CHARGE }
    public static LifetimeDecision lifetimeCheckout(boolean busy, UnresolvedPurchase unresolved, boolean uncertain,
            boolean freshRemoteCheck, boolean productAvailable, boolean lifetimeActive, LegacyStatus legacy,
            List<SubscriptionObligation> subscriptions) {
        Objects.requireNonNull(legacy);
        if (busy || unresolved != null || uncertain) return LifetimeDecision.WAIT;
        if (lifetimeActive) return LifetimeDecision.ALREADY_OWNED;
        if (legacy == LegacyStatus.ELIGIBLE) return LifetimeDecision.GIFT_PORTABILITY;
        if (legacy == LegacyStatus.NEEDS_RECOVERY || !freshRemoteCheck || !productAvailable || subscriptions == null)
            return LifetimeDecision.REFRESH;
        for (SubscriptionObligation subscription : subscriptions) {
            if (subscription == null) return LifetimeDecision.MANAGE_PLAY;
            if (subscription.scope == SubscriptionScope.HISTORY && subscription.terminalHistoryProven) continue;
            if (!subscription.renewalDisabled || (subscription.state != SubscriptionState.CANCELED_UNEXPIRED
                    && subscription.state != SubscriptionState.EXPIRED)) return LifetimeDecision.MANAGE_PLAY;
        }
        return LifetimeDecision.CONFIRM_IMMEDIATE_CHARGE;
    }
    /** Adapter classification is explicit; network or receipt-post uncertainty must journal, never invite rebuy. */
    public enum Outcome { USER_CANCELED, PENDING, NETWORK_UNCERTAIN, RECEIPT_POST_UNCERTAIN, PRODUCT_UNAVAILABLE, CONFIGURATION, VERIFICATION }
    public static final class OutcomePolicy {
        public final OperationState state; public final Issue issue; public final PurchaseStage journalStage;
        public final boolean catalogUnavailable;
        OutcomePolicy(OperationState state, Issue issue, PurchaseStage journalStage, boolean catalogUnavailable) {
            this.state = state; this.issue = issue; this.journalStage = journalStage; this.catalogUnavailable = catalogUnavailable;
        }
    }
    public static OutcomePolicy outcome(Outcome outcome) {
        switch (Objects.requireNonNull(outcome)) {
            case USER_CANCELED: return new OutcomePolicy(OperationState.CANCELED, Issue.NONE, null, false);
            case PENDING: return new OutcomePolicy(OperationState.IDLE, Issue.PENDING, PurchaseStage.PENDING, false);
            case NETWORK_UNCERTAIN: case RECEIPT_POST_UNCERTAIN:
                return new OutcomePolicy(OperationState.IDLE, Issue.UNCERTAIN, PurchaseStage.UNCERTAIN, false);
            case PRODUCT_UNAVAILABLE: return new OutcomePolicy(OperationState.IDLE, Issue.PROVIDER, null, true);
            case CONFIGURATION: return new OutcomePolicy(OperationState.IDLE, Issue.PROVIDER, null, false);
            case VERIFICATION: return new OutcomePolicy(OperationState.IDLE, Issue.VERIFICATION, PurchaseStage.UNCERTAIN, false);
            default: throw new AssertionError(outcome);
        }
    }
}
