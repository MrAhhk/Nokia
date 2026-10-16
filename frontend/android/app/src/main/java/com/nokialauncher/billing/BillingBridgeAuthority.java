package com.nokialauncher.billing;

import java.net.URI;
import java.net.URLDecoder;

/** Billing is available only to the packaged Home document, never the IME or remote browser. */
public final class BillingBridgeAuthority {
    private BillingBridgeAuthority() {}
    public static boolean permits(String url) {
        if (url == null || url.length() > 2048) return false;
        try {
            URI uri = new URI(url);
            if (!"https".equals(uri.getScheme()) || !"localhost".equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getFragment() != null) return false;
            String path = uri.getRawPath();
            if (path != null && !path.isEmpty() && !"/".equals(path)) return false;
            String query = uri.getRawQuery();
            if (query == null || query.isEmpty()) return true;
            boolean viewSeen = false;
            for (String pair : query.split("&", -1)) {
                String[] fields = pair.split("=", -1);
                if (fields.length != 2 || viewSeen || !"view".equals(URLDecoder.decode(fields[0], "UTF-8"))
                        || !"launcher".equals(URLDecoder.decode(fields[1], "UTF-8"))) return false;
                viewSeen = true;
            }
            return viewSeen;
        } catch (Exception invalid) { return false; }
    }
}
