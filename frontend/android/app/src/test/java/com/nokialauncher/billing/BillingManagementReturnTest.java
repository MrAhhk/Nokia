package com.nokialauncher.billing;

import org.junit.Test;
import static org.junit.Assert.*;

public class BillingManagementReturnTest {
    @Test public void rejectedUiBindingStillConsumesTheArmedReturn() {
        BillingManagementReturn guard = new BillingManagementReturn();
        guard.opened(10); guard.pause();
        assertTrue(guard.bindAndResume(20, () -> { throw new java.util.concurrent.RejectedExecutionException(); }));
        assertFalse(guard.bindAndResume(30, () -> { throw new java.util.concurrent.RejectedExecutionException(); }));
        guard.pause(); assertFalse(guard.resume(40));
    }
    @Test public void onlySuccessfulLaunchThenPauseCanArmOneReturn() {
        BillingManagementReturn guard = new BillingManagementReturn();
        guard.pause(); assertFalse(guard.resume(10));
        guard.opened(20); assertFalse(guard.resume(30));
        guard.pause(); assertTrue(guard.resume(40));
        guard.pause(); assertFalse(guard.resume(50));
    }
    @Test public void expiryBackwardClockAndTeardownConsumeWithoutRefreshing() {
        BillingManagementReturn guard = new BillingManagementReturn();
        guard.opened(100); guard.pause(); assertFalse(guard.resume(600101));
        assertFalse(guard.resume(600102));
        guard.opened(100); guard.pause(); assertFalse(guard.resume(99));
        guard.opened(100); guard.pause(); guard.clear(); assertFalse(guard.resume(110));
    }
    @Test public void newerSuccessfulOpenRequiresItsOwnPause() {
        BillingManagementReturn guard = new BillingManagementReturn();
        guard.opened(10); guard.pause(); guard.opened(20);
        assertFalse(guard.resume(30)); guard.pause(); assertTrue(guard.resume(600020));
    }
}
