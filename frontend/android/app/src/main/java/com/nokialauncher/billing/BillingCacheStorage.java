package com.nokialauncher.billing;

import java.io.IOException;
import java.util.Objects;
import static com.nokialauncher.billing.BillingPolicy.StoreRecord;

/** Blocking ACCESS adapter for the controller's disk worker. Corruption is recovery, never a missing grant. */
public final class BillingCacheStorage implements BillingController.Storage {
    private final BillingStore store;
    private final String ownerEpoch;
    private final BillingCacheCodec codec = new BillingCacheCodec();
    public BillingCacheStorage(BillingStore store, String ownerEpoch) {
        this.store = Objects.requireNonNull(store);
        this.ownerEpoch = BillingSnapshot.requiredText(ownerEpoch);
    }

    @Override public synchronized StoreRecord load() throws IOException {
        BillingStore.ReadResult result = store.read(BillingStore.FileKind.ACCESS);
        if (result.status == BillingStore.Status.MISSING) return null;
        if (result.status == BillingStore.Status.UNKNOWN) throw new IOException("Billing cache requires recovery");
        StoreRecord record = codec.decode(result);
        // Owner changes need an explicit recovery/migration decision; never silently erase the old cache.
        if (!ownerEpoch.equals(record.generation)) throw new IOException("Billing cache owner requires recovery");
        return record;
    }

    @Override public synchronized boolean save(StoreRecord record) {
        try {
            String json = codec.encode(record);
            if (!ownerEpoch.equals(record.generation)) return false;
            // Store protects envelope corruption; the adapter also preserves authenticated schema corruption.
            load();
            return store.write(BillingStore.FileKind.ACCESS, json);
        } catch (IOException invalidOrUnknown) { return false; }
    }
}
