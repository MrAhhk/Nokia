package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;

public class BillingShellReadinessTest {
    @Test public void rolloutOffDoesNotArmDeadlineButRendererFailureStillRecovers() {
        BillingShellReadiness policy = new BillingShellReadiness();
        assertFalse(policy.start(false, true));
        assertFalse(policy.deadline());
        assertTrue(policy.rendererGone());
        assertTrue(policy.isRecovery());
    }
    @Test public void missingBridgeAlwaysOffersNativeRecovery() {
        for (boolean rollout : new boolean[]{false, true}) {
            BillingShellReadiness policy = new BillingShellReadiness();
            assertFalse(policy.start(rollout, false));
            assertTrue(policy.isRecovery());
        }
    }
    @Test public void trustedCommittedShellCancelsDeadlineAndResumeCannotRearmIt() {
        BillingShellReadiness policy = new BillingShellReadiness();
        assertTrue(policy.start(true, true));
        assertTrue(policy.ready("https://localhost/?view=launcher", true));
        assertFalse(policy.deadline());
        assertFalse(policy.start(true, true));
        assertEquals(BillingShellReadiness.State.HEALTHY, policy.state());
        assertTrue(policy.ready("https://localhost/", true));
    }
    @Test public void untrustedOrDifferentRendererCannotSuppressFallback() {
        for (String url : new String[]{null, "https://evil.test/", "https://localhost/?view=keyboard", "file:///android_asset/public/index.html"}) {
            BillingShellReadiness policy = new BillingShellReadiness();
            assertTrue(policy.start(true, true));
            assertFalse(policy.ready(url, true));
            assertFalse(policy.ready("https://localhost/", false));
            assertTrue(policy.deadline());
        }
    }
    @Test public void timeoutIsTerminalAndLateShellCannotHideEscapeControls() {
        BillingShellReadiness policy = new BillingShellReadiness();
        assertTrue(policy.start(true, true));
        assertTrue(policy.deadline());
        assertFalse(policy.deadline());
        assertFalse(policy.ready("https://localhost/", true));
        assertFalse(policy.start(true, true));
        assertFalse(policy.rendererGone());
        assertTrue(policy.isRecovery());
    }
    @Test public void rendererFailureAfterReadinessAlsoRecoversOnlyOnce() {
        BillingShellReadiness policy = new BillingShellReadiness();
        policy.start(true, true);
        assertTrue(policy.ready("https://localhost/", true));
        assertTrue(policy.rendererGone());
        assertFalse(policy.rendererGone());
        assertFalse(policy.ready("https://localhost/", true));
    }
    @Test public void destructionRejectsEveryLateTransition() {
        BillingShellReadiness policy = new BillingShellReadiness();
        policy.start(true, true);
        policy.destroy();
        assertFalse(policy.deadline());
        assertFalse(policy.rendererGone());
        assertFalse(policy.ready("https://localhost/", true));
        assertFalse(policy.start(true, true));
        assertEquals(BillingShellReadiness.State.DESTROYED, policy.state());
    }
    @Test public void terminalRecoveryRevokesLocalSourceAuthorityBeforeAnyCleanup() {
        BillingShellReadiness policy = new BillingShellReadiness();
        policy.start(true, true);
        assertTrue(policy.permits("https://localhost/", true));
        assertFalse(policy.permits("https://localhost/", false));
        assertFalse(policy.permits("https://localhost/?view=keyboard", true));
        policy.deadline();
        assertFalse(policy.permits("https://localhost/", true));
        policy.destroy();
        assertFalse(policy.permits("https://localhost/", true));
    }
    @Test public void rendererFailureAlsoRevokesRolloutDisabledSourceAuthority() {
        BillingShellReadiness policy = new BillingShellReadiness();
        policy.start(false, true);
        assertTrue(policy.permits("https://localhost/?view=launcher", true));
        policy.rendererGone();
        assertFalse(policy.permits("https://localhost/?view=launcher", true));
    }
}
