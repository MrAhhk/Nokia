package com.nokialauncher;

import org.junit.Test;
import static org.junit.Assert.*;

public class KeyboardResourcePolicyTest {
    @Test public void allowsOnlyPackagedKeyboardResources() {
        assertTrue(KeyboardResourcePolicy.allows("file:///android_asset/public/index.html?view=keyboard"));
        assertTrue(KeyboardResourcePolicy.allows("file:///android_asset/public/static/js/main.js"));
        assertTrue(KeyboardResourcePolicy.allows("file:///android_asset/public/sounds/key%20tone.wav"));
        for (String url : new String[]{null, "https://evil.example/", "content://sms", "file:///data/data/private",
                "file://evil/android_asset/public/index.html", "file:///android_asset/public/../secret",
                "file:///android_asset/public/%2e%2e/secret", "file:///android_asset/public/%252e%252e/secret",
                "file:///android_asset/public/%5csecret", "data:text/html,evil", "javascript:alert(1)"}) {
            assertFalse(String.valueOf(url), KeyboardResourcePolicy.allows(url));
        }
    }
}
