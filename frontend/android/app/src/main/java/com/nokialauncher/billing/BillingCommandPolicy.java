package com.nokialauncher.billing;

import java.util.function.Supplier;

/** Audited launcher bridge classification. These exemptions are narrow operations, not
 * a second full-access grant. Billing recovery retains its existing host/input guards.
 * New bridge exports must be classified explicitly; the source coverage test enforces it.
 * Settings/Home/dialer/flashlight remain system escape/utility operations. Friend removal
 * keeps the established controller's active-owner restriction and never unlocks a session.
 */
public final class BillingCommandPolicy {
    private BillingCommandPolicy() { }
    public enum Category { BILLING_RECOVERY, EXISTING_FRIEND_OBLIGATION, CLEANUP,
        SYSTEM_SAFETY, PREPAYMENT_SETUP, IME_AND_FEEDBACK, PAID_FEATURE }
    public enum Command {
        getBillingBootstrapPolicy(Category.BILLING_RECOVERY),
        initializeBilling(Category.BILLING_RECOVERY),
        getBillingSnapshot(Category.BILLING_RECOVERY),
        refreshBilling(Category.BILLING_RECOVERY),
        refreshBillingCatalog(Category.BILLING_RECOVERY),
        restoreBillingPurchases(Category.BILLING_RECOVERY),
        billingShellReady(Category.BILLING_RECOVERY),
        purchaseBillingPlan(Category.BILLING_RECOVERY),
        reconcileBillingPurchase(Category.BILLING_RECOVERY),
        getBillingSupportSummary(Category.BILLING_RECOVERY),
        openBillingManagement(Category.BILLING_RECOVERY),
        openBillingRecovery(Category.BILLING_RECOVERY),
        getDumbModeState(Category.EXISTING_FRIEND_OBLIGATION),
        getDumbModeApps(Category.PAID_FEATURE),
        prepareDumbMode(Category.PAID_FEATURE),
        shareDumbModeCode(Category.PAID_FEATURE),
        activateDumbMode(Category.PAID_FEATURE),
        cancelDumbModeSetup(Category.CLEANUP),
        unlockDumbMode(Category.EXISTING_FRIEND_OBLIGATION),
        getFriendAuthenticatorState(Category.EXISTING_FRIEND_OBLIGATION),
        beginFriendPairing(Category.PAID_FEATURE),
        acceptFriendPairing(Category.PAID_FEATURE),
        inspectFriendPairing(Category.PAID_FEATURE),
        completeFriendPairing(Category.PAID_FEATURE),
        acknowledgeFriendPairing(Category.PAID_FEATURE),
        cancelFriendPairing(Category.CLEANUP),
        removeFriendPairing(Category.CLEANUP),
        getHeldFriendCode(Category.EXISTING_FRIEND_OBLIGATION),
        getFriendPairingQr(Category.PAID_FEATURE),
        startFriendPairingScan(Category.PAID_FEATURE),
        stopFriendPairingScan(Category.CLEANUP),
        shareFriendPairingText(Category.PAID_FEATURE),
        pasteFriendPairingText(Category.PAID_FEATURE),
        getInstalledApps(Category.PAID_FEATURE),
        launchApp(Category.PAID_FEATURE),
        openAppRemovalSettings(Category.PAID_FEATURE),
        openAppReview(Category.PAID_FEATURE),
        shareApp(Category.PAID_FEATURE),
        makePhoneCall(Category.SYSTEM_SAFETY),
        getContacts(Category.PAID_FEATURE),
        getRecentCalls(Category.PAID_FEATURE),
        deleteRecentCall(Category.PAID_FEATURE),
        simulateIncomingSms(Category.PAID_FEATURE),
        getConversations(Category.PAID_FEATURE),
        getThreadMessages(Category.PAID_FEATURE),
        markConversationRead(Category.PAID_FEATURE),
        sendSms(Category.PAID_FEATURE),
        getNotificationConversations(Category.PAID_FEATURE),
        replyNotificationMessage(Category.PAID_FEATURE),
        deleteConversation(Category.PAID_FEATURE),
        deleteMessage(Category.PAID_FEATURE),
        checkNotificationAccess(Category.PREPAYMENT_SETUP),
        simulateIncomingNotification(Category.PAID_FEATURE),
        openDefaultPhone(Category.SYSTEM_SAFETY),
        openDefaultMaps(Category.PAID_FEATURE),
        selectDefaultApp(Category.PAID_FEATURE),
        getDeviceStatus(Category.PREPAYMENT_SETUP),
        toggleSirenSound(Category.SYSTEM_SAFETY),
        cycleNotificationMode(Category.SYSTEM_SAFETY),
        openRecentApps(Category.SYSTEM_SAFETY),
        lockScreen(Category.SYSTEM_SAFETY),
        vibrate(Category.IME_AND_FEEDBACK),
        getSystemToneAccess(Category.PREPAYMENT_SETUP),
        syncKeyboardSoundSettings(Category.IME_AND_FEEDBACK),
        toggleFlashlight(Category.SYSTEM_SAFETY),
        requestSystemToneAccess(Category.PREPAYMENT_SETUP),
        applySystemTone(Category.PAID_FEATURE),
        openNotificationAccessSettings(Category.PREPAYMENT_SETUP),
        isDefaultLauncher(Category.PREPAYMENT_SETUP),
        requestDefaultLauncher(Category.PREPAYMENT_SETUP),
        openSystemSetting(Category.SYSTEM_SAFETY),
        openWebUrl(Category.PAID_FEATURE),
        showKeyboardSettings(Category.PREPAYMENT_SETUP),
        showAccessibilitySettings(Category.SYSTEM_SAFETY),
        pasteDumbModeCode(Category.EXISTING_FRIEND_OBLIGATION),
        showKeyboardPicker(Category.PREPAYMENT_SETUP),
        startBrowser(Category.PAID_FEATURE),
        navigateBrowser(Category.PAID_FEATURE),
        controlBrowser(Category.PAID_FEATURE),
        updateBrowserSurfaceBounds(Category.PAID_FEATURE),
        stopBrowser(Category.CLEANUP),
        startCamera(Category.PAID_FEATURE),
        updateCameraSurfaceBounds(Category.PAID_FEATURE),
        setCameraLens(Category.PAID_FEATURE),
        setCameraFlash(Category.PAID_FEATURE),
        setCameraMode(Category.PAID_FEATURE),
        setCameraGrid(Category.PAID_FEATURE),
        capturePhoto(Category.PAID_FEATURE),
        startVideo(Category.PAID_FEATURE),
        stopVideo(Category.CLEANUP),
        stopCamera(Category.CLEANUP),
        listCameraMedia(Category.PAID_FEATURE),
        showCameraMedia(Category.PAID_FEATURE),
        controlCameraMedia(Category.PAID_FEATURE),
        hideCameraMedia(Category.CLEANUP),
        triggerKeyHaptic(Category.IME_AND_FEEDBACK),
        playKeypadTone(Category.IME_AND_FEEDBACK);
        public final Category category;
        Command(Category category) { this.category = category; }
    }
    public interface Authority { boolean permits(String command); }
    public static Command command(String name) {
        if (name == null) return null;
        try { return Command.valueOf(name); } catch (IllegalArgumentException unknown) { return null; }
    }
    /** An unconfirmed holder's rotating code is a pairing step, not an established obligation. */
    public static boolean permitsHeldFriendCode(boolean confirmed, boolean newPairingAllowed) {
        return confirmed || newPairingAllowed;
    }
    public static final class Access {
        public final boolean packagedHome, localDecisionSealed, legacyPersistedOrEligible, full;
        public Access(boolean home, boolean sealed, boolean legacyReady, boolean full) {
            packagedHome = home; localDecisionSealed = sealed;
            legacyPersistedOrEligible = legacyReady; this.full = full;
        }
        public static Access fromRuntime(boolean home, BillingRuntime.State state) {
            return new Access(home, state != null && state.localDecisionSealed,
                    state != null && state.writersMayStart(),
                    state != null && state.snapshot != null && state.snapshot.access.full);
        }
    }
    /** Re-read at the actual native owner entry after queues, permissions and provider futures.
     * The supplier must use existing in-memory state only. Rollout-off does not read it.
     */
    public static boolean permits(boolean rollout, Command command, Supplier<Access> latest) {
        if (!rollout) return true;
        if (command == null) return false;
        if (command.category != Category.PAID_FEATURE) return true;
        Access access = latest.get();
        return access != null && access.packagedHome && access.localDecisionSealed
                && access.legacyPersistedOrEligible && access.full;
    }
}
