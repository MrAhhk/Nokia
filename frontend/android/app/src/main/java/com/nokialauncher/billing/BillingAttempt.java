package com.nokialauncher.billing;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Native purchase journal. No timeout, full-access boolean or Restore operation can resolve it.
 * Receipt identity must come from a proven public SDK mapping using the same identity namespace
 * as baselineIds; the class cannot verify a receipt and never starts checkout.
 * ownerEpoch identifies the stable customer/catalog configuration, not a random process/UI ID.
 * Adapter capability gates must prove complete baseline capture and definitive cancellation.
 */
public final class BillingAttempt {
    public enum State { PREPARED, PENDING, UNCERTAIN, COMPLETED, CANCELED }
    private static final long MAX_SAFE = 9007199254740991L;
    public final String id, ownerEpoch, productId, basePlanId;
    public final Plan plan;
    public final long startedAtMs;
    public final State state;
    public final Set<String> baselineIds;
    public final String resolvedTransactionId;

    private BillingAttempt(String id, String ownerEpoch, Plan plan, String productId, String basePlanId,
            long startedAtMs, State state, Set<String> baselineIds, String resolvedTransactionId) {
        this.id = requiredText(id); this.ownerEpoch = requiredText(ownerEpoch);
        this.plan = Objects.requireNonNull(plan); this.productId = requiredText(productId);
        this.basePlanId = basePlanId == null ? null : requiredText(basePlanId);
        if ((plan == Plan.LIFETIME) != (basePlanId == null))
            throw new IllegalArgumentException("Product/base-plan mismatch");
        if (startedAtMs < 0 || startedAtMs > MAX_SAFE) throw new IllegalArgumentException("Invalid journal time");
        this.startedAtMs = startedAtMs; this.state = Objects.requireNonNull(state);
        Objects.requireNonNull(baselineIds);
        if (baselineIds.size() > 256) throw new IllegalArgumentException("Unbounded transaction baseline");
        Set<String> copy = new LinkedHashSet<>();
        for (String receipt : baselineIds) copy.add(requiredText(receipt));
        this.baselineIds = Collections.unmodifiableSet(copy);
        this.resolvedTransactionId = resolvedTransactionId == null ? null : requiredText(resolvedTransactionId);
        if ((state == State.COMPLETED) != (resolvedTransactionId != null))
            throw new IllegalArgumentException("Completion requires transaction evidence");
        if (resolvedTransactionId != null && copy.contains(resolvedTransactionId))
            throw new IllegalArgumentException("Old transaction cannot complete a new attempt");
    }

    public static BillingAttempt prepare(String id, String epoch, Plan plan, String product,
            String basePlan, long startedAt, Set<String> knownTransactionIds) {
        return new BillingAttempt(id, epoch, plan, product, basePlan, startedAt,
                State.PREPARED, knownTransactionIds, null);
    }

    public boolean unresolved() { return state != State.COMPLETED && state != State.CANCELED; }

    public UnresolvedPurchase barrier() {
        if (!unresolved()) return null;
        PurchaseStage stage = state == State.PREPARED ? PurchaseStage.PREPARED
                : state == State.PENDING ? PurchaseStage.PENDING : PurchaseStage.UNCERTAIN;
        return new UnresolvedPurchase(id, plan, stage);
    }

    /** Callback must name the purchase, not a simultaneous Restore/request operation. */
    public BillingAttempt recordUnresolved(String purchaseId, State stage) {
        if (stage != State.PENDING && stage != State.UNCERTAIN)
            throw new IllegalArgumentException("Invalid unresolved transition");
        if (!id.equals(purchaseId) || !unresolved()) return this;
        return copy(stage, null);
    }

    /** Call only for an SDK result that proves this checkout was canceled, not generic errors. */
    public BillingAttempt definitiveUserCancel(String purchaseId) {
        if (!id.equals(purchaseId) || !unresolved()) return this;
        return copy(State.CANCELED, null);
    }

    /** Only the live native owner may call BEFORE invoking its purchase transport.
     * PREPARED restored after process death is not proof that checkout never launched.
     * CANCELED here means preparation aborted without launch, not an SDK cancellation.
     */
    BillingAttempt abortUnlaunchedPreparation(String purchaseId) {
        if (!id.equals(purchaseId) || state != State.PREPARED) return this;
        return copy(State.CANCELED, null);
    }

    /** Live checkout callback only: Play ITEM_UNAVAILABLE rejects the purchase.
     * Never use this to clear a recovered, pending or uncertain attempt.
     * CANCELED is the existing persisted terminal state for an aborted attempt;
     * the controller separately reports store rejection, not user cancellation.
     */
    BillingAttempt rejectUnavailableProduct(String purchaseId) {
        if (!id.equals(purchaseId) || state != State.PREPARED) return this;
        return copy(State.CANCELED, null);
    }

    public static final class Receipt {
        public final String ownerEpoch, transactionId, productId, basePlanId;
        public final Plan plan;
        public final Verification verification;
        public Receipt(String epoch, String transactionId, Plan plan, String product, String basePlan,
                Verification verification) {
            this.ownerEpoch = requiredText(epoch); this.transactionId = requiredText(transactionId);
            this.productId = requiredText(product); this.plan = Objects.requireNonNull(plan);
            this.basePlanId = basePlan == null ? null : requiredText(basePlan);
            this.verification = Objects.requireNonNull(verification);
        }
    }

    /** Idempotent reconciliation independent of local operation/UI state or device purchase-date ordering. */
    public BillingAttempt reconcile(Receipt receipt) {
        if (receipt == null || state == State.COMPLETED || receipt.verification != Verification.REMOTE
                || !ownerEpoch.equals(receipt.ownerEpoch) || plan != receipt.plan
                || !productId.equals(receipt.productId) || !Objects.equals(basePlanId, receipt.basePlanId)
                || baselineIds.contains(receipt.transactionId)) return this;
        return copy(State.COMPLETED, receipt.transactionId);
    }

    private BillingAttempt copy(State next, String transaction) {
        return new BillingAttempt(id, ownerEpoch, plan, productId, basePlanId, startedAtMs,
                next, baselineIds, transaction);
    }

    /** Private normalized persistence DTO. Never exposed through the public JS bridge. */
    public Map<String, Object> toMap() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("schema", 1); out.put("id", id); out.put("ownerEpoch", ownerEpoch);
        out.put("plan", plan.wire); out.put("productId", productId); out.put("basePlanId", basePlanId);
        out.put("startedAtMs", startedAtMs); out.put("state", state.name());
        out.put("baselineIds", new ArrayList<>(baselineIds)); out.put("resolvedTransactionId", resolvedTransactionId);
        return out;
    }

    public static BillingAttempt fromMap(Map<String, ?> input) {
        Objects.requireNonNull(input);
        Set<String> expected = new LinkedHashSet<>(); Collections.addAll(expected,
                "schema", "id", "ownerEpoch", "plan", "productId", "basePlanId", "startedAtMs",
                "state", "baselineIds", "resolvedTransactionId");
        if (!input.keySet().equals(expected) || number(input.get("schema")) != 1)
            throw new IllegalArgumentException("Unknown journal schema");
        Plan plan = null; for (Plan item : Plan.values()) if (item.wire.equals(input.get("plan"))) plan = item;
        if (plan == null || !(input.get("baselineIds") instanceof List))
            throw new IllegalArgumentException("Invalid journal metadata");
        List<?> raw = (List<?>) input.get("baselineIds");
        if (raw.size() > 256) throw new IllegalArgumentException("Unbounded transaction baseline");
        Set<String> baseline = new LinkedHashSet<>();
        for (Object item : raw) if (!baseline.add(string(item)))
            throw new IllegalArgumentException("Duplicate transaction baseline");
        return new BillingAttempt(string(input.get("id")), string(input.get("ownerEpoch")), plan,
                string(input.get("productId")), nullableString(input.get("basePlanId")),
                number(input.get("startedAtMs")), State.valueOf(string(input.get("state"))),
                baseline, nullableString(input.get("resolvedTransactionId")));
    }

    private static String string(Object value) {
        if (!(value instanceof String)) throw new IllegalArgumentException("Invalid journal string");
        return requiredText((String) value);
    }
    private static String nullableString(Object value) { return value == null ? null : string(value); }
    private static long number(Object value) {
        if (!(value instanceof Byte || value instanceof Short || value instanceof Integer || value instanceof Long))
            throw new IllegalArgumentException("Invalid journal integer");
        long number = ((Number) value).longValue();
        if (number < 0 || number > MAX_SAFE) throw new IllegalArgumentException("Invalid journal integer");
        return number;
    }
}
