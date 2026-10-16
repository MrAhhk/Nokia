package com.nokialauncher.billing;

import com.revenuecat.purchases.Offerings;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.interfaces.ReceiveOfferingsCallback;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

/** Public SDK presentation transport. getOfferings can return cached product details;
 * neither a callback nor a mapped revision proves fresh charge terms. No purchase launch. */
public final class RevenueCatCatalogProvider implements BillingController.CatalogProvider {
    public interface Transport { void fetchOfferings(ReceiveOfferingsCallback callback); }
    private final Transport transport;
    private final BillingProviderConfig config;
    public RevenueCatCatalogProvider(RevenueCatAdapter adapter, BillingProviderConfig config) {
        this(Objects.requireNonNull(adapter)::fetchOfferings, config);
    }
    public RevenueCatCatalogProvider(Transport transport, BillingProviderConfig config) {
        this.transport = Objects.requireNonNull(transport); this.config = Objects.requireNonNull(config);
    }
    @Override public void fetchCatalog(BillingController.CatalogCallback callback) {
        Objects.requireNonNull(callback);
        if (!config.isConfigured()) { callback.complete(RevenueCatCatalog.unavailable()); return; }
        AtomicBoolean completed = new AtomicBoolean();
        try { transport.fetchOfferings(new ReceiveOfferingsCallback() {
            @Override public void onReceived(Offerings offerings) {
                if (!completed.compareAndSet(false, true)) return;
                RevenueCatCatalog mapped;
                try { mapped = RevenueCatCatalog.map(offerings, config); }
                catch (RuntimeException invalid) { mapped = RevenueCatCatalog.unavailable(); }
                callback.complete(mapped);
            }
            @Override public void onError(PurchasesError ignored) {
                if (completed.compareAndSet(false, true)) callback.complete(RevenueCatCatalog.unavailable());
            }
        }); } catch (RuntimeException unavailable) {
            if (completed.compareAndSet(false, true)) callback.complete(RevenueCatCatalog.unavailable());
            else throw unavailable;
        }
    }
}
