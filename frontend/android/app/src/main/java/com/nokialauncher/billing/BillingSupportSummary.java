package com.nokialauncher.billing;

/** Minimal explicit support export. No receipt, order/token, owner hash or provider payload. */
public final class BillingSupportSummary {
    private BillingSupportSummary() {}
    public static String create(String version, String supportId, BillingSnapshot snapshot, String bootstrapIssue) {
        StringBuilder text = new StringBuilder("Nokia Launcher billing support\nContact: mr.ahhk142857@gmail.com\nVersion: ");
        text.append(safe(version, 128, "unavailable"));
        text.append("\nSupport ID: ").append(safe(supportId, 128, "unavailable"));
        text.append("\nBootstrap: ").append(safe(bootstrapIssue, 32, "unavailable"));
        if (snapshot == null) return text.append("\nBilling state: unavailable").toString();
        text.append("\nAccess: ").append(snapshot.access.full ? "full" : "restricted");
        text.append("\nLegacy: ").append(snapshot.legacy.status.wire);
        text.append("\nVerification: ").append(snapshot.store.verification.wire);
        text.append("\nIssue: ").append(snapshot.issue.wire);
        text.append("\nOperation: ").append(snapshot.operation.state.wire);
        text.append("\nUnresolved purchase: ").append(snapshot.unresolvedPurchase == null ? "none" : snapshot.unresolvedPurchase.stage.wire);
        text.append("\nSubscription renewal: ").append(snapshot.store.renewState.wire);
        return text.toString();
    }
    private static String safe(String value, int limit, String fallback) {
        // Anonymous RC ID and native version contain these ASCII characters. No arbitrary text.
        return value != null && value.length() <= limit && value.matches("[A-Za-z0-9_$:.+-]+") ? value : fallback;
    }
}
