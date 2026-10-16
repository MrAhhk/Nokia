package com.nokialauncher.billing;

import com.revenuecat.purchases.Package;
import com.revenuecat.purchases.ProductType;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import com.revenuecat.purchases.interfaces.GetStoreProductsCallback;
import com.revenuecat.purchases.models.GoogleStoreProduct;
import com.revenuecat.purchases.models.Price;
import com.revenuecat.purchases.models.RecurrenceMode;
import com.revenuecat.purchases.models.StoreProduct;
import com.revenuecat.purchases.models.SubscriptionOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.RevenueCatCatalogTest.*;
import static com.nokialauncher.billing.RevenueCatCheckoutPreflight.Status.*;

/** Actual public SDK models, direct transport injection; no payment/provider/device claims. */
public class RevenueCatCheckoutPreflightTest {
    private static class Fixture {
        final RevenueCatCatalog prior;
        final List<GetStoreProductsCallback> calls = new ArrayList<>();
        final List<List<String>> ids = new ArrayList<>();
        final List<RevenueCatCheckoutPreflight.Result> results = new ArrayList<>();
        final RevenueCatCheckoutPreflight subject = new RevenueCatCheckoutPreflight((products, callback) -> {
            ids.add(products); calls.add(callback);
        }, CONFIG);
        Fixture() throws Exception { prior = RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY), subscription(Plan.YEARLY), lifetime(PRICE)), CONFIG); }
        void start(Plan plan) { subject.prepare(prior, plan, item(prior, plan).catalogRevision, results::add); }
        void receive(StoreProduct... products) { calls.get(calls.size() - 1).onReceived(Arrays.asList(products)); }
        RevenueCatCheckoutPreflight.Result result() { return results.get(results.size() - 1); }
    }
    private static StoreProduct direct(Package value) { return value.getProduct().copyWithPresentedOfferingContext(null); }
    private static PurchasesError error() { return new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"); }
    @Test public void queriesOnlyConfiguredProductsAndBindsFreshModelsToPriorPackage() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.MONTHLY);
        StoreProduct fresh = direct(subscription(Plan.MONTHLY));
        assertEquals(Arrays.asList("sub", "life"), f.ids.get(0));
        f.receive(fresh, direct(subscription(Plan.YEARLY)), direct(lifetime(PRICE)));
        assertEquals(READY, f.result().status); assertEquals(Plan.MONTHLY, f.result().plan);
        assertEquals(item(f.prior, Plan.MONTHLY).catalogRevision, f.result().shownRevision);
        assertNotSame(f.prior.resolve(Plan.MONTHLY, f.result().shownRevision).product, f.result().selection.product);
        assertSame(((GoogleStoreProduct) fresh).getProductDetails(), f.result().selection.product.getProductDetails());
        assertEquals("main", f.result().selection.option.getPresentedOfferingContext().getOfferingIdentifier());
        assertEquals("monthly", f.result().selection.sdkPackage.getIdentifier());
        assertEquals("monthly", f.result().selection.option.getId());
    }
    @Test public void priceChangeRequiresNewConfirmationAndFreshQuery() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.LIFETIME);
        f.receive(direct(lifetime(new Price("₫50,000", 50000000000L, "VND"))));
        assertEquals(NEEDS_RECONFIRMATION, f.result().status); assertNull(f.result().selection);
        RevenueCatCatalog changed = f.result().catalog;
        assertEquals("₫50,000", item(changed, Plan.LIFETIME).priceText);
        f.subject.prepare(changed, Plan.LIFETIME, item(changed, Plan.LIFETIME).catalogRevision, f.results::add);
        assertEquals(2, f.calls.size());
        f.receive(direct(lifetime(new Price("₫50,000", 50000000000L, "VND"))));
        assertEquals(READY, f.result().status);
    }
    @Test public void permanentOptionIdentityChangeRequiresReconfirmation() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.LIFETIME);
        f.receive(direct(lifetime(PRICE, new JSONArray().put(buyDetails(PRICE).put("purchaseOptionId", "new-buy")))));
        assertEquals(NEEDS_RECONFIRMATION, f.result().status); assertNull(f.result().selection);
    }
    @Test public void subscriptionPriceChangeRequiresReconfirmation() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.MONTHLY); Price changed = new Price("$4.00", 4000000L, "USD");
        f.receive(direct(subscription(Plan.MONTHLY, Collections.singletonList(option(Plan.MONTHLY, null,
                Collections.singletonList(phase(Plan.MONTHLY, changed, RecurrenceMode.INFINITE_RECURRING)))), changed)));
        assertEquals(NEEDS_RECONFIRMATION, f.result().status); assertNull(f.result().selection);
    }
    @Test public void changedPeriodAndMissingBaseNeverFallBackToOldDetails() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.MONTHLY);
        GoogleStoreProduct fresh = (GoogleStoreProduct) direct(subscription(Plan.MONTHLY));
        GoogleStoreProduct wrongPeriod = new GoogleStoreProduct("sub", "monthly", ProductType.SUBS, PRICE,
                "Nokia", "Nokia", "fixture", period(Plan.YEARLY), fresh.getSubscriptionOptions(), fresh.getDefaultOption(),
                fresh.getProductDetails(), null, null);
        f.receive(wrongPeriod); assertEquals(UNAVAILABLE, f.result().status); assertNull(f.result().selection);
        f.start(Plan.MONTHLY); f.receive(direct(subscription(Plan.YEARLY)));
        assertEquals(UNAVAILABLE, f.result().status); assertFalse(item(f.result().catalog, Plan.MONTHLY).available);
    }
    @Test public void priorTrialDefaultCannotOverrideNewExplicitBaseOption() throws Exception {
        SubscriptionOption trial = option(Plan.MONTHLY, "trial", Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.FINITE_RECURRING)));
        SubscriptionOption base = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        RevenueCatCatalog prior = RevenueCatCatalog.map(offerings("main", subscription(Plan.MONTHLY, Arrays.asList(trial, base), PRICE)), CONFIG);
        Fixture f = new Fixture();
        f.subject.prepare(prior, Plan.MONTHLY, item(prior, Plan.MONTHLY).catalogRevision, f.results::add);
        f.receive(direct(subscription(Plan.MONTHLY)));
        assertEquals(READY, f.result().status); assertNull(f.result().selection.option.getOfferId());
        assertNotSame(base, f.result().selection.option);
    }
    @Test public void duplicateRowsAndUnsupportedRowsFailClosed() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.LIFETIME);
        StoreProduct fresh = direct(lifetime(PRICE)); f.receive(fresh, fresh);
        assertEquals(UNAVAILABLE, f.result().status); assertNull(f.result().selection);
        f.start(Plan.MONTHLY); f.calls.get(1).onReceived(null);
        assertEquals(UNAVAILABLE, f.result().status);
        f.start(Plan.MONTHLY); f.calls.get(2).onReceived(Collections.singletonList(null));
        assertEquals(UNAVAILABLE, f.result().status);
    }
    @Test public void freshTrialDefaultStillSelectsOnlyUniqueBaseAndAmbiguousBaseFails() throws Exception {
        Fixture f = new Fixture();
        SubscriptionOption trial = option(Plan.MONTHLY, "trial", Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.FINITE_RECURRING)));
        SubscriptionOption base = option(Plan.MONTHLY, null, Collections.singletonList(phase(Plan.MONTHLY, PRICE, RecurrenceMode.INFINITE_RECURRING)));
        f.start(Plan.MONTHLY); f.receive(direct(subscription(Plan.MONTHLY, Arrays.asList(trial, base), PRICE)));
        assertEquals(READY, f.result().status); assertNull(f.result().selection.option.getOfferId());
        assertNotNull(((com.revenuecat.purchases.models.GoogleSubscriptionOption) f.result().selection.product.getDefaultOption()).getOfferId());
        f.start(Plan.MONTHLY); f.receive(direct(subscription(Plan.MONTHLY, Arrays.asList(base, base), PRICE)));
        assertEquals(UNAVAILABLE, f.result().status); assertNull(f.result().selection);
    }
    @Test public void staleInputAndDisabledConfigDoNotQuery() throws Exception {
        Fixture f = new Fixture(); f.subject.prepare(f.prior, Plan.MONTHLY, "stale", f.results::add);
        assertEquals(UNAVAILABLE, f.result().status); assertTrue(f.calls.isEmpty());
        new RevenueCatCheckoutPreflight((ids, callback) -> fail("disabled query"), new BillingProviderConfig("", "", "", "", "", ""))
                .prepare(f.prior, Plan.MONTHLY, item(f.prior, Plan.MONTHLY).catalogRevision, f.results::add);
        assertEquals(UNAVAILABLE, f.result().status);
    }
    @Test public void firstFailureOrSuccessIsImmutableAndDuplicateCallbacksIgnored() throws Exception {
        Fixture f = new Fixture(); f.start(Plan.MONTHLY); f.calls.get(0).onError(error());
        f.receive(direct(subscription(Plan.MONTHLY))); f.calls.get(0).onError(error());
        assertEquals(1, f.results.size()); assertEquals(UNAVAILABLE, f.result().status);
        f.start(Plan.MONTHLY); f.receive(direct(subscription(Plan.MONTHLY)));
        f.calls.get(1).onError(error()); f.receive(direct(subscription(Plan.MONTHLY)));
        assertEquals(2, f.results.size()); assertEquals(READY, f.result().status);
    }
    @Test public void throwingTransportNeverReturnsPriorSelection() throws Exception {
        Fixture f = new Fixture();
        new RevenueCatCheckoutPreflight((ids, callback) -> { throw new IllegalStateException("fixture"); }, CONFIG)
                .prepare(f.prior, Plan.MONTHLY, item(f.prior, Plan.MONTHLY).catalogRevision, f.results::add);
        assertEquals(UNAVAILABLE, f.result().status); assertNull(f.result().selection);
        assertFalse(item(f.result().catalog, Plan.MONTHLY).available);
    }
}
