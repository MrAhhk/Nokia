package com.nokialauncher.dumbmode;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** RFC 6238 SHA-256, eight digits. Pure policy: callers durably record consumed periods. */
public final class TotpPolicy {
    private TotpPolicy() {}
    public static String code(byte[] secret, long period) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        byte[] digest = mac.doFinal(ByteBuffer.allocate(8).putLong(period).array());
        int offset = digest[digest.length - 1] & 15;
        int value = ((digest[offset] & 127) << 24) | ((digest[offset+1] & 255) << 16)
                | ((digest[offset+2] & 255) << 8) | (digest[offset+3] & 255);
        return String.format(Locale.ROOT, "%08d", value % 100000000);
    }
    public static long verify(byte[] secret, String input, long nowMillis, long lastAccepted) throws Exception {
        String normalized = input == null ? "" : input.replace(" ", "").trim();
        if (!normalized.matches("[0-9]{8}")) return -1;
        long current = nowMillis / 30000L;
        for (long period = current - 1; period <= current + 1; period++) {
            if (period >= 0 && period > lastAccepted && MessageDigest.isEqual(
                    code(secret, period).getBytes(StandardCharsets.US_ASCII), normalized.getBytes(StandardCharsets.US_ASCII))) return period;
        }
        return -1;
    }
    public static byte[] hkdf(byte[] input, byte[] salt, byte[] info, int length) throws Exception {
        if (length < 1 || length > 255 * 32) throw new IllegalArgumentException("invalid_length");
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(input), previous = new byte[0], result = new byte[length]; int position = 0;
        for (int i = 1; position < length; i++) {
            mac.init(new SecretKeySpec(prk, "HmacSHA256")); mac.update(previous); mac.update(info); mac.update((byte)i);
            previous = mac.doFinal(); int count = Math.min(previous.length, length-position);
            System.arraycopy(previous,0,result,position,count); position += count;
        }
        return result;
    }
}
