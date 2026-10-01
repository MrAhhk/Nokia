package com.nokialauncher;

/** Tracks distinct multipart acknowledgements, independent of Android callbacks. */
final class SmsSendState {
    static final int MAX_BODY_CHARS = 6_700;
    static final int MAX_PARTS = 100;
    private final boolean[] acknowledged;
    private int remaining;
    private boolean failed;
    SmsSendState(int parts) {
        if (parts < 1) throw new IllegalArgumentException("empty SMS");
        acknowledged = new boolean[parts];
        remaining = parts;
    }
    void acknowledge(int part, boolean success) {
        if (part < 0 || part >= acknowledged.length || acknowledged[part]) return;
        acknowledged[part] = true;
        remaining--;
        failed |= !success;
    }
    boolean isComplete() { return remaining == 0; }
    boolean isSent() { return isComplete() && !failed; }
    static boolean acceptableBody(String value) {
        return value != null && !value.trim().isEmpty() && value.length() <= MAX_BODY_CHARS;
    }
    static String recipient(String value) {
        String number = value == null ? "" : value.trim().replaceAll("[\\s()-]", "");
        return number.matches("\\+?[0-9]{2,20}") ? number : "";
    }
}
