package com.nokialauncher.billing;

import java.util.Map;
import static com.nokialauncher.billing.BillingSnapshot.Plan;

/** Strict packaged-Home purchase intent. Store identity and price remain native-owned. */
public final class BillingPurchaseInput {
    public final Plan plan;
    public final String catalogRevision;
    public final boolean acceptedImmediateCharge;
    private BillingPurchaseInput(Plan plan, String revision, boolean accepted) {
        this.plan = plan; catalogRevision = revision; acceptedImmediateCharge = accepted;
    }
    public static BillingPurchaseInput parse(Map<String, ?> input) {
        if (input == null || input.size() != 3 || !input.containsKey("plan")
                || !input.containsKey("catalogRevision") || !input.containsKey("acceptedImmediateCharge"))
            throw invalid();
        Object rawPlan = input.get("plan"), rawRevision = input.get("catalogRevision"), rawAccepted = input.get("acceptedImmediateCharge");
        if (!(rawPlan instanceof String) || !(rawRevision instanceof String) || !(rawAccepted instanceof Boolean)) throw invalid();
        Plan plan = null;
        for (Plan candidate : Plan.values()) if (candidate.wire.equals(rawPlan)) plan = candidate;
        validate(plan, (String) rawRevision, (Boolean) rawAccepted);
        return new BillingPurchaseInput(plan, (String) rawRevision, (Boolean) rawAccepted);
    }
    public static void validate(Plan plan, String revision, boolean acceptedImmediateCharge) {
        if (plan == null || revision == null || revision.length() > 128 || revision.trim().isEmpty()) throw invalid();
        for (int i = 0; i < revision.length(); i++) if (revision.charAt(i) < 32 || revision.charAt(i) == 127) throw invalid();
        if (plan == Plan.LIFETIME && !acceptedImmediateCharge) throw invalid();
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("invalid_billing_input"); }
}
