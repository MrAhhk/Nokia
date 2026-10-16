package com.nokialauncher.billing;

import com.android.billingclient.api.ProductDetails;
import com.revenuecat.purchases.Offering;
import com.revenuecat.purchases.Offerings;
import com.revenuecat.purchases.Package;
import com.revenuecat.purchases.PackageType;
import com.revenuecat.purchases.PresentedOfferingContext;
import com.revenuecat.purchases.ProductType;
import com.revenuecat.purchases.models.*;
import java.lang.reflect.Constructor;
import java.util.*;
import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Actual pinned RC public models/getters. Only Play's package-private JSON constructor
 * is reflected to construct a fixture with test-scope TextUtils.isEmpty substrate;
 * production does not call private SDK APIs.
 * These cases do not prove Play product availability or a successful purchase.
 */
public class RevenueCatCatalogTest {
    static final BillingProviderConfig CONFIG = new BillingProviderConfig("goog_public", "sub", "monthly", "yearly", "life", "main");
    static final Price PRICE = new Price("₫49,000", 49000000000L, "VND");
    static ProductDetails details(String id, boolean subscription) throws Exception {
        Constructor<ProductDetails> constructor = ProductDetails.class.getDeclaredConstructor(String.class);
        constructor.setAccessible(true);
        return constructor.newInstance("{\"productId\":\"" + id + "\",\"type\":\"" + (subscription ? "subs" : "inapp")
                + "\",\"name\":\"Nokia\",\"title\":\"Nokia\",\"description\":\"fixture\"}");
    }
    static Period period(Plan plan) { return new Period(1, plan == Plan.MONTHLY ? Period.Unit.MONTH : Period.Unit.YEAR, plan == Plan.MONTHLY ? "P1M" : "P1Y"); }
    static GoogleSubscriptionOption option(Plan plan, String offer, List<PricingPhase> phases) throws Exception {
        return new GoogleSubscriptionOption("sub", plan.wire, offer, phases, Collections.emptyList(),
                details("sub", true), "fixture-token", new PresentedOfferingContext("main", null, null), null);
    }
    static PricingPhase phase(Plan plan, Price price, RecurrenceMode recurrence) { return new PricingPhase(period(plan), recurrence, null, price); }
    static Package subscription(Plan plan, List<SubscriptionOption> options, Price price) throws Exception {
        GoogleStoreProduct product = new GoogleStoreProduct("sub", plan.wire, ProductType.SUBS, price,
                "Nokia", "Nokia", "fixture", period(plan), new SubscriptionOptions(options), options.get(0),
                details("sub", true), "main", new PresentedOfferingContext("main", null, null));
        return new Package(plan.wire, PackageType.CUSTOM, product, new PresentedOfferingContext("main", null, null));
    }
    static Package subscription(Plan plan) throws Exception {
        return subscription(plan, Collections.singletonList(option(plan, null, Collections.singletonList(phase(plan, PRICE, RecurrenceMode.INFINITE_RECURRING)))), PRICE);
    }
    static Package lifetime(Price price) throws Exception {
        return lifetime(price, new JSONArray().put(buyDetails(price)));
    }
    static JSONObject buyDetails(Price price) throws Exception {
        return new JSONObject().put("formattedPrice", price.getFormatted()).put("priceAmountMicros", price.getAmountMicros())
                .put("priceCurrencyCode", price.getCurrencyCode()).put("purchaseOptionId", "buy").put("offerIdToken", "fixture-buy-token");
    }
    static Package lifetime(Price price, JSONArray options) throws Exception {
        Constructor<ProductDetails> constructor = ProductDetails.class.getDeclaredConstructor(String.class);
        constructor.setAccessible(true);
        JSONObject json = new JSONObject().put("productId", "life").put("type", "inapp").put("name", "Nokia")
                .put("title", "Nokia").put("description", "fixture");
        if (options != null) json.put("oneTimePurchaseOfferDetailsList", options);
        ProductDetails details = constructor.newInstance(json.toString());
        GoogleStoreProduct product = new GoogleStoreProduct("life", null, ProductType.INAPP, price, "Nokia", "Nokia",
                "fixture", null, null, null, details, "main", new PresentedOfferingContext("main", null, null));
        return new Package("life", PackageType.LIFETIME, product, new PresentedOfferingContext("main", null, null));
    }
    static Offerings offerings(String id, Package... packages) {
        Offering offering = new Offering(id, "fixture", Collections.emptyMap(), Arrays.asList(packages));
        return new Offerings(offering, Collections.singletonMap(id, offering));
    }
    static CatalogItem item(RevenueCatCatalog catalog, Plan plan) { return catalog.items.get(plan.ordinal()); }
    @Test public void mapsThreeCardsFromRealLocalizedPriceAndRetainsExactNativeObjects() throws Exception {
        Package monthly = subscription(Plan.MONTHLY), yearly = subscription(Plan.YEARLY), life = lifetime(PRICE);
        RevenueCatCatalog catalog = RevenueCatCatalog.map(offerings("main", monthly, yearly, life), CONFIG);
        assertEquals(3, catalog.items.size());
        for (Plan plan : Plan.values()) {
            CatalogItem item = item(catalog, plan); assertTrue(item.available); assertEquals("₫49,000", item.priceText);
            assertNotNull(catalog.resolve(plan, item.catalogRevision));
        }
        RevenueCatCatalog.Selection selection = catalog.resolve(Plan.MONTHLY, item(catalog, Plan.MONTHLY).catalogRevision);
        assertSame(monthly, selection.sdkPackage); assertSame(monthly.getProduct(), selection.product);
        assertSame(monthly.getProduct().getDefaultOption(), selection.option);
        assertTrue(item(catalog, Plan.MONTHLY).periodText.contains("auto-renews"));
        assertEquals("One-time payment", item(catalog, Plan.LIFETIME).periodText);
        assertNull(catalog.resolve(Plan.MONTHLY, "stale"));
    }
    @Test public void unavailableRetainsThreeCardsWithoutReferencePrices() {
        RevenueCatCatalog catalog = RevenueCatCatalog.map(null, CONFIG);
        for (CatalogItem item : catalog.items) { assertFalse(item.available); assertEquals("", item.priceText); assertNull(catalog.resolve(item.key, item.catalogRevision)); }
        assertEquals(3, catalog.items.size());
    }
    @Test public void missingAllowlistedOfferingNeverFallsBackToCurrent() throws Exception {
        assertFalse(item(RevenueCatCatalog.map(offerings("other", subscription(Plan.MONTHLY)), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void missingOnePlanDoesNotHideOtherCards() throws Exception {
        RevenueCatCatalog catalog = RevenueCatCatalog.map(offerings("main", lifetime(PRICE)), CONFIG);
        assertFalse(item(catalog, Plan.MONTHLY).available); assertFalse(item(catalog, Plan.YEARLY).available); assertTrue(item(catalog, Plan.LIFETIME).available);
    }
    @Test public void duplicateMatchingPackagesAreUnavailable() throws Exception {
        Package p = subscription(Plan.MONTHLY);
        assertFalse(item(RevenueCatCatalog.map(offerings("main", p, p), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void trialIntroOfferAndPrepaidCannotBecomePurchasable() throws Exception {
        for (RecurrenceMode recurrence : new RecurrenceMode[]{RecurrenceMode.NON_RECURRING, RecurrenceMode.FINITE_RECURRING, RecurrenceMode.UNKNOWN}) {
            Package p = subscription(Plan.MONTHLY, Collections.singletonList(option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, recurrence)))), PRICE);
            assertFalse(item(RevenueCatCatalog.map(offerings("main", p), CONFIG), Plan.MONTHLY).available);
        }
        for (String offer : new String[]{"trial", "intro", ""}) {
            Package p = subscription(Plan.MONTHLY, Collections.singletonList(option(Plan.MONTHLY, offer, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)))), PRICE);
            assertFalse(item(RevenueCatCatalog.map(offerings("main", p), CONFIG), Plan.MONTHLY).available);
        }
        Package phased = subscription(Plan.MONTHLY, Collections.singletonList(option(Plan.MONTHLY, null,
                Arrays.asList(phase(Plan.MONTHLY, new Price("Free", 0, "VND"), RecurrenceMode.FINITE_RECURRING), phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)))), PRICE);
        assertFalse(item(RevenueCatCatalog.map(offerings("main", phased), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void explicitBaseOptionIgnoresSdkDefaultTrial() throws Exception {
        GoogleSubscriptionOption trial = option(Plan.MONTHLY, "trial", Arrays.asList(phase(Plan.MONTHLY, new Price("Free", 0, "VND"), RecurrenceMode.FINITE_RECURRING), phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        GoogleSubscriptionOption base = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        RevenueCatCatalog catalog = RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Arrays.asList(trial, base), PRICE)), CONFIG);
        assertTrue(item(catalog, Plan.MONTHLY).available); assertSame(base, catalog.resolve(Plan.MONTHLY, item(catalog, Plan.MONTHLY).catalogRevision).option);
    }
    @Test public void malformedOrFreePriceFailsClosed() throws Exception {
        for (Price price : new Price[]{new Price("", 123, "USD"), new Price("Free", 0, "USD"), new Price("$2", -1, "USD"), new Price("$2", 2000000, "$")}) {
            assertFalse(item(RevenueCatCatalog.map(offerings("main", lifetime(price)), CONFIG), Plan.LIFETIME).available);
        }
    }
    @Test public void wrongPeriodAndProductPhasePriceMismatchAreUnavailable() throws Exception {
        GoogleSubscriptionOption wrongPeriod = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.YEARLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        assertFalse(item(RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Collections.singletonList(wrongPeriod), PRICE)), CONFIG), Plan.MONTHLY).available);
        GoogleSubscriptionOption base = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        Price different = new Price("₫50,000", 50000000000L, "VND");
        assertFalse(item(RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Collections.singletonList(base), different)), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void duplicateBaseOptionsFailClosed() throws Exception {
        GoogleSubscriptionOption base = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        assertFalse(item(RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Arrays.asList(base, base), PRICE)), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void installmentBasePlanCannotBecomePurchasable() throws Exception {
        GoogleSubscriptionOption installment = new GoogleSubscriptionOption("sub", "monthly", null,
                Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)),
                Collections.emptyList(), details("sub", true), "fixture-token", new PresentedOfferingContext("main", null, null),
                new GoogleInstallmentsInfo(3, 3));
        assertFalse(item(RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Collections.singletonList(installment), PRICE)), CONFIG), Plan.MONTHLY).available);
    }
    @Test public void packageIdentityIsBoundToRevision() throws Exception {
        Package original = lifetime(PRICE);
        Package replaced = new Package("renamed", PackageType.LIFETIME, original.getProduct(), new PresentedOfferingContext("main", null, null));
        String before = item(RevenueCatCatalog.map(offerings("main", original), CONFIG), Plan.LIFETIME).catalogRevision;
        RevenueCatCatalog changed = RevenueCatCatalog.map(offerings("main", replaced), CONFIG);
        assertNotEquals(before, item(changed, Plan.LIFETIME).catalogRevision); assertNull(changed.resolve(Plan.LIFETIME, before));
    }
    @Test public void priceDisclosureAndCurrencyChangesInvalidateRevision() throws Exception {
        String revision = item(RevenueCatCatalog.map(offerings("main", lifetime(PRICE)), CONFIG), Plan.LIFETIME).catalogRevision;
        for (Price changed : new Price[]{new Price("₫49,000", 50000000000L, "VND"), new Price("49.000 ₫", PRICE.getAmountMicros(), "VND"), new Price("₫49,000", PRICE.getAmountMicros(), "USD")}) {
            RevenueCatCatalog catalog = RevenueCatCatalog.map(offerings("main", lifetime(changed)), CONFIG);
            assertNotEquals(revision, item(catalog, Plan.LIFETIME).catalogRevision); assertNull(catalog.resolve(Plan.LIFETIME, revision));
        }
    }
    @Test public void catalogItemsAreImmutableAndNoNativeSecretsInDto() throws Exception {
        RevenueCatCatalog catalog = RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY)), CONFIG);
        assertThrows(UnsupportedOperationException.class, () -> catalog.items.clear());
        CatalogItem item = item(catalog, Plan.MONTHLY);
        assertFalse(item.catalogRevision.contains("fixture-token")); assertEquals(64, item.catalogRevision.length());
    }
    @Test public void lifetimeRequiresUniqueExplicitBuyDetails() throws Exception {
        for (JSONArray options : new JSONArray[]{null, new JSONArray(), new JSONArray().put(buyDetails(PRICE)).put(buyDetails(PRICE)),
                new JSONArray().put(buyDetails(PRICE).put("purchaseOptionId", JSONObject.NULL)),
                new JSONArray().put(buyDetails(PRICE).put("offerIdToken", JSONObject.NULL))}) {
            assertFalse(item(RevenueCatCatalog.map(offerings("main", lifetime(PRICE, options)), CONFIG), Plan.LIFETIME).available);
        }
    }
    @Test public void lifetimeRentalPreorderAndDiscountTermsCannotBecomePurchasable() throws Exception {
        for (String term : new String[]{"rentalDetails", "preorderDetails", "discountDisplayInfo", "validTimeWindow", "limitedQuantityInfo"}) {
            JSONObject unsupported = new JSONObject();
            if (term.equals("rentalDetails")) unsupported.put("rentalPeriod", "P1D").put("rentalExpirationPeriod", "P7D");
            if (term.equals("preorderDetails")) unsupported.put("preorderReleaseTimeMillis", 1900000000000L)
                    .put("preorderPresaleEndTimeMillis", 1800000000000L);
            if (term.equals("discountDisplayInfo")) unsupported.put("percentageDiscount", 10);
            if (term.equals("validTimeWindow")) unsupported.put("startTimeMillis", 1700000000000L).put("endTimeMillis", 1900000000000L);
            if (term.equals("limitedQuantityInfo")) unsupported.put("maximumQuantity", 10).put("remainingQuantity", 3);
            JSONObject offer = buyDetails(PRICE).put(term, unsupported);
            assertFalse(item(RevenueCatCatalog.map(offerings("main", lifetime(PRICE, new JSONArray().put(offer))), CONFIG), Plan.LIFETIME).available);
        }
        for (JSONObject offer : new JSONObject[]{buyDetails(PRICE).put("offerId", "discount"), buyDetails(PRICE).put("fullPriceMicros", PRICE.getAmountMicros())}) {
            assertFalse(item(RevenueCatCatalog.map(offerings("main", lifetime(PRICE, new JSONArray().put(offer))), CONFIG), Plan.LIFETIME).available);
        }
    }
    @Test public void lifetimeRealPriceMustMatchNormalizedPriceAndOptionIdChangesRevision() throws Exception {
        JSONObject mismatch = buyDetails(new Price("₫50,000", 50000000000L, "VND"));
        assertFalse(item(RevenueCatCatalog.map(offerings("main", lifetime(PRICE, new JSONArray().put(mismatch))), CONFIG), Plan.LIFETIME).available);
        RevenueCatCatalog original = RevenueCatCatalog.map(offerings("main", lifetime(PRICE)), CONFIG);
        String revision = item(original, Plan.LIFETIME).catalogRevision;
        assertEquals("buy", original.resolve(Plan.LIFETIME, revision).optionId);
        assertNotNull(original.resolve(Plan.LIFETIME, revision).oneTimeOption);
        RevenueCatCatalog changed = RevenueCatCatalog.map(offerings("main", lifetime(PRICE, new JSONArray().put(buyDetails(PRICE).put("purchaseOptionId", "other-buy")))), CONFIG);
        assertNotEquals(revision, item(changed, Plan.LIFETIME).catalogRevision); assertNull(changed.resolve(Plan.LIFETIME, revision));
    }
}
