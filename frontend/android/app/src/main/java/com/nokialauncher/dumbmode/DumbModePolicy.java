package com.nokialauncher.dumbmode;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;

/** Pure policy: Android category numbers, never package-name guesses. */
public final class DumbModePolicy {
    private static final String ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private DumbModePolicy() {}
    public static String group(int category) {
        switch (category) {
            case 0: return "games";
            case 1: return "audio";
            case 2: return "video";
            case 3: return "photography";
            case 4: return "social";
            case 5: return "news";
            case 6: return "maps";
            case 7: return "productivity";
            case 8: return "accessibility";
            case -1: return "unclassified";
            default: return "unclassified";
        }
    }
    public static boolean defaultBlocked(int category) {
        return category == 0 || category == 2 || category == 4 || category == 5;
    }
    public static String generateCode(SecureRandom random) {
        // Rejection sampling preserves a uniform distribution over valid 12-character codes.
        while (true) {
            char[] code = new char[12];
            boolean upper = false, lower = false, digit = false;
            for (int i = 0; i < code.length; i++) {
                char c = ALPHABET.charAt(random.nextInt(ALPHABET.length()));
                code[i] = c; upper |= c >= 'A' && c <= 'Z';
                lower |= c >= 'a' && c <= 'z'; digit |= c >= '0' && c <= '9';
            }
            if (upper && lower && digit) return new String(code);
        }
    }
    public static Set<String> reconcile(Set<String> blocked, Set<String> seen,
            java.util.Map<String, Integer> current) {
        Set<String> result = new HashSet<>(blocked);
        result.add("snake");
        for (java.util.Map.Entry<String, Integer> app : current.entrySet()) {
            if (app.getValue() == 0 || (!seen.contains(app.getKey()) && defaultBlocked(app.getValue()))) {
                result.add(app.getKey());
            }
        }
        return result;
    }
}
