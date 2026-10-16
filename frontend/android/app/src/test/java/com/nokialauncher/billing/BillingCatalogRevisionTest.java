package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

public class BillingCatalogRevisionTest {
    private String monthly(long price, String currency, String option, String disclosure) {
        return BillingCatalogRevision.create(Plan.MONTHLY, "launcher_sub", "monthly", option,
                price, currency, "P1M", disclosure, "per month");
    }
    @Test public void sameNativeSelectionHasStableBoundedRevision() {
        String revision = monthly(1990000, "USD", "monthly", "$1.99");
        assertEquals(revision, monthly(1990000, "USD", "monthly", "$1.99"));
        assertTrue(revision.matches("[0-9a-f]{64}"));
    }
    @Test public void changedPriceCurrencyOptionOrVisibleDisclosureRequiresReconfirmation() {
        String old = monthly(1990000, "USD", "monthly", "$1.99");
        assertNotEquals(old, monthly(2990000, "USD", "monthly", "$2.99"));
        assertNotEquals(old, monthly(1990000, "CAD", "monthly", "$1.99"));
        assertNotEquals(old, monthly(1990000, "USD", "monthly:other", "$1.99"));
        assertNotEquals(old, monthly(1990000, "USD", "monthly", "US$1.99"));
        assertNotEquals(old, BillingCatalogRevision.create(Plan.YEARLY, "launcher_sub", "yearly", "yearly",
                1990000, "USD", "P1Y", "$1.99", "per year"));
    }
    @Test public void wrongPeriodOrFreeMissingPriceCannotBecomePaidCatalog() {
        try { monthly(0, "USD", "monthly", "$0"); fail(); } catch (IllegalArgumentException expected) {}
        try { monthly(1990000, "usd", "monthly", "$1.99"); fail(); } catch (IllegalArgumentException expected) {}
        try { BillingCatalogRevision.create(Plan.MONTHLY, "sub", "monthly", "monthly", 1990000, "USD", "P1Y", "$1.99", "year"); fail(); } catch (IllegalArgumentException expected) {}
        try { BillingCatalogRevision.create(Plan.LIFETIME, "lifetime", "yearly", "lifetime", 5550000, "USD", "P1Y", "$5.55", "once"); fail(); } catch (IllegalArgumentException expected) {}
        assertNotNull(BillingCatalogRevision.create(Plan.LIFETIME, "lifetime", null, "lifetime", 5550000, "USD", null, "$5.55", "once"));
    }
}
