package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;

public class BillingProviderConfigTest {
    private BillingProviderConfig config(String key, String sub, String monthly, String yearly,
            String lifetime, String offering) {
        return new BillingProviderConfig(key, sub, monthly, yearly, lifetime, offering);
    }

    @Test public void absentConfigDoesNotEnablePurchases() {
        assertFalse(config(null, null, null, null, null, null).isConfigured());
    }

    @Test public void onlyGooglePublicKeyAccepted() {
        assertFalse(config("sk_secret", "subscription", "monthly", "yearly", "lifetime", "default").isConfigured());
        assertFalse(config("test_fake", "subscription", "monthly", "yearly", "lifetime", "default").isConfigured());
        assertTrue(config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", "default").isConfigured());
    }

    @Test public void distinctProductsAndBasePlansRequired() {
        assertFalse(config("goog_Public123", "same", "monthly", "yearly", "same", "default").isConfigured());
        assertFalse(config("goog_Public123", "subscription", "monthly", "monthly", "lifetime", "default").isConfigured());
    }

    @Test public void missingOrArbitraryCatalogIdentityRejected() {
        assertFalse(config("goog_Public123", "", "monthly", "yearly", "lifetime", "default").isConfigured());
        assertFalse(config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", "https://bad.example").isConfigured());
        assertFalse(config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", "default\nother").isConfigured());
    }

    @Test public void processOwnerCannotSilentlyChangeCatalogOrSdkKey() {
        BillingProviderConfig a = config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", "default");
        assertTrue(a.hasSameIdentity(config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", "default")));
        assertFalse(a.hasSameIdentity(config("goog_Other456", "subscription", "monthly", "yearly", "lifetime", "default")));
        assertFalse(a.hasSameIdentity(config("goog_Public123", "subscription", "monthly", "yearly", "other", "default")));
        assertFalse(a.hasSameIdentity(null));
    }

    @Test public void configuredPurchaseIdentitiesMustFitDurableJournalWithoutTruncation() {
        String boundary = new String(new char[128]).replace('\0', 'a');
        assertTrue(config("goog_Public123", boundary, "monthly", "yearly", "lifetime", "default").isConfigured());
        assertFalse(config("goog_Public123", boundary + "a", "monthly", "yearly", "lifetime", "default").isConfigured());
        assertFalse(config("goog_Public123", "subscription", boundary + "a", "yearly", "lifetime", "default").isConfigured());
        assertFalse(config("goog_Public123", "subscription", "monthly", boundary + "a", "lifetime", "default").isConfigured());
        assertFalse(config("goog_Public123", "subscription", "monthly", "yearly", boundary + "a", "default").isConfigured());
        assertTrue(config("goog_Public123", "subscription", "monthly", "yearly", "lifetime", boundary + "a").isConfigured());
    }
}
