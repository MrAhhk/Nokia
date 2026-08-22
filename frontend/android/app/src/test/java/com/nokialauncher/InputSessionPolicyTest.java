package com.nokialauncher;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class InputSessionPolicyTest {
    @Test
    public void freshExternalInputStartsAndResetsTheComposer() {
        assertTrue(InputSessionPolicy.shouldRequestShow(false, NokiaIME.IMEState.ACTIVE));
        assertTrue(InputSessionPolicy.shouldResetComposer(false, NokiaIME.IMEState.ACTIVE));
    }

    @Test
    public void restartingInputDoesNotReshowOrResetTheComposer() {
        assertFalse(InputSessionPolicy.shouldRequestShow(true, NokiaIME.IMEState.ACTIVE));
        assertFalse(InputSessionPolicy.shouldResetComposer(true, NokiaIME.IMEState.ACTIVE));
    }

    @Test
    public void suppressedInputNeverReshowsOrResetsTheComposer() {
        assertFalse(InputSessionPolicy.shouldRequestShow(false, NokiaIME.IMEState.LAUNCHER_SUPPRESSED));
        assertFalse(InputSessionPolicy.shouldResetComposer(false, NokiaIME.IMEState.LAUNCHER_SUPPRESSED));
    }
}
