package com.nokialauncher.billing;

import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import com.revenuecat.purchases.interfaces.ReceiveCustomerInfoCallback;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Native current/explicit Restore boundary. Controller owns serialization/coalescing; no purchase,
 * Activity or JS export is installed here. SDK errors/receipts are never logged.
 */
public final class RevenueCatProvider implements BillingController.Provider {
    public interface Transport { void fetchCurrent(ReceiveCustomerInfoCallback callback); }
    private final Transport transport;
    private final Transport restore;
    private final RevenueCatNormalizer normalizer;
    private final BillingController.Time time;
    private final String ownerEpoch;

    public RevenueCatProvider(RevenueCatAdapter adapter, BillingProviderConfig config,
            String ownerEpoch, BillingController.Time time) {
        this(Objects.requireNonNull(adapter)::fetchCurrent, adapter::restoreFromUserAction, config, ownerEpoch, time);
    }
    /** Injection uses the same public SDK callback, without parallel synthetic provider DTOs. */
    public RevenueCatProvider(Transport transport, BillingProviderConfig config,
            String ownerEpoch, BillingController.Time time) {
        this(transport, callback -> callback.onError(new PurchasesError(PurchasesErrorCode.UnknownError,
                "Restore transport unavailable")), config, ownerEpoch, time);
    }
    public RevenueCatProvider(Transport transport, Transport restore, BillingProviderConfig config,
            String ownerEpoch, BillingController.Time time) {
        this.transport = Objects.requireNonNull(transport);
        this.restore = Objects.requireNonNull(restore);
        this.normalizer = new RevenueCatNormalizer(config);
        this.ownerEpoch = requiredText(ownerEpoch);
        this.time = Objects.requireNonNull(time);
    }
    @Override public void fetchCurrent(BillingController.Callback callback) {
        request(transport, callback);
    }
    /** Called solely by the native serialized owner after explicit user input. */
    public void restoreCurrent(BillingController.Callback callback) {
        Objects.requireNonNull(callback);
        AtomicBoolean restored = new AtomicBoolean();
        try {
            restore.fetchCurrent(new ReceiveCustomerInfoCallback() {
                @Override public void onReceived(CustomerInfo ignoredCacheOrReceipt) {
                    // SDK Restore's empty-inventory path may return cached CustomerInfo.
                    // Its old signature must not acquire a new elapsed-time anchor.
                    if (restored.compareAndSet(false, true)) request(transport, callback);
                }
                @Override public void onError(PurchasesError error) {
                    if (restored.compareAndSet(false, true)) callback.complete(null,
                            error != null && error.getCode() == PurchasesErrorCode.NetworkError ? Issue.OFFLINE : Issue.PROVIDER);
                }
            });
        } catch (RuntimeException unavailable) {
            if (restored.compareAndSet(false, true)) callback.complete(null, Issue.PROVIDER);
            else throw unavailable;
        }
    }
    private void request(Transport action, BillingController.Callback callback) {
        Objects.requireNonNull(callback);
        String boot = time.bootToken();
        long elapsed = time.elapsedRealtimeMs();
        AtomicBoolean delivered = new AtomicBoolean();
        try {
            action.fetchCurrent(new ReceiveCustomerInfoCallback() {
                @Override public void onReceived(CustomerInfo info) {
                    if (!delivered.compareAndSet(false, true)) return;
                    BillingController.Record record;
                    try {
                        record = normalizer.normalizeCurrent(info, ownerEpoch, boot, elapsed,
                                time.bootToken(), time.elapsedRealtimeMs());
                    } catch (RuntimeException invalid) {
                        callback.complete(null, Issue.VERIFICATION);
                        return;
                    }
                    callback.complete(record, Issue.NONE);
                }
                @Override public void onError(PurchasesError error) {
                    if (delivered.compareAndSet(false, true)) callback.complete(null,
                            error != null && error.getCode() == PurchasesErrorCode.NetworkError
                                    ? Issue.OFFLINE : Issue.PROVIDER);
                }
            });
        } catch (RuntimeException unavailable) {
            if (delivered.compareAndSet(false, true)) callback.complete(null, Issue.PROVIDER);
            else throw unavailable; // Completion delivery rejection remains explicit to the owner.
        }
    }
}
