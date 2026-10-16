package com.nokialauncher.billing;

import com.android.billingclient.api.ProductDetails;
import com.revenuecat.purchases.Offering;
import com.revenuecat.purchases.Offerings;
import com.revenuecat.purchases.Package;
import com.revenuecat.purchases.ProductType;
import com.revenuecat.purchases.models.GoogleStoreProduct;
import com.revenuecat.purchases.models.GoogleSubscriptionOption;
import com.revenuecat.purchases.models.Period;
import com.revenuecat.purchases.models.Price;
import com.revenuecat.purchases.models.PricingPhase;
import com.revenuecat.purchases.models.RecurrenceMode;
import com.revenuecat.purchases.models.SubscriptionOption;
import com.revenuecat.purchases.models.StoreProduct;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Immutable, native-only SDK catalog. Mapping is not permission to launch checkout.
 * The serialized controller replaces this object on every fetch/failure. Future checkout resolves
 * the selected revision immediately before preparing its durable checkout journal.
 */
public final class RevenueCatCatalog {
    public static final class Selection {
        public final Plan plan;
        public final String productId, basePlanId, optionId, revision;
        public final Package sdkPackage;
        public final GoogleStoreProduct product;
        // Never purchase a subscription Package/defaultOption: it may choose a trial.
        public final GoogleSubscriptionOption option;
        public final ProductDetails.OneTimePurchaseOfferDetails oneTimeOption;
        private Selection(Plan plan, Package sdkPackage, GoogleStoreProduct product,
                GoogleSubscriptionOption option, ProductDetails.OneTimePurchaseOfferDetails oneTimeOption, String revision) {
            this.plan = plan; this.sdkPackage = sdkPackage; this.product = product; this.option = option;
            this.productId = product.getProductId(); this.basePlanId = product.getBasePlanId();
            this.oneTimeOption = oneTimeOption;
            this.optionId = option == null ? oneTimeOption.getPurchaseOptionId() : option.getId(); this.revision = revision;
        }
    }

    private final Map<Plan, Selection> selections;
    public final List<CatalogItem> items;
    private RevenueCatCatalog(Map<Plan, Selection> selections, List<CatalogItem> items) {
        this.selections = Collections.unmodifiableMap(new EnumMap<>(selections));
        this.items = Collections.unmodifiableList(new ArrayList<>(items));
    }

    /** Missing price remains visible as an unavailable card with no invented price. */
    public static RevenueCatCatalog unavailable() {
        EnumMap<Plan, Selection> selections = new EnumMap<>(Plan.class);
        List<CatalogItem> items = new ArrayList<>();
        for (Plan plan : Plan.values()) items.add(unavailableItem(plan));
        return new RevenueCatCatalog(selections, items);
    }

    public Selection resolve(Plan plan, String revision) {
        Selection selection = selections.get(plan);
        return selection != null && selection.revision.equals(revision) ? selection : null;
    }

    /** Rebuild from direct Play rows, retaining only native prior offering/package identity.
     * Never copy price, options, defaults, tokens or ProductDetails from the previous catalog.
     */
    static RevenueCatCatalog requery(RevenueCatCatalog prior, List<StoreProduct> products,
            BillingProviderConfig config) {
        if (prior == null || products == null || config == null || !config.isConfigured()) return unavailable();
        List<Package> packages = new ArrayList<>();
        for (StoreProduct row : products) {
            if (!(row instanceof GoogleStoreProduct)) return unavailable();
            GoogleStoreProduct product = (GoogleStoreProduct) row;
            if (!config.subscriptionProduct.equals(product.getProductId())
                    && !config.lifetimeProduct.equals(product.getProductId())) return unavailable();
        }
        for (Plan plan : Plan.values()) {
            Selection previous = prior.selections.get(plan);
            if (previous == null) continue;
            if (!matches(plan, previous.product, config)
                    || !config.offering.equals(previous.sdkPackage.getPresentedOfferingContext().getOfferingIdentifier()))
                return unavailable();
            for (StoreProduct row : products) {
                GoogleStoreProduct fresh = (GoogleStoreProduct) row;
                if (!matches(plan, fresh, config)) continue;
                GoogleStoreProduct bound = (GoogleStoreProduct) fresh.copyWithPresentedOfferingContext(
                        previous.sdkPackage.getPresentedOfferingContext());
                packages.add(new Package(previous.sdkPackage.getIdentifier(), previous.sdkPackage.getPackageType(),
                        bound, previous.sdkPackage.getPresentedOfferingContext()));
            }
        }
        Offering offering = new Offering(config.offering, "", Collections.emptyMap(), packages);
        return map(new Offerings(offering, Collections.singletonMap(config.offering, offering)), config);
    }

    public static RevenueCatCatalog map(Offerings offerings, BillingProviderConfig config) {
        if (offerings == null || config == null || !config.isConfigured()) return unavailable();
        // Never consult current, targeting, placements or another offering as a fallback.
        Offering offering = offerings.getAll().get(config.offering);
        if (offering == null || !config.offering.equals(offering.getIdentifier())) return unavailable();
        EnumMap<Plan, Selection> selections = new EnumMap<>(Plan.class);
        List<CatalogItem> items = new ArrayList<>();
        for (Plan plan : Plan.values()) {
            Package match = null; boolean duplicate = false;
            for (Package candidate : offering.getAvailablePackages()) {
                if (!(candidate.getProduct() instanceof GoogleStoreProduct)) continue;
                GoogleStoreProduct product = (GoogleStoreProduct) candidate.getProduct();
                if (!matches(plan, product, config)) continue;
                if (match != null) duplicate = true;
                match = candidate;
            }
            if (match == null || duplicate) { items.add(unavailableItem(plan)); continue; }
            try {
                GoogleStoreProduct product = (GoogleStoreProduct) match.getProduct();
                if (!config.offering.equals(match.getPresentedOfferingContext().getOfferingIdentifier()))
                    throw new IllegalArgumentException("Offering mismatch");
                if (product.getPresentedOfferingContext() == null
                        || !config.offering.equals(product.getPresentedOfferingContext().getOfferingIdentifier()))
                    throw new IllegalArgumentException("Product offering mismatch");
                GoogleSubscriptionOption option = null;
                ProductDetails.OneTimePurchaseOfferDetails oneTimeOption = null;
                Price price = product.getPrice(); String period = null;
                String disclosure = "One-time payment";
                if (plan != Plan.LIFETIME) {
                    if (product.getSubscriptionOptions() == null) throw new IllegalArgumentException("Missing options");
                    for (SubscriptionOption candidate : product.getSubscriptionOptions()) {
                        if (!(candidate instanceof GoogleSubscriptionOption)) continue;
                        GoogleSubscriptionOption google = (GoogleSubscriptionOption) candidate;
                        if (google.getOfferId() != null || !product.getBasePlanId().equals(google.getBasePlanId())) continue;
                        if (option != null) throw new IllegalArgumentException("Ambiguous base option");
                        option = google;
                    }
                    if (option == null || !product.getProductId().equals(option.getProductId())
                            || !product.getBasePlanId().equals(option.getId())
                            || option.getInstallmentsInfo() != null || option.getPricingPhases().size() != 1
                            || option.getPresentedOfferingContext() == null
                            || !config.offering.equals(option.getPresentedOfferingContext().getOfferingIdentifier())
                            || option.getOfferToken().trim().isEmpty())
                        throw new IllegalArgumentException("Unsupported option");
                    PricingPhase phase = option.getPricingPhases().get(0);
                    period = plan == Plan.MONTHLY ? "P1M" : "P1Y";
                    if (phase.getRecurrenceMode() != RecurrenceMode.INFINITE_RECURRING
                            || (phase.getBillingCycleCount() != null && phase.getBillingCycleCount() != 0)
                            || !exactPeriod(phase.getBillingPeriod(), plan)
                            || !exactPeriod(product.getPeriod(), plan))
                        throw new IllegalArgumentException("Unsupported payment period");
                    price = phase.getPrice();
                    if (!samePrice(price, product.getPrice())) throw new IllegalArgumentException("Price mismatch");
                    disclosure = plan == Plan.MONTHLY ? "per month; auto-renews until canceled" : "per year; auto-renews until canceled";
                } else {
                    if (product.getPeriod() != null || product.getSubscriptionOptions() != null
                            || product.getDefaultOption() != null) throw new IllegalArgumentException("Recurring lifetime");
                    ProductDetails details = product.getProductDetails();
                    List<ProductDetails.OneTimePurchaseOfferDetails> offers = details.getOneTimePurchaseOfferDetailsList();
                    if (!product.getProductId().equals(details.getProductId()) || !"inapp".equals(details.getProductType())
                            || offers == null || offers.size() != 1)
                        throw new IllegalArgumentException("Missing or ambiguous one-time option");
                    oneTimeOption = offers.get(0);
                    // Current Play8 BUY contract only. Old schema without purchaseOptionId
                    // is unavailable; no fabricated product-ID substitute for an option.
                    requiredText(oneTimeOption.getPurchaseOptionId());
                    if (oneTimeOption.getOfferToken() == null || oneTimeOption.getOfferToken().trim().isEmpty())
                        throw new IllegalArgumentException("Missing one-time checkout token");
                    ProductDetails.OneTimePurchaseOfferDetails selected = details.getOneTimePurchaseOfferDetails();
                    // RC calls Play setProductDetails, which copies this singular row's
                    // token. Prove that route targets exactly the validated unique BUY.
                    if (selected == null || !oneTimeOption.getPurchaseOptionId().equals(selected.getPurchaseOptionId())
                            || !oneTimeOption.getOfferToken().equals(selected.getOfferToken())
                            || oneTimeOption.getPriceAmountMicros() != selected.getPriceAmountMicros()
                            || !oneTimeOption.getPriceCurrencyCode().equals(selected.getPriceCurrencyCode())
                            || !oneTimeOption.getFormattedPrice().equals(selected.getFormattedPrice()))
                        throw new IllegalArgumentException("One-time SDK selection mismatch");
                    if (oneTimeOption.getOfferId() != null || oneTimeOption.getRentalDetails() != null
                            || oneTimeOption.getPreorderDetails() != null || oneTimeOption.getDiscountDisplayInfo() != null
                            || oneTimeOption.getFullPriceMicros() != null || oneTimeOption.getValidTimeWindow() != null
                            || oneTimeOption.getLimitedQuantityInfo() != null)
                        throw new IllegalArgumentException("Unsupported one-time purchase terms");
                    if (price == null || price.getAmountMicros() != oneTimeOption.getPriceAmountMicros()
                            || !price.getCurrencyCode().equals(oneTimeOption.getPriceCurrencyCode())
                            || !price.getFormatted().equals(oneTimeOption.getFormattedPrice()))
                        throw new IllegalArgumentException("One-time price mismatch");
                }
                String revision = BillingCatalogRevision.create(plan, product.getProductId(), product.getBasePlanId(),
                        option == null ? oneTimeOption.getPurchaseOptionId() : option.getId(), price.getAmountMicros(),
                        price.getCurrencyCode(), period, price.getFormatted(), disclosure);
                revision = BillingCatalogRevision.bindSelection(revision, config.offering, match.getIdentifier());
                Selection selection = new Selection(plan, match, product, option, oneTimeOption, revision);
                selections.put(plan, selection);
                items.add(new CatalogItem(plan, title(plan), price.getFormatted(), disclosure, true, revision));
            } catch (IllegalArgumentException | NullPointerException invalid) {
                selections.remove(plan); items.add(unavailableItem(plan));
            }
        }
        return new RevenueCatCatalog(selections, items);
    }

    private static boolean matches(Plan plan, GoogleStoreProduct product, BillingProviderConfig config) {
        if (plan == Plan.LIFETIME) return product.getType() == ProductType.INAPP
                && config.lifetimeProduct.equals(product.getProductId()) && product.getBasePlanId() == null;
        return product.getType() == ProductType.SUBS && config.subscriptionProduct.equals(product.getProductId())
                && (plan == Plan.MONTHLY ? config.monthlyPlan : config.yearlyPlan).equals(product.getBasePlanId());
    }
    private static boolean exactPeriod(Period period, Plan plan) {
        return period != null && period.getValue() == 1
                && period.getUnit() == (plan == Plan.MONTHLY ? Period.Unit.MONTH : Period.Unit.YEAR)
                && (plan == Plan.MONTHLY ? "P1M" : "P1Y").equals(period.getIso8601());
    }
    private static boolean samePrice(Price left, Price right) {
        return left != null && right != null && left.getAmountMicros() == right.getAmountMicros()
                && left.getCurrencyCode().equals(right.getCurrencyCode()) && left.getFormatted().equals(right.getFormatted());
    }
    private static String title(Plan plan) { return plan == Plan.MONTHLY ? "Monthly" : plan == Plan.YEARLY ? "Yearly" : "Lifetime"; }
    private static CatalogItem unavailableItem(Plan plan) {
        return new CatalogItem(plan, title(plan), "", "", false, "unavailable-" + plan.wire);
    }
}
