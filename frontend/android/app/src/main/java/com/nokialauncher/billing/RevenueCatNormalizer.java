package com.nokialauncher.billing;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.EntitlementInfo;
import com.revenuecat.purchases.SubscriptionInfo;
import com.revenuecat.purchases.VerificationResult;
import com.revenuecat.purchases.models.Transaction;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingPolicy.*;

/** Public RevenueCat 10.24.0 mapping for an owner-issued FETCH_CURRENT callback only.
 * Cached/listener/restore payloads must not enter this method. Exact VERIFIED qualifies the
 * signed public requestDate (including 304 revalidation); SDK isActive/device date and the
 * cached raw body's request_date never establish authority. This mapper reads no raw JSON.
 */
public final class RevenueCatNormalizer {
    public static final String SUBSCRIPTION_ENTITLEMENT = "launcher_subscription";
    public static final String LIFETIME_ENTITLEMENT = "launcher_lifetime";
    private static final int MAX_RECORDS = 256;
    private static final long MAX_TIME = 9007199254740991L;
    private final BillingProviderConfig config;

    public RevenueCatNormalizer(BillingProviderConfig config) {
        this.config = Objects.requireNonNull(config);
        if (!config.isConfigured()) throw new IllegalArgumentException("billing_not_configured");
    }

    /** Invalid evidence throws; the provider converts this to VERIFICATION, retaining trusted cache.
     * request-start elapsed is deliberately conservative: response/network delay consumes access.
     * ownerEpoch is the controller's stable customer/configuration identity, not a product ID.
     */
    public BillingController.Record normalizeCurrent(CustomerInfo info, String ownerEpoch,
            String requestBootToken, long requestElapsedMs, String currentBootToken, long currentElapsedMs) {
        Objects.requireNonNull(info);
        if (info.getEntitlements().getVerification() != VerificationResult.VERIFIED)
            throw invalid();
        long remote = date(info.getRequestDate());
        ClockAnchor clock = new ClockAnchor(remote, requestElapsedMs, requestBootToken,
                TimeProvenance.SIGNED_REMOTE_REQUEST_TIME);
        Long now = trustedNow(clock, currentBootToken, currentElapsedMs);
        // BOOT_COUNT is unavailable on some supported devices. A fresh in-process callback can
        // use the monotonic request interval without claiming a reboot-safe persistent anchor.
        if (requestBootToken == null && currentBootToken == null && currentElapsedMs >= requestElapsedMs
                && currentElapsedMs - requestElapsedMs <= Long.MAX_VALUE - remote)
            now = remote + (currentElapsedMs - requestElapsedMs);
        if (now == null || now > MAX_TIME) throw invalid();
        Map<String, EntitlementInfo> entitlements = info.getEntitlements().getAll();
        bounded(entitlements);
        Map<String, SubscriptionInfo> subscriptions = info.getSubscriptionsByProductIdentifier();
        bounded(subscriptions);
        List<Transaction> transactions = info.getNonSubscriptionTransactions();
        if (transactions == null || transactions.size() > MAX_RECORDS) throw invalid();

        EntitlementInfo sub = entitlements.get(SUBSCRIPTION_ENTITLEMENT);
        EntitlementInfo lifetime = entitlements.get(LIFETIME_ENTITLEMENT);
        // A present null configured entry is malformed, not an authoritative revoke.
        if ((entitlements.containsKey(SUBSCRIPTION_ENTITLEMENT) && sub == null)
                || (entitlements.containsKey(LIFETIME_ENTITLEMENT) && lifetime == null)) throw invalid();
        SubscriptionInfo details = subscriptions.get(config.subscriptionProduct);
        if (subscriptions.containsKey(config.subscriptionProduct) && details == null) throw invalid();
        // The pinned SDK's SubscriptionInfo parser can swallow a serialization failure and
        // return a partial/empty map. Its independently parsed public date maps still expose
        // configured inventory. Omitted known inventory is uncertainty, never a verified revoke.
        boolean datedSubscription = knownSubscriptionDates(info.getAllPurchaseDatesByProduct(), true, remote);
        datedSubscription |= knownSubscriptionDates(info.getAllExpirationDatesByProduct(), false, remote);
        if (details == null && datedSubscription) throw invalid();

        boolean subscriptionActive = false, lifetimeActive = false, billingProblem = false;
        Long expiry = null, pausedUntil = null;
        Plan plan = null;
        RenewState renewal = RenewState.UNKNOWN;
        if (details != null) {
            if (!config.subscriptionProduct.equals(details.getProductIdentifier())
                    || details.getStore() != com.revenuecat.purchases.Store.PLAY_STORE) throw invalid();
            plan = plan(details.getProductPlanIdentifier());
            past(details.getPurchaseDate(), remote);
            optionalPast(details.getOriginalPurchaseDate(), remote);
            optionalDate(details.getExpiresDate());
            optionalDate(details.getGracePeriodExpiresDate());
            optionalPast(details.getUnsubscribeDetectedAt(), remote);
            optionalPast(details.getBillingIssuesDetectedAt(), remote);
            optionalPast(details.getRefundedAt(), remote);
            pausedUntil = optionalDate(details.getAutoResumeDate());
            billingProblem = details.getBillingIssuesDetectedAt() != null;
        }
        if (sub != null) {
            entitlement(sub, SUBSCRIPTION_ENTITLEMENT, config.subscriptionProduct, remote);
            Plan entitlementPlan = plan(sub.getProductPlanIdentifier());
            expiry = date(sub.getExpirationDate()); // Entitlement expiry preserves grace access semantics.
            if (expiry < date(sub.getLatestPurchaseDate()) || details == null || plan != entitlementPlan
                    || date(details.getPurchaseDate()) != date(sub.getLatestPurchaseDate())) throw invalid();
            plan = entitlementPlan;
            optionalPast(sub.getUnsubscribeDetectedAt(), remote);
            optionalPast(sub.getBillingIssueDetectedAt(), remote);
            billingProblem |= sub.getBillingIssueDetectedAt() != null;
            subscriptionActive = now < expiry && details.getRefundedAt() == null && pausedUntil == null;
            boolean consistent = Objects.equals(sub.getUnsubscribeDetectedAt(), details.getUnsubscribeDetectedAt())
                    && Objects.equals(sub.getBillingIssueDetectedAt(), details.getBillingIssuesDetectedAt())
                    && sub.getWillRenew() == details.getWillRenew()
                    && Objects.equals(sub.getExpirationDate(), details.getExpiresDate())
                    && !subscriptionDateBeyond(info.getAllExpirationDatesByProduct(), expiry);
            if (consistent && !billingProblem && pausedUntil == null && details.getRefundedAt() == null) {
                if (sub.getWillRenew() && sub.getUnsubscribeDetectedAt() == null) renewal = RenewState.ON;
                else if (!sub.getWillRenew() && sub.getUnsubscribeDetectedAt() != null) renewal = RenewState.OFF;
            }
        }
        // SubscriptionInfo alone cannot invent entitlement access or prove terminal Play history.
        // Its presence without the configured entitlement leaves renewal UNKNOWN for later checkout gates.
        if (lifetime != null) {
            entitlement(lifetime, LIFETIME_ENTITLEMENT, config.lifetimeProduct, remote);
            if (lifetime.getProductPlanIdentifier() != null
                    || lifetime.getBillingIssueDetectedAt() != null || lifetime.getUnsubscribeDetectedAt() != null)
                throw invalid();
            if (lifetime.getExpirationDate() != null) {
                long ended = date(lifetime.getExpirationDate());
                // A valid expired record can revoke a previous grant (for example a retained
                // refund record). A future finite Lifetime cannot establish the configured grant.
                if (ended < date(lifetime.getLatestPurchaseDate()) || ended > now) throw invalid();
            } else {
                for (Transaction transaction : transactions) {
                    if (transaction == null) throw invalid();
                    if (config.lifetimeProduct.equals(transaction.getProductIdentifier())) {
                        past(transaction.getPurchaseDate(), remote);
                        if (transaction.getStore() == com.revenuecat.purchases.Store.PLAY_STORE
                                && date(transaction.getPurchaseDate()) == date(lifetime.getLatestPurchaseDate()))
                            lifetimeActive = true;
                    }
                }
                if (!lifetimeActive) throw invalid();
            }
        }
        BillingSnapshot.Store store = new BillingSnapshot.Store(Verification.REMOTE, remote, lifetimeActive,
                subscriptionActive, expiry, renewal, plan, billingProblem, pausedUntil);
        return new BillingController.Record(ownerEpoch, store, clock);
    }

    private void entitlement(EntitlementInfo value, String id, String product, long remote) {
        if (!id.equals(value.getIdentifier()) || !product.equals(value.getProductIdentifier())
                || value.getStore() != com.revenuecat.purchases.Store.PLAY_STORE
                || value.getVerification() != VerificationResult.VERIFIED) throw invalid();
        past(value.getLatestPurchaseDate(), remote);
        past(value.getOriginalPurchaseDate(), remote);
        if (date(value.getOriginalPurchaseDate()) > date(value.getLatestPurchaseDate())) throw invalid();
    }
    private Plan plan(String id) {
        if (config.monthlyPlan.equals(id)) return Plan.MONTHLY;
        if (config.yearlyPlan.equals(id)) return Plan.YEARLY;
        throw invalid();
    }
    private boolean knownSubscriptionDates(Map<String, Date> dates, boolean purchase, long remote) {
        bounded(dates);
        boolean found = false;
        String prefix = config.subscriptionProduct + ":";
        for (Map.Entry<String, Date> entry : dates.entrySet()) {
            String id = entry.getKey();
            if (id == null) throw invalid();
            if (id.equals(config.subscriptionProduct) || id.startsWith(prefix)) {
                // Config IDs permit 200 characters; the combined public product:plan key can
                // therefore be 401. Do not truncate it to normalized owner/journal identifiers.
                if (id.length() > 401) throw invalid();
                if (id.startsWith(prefix)) plan(id.substring(prefix.length()));
                if (purchase) past(entry.getValue(), remote); else date(entry.getValue());
                found = true;
            }
        }
        return found;
    }
    /** Independent public history must not expose a later configured period than the
     * entitlement/detail pair used to declare cancellation. A conflict stays UNKNOWN.
     */
    private boolean subscriptionDateBeyond(Map<String, Date> dates, long expiry) {
        String prefix = config.subscriptionProduct + ":";
        for (Map.Entry<String, Date> entry : dates.entrySet()) {
            String id = entry.getKey();
            if ((config.subscriptionProduct.equals(id) || id.startsWith(prefix)) && date(entry.getValue()) > expiry)
                return true;
        }
        return false;
    }
    private static void bounded(Map<?, ?> map) {
        if (map == null || map.size() > MAX_RECORDS) throw invalid();
    }
    private static long date(Date value) {
        if (value == null || value.getTime() < 0 || value.getTime() > MAX_TIME) throw invalid();
        return value.getTime();
    }
    private static Long optionalDate(Date value) { return value == null ? null : date(value); }
    private static void past(Date value, long remote) { if (date(value) > remote) throw invalid(); }
    private static void optionalPast(Date value, long remote) { if (value != null) past(value, remote); }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("billing_verification_invalid"); }
}
