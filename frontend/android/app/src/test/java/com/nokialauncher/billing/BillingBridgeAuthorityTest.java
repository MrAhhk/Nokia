package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;

public class BillingBridgeAuthorityTest {
    @Test public void onlyPackagedRootHomeDocumentCanCallBilling() {
        for (String url : new String[]{"https://localhost", "https://localhost/", "https://localhost/?view=launcher",
                "https://localhost/?%76iew=launcher"}) assertTrue(url, BillingBridgeAuthority.permits(url));
        for (String url : new String[]{null, "", "https://localhost/?view=keyboard", "https://localhost/?view=launcher&view=keyboard",
                "https://localhost/?view=launcher&view=launcher", "https://localhost/?other=launcher",
                "https://localhost/?view=launcher&", "https://localhost/?view=%", "https://localhost/?view=launcher=",
                "https://localhost/privacy", "https://localhost/index.html", "https://localhost/%2f", "https://localhost/#keyboard",
                "https://localhost:443/", "https://user@localhost/", "https://localhost.evil.test/", "https://evil.test/",
                "http://localhost/", "file:///android_asset/public/index.html", "javascript:alert(1)"})
            assertFalse(String.valueOf(url), BillingBridgeAuthority.permits(url));
    }
}
