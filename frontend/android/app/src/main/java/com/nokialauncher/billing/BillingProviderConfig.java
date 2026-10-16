package com.nokialauncher.billing;

import com.nokialauncher.BuildConfig;

/** Public catalog identity. Missing configuration is not permission to charge. */
public final class BillingProviderConfig {
    public final String publicKey;
    public final String subscriptionProduct;
    public final String monthlyPlan;
    public final String yearlyPlan;
    public final String lifetimeProduct;
    public final String offering;

    public BillingProviderConfig(String publicKey, String subscriptionProduct, String monthlyPlan,
            String yearlyPlan, String lifetimeProduct, String offering) {
        this.publicKey = value(publicKey);
        this.subscriptionProduct = value(subscriptionProduct);
        this.monthlyPlan = value(monthlyPlan);
        this.yearlyPlan = value(yearlyPlan);
        this.lifetimeProduct = value(lifetimeProduct);
        this.offering = value(offering);
    }

    public static BillingProviderConfig fromBuild() {
        return new BillingProviderConfig(BuildConfig.BILLING_PUBLIC_KEY,
                BuildConfig.BILLING_SUBSCRIPTION_PRODUCT, BuildConfig.BILLING_MONTHLY_PLAN,
                BuildConfig.BILLING_YEARLY_PLAN, BuildConfig.BILLING_LIFETIME_PRODUCT,
                BuildConfig.BILLING_OFFERING);
    }

    public boolean isConfigured() {
        return publicKey.matches("goog_[A-Za-z0-9]+")
                && validPurchaseId(subscriptionProduct) && validPurchaseId(monthlyPlan) && validPurchaseId(yearlyPlan)
                && validPurchaseId(lifetimeProduct) && validId(offering)
                && !monthlyPlan.equals(yearlyPlan) && !subscriptionProduct.equals(lifetimeProduct);
    }

    public boolean hasSameIdentity(BillingProviderConfig other) {
        return other != null && publicKey.equals(other.publicKey)
                && subscriptionProduct.equals(other.subscriptionProduct)
                && monthlyPlan.equals(other.monthlyPlan) && yearlyPlan.equals(other.yearlyPlan)
                && lifetimeProduct.equals(other.lifetimeProduct) && offering.equals(other.offering);
    }

    private static String value(String input) { return input == null ? "" : input; }
    // Checkout must be journalable before it can launch. Keep purchase identities
    // inside the journal/bridge bound; the offering is never a receipt identity.
    private static boolean validPurchaseId(String input) {
        return input.length() <= 128 && validId(input);
    }
    private static boolean validId(String input) {
        return !input.isEmpty() && input.length() <= 200 && input.matches("[A-Za-z0-9_.:$-]+");
    }
}
