package com.nokialauncher;

import java.net.URI;

/** The privileged keyboard may only load immutable resources packaged in this APK. */
final class KeyboardResourcePolicy {
    static boolean allows(String value) {
        if (value == null) return false;
        try {
            URI uri = new URI(value);
            if (!"file".equals(uri.getScheme()) || uri.getRawAuthority() != null) return false;
            String path = uri.getPath();
            if (path == null || !path.startsWith("/android_asset/public/")) return false;
            // Reject both decoded traversal and ambiguous double-encoded paths.
            if (path.indexOf('%') >= 0 || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) return false;
            for (String part : path.split("/")) {
                if ("..".equals(part) || ".".equals(part)) return false;
            }
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
