package com.nokialauncher.billing;

import org.junit.Test;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import static com.nokialauncher.billing.BillingCommandPolicy.*;
import static org.junit.Assert.*;

/** Actual exported source inventory plus typed, live access evaluation. No store fixture
 * is claimed to prove provider/device behavior or packaged WebView authority at runtime.
 */
public class BillingCommandPolicyTest {
    @Test public void revokedSnapshotRetiresOwnersBeforeAllUiPublicationPaths() throws Exception {
        String plugin = source("LauncherAppsPlugin.java");
        int event = plugin.indexOf("billingUiHandle = billingRuntime.subscribe");
        assertTrue(plugin.indexOf("retireRevokedResources(state.snapshot)", event)
                < plugin.indexOf("notifyListeners(\"billingStateChanged\"", event));
        int completion = plugin.indexOf("private void finishBillingCall(");
        assertTrue(plugin.indexOf("retireRevokedResources(snapshot)", completion)
                < plugin.indexOf("call.resolve(billingJson(snapshot))", completion));
        int read = plugin.indexOf("public void getBillingSnapshot(");
        assertTrue(plugin.indexOf("retireRevokedResources(snapshot)", read)
                < plugin.indexOf("call.resolve(billingJson(snapshot))", read));
        int start = plugin.indexOf("private void retireRevokedResources(");
        String cleanup = plugin.substring(start, plugin.indexOf("\n    }", start));
        assertTrue(cleanup.contains("snapshot.access.full"));
        assertTrue(cleanup.contains("cameraController.pauseForBackground()"));
        assertTrue(cleanup.contains("browserController.stop()"));
        assertFalse(cleanup.contains("DumbMode"));
        assertFalse(cleanup.contains("requireBillingRuntime"));
    }
    private static String source(String relative) throws Exception {
        Path path = Paths.get("src/main/java/com/nokialauncher", relative);
        if (!Files.exists(path)) path = Paths.get("app/src/main/java/com/nokialauncher", relative);
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8).replace("\r\n", "\n");
    }
    @Test public void everyActualPluginExportHasOneAuditedClassificationAndEveryPaidEntryIsGuarded() throws Exception {
        String plugin = source("LauncherAppsPlugin.java");
        Matcher exports = Pattern.compile("@PluginMethod\\s+public void (\\w+)\\(PluginCall call\\)\\s*\\{").matcher(plugin);
        Set<String> actual = new HashSet<>();
        while (exports.find()) {
            String name = exports.group(1); assertTrue("Duplicate export: " + name, actual.add(name));
            Command command = command(name); assertNotNull("Unclassified export: " + name, command);
            if (command.category == Category.PAID_FEATURE) {
                String body = plugin.substring(exports.end());
                assertTrue("Unguarded entry: " + name, body.matches("(?s)^\\s*withPaidCommand\\(call, \\\"" + name + "\\\",.*"));
            }
        }
        Set<String> classified = new HashSet<>();
        for (Command command : Command.values()) classified.add(command.name());
        assertFalse(actual.isEmpty()); assertEquals(actual, classified);
    }
    @Test public void rolloutOffNeverReadsOrInitializesAuthorityEvenForPaidCommands() {
        for (Command command : Command.values()) {
            assertTrue(permits(false, command, () -> { throw new AssertionError("No runtime read"); }));
        }
    }
    @Test public void fullAccessRequiresActualHomeAndEstablishedLocalDecision() {
        Command start = Command.startCamera;
        assertFalse(permits(true, start, () -> null));
        assertFalse(permits(true, start, () -> new Access(false, true, true, true)));
        assertFalse(permits(true, start, () -> new Access(true, false, true, true)));
        assertFalse(permits(true, start, () -> new Access(true, true, false, true)));
        assertFalse(permits(true, start, () -> new Access(true, true, true, false)));
        assertTrue(permits(true, start, () -> new Access(true, true, true, true)));
        assertFalse(permits(true, command("futureUnauditedExport"), () -> new Access(true, true, true, true)));
    }
    @Test public void queuedPermissionAndOwnerWorkReReadsRevokedRightsInsteadOfHoldingOldSuccess() {
        AtomicReference<Access> latest = new AtomicReference<>(new Access(true, true, true, true));
        AtomicInteger starts = new AtomicInteger();
        assertTrue(permits(true, Command.activateDumbMode, latest::get));
        Runnable deferredOwner = () -> { if (permits(true, Command.activateDumbMode, latest::get)) starts.incrementAndGet(); };
        latest.set(new Access(true, true, true, false)); deferredOwner.run(); assertEquals(0, starts.get());
        assertTrue(permits(true, Command.unlockDumbMode, latest::get));
        assertTrue(permits(true, Command.stopVideo, latest::get));
        assertTrue(permits(true, Command.getHeldFriendCode, latest::get));
        latest.set(new Access(true, true, true, true)); deferredOwner.run(); assertEquals(1, starts.get());
    }
    @Test public void actualRuntimeLocalSealPreservesEligibleSessionButBlocksFailedFreshSealWithoutAnyProviderWork() {
        for (BillingSnapshot.LegacyStatus status : Arrays.asList(BillingSnapshot.LegacyStatus.ELIGIBLE,
                BillingSnapshot.LegacyStatus.INELIGIBLE, BillingSnapshot.LegacyStatus.NEEDS_RECOVERY)) {
            AtomicInteger seals = new AtomicInteger();
            BillingRuntime runtime = new BillingRuntime(new BillingRuntime.Dependencies() {
                public BillingSnapshot.Legacy seal(String capture) {
                    seals.incrementAndGet(); return new BillingSnapshot.Legacy(status, false);
                }
                public boolean configured() { return false; }
                public BillingRuntime.Session configure() { throw new AssertionError("No SDK configuration"); }
            }, Runnable::run, Runnable::run);
            assertFalse(permits(true, Command.startBrowser, () -> Access.fromRuntime(true, runtime.read())));
            runtime.start("bounded-native-capture");
            for (int key = 0; key < 20; key++) {
                assertEquals(status == BillingSnapshot.LegacyStatus.ELIGIBLE,
                        permits(true, Command.startBrowser, () -> Access.fromRuntime(true, runtime.read())));
            }
            assertEquals(1, seals.get()); assertFalse(runtime.read().sdkAvailable);
        }
    }
    @Test public void recoveryAndCleanupDoNotReadRightsWhileNewPairingAndLocksStayPaid() {
        for (Command command : Arrays.asList(Command.stopCamera, Command.stopBrowser, Command.stopVideo,
                Command.stopFriendPairingScan, Command.cancelFriendPairing, Command.removeFriendPairing,
                Command.cancelDumbModeSetup, Command.unlockDumbMode, Command.getHeldFriendCode,
                Command.makePhoneCall, Command.openDefaultPhone, Command.openSystemSetting,
                Command.requestDefaultLauncher, Command.showKeyboardSettings, Command.showKeyboardPicker,
                Command.syncKeyboardSoundSettings, Command.playKeypadTone, Command.billingShellReady)) {
            assertTrue(command.name(), permits(true, command, () -> { throw new AssertionError("Safety must not wait for billing"); }));
        }
        for (Command command : Arrays.asList(Command.beginFriendPairing, Command.acceptFriendPairing,
                Command.completeFriendPairing, Command.acknowledgeFriendPairing, Command.prepareDumbMode,
                Command.activateDumbMode, Command.startFriendPairingScan, Command.startBrowser,
                Command.startVideo, Command.capturePhoto, Command.sendSms, Command.launchApp)) {
            assertEquals(command.name(), Category.PAID_FEATURE, command.category);
            assertFalse(permits(true, command, () -> new Access(true, true, true, false)));
        }
    }
    @Test public void onlyEstablishedHeldCodesBypassPaymentWhileUnconfirmedPairingCodesRequireAccess() throws Exception {
        assertTrue(permitsHeldFriendCode(true, false));
        assertTrue(permitsHeldFriendCode(true, true));
        assertTrue(permitsHeldFriendCode(false, true));
        assertFalse(permitsHeldFriendCode(false, false));
        assertTrue(source("dumbmode/FriendAuthenticatorController.java").contains(
                "permitsHeldFriendCode(row.optBoolean(\"confirmed\"),newPairingAllowed)"));
        assertTrue(source("dumbmode/DumbModeController.java").contains(
                "friends.operation(action, call.getData(), active, newPairingAllowed,"));
        assertTrue(source("dumbmode/FriendAuthenticatorController.java").contains(
                "if(!commandAllowed.getAsBoolean())throw fail(\"billing_access_required\");\n        bump(next);commit(next)"));
    }
    @Test public void actualDeferredResourceOwnersRecheckAndCleanupDoesNotConsultPaidGate() throws Exception {
        String camera = source("camera/BuiltInCameraController.java");
        String browser = source("browser/BuiltInBrowserController.java");
        String qr = source("dumbmode/PairingQrController.java");
        String dumb = source("dumbmode/DumbModeController.java");
        assertTrue(camera.contains("private void bindUseCases(PluginCall call) {\n        if (!requirePaid(call)) return;"));
        assertTrue(camera.contains("if (!requirePaid(call)) { removePreview(); return; }"));
        assertTrue(browser.contains("activity.runOnUiThread(() -> {\n            if (!requirePaid(call)) return;\n            active = true;"));
        assertTrue(browser.contains("private void openExternally() {\n        if (!paidAccess.getAsBoolean()) { stop(); return; }"));
        assertTrue(browser.contains("if (!\"Close\".equals(title) && !paidAccess.getAsBoolean()) { stop(); return true; }"));
        assertTrue(browser.contains("private void switchToTab(int index) {\n        if (!paidAccess.getAsBoolean()) { stop(); return; }"));
        assertTrue(qr.contains("if (!paidAccess.getAsBoolean()) { release(\"billing_access_required\"); return; }"));
        assertTrue(dumb.contains("requirePaid(owner, \"activateDumbMode\");\n        paymentLaunchGate.reserveActivation();"));
        for (String method : Arrays.asList("stopVideo", "stopCamera", "hideMedia")) {
            int start = camera.indexOf("public void " + method + "(");
            assertTrue(start >= 0);
            int end = camera.indexOf("\n    }", start);
            assertFalse(camera.substring(start, end).contains("requirePaid"));
        }
        String plugin = source("LauncherAppsPlugin.java");
        assertTrue(plugin.contains("((MainActivity) getActivity()).permitsPackagedShell(getBridge().getWebView())"));
        int retirement = plugin.indexOf("public void enterNativeRecovery()");
        String hook = plugin.substring(retirement, plugin.indexOf("\n    }", retirement));
        assertTrue(hook.indexOf("paidHostRetired = true") < hook.indexOf("cameraController.pauseForBackground()"));
        assertTrue(hook.contains("browserController.stop()"));
        assertFalse(hook.contains("requireBillingRuntime"));
        assertFalse(hook.contains("new BuiltIn"));
    }
}
