package com.nokialauncher.billing;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Immutable normalized bridge DTO v1. No provider JSON, receipt, token or Android dependency. */
public final class BillingSnapshot {
    public enum Plan { MONTHLY("monthly"), YEARLY("yearly"), LIFETIME("lifetime");
        public final String wire; Plan(String wire) { this.wire = wire; } }
    public enum LegacyStatus { ELIGIBLE("eligible"), INELIGIBLE("ineligible"), NEEDS_RECOVERY("needs_recovery");
        public final String wire; LegacyStatus(String wire) { this.wire = wire; } }
    public enum Verification { REMOTE("remote"), DEVICE("device"), UNVERIFIED("unverified");
        public final String wire; Verification(String wire) { this.wire = wire; } }
    public enum Issue { NONE("none"), OFFLINE("offline"), PROVIDER("provider"), STORAGE("storage"),
        VERIFICATION("verification"), PENDING("pending"), UNCERTAIN("uncertain"), UNKNOWN_SUBSCRIPTION("unknown_subscription"),
        PRODUCT_UNAVAILABLE("product_unavailable");
        public final String wire; Issue(String wire) { this.wire = wire; } }
    public enum OperationState { IDLE("idle"), CHECKING("checking"), CHECKOUT("checkout"), RESTORING("restoring"), COMPLETED("completed"), CANCELED("canceled");
        public final String wire; OperationState(String wire) { this.wire = wire; } }
    public enum PurchaseStage { PREPARED("prepared"), PENDING("pending"), UNCERTAIN("uncertain");
        public final String wire; PurchaseStage(String wire) { this.wire = wire; } }
    public enum RenewState { ON("on"), OFF("off"), UNKNOWN("unknown");
        public final String wire; RenewState(String wire) { this.wire = wire; } }
    public enum Source { LEGACY_DEVICE("legacyDevice"), STORE_LIFETIME("storeLifetime"), SUBSCRIPTION("subscription");
        public final String wire; Source(String wire) { this.wire = wire; } }

    public static final class Legacy {
        public final LegacyStatus status; public final boolean persisted;
        public Legacy(LegacyStatus status, boolean persisted) { this.status = Objects.requireNonNull(status); this.persisted = persisted; }
    }
    public static final class Operation {
        public final String id; public final OperationState state; public final Plan plan;
        public Operation(String id, OperationState state, Plan plan) {
            this.state = Objects.requireNonNull(state); this.id = optionalText(id); this.plan = plan;
            if (state != OperationState.IDLE && id == null) throw new IllegalArgumentException("Operation requires id");
            if (state == OperationState.IDLE && (id != null || plan != null)) throw new IllegalArgumentException("Idle operation has no id/plan");
            if (state == OperationState.CHECKOUT && plan == null) throw new IllegalArgumentException("Checkout requires plan");
        }
        public boolean isBusy() { return state == OperationState.CHECKING || state == OperationState.CHECKOUT || state == OperationState.RESTORING; }
        public static Operation idle() { return new Operation(null, OperationState.IDLE, null); }
    }
    public static final class UnresolvedPurchase {
        public final String id; public final Plan plan; public final PurchaseStage stage;
        public UnresolvedPurchase(String id, Plan plan, PurchaseStage stage) {
            this.id = requiredText(id); this.plan = Objects.requireNonNull(plan); this.stage = Objects.requireNonNull(stage);
        }
    }
    public static final class Store {
        public final Verification verification; public final Long fetchedAtMs;
        public final boolean lifetimeActive, subscriptionActive, billingProblem;
        public final Long expiresAtMs, pausedUntilMs; public final RenewState renewState; public final Plan plan;
        public Store(Verification verification, Long fetchedAtMs, boolean lifetimeActive, boolean subscriptionActive,
                Long expiresAtMs, RenewState renewState, Plan plan, boolean billingProblem, Long pausedUntilMs) {
            this.verification = Objects.requireNonNull(verification); this.renewState = Objects.requireNonNull(renewState);
            nonnegative(fetchedAtMs); nonnegative(expiresAtMs); nonnegative(pausedUntilMs);
            if (verification != Verification.REMOTE && fetchedAtMs != null) throw new IllegalArgumentException("Only remote data has fetchedAtMs");
            if (verification == Verification.REMOTE && fetchedAtMs == null) throw new IllegalArgumentException("Remote data requires request date");
            this.fetchedAtMs = fetchedAtMs; this.lifetimeActive = lifetimeActive; this.subscriptionActive = subscriptionActive;
            this.expiresAtMs = expiresAtMs; this.plan = plan; this.billingProblem = billingProblem; this.pausedUntilMs = pausedUntilMs;
        }
        public static Store unknown() { return new Store(Verification.UNVERIFIED, null, false, false, null, RenewState.UNKNOWN, null, false, null); }
    }
    public static final class CatalogItem {
        public final Plan key; public final String title, priceText, periodText, catalogRevision; public final boolean available;
        public CatalogItem(Plan key, String title, String priceText, String periodText, boolean available, String catalogRevision) {
            this.key = Objects.requireNonNull(key); this.title = boundedText(title, 160, false);
            this.priceText = boundedText(priceText, 128, !available); this.periodText = boundedText(periodText, 128, true);
            this.catalogRevision = requiredText(catalogRevision); this.available = available;
        }
    }
    public static final class Access {
        public final boolean full; public final List<Source> sources;
        Access(List<Source> sources) { this.sources = immutable(sources); this.full = !sources.isEmpty(); }
    }
    public static final class Capabilities {
        public final boolean checkout, restore, manage;
        public final boolean existingFriendRecovery = true, nativeRecovery = true;
        Capabilities(boolean checkout, boolean restore, boolean manage) { this.checkout = checkout; this.restore = restore; this.manage = manage; }
    }

    public final int schema = 1;
    public final String controllerEpoch; public final long sequence;
    public final Legacy legacy; public final Access access; public final Capabilities capabilities;
    public final Operation operation; public final UnresolvedPurchase unresolvedPurchase;
    public final Store store; public final Issue issue; public final List<CatalogItem> catalog;
    BillingSnapshot(String epoch, long sequence, Legacy legacy, Access access, Capabilities capabilities,
            Operation operation, UnresolvedPurchase unresolved, Store store, Issue issue, List<CatalogItem> catalog) {
        this.controllerEpoch = requiredText(epoch);
        if (sequence < 0 || sequence > 9007199254740991L) throw new IllegalArgumentException("Invalid bridge sequence");
        this.sequence = sequence; this.legacy = legacy; this.access = access; this.capabilities = capabilities;
        this.operation = operation; this.unresolvedPurchase = unresolved; this.store = store; this.issue = issue; this.catalog = immutable(catalog);
    }

    /** Fresh detached structure for the future bridge serializer; no mutable reference reaches policy state. */
    public Map<String, Object> toMap() {
        List<String> sources = new ArrayList<>(); for (Source source : access.sources) sources.add(source.wire);
        List<Map<String, Object>> items = new ArrayList<>();
        for (CatalogItem item : catalog) items.add(map("key", item.key.wire, "title", item.title, "priceText", item.priceText,
                "periodText", item.periodText, "available", item.available, "catalogRevision", item.catalogRevision));
        return map("schema", schema, "controllerEpoch", controllerEpoch, "sequence", sequence,
            "legacy", map("status", legacy.status.wire, "persisted", legacy.persisted),
            "access", map("full", access.full, "sources", sources),
            "capabilities", map("checkout", capabilities.checkout, "restore", capabilities.restore, "manage", capabilities.manage,
                "existingFriendRecovery", true, "nativeRecovery", true),
            "operation", map("id", operation.id, "state", operation.state.wire, "plan", operation.plan == null ? null : operation.plan.wire),
            "unresolvedPurchase", unresolvedPurchase == null ? null : map("id", unresolvedPurchase.id, "plan", unresolvedPurchase.plan.wire, "stage", unresolvedPurchase.stage.wire),
            "store", map("verification", store.verification.wire, "fetchedAtMs", store.fetchedAtMs, "lifetimeActive", store.lifetimeActive,
                "subscriptionActive", store.subscriptionActive, "expiresAtMs", store.expiresAtMs, "renewState", store.renewState.wire,
                "plan", store.plan == null ? null : store.plan.wire, "billingProblem", store.billingProblem, "pausedUntilMs", store.pausedUntilMs),
            "issue", issue.wire, "catalog", items);
    }
    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]); return result;
    }
    static String requiredText(String text) {
        return boundedText(text, 128, false);
    }
    private static String boundedText(String text, int max, boolean allowEmpty) {
        if (text == null || (!allowEmpty && text.isEmpty())
                || (!text.isEmpty() && text.trim().isEmpty()) || text.length() > max)
            throw new IllegalArgumentException("Invalid identifier/text");
        for (int i = 0; i < text.length(); i++) if (text.charAt(i) < 32 || text.charAt(i) == 127)
            throw new IllegalArgumentException("Control character in text");
        return text;
    }
    private static String optionalText(String text) { return text == null ? null : requiredText(text); }
    private static void nonnegative(Long value) {
        if (value != null && (value < 0 || value > 9007199254740991L)) throw new IllegalArgumentException("Invalid bridge time");
    }
    private static <T> List<T> immutable(List<T> values) {
        Objects.requireNonNull(values); List<T> copy = new ArrayList<>(); for (T value : values) copy.add(Objects.requireNonNull(value));
        return Collections.unmodifiableList(copy);
    }
}
