package com.nokialauncher.billing;

import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.interfaces.GetStoreProductsCallback;
import com.revenuecat.purchases.models.StoreProduct;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Native-only direct Play requery. No launch, journal, rights, or bridge side effects.
 * Future checkout owner must serialize this result and enforce operation/lifecycle freshness,
 * ownership checks and durable journal preparation before using a ready selection.
 */
public final class RevenueCatCheckoutPreflight {
    public enum Status { READY, NEEDS_RECONFIRMATION, UNAVAILABLE }
    public interface Transport { void getProducts(List<String> productIds, GetStoreProductsCallback callback); }
    public interface Callback { void complete(Result result); }
    public static final class Result {
        public final Status status;
        public final Plan plan;
        public final String shownRevision;
        public final RevenueCatCatalog catalog;
        /** Fresh native selection exists only for READY; reconfirmation requires new input/query. */
        public final RevenueCatCatalog.Selection selection;
        private Result(Status status, Plan plan, String shownRevision, RevenueCatCatalog catalog,
                RevenueCatCatalog.Selection selection) {
            this.status = status; this.plan = plan; this.shownRevision = shownRevision;
            this.catalog = catalog; this.selection = selection;
        }
    }
    private final Transport transport;
    private final BillingProviderConfig config;
    public RevenueCatCheckoutPreflight(RevenueCatAdapter adapter, BillingProviderConfig config) {
        this(Objects.requireNonNull(adapter)::getProducts, config);
    }
    public RevenueCatCheckoutPreflight(Transport transport, BillingProviderConfig config) {
        this.transport = Objects.requireNonNull(transport); this.config = Objects.requireNonNull(config);
    }
    public void prepare(RevenueCatCatalog prior, Plan plan, String shownRevision, Callback callback) {
        Objects.requireNonNull(callback);
        Result unavailable = new Result(Status.UNAVAILABLE, plan, shownRevision, RevenueCatCatalog.unavailable(), null);
        if (!config.isConfigured() || prior == null || plan == null || shownRevision == null
                || prior.resolve(plan, shownRevision) == null) { callback.complete(unavailable); return; }
        AtomicBoolean completed = new AtomicBoolean();
        try {
            transport.getProducts(Collections.unmodifiableList(Arrays.asList(config.subscriptionProduct, config.lifetimeProduct)),
                    new GetStoreProductsCallback() {
                @Override public void onReceived(List<StoreProduct> products) {
                    if (!completed.compareAndSet(false, true)) return;
                    Result result;
                    try {
                        RevenueCatCatalog fresh = RevenueCatCatalog.requery(prior, products, config);
                        CatalogItem item = fresh.items.get(plan.ordinal());
                        RevenueCatCatalog.Selection selected = fresh.resolve(plan, item.catalogRevision);
                        Status status = selected == null ? Status.UNAVAILABLE
                                : shownRevision.equals(selected.revision) ? Status.READY : Status.NEEDS_RECONFIRMATION;
                        result = new Result(status, plan, shownRevision, fresh,
                                status == Status.READY ? selected : null);
                    } catch (RuntimeException invalid) { result = unavailable; }
                    callback.complete(result);
                }
                @Override public void onError(PurchasesError ignored) {
                    if (completed.compareAndSet(false, true)) callback.complete(unavailable);
                }
            });
        } catch (RuntimeException failure) {
            if (completed.compareAndSet(false, true)) callback.complete(unavailable);
            else throw failure;
        }
    }
}
