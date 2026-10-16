package com.nokialauncher.billing;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.EntitlementInfo;
import com.revenuecat.purchases.SubscriptionInfo;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import com.revenuecat.purchases.models.Transaction;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Native evidence from an owner-issued FETCH_CURRENT. No purchase or journal mutation.
 * Baseline contains all exposed configured IDs, not complete Play history/pending inventory.
 * Future checkout must correlate receipt dates with signed preparation time, not full rights.
 */
public final class RevenueCatReceiptMapper {
    public interface Callback { void complete(Result result, Issue failure); }
    public static final class DatedReceipt {
        public final BillingAttempt.Receipt receipt;
        public final long purchaseDateMs;
        private DatedReceipt(BillingAttempt.Receipt receipt, long date) {
            this.receipt = receipt; this.purchaseDateMs = date;
        }
    }
    public static final class Result {
        public final BillingController.Record record;
        public final Set<String> baselineIds;
        public final List<DatedReceipt> receipts;
        private final BillingProviderConfig config;
        private Result(BillingController.Record record, Set<String> ids, List<DatedReceipt> receipts,
                BillingProviderConfig config) {
            this.config = config;
            this.record = record;
            this.baselineIds = Collections.unmodifiableSet(new LinkedHashSet<>(ids));
            this.receipts = Collections.unmodifiableList(new ArrayList<>(receipts));
        }
        /** Actor must check rights/obligations, selection freshness and persist before launch.
         * Uses signed response time, never device wall time. This alone is not launch approval.
         */
        public BillingAttempt prepareAttempt(String operationId, RevenueCatCatalog.Selection selection) {
            Objects.requireNonNull(selection);
            String expectedProduct = selection.plan == Plan.LIFETIME ? config.lifetimeProduct : config.subscriptionProduct;
            String expectedBase = selection.plan == Plan.LIFETIME ? null
                    : selection.plan == Plan.MONTHLY ? config.monthlyPlan : config.yearlyPlan;
            if (!expectedProduct.equals(selection.productId) || !Objects.equals(expectedBase, selection.basePlanId)
                    || !config.offering.equals(selection.sdkPackage.getPresentedOfferingContext().getOfferingIdentifier()))
                throw new IllegalArgumentException("Selection configuration mismatch");
            return BillingAttempt.prepare(operationId, record.ownerEpoch, selection.plan,
                    selection.productId, selection.basePlanId, record.store.fetchedAtMs, baselineIds);
        }
        /** Only for attempts prepared through the qualified factory above and durable native store.
         * Strictly newer purchase time and exactly one matching new receipt are required.
         * Same-timestamp ambiguity remains unresolved; no timeout or empty inventory clears it.
         * Caller persists qualified rights before persisting the returned resolved attempt.
         */
        public BillingAttempt reconcileAttempt(BillingAttempt attempt) {
            Objects.requireNonNull(attempt);
            if (!attempt.unresolved() || !record.ownerEpoch.equals(attempt.ownerEpoch)
                    || record.store.fetchedAtMs <= attempt.startedAtMs) return attempt;
            BillingAttempt resolved = null;
            for (DatedReceipt candidate : receipts) {
                if (candidate.purchaseDateMs <= attempt.startedAtMs) continue;
                BillingAttempt next = attempt.reconcile(candidate.receipt);
                if (next == attempt) continue;
                if (resolved != null) return attempt; // Multiple new matching transactions are ambiguous.
                resolved = next;
            }
            return resolved == null ? attempt : resolved;
        }
    }
    private final RevenueCatProvider.Transport transport;
    private final RevenueCatNormalizer normalizer;
    private final BillingProviderConfig config;
    private final BillingController.Time time;
    private final String owner;
    public RevenueCatReceiptMapper(RevenueCatAdapter adapter, BillingProviderConfig config,
            String owner, BillingController.Time time) {
        this(Objects.requireNonNull(adapter)::fetchCurrent, config, owner, time);
    }
    public RevenueCatReceiptMapper(RevenueCatProvider.Transport transport, BillingProviderConfig config,
            String owner, BillingController.Time time) {
        this.transport = Objects.requireNonNull(transport); this.config = Objects.requireNonNull(config);
        this.normalizer = new RevenueCatNormalizer(config); this.owner = requiredText(owner);
        this.time = Objects.requireNonNull(time);
    }
    public void fetchCurrent(Callback callback) {
        Objects.requireNonNull(callback);
        String boot = time.bootToken(); long elapsed = time.elapsedRealtimeMs();
        AtomicBoolean terminal = new AtomicBoolean();
        try {
            transport.fetchCurrent(new ReceiveCustomerInfoCallback() {
                @Override public void onReceived(CustomerInfo info) {
                    if (!terminal.compareAndSet(false, true)) return;
                    Result result;
                    try {
                        BillingController.Record record = normalizer.normalizeCurrent(info, owner, boot, elapsed,
                                time.bootToken(), time.elapsedRealtimeMs());
                        result = map(info, record);
                    } catch (RuntimeException invalid) { callback.complete(null, Issue.VERIFICATION); return; }
                    callback.complete(result, Issue.NONE);
                }
                @Override public void onError(PurchasesError ignored) {
                    if (terminal.compareAndSet(false, true)) callback.complete(null, Issue.PROVIDER);
                }
            });
        } catch (RuntimeException failure) {
            if (terminal.compareAndSet(false, true)) callback.complete(null, Issue.PROVIDER);
            else throw failure;
        }
    }
    private Result map(CustomerInfo info, BillingController.Record record) {
        Set<String> ids = new LinkedHashSet<>(); List<DatedReceipt> receipts = new ArrayList<>();
        long remote = info.getRequestDate().getTime();
        SubscriptionInfo sub = info.getSubscriptionsByProductIdentifier().get(config.subscriptionProduct);
        if (sub != null) {
            String id = identity("rc10:play-sub:", sub.getStoreTransactionId()); add(ids, id);
            long date = purchaseDate(sub.getPurchaseDate(), remote);
            Plan plan = config.monthlyPlan.equals(sub.getProductPlanIdentifier()) ? Plan.MONTHLY
                    : config.yearlyPlan.equals(sub.getProductPlanIdentifier()) ? Plan.YEARLY : null;
            if (plan == null) throw new IllegalArgumentException("Invalid plan");
            if (record.store.subscriptionActive) receipts.add(new DatedReceipt(new BillingAttempt.Receipt(
                    owner, id, plan, config.subscriptionProduct, sub.getProductPlanIdentifier(), Verification.REMOTE), date));
        }
        EntitlementInfo lifetime = info.getEntitlements().getAll().get(RevenueCatNormalizer.LIFETIME_ENTITLEMENT);
        for (Transaction transaction : info.getNonSubscriptionTransactions()) {
            if (transaction == null) throw new IllegalArgumentException("Invalid transaction");
            if (!config.lifetimeProduct.equals(transaction.getProductIdentifier())) continue;
            if (transaction.getStore() != com.revenuecat.purchases.Store.PLAY_STORE)
                throw new IllegalArgumentException("Invalid store");
            String id = identity("rc10:non-sub:", transaction.getTransactionIdentifier()); add(ids, id);
            long date = purchaseDate(transaction.getPurchaseDate(), remote);
            if (record.store.lifetimeActive && lifetime != null && date == lifetime.getLatestPurchaseDate().getTime())
                receipts.add(new DatedReceipt(new BillingAttempt.Receipt(owner, id, Plan.LIFETIME,
                        config.lifetimeProduct, null, Verification.REMOTE), date));
        }
        return new Result(record, ids, receipts, config);
    }
    private static String identity(String prefix, String id) { return requiredText(prefix + requiredText(id)); }
    private static void add(Set<String> ids, String id) {
        if (!ids.add(id) || ids.size() > 256) throw new IllegalArgumentException("Invalid transaction inventory");
    }
    private static long purchaseDate(Date date, long remote) {
        if (date == null || date.getTime() < 0 || date.getTime() > remote)
            throw new IllegalArgumentException("Invalid purchase date");
        return date.getTime();
    }
}
