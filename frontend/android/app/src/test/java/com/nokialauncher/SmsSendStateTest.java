package com.nokialauncher;
import org.junit.Test;
import static org.junit.Assert.*;
public class SmsSendStateTest {
    @Test public void waitsForEveryDistinctPartAndRemembersFailure() {
        SmsSendState state = new SmsSendState(2);
        state.acknowledge(0, true); state.acknowledge(0, true);
        assertFalse(state.isComplete()); assertFalse(state.isSent());
        state.acknowledge(1, false);
        assertTrue(state.isComplete()); assertFalse(state.isSent());
    }
    @Test public void successfulPartsCanArriveOutOfOrder() {
        SmsSendState state = new SmsSendState(2);
        state.acknowledge(1, true); state.acknowledge(0, true);
        assertTrue(state.isSent());
    }
    @Test public void neverResolvesContactNamesOrMixedText() {
        assertEquals("", SmsSendState.recipient("Nam"));
        assertEquals("", SmsSendState.recipient("Nam 090123"));
        assertEquals("+84901234567", SmsSendState.recipient("+84 (90) 123-4567"));
    }
    @Test public void boundsDraftBeforeAndroidAllocatesMultipartState() {
        String atLimit = new String(new char[SmsSendState.MAX_BODY_CHARS]).replace('\0', 'x');
        assertTrue(SmsSendState.acceptableBody("hello"));
        assertTrue(SmsSendState.acceptableBody(atLimit));
        assertFalse(SmsSendState.acceptableBody(atLimit + "x"));
        assertFalse(SmsSendState.acceptableBody("   "));
    }
}
