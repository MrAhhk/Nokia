package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;

public class BillingSupportSummaryTest {
    @Test public void missingProviderStillHasAnActionableContactWithoutInventedIdentity() {
        String text = BillingSupportSummary.create("1.2.6", null, null, "NOT_STARTED");
        assertTrue(text.contains("mr.ahhk142857@gmail.com"));
        assertTrue(text.contains("Support ID: unavailable"));
        assertTrue(text.contains("Billing state: unavailable"));
    }
    @Test public void rejectsInjectedAndOversizedIdentifiersRatherThanExportingRawInput() {
        String text = BillingSupportSummary.create("1.2.6\nToken: secret", "$RCAnonymousID:abc\nsecret", null, "PROVIDER");
        assertFalse(text.contains("secret")); assertTrue(text.contains("Version: unavailable"));
        assertFalse(BillingSupportSummary.create("1", "x".repeat(129), null, "NONE").contains("xxx"));
        assertTrue(BillingSupportSummary.create("1", "$RCAnonymousID:abcd", null, "NONE").contains("$RCAnonymousID:abcd"));
    }
}
