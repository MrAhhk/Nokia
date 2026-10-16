package com.nokialauncher.billing;

import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Pinned public SDK callback/model integration; not live Play availability or checkout. */
public class RevenueCatCatalogProviderTest {
    @Test public void publicSdkModelMapsLocalizedPriceAndSuppressesDuplicateCallbacks() throws Exception {
        List<ReceiveOfferingsCallback> calls = new ArrayList<>();
        List<RevenueCatCatalog> results = new ArrayList<>();
        RevenueCatCatalogProvider provider = new RevenueCatCatalogProvider(calls::add, RevenueCatCatalogTest.CONFIG);
        provider.fetchCatalog(results::add);
        calls.get(0).onReceived(RevenueCatCatalogTest.offerings("main", RevenueCatCatalogTest.subscription(Plan.MONTHLY)));
        calls.get(0).onError(new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"));
        assertEquals(1, results.size()); assertEquals(3, results.get(0).items.size());
        assertEquals(RevenueCatCatalogTest.PRICE.getFormatted(), results.get(0).items.get(0).priceText);
        assertTrue(results.get(0).items.get(0).available); assertFalse(results.get(0).items.get(1).available);
    }
    @Test public void errorsAndThrowsProduceUnavailableAndExplicitRetryCanSucceed() throws Exception {
        List<ReceiveOfferingsCallback> calls = new ArrayList<>(); List<RevenueCatCatalog> results = new ArrayList<>();
        RevenueCatCatalogProvider provider = new RevenueCatCatalogProvider(calls::add, RevenueCatCatalogTest.CONFIG);
        provider.fetchCatalog(results::add); calls.get(0).onError(new PurchasesError(PurchasesErrorCode.NetworkError, "fixture"));
        assertFalse(results.get(0).items.get(0).available);
        provider.fetchCatalog(results::add); calls.get(1).onReceived(RevenueCatCatalogTest.offerings("main", RevenueCatCatalogTest.subscription(Plan.MONTHLY)));
        assertTrue(results.get(1).items.get(0).available);
        new RevenueCatCatalogProvider(callback -> { throw new IllegalStateException("transport"); }, RevenueCatCatalogTest.CONFIG)
                .fetchCatalog(results::add);
        assertFalse(results.get(2).items.get(0).available);
    }
    @Test public void disabledConfigurationNeverCallsTransport() {
        List<ReceiveOfferingsCallback> calls = new ArrayList<>(); List<RevenueCatCatalog> results = new ArrayList<>();
        new RevenueCatCatalogProvider(calls::add, new BillingProviderConfig("", "", "", "", "", ""))
                .fetchCatalog(results::add);
        assertTrue(calls.isEmpty()); assertEquals(3, results.get(0).items.size());
    }
}
