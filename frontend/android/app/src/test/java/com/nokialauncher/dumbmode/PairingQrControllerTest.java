package com.nokialauncher.dumbmode;

import org.junit.Test;
import static org.junit.Assert.*;

public final class PairingQrControllerTest {
    @Test public void pairingTransportRejectsBlankAndOversizedMessages() {
        assertFalse(PairingQrController.validPayload(null));
        assertFalse(PairingQrController.validPayload(" \n "));
        assertTrue(PairingQrController.validPayload(repeat("a", 2048)));
        assertFalse(PairingQrController.validPayload(repeat("a", 2049)));
    }

    @Test public void payloadLimitCountsUtf8BytesRatherThanCharacters() {
        assertTrue(PairingQrController.validPayload(repeat("é", 1024)));
        assertFalse(PairingQrController.validPayload(repeat("é", 1025)));
    }

    private static String repeat(String text, int count) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < count; i++) result.append(text);
        return result.toString();
    }
}
