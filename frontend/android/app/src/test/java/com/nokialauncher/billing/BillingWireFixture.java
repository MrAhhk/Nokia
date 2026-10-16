package com.nokialauncher.billing;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Synthetic bridge compatibility harness. Executes the real native policy and DTO serialization. */
public final class BillingWireFixture {
    public static void main(String[] args) {
        List<CatalogItem> catalog = Arrays.asList(
            new CatalogItem(Plan.MONTHLY, "Synthetic monthly", "TEST 1.99", "month", true, "synthetic-v1"),
            new CatalogItem(Plan.LIFETIME, "Synthetic unavailable", "", "", false, "synthetic-v1"));
        Store store = new Store(Verification.REMOTE, 100L, false, true, 200L, RenewState.OFF, Plan.MONTHLY, false, null);
        BillingPolicy.StoreRecord record = new BillingPolicy.StoreRecord(store, "synthetic-owner", 1,
            new BillingPolicy.ClockAnchor(100, 10, "synthetic-boot", BillingPolicy.TimeProvenance.SIGNED_REMOTE_BODY_TIME), true);
        BillingSnapshot paid = BillingPolicy.snapshot("synthetic-process", 1, "synthetic-owner",
            new Legacy(LegacyStatus.INELIGIBLE, true), record, "synthetic-boot", 20,
            Operation.idle(), null, false, true, true, Issue.NONE, catalog);
        BillingSnapshot pending = BillingPolicy.snapshot("synthetic-process", 2, "synthetic-owner",
            new Legacy(LegacyStatus.ELIGIBLE, false), null, "synthetic-boot", 20,
            Operation.idle(), new UnresolvedPurchase("synthetic-journal", Plan.LIFETIME, PurchaseStage.PENDING),
            false, false, true, Issue.PENDING, catalog);
        System.out.println(json(Arrays.asList(paid.toMap(), pending.toMap())));
    }

    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return "\"" + ((String) value).replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        StringBuilder out = new StringBuilder();
        if (value instanceof Map) {
            out.append('{');
            for (Map.Entry<?, ?> entry : ((Map<?, ?>) value).entrySet()) {
                if (out.length() > 1) out.append(',');
                out.append(json(entry.getKey())).append(':').append(json(entry.getValue()));
            }
            return out.append('}').toString();
        }
        out.append('[');
        for (Object entry : (List<?>) value) { if (out.length() > 1) out.append(','); out.append(json(entry)); }
        return out.append(']').toString();
    }
}
