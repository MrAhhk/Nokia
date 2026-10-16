package com.nokialauncher.billing;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.Plan;

public final class BillingPurchaseInputTest {
    private static Map<String, Object> intent(Object plan, Object revision, Object accepted) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("plan", plan); values.put("catalogRevision", revision); values.put("acceptedImmediateCharge", accepted);
        return values;
    }
    @Test public void exactWirePlanAndRealBooleanAreRequiredWithoutCoercion() {
        BillingPurchaseInput lifetime = BillingPurchaseInput.parse(intent("lifetime", "catalog-v1", true));
        assertEquals(Plan.LIFETIME, lifetime.plan); assertEquals("catalog-v1", lifetime.catalogRevision);
        assertTrue(lifetime.acceptedImmediateCharge);
        assertEquals(Plan.MONTHLY, BillingPurchaseInput.parse(intent("monthly", "catalog-v1", false)).plan);
        for (Object plan : new Object[]{Plan.MONTHLY, "MONTHLY", " monthly", 1, null})
            assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(intent(plan, "revision", true)));
        for (Object consent : new Object[]{"true", 1, null})
            assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(intent("lifetime", "revision", consent)));
        assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(intent("lifetime", "revision", false)));
    }
    @Test public void unknownFieldsAndMissingConsentCannotBecomeCheckoutIntent() {
        Map<String, Object> extra = intent("monthly", "revision", true); extra.put("productId", "arbitrary");
        assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(extra));
        Map<String, Object> replaced = intent("monthly", "revision", true); replaced.remove("acceptedImmediateCharge"); replaced.put("paid", true);
        assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(replaced));
        Map<String, Object> missing = intent("monthly", "revision", true); missing.remove("acceptedImmediateCharge");
        assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(missing));
    }
    @Test public void revisionIsBoundedTypedAndNotTakenFromPriceOrProviderObjects() {
        Object coercible = new Object() { @Override public String toString() { throw new AssertionError("Must not coerce bridge values"); } };
        for (Object revision : new Object[]{null, 7, coercible, "", " \t", "revision\n", "revision\u007f", new String(new char[129]).replace('\0', 'a')})
            assertThrows(IllegalArgumentException.class, () -> BillingPurchaseInput.parse(intent("yearly", revision, false)));
        String bounded = new String(new char[128]).replace('\0', 'a');
        assertEquals(bounded, BillingPurchaseInput.parse(intent("yearly", bounded, false)).catalogRevision);
    }
}
