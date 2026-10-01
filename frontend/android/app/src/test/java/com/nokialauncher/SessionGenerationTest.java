package com.nokialauncher;
import org.junit.Test;
import static org.junit.Assert.*;
public class SessionGenerationTest {
    @Test public void oldCallbacksCannotMutateReplacementOrClosedSession() {
        SessionGeneration session = new SessionGeneration();
        long old = session.next();
        long current = session.next();
        assertEquals(current, session.current());
        assertFalse(session.isCurrent(old)); assertTrue(session.isCurrent(current));
        session.close(); assertFalse(session.isCurrent(current));
        assertFalse(session.isCurrent(session.next()));
    }
}
