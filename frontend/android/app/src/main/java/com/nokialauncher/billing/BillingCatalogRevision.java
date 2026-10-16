package com.nokialauncher.billing;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Fingerprint of the exact native catalog selection and disclosure; not a receipt or secret token.
 * The native checkout guard must compare against its current SDK catalog, never a JS price/product.
 */
public final class BillingCatalogRevision {
    private BillingCatalogRevision() {}

    /** Bind the price disclosure to the exact offering/package selection as well. */
    public static String bindSelection(String revision, String offering, String packageId) {
        requiredText(revision); requiredText(packageId);
        if (offering == null || offering.isEmpty() || offering.length() > 200
                || !offering.matches("[A-Za-z0-9_.:$-]+")) throw new IllegalArgumentException("Invalid offering");
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            for (String value : new String[]{"billing-selection-v1", revision, offering, packageId}) {
                byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
                hash.update(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
                hash.update((byte) ':'); hash.update(bytes);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte value : hash.digest()) {
                hex.append(Character.forDigit((value >>> 4) & 15, 16));
                hex.append(Character.forDigit(value & 15, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    public static String create(Plan plan, String productId, String basePlanId, String optionId,
            long priceMicros, String currency, String period, String priceText, String periodText) {
        if (plan == null || priceMicros <= 0 || priceMicros > 9007199254740991L
                || currency == null || !currency.matches("[A-Z]{3}"))
            throw new IllegalArgumentException("Invalid paid catalog metadata");
        requiredText(productId); requiredText(optionId);
        if (plan == Plan.LIFETIME) {
            if (basePlanId != null || period != null) throw new IllegalArgumentException("Lifetime is not recurring");
        } else {
            requiredText(basePlanId);
            String expectedPeriod = plan == Plan.MONTHLY ? "P1M" : "P1Y";
            if (!expectedPeriod.equals(period)) throw new IllegalArgumentException("Incorrect billing period");
        }
        requiredText(priceText);
        if (periodText == null || periodText.length() > 128) throw new IllegalArgumentException("Invalid disclosure");
        if (!periodText.isEmpty()) requiredText(periodText);
        try {
            MessageDigest hash = MessageDigest.getInstance("SHA-256");
            String[] values = {"billing-catalog-v1", plan.wire, productId, basePlanId == null ? "" : basePlanId,
                    optionId, Long.toString(priceMicros), currency, period == null ? "" : period,
                    priceText, periodText};
            for (String value : values) {
                byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
                // Length prefix makes concatenation unambiguous even for punctuation in product/option IDs.
                hash.update(Integer.toString(bytes.length).getBytes(StandardCharsets.US_ASCII));
                hash.update((byte) ':'); hash.update(bytes);
            }
            StringBuilder hex = new StringBuilder(64);
            for (byte value : hash.digest()) {
                hex.append(Character.forDigit((value >>> 4) & 15, 16));
                hex.append(Character.forDigit(value & 15, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException("Missing SHA-256", impossible); }
    }
}
