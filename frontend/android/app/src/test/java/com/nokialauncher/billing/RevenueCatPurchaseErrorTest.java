package com.nokialauncher.billing;

import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.PurchasesErrorCode;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingController.PurchaseOutcome.*;

public class RevenueCatPurchaseErrorTest {
    @Test public void onlyConsistentExplicitSdkCancelResolvesCancellation() {
        for (PurchasesErrorCode code : PurchasesErrorCode.values()) {
            PurchasesError error = new PurchasesError(code, "fixture");
            assertEquals(code == PurchasesErrorCode.PurchaseCancelledError ? CANCELED : UNCERTAIN,
                    RevenueCatAdapter.classifyPurchaseError(error, true));
            assertEquals(code == PurchasesErrorCode.PaymentPendingError ? PENDING
                            : code == PurchasesErrorCode.ProductNotAvailableForPurchaseError ? PRODUCT_UNAVAILABLE : UNCERTAIN,
                    RevenueCatAdapter.classifyPurchaseError(error, false));
        }
    }
    @Test public void missingErrorNeverProvesCancellation() {
        assertEquals(UNCERTAIN, RevenueCatAdapter.classifyPurchaseError(null, true));
        assertEquals(UNCERTAIN, RevenueCatAdapter.classifyPurchaseError(null, false));
    }

    @Test public void acceptanceDiagnosticNeverIncludesUnderlyingSdkData() {
        String privateText = "account@example.invalid token=secret order=GPA.fixture";
        for (PurchasesErrorCode code : PurchasesErrorCode.values()) {
            PurchasesError error = new PurchasesError(code, privateText);
            String summary = RevenueCatAdapter.acceptanceErrorDiagnostic("internalBilling", error, false);
            assertEquals("checkout_error_code=" + code.name() + ";user_cancelled=false", summary);
            assertFalse(summary.contains(privateText));
            assertNull(RevenueCatAdapter.acceptanceErrorDiagnostic("release", error, false));
            assertNull(RevenueCatAdapter.acceptanceErrorDiagnostic("debug", error, false));
            assertNull(RevenueCatAdapter.acceptanceErrorDiagnostic("billingSmoke", error, false));
        }
        assertEquals("checkout_error_code=missing;user_cancelled=true",
                RevenueCatAdapter.acceptanceErrorDiagnostic("internalBilling", null, true));
        assertNull(RevenueCatAdapter.acceptanceErrorDiagnostic(null, null, true));
    }
    @Test public void hostExceptionDiagnosticUsesFixedCategoriesWithoutMessagesOrCustomClassNames() {
        String privateText = "account@example.invalid token=secret order=GPA.fixture";
        RuntimeException[] errors = { new SecurityException(privateText), new IllegalArgumentException(privateText),
                new IllegalStateException(privateText), new RuntimeException(privateText) {} };
        String[] categories = { "security", "argument", "state", "other" };
        for (int i = 0; i < errors.length; i++) {
            for (boolean entered : new boolean[] { false, true }) {
                assertEquals("checkout_host_exception=" + categories[i] + ";after_sdk_entry=" + entered,
                        BillingPurchaseHost.acceptanceExceptionDiagnostic("internalBilling", errors[i], entered));
                for (String build : new String[] { "release", "debug", "billingSmoke", null })
                    assertNull(BillingPurchaseHost.acceptanceExceptionDiagnostic(build, errors[i], entered));
            }
        }
    }
}
