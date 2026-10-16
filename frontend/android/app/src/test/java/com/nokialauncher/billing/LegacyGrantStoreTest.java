package com.nokialauncher.billing;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.LegacyStatus.*;

public class LegacyGrantStoreTest {
    private static final class Disk implements BillingStore.Files {
        final Map<BillingStore.FileKind, byte[]> bytes = new EnumMap<>(BillingStore.FileKind.class);
        boolean failWrite, failRead; int writes;
        public boolean exists(BillingStore.FileKind kind) { return bytes.containsKey(kind); }
        public InputStream open(BillingStore.FileKind kind) throws IOException {
            if (failRead) throw new IOException("read unavailable");
            return new ByteArrayInputStream(bytes.get(kind));
        }
        public void replace(BillingStore.FileKind kind, byte[] value) throws IOException {
            if (failWrite) throw new IOException("disk full");
            bytes.put(kind, value.clone()); writes++;
        }
    }
    private static final class Keys implements BillingStore.Crypto {
        SecretKey value; boolean lost;
        public SecretKey key(boolean create) throws Exception {
            if (lost) return null;
            if (value == null && create) value = KeyGenerator.getInstance("AES").generateKey();
            return value;
        }
    }
    private static final class Fixture {
        final Disk disk = new Disk(); final Keys keys = new Keys();
        final BillingStore storage = new BillingStore(disk, keys);
        final LegacyGrantStore seals = new LegacyGrantStore(storage);
    }
    private static LegacyGrantStore.ReleasedRules code8() { return new LegacyGrantStore.ReleasedRules("code8-evidence-v1", true, true, false); }
    private static LegacyGrantStore.ReleasedRules complete() { return new LegacyGrantStore.ReleasedRules("explicit-fixture-all-cohorts", true, true, true); }
    private static String evidence(String classification) { return "{\"classification\":\"" + classification + "\"}"; }
    private static String historical(boolean onboarding) { return "{\"classification\":\"historical_valid\",\"" + (onboarding ? "completed" : "shown") + "\":false}"; }
    private static String capture(String onboarding, String checkIn, String readStatus) {
        return "{\"version\":1,\"coverage\":\"unknown\",\"readStatus\":\"" + readStatus + "\",\"onboarding\":" + onboarding + ",\"checkIn\":" + checkIn + "}";
    }
    private static String missing() { return capture(evidence("missing"), evidence("missing"), "complete"); }
    private static String eligible() { return capture(historical(true), historical(false), "complete"); }

    @Test public void authenticatedRoundtripRecognizesUnfinishedHistoricalEvidence() {
        Fixture f = new Fixture(); LegacyGrantStore.Result result = f.seals.sealCapturedBeforeWriters(eligible(), code8());
        assertEquals(ELIGIBLE, result.status); assertTrue(result.persisted);
        assertEquals(ELIGIBLE, result.trustedSealedState().status); assertTrue(result.trustedSealedState().persisted);
        String encrypted = new String(f.disk.bytes.get(BillingStore.FileKind.LEGACY), StandardCharsets.UTF_8);
        assertFalse(encrypted.contains("eligible")); assertTrue(encrypted.contains("\"iv\""));
        assertEquals(ELIGIBLE, new LegacyGrantStore(f.storage).sealCapturedBeforeWriters(null, null).status);
        assertEquals(1, f.disk.writes);
    }

    @Test public void eitherHistoricalKeyIsSufficientWhenOtherIsMissing() {
        assertEquals(ELIGIBLE, new Fixture().seals.sealCapturedBeforeWriters(capture(historical(true), evidence("missing"), "complete"), code8()).status);
        assertEquals(ELIGIBLE, new Fixture().seals.sealCapturedBeforeWriters(capture(evidence("missing"), historical(false), "complete"), code8()).status);
    }

    @Test public void currentOnboardingPreservesIndependentHistoricalCheckInEvidence() {
        for (boolean completed : new boolean[]{false, true}) {
            String current = "{\"classification\":\"current_valid\",\"completed\":" + completed + "}";
            LegacyGrantStore.Result mixed = new Fixture().seals.sealCapturedBeforeWriters(capture(current, historical(false), "complete"), code8());
            assertEquals(ELIGIBLE, mixed.status); assertTrue(mixed.persisted);
            assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(capture(current, evidence("missing"), "complete"), complete()).status);
            assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(capture(current, historical(false), "complete"), null).status);
            for (String ambiguous : new String[]{"malformed", "unsupported", "oversized", "unreadable"}) {
                String read = "unreadable".equals(ambiguous) ? "unreadable" : "complete";
                assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(capture(current, evidence(ambiguous), read), complete()).status);
            }
        }
    }

    @Test public void freshRequiresExplicitCompleteNativeRulesAndThenCannotMintLegacy() {
        Fixture f = new Fixture(); assertEquals(INELIGIBLE, f.seals.sealCapturedBeforeWriters(missing(), complete()).status);
        assertEquals(INELIGIBLE, new LegacyGrantStore(f.storage).sealCapturedBeforeWriters(eligible(), code8()).status);
        assertEquals(1, f.disk.writes);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(missing(), null).status);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(missing(), code8()).status);
    }
    @Test public void nativeFirstInstallEvidenceRejectsRestoredPreferenceGiftsWithoutClaimingCohortCoverage() {
        Fixture fresh = new Fixture();
        assertEquals(INELIGIBLE, fresh.seals.sealCapturedBeforeWriters(missing(), code8(), true).status);
        assertEquals(INELIGIBLE, fresh.seals.sealCapturedBeforeWriters(eligible(), code8(), false).status);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(missing(), code8(), false).status);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(null, code8(), true).status);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(
                capture(evidence("unreadable"), evidence("missing"), "unreadable"), code8(), true).status);
        assertEquals(INELIGIBLE, new Fixture().seals.sealCapturedBeforeWriters(eligible(), code8(), true).status);
    }

    @Test public void sealedRecoveryCannotBePromotedByLaterWritersOrRuleUpgrade() {
        Fixture f = new Fixture(); assertTrue(f.seals.sealCapturedBeforeWriters(missing(), code8()).persisted);
        assertEquals(NEEDS_RECOVERY, f.seals.sealCapturedBeforeWriters(eligible(), complete()).status);
        assertEquals(1, f.disk.writes);
    }

    @Test public void ambiguousOtherKeyOverridesHistoricalEvidence() {
        for (String classification : new String[]{"malformed", "unsupported", "oversized", "unreadable"}) {
            String read = "unreadable".equals(classification) ? "unreadable" : "complete";
            LegacyGrantStore.Result result = new Fixture().seals.sealCapturedBeforeWriters(capture(historical(true), evidence(classification), read), complete());
            assertEquals(NEEDS_RECOVERY, result.status); assertTrue(result.persisted);
        }
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(capture("{\"classification\":\"current_valid\",\"completed\":true}", evidence("missing"), "complete"), complete()).status);
    }

    @Test public void exactHelperSchemaRejectsContradictionsSpoofFlagsUnknownsAndNestedObjects() {
        String[] invalid = { eligible().replace("\"complete\"", "\"unreadable\""),
                capture(historical(true), evidence("unreadable"), "complete"),
                eligible().replace("\"coverage\":\"unknown\"", "\"coverage\":\"complete\""),
                eligible().replace("\"version\":1", "\"version\":1,\"version\":1"),
                eligible().replace("\"version\":1", "\"version\":1,\"eligible\":true"),
                capture("{\"classification\":\"historical_valid\",\"completed\":false,\"index\":1}", historical(false), "complete"),
                capture("{\"classification\":\"missing\",\"completed\":false}", historical(false), "complete"),
                capture("{\"classification\":\"historical_valid\",\"completed\":{}}", historical(false), "complete"),
                capture("{\"classification\":\"historical_valid\",\"completed\":\"false\"}", historical(false), "complete"),
                capture(historical(true), "{\"classification\":\"current_valid\",\"shown\":false}", "complete"),
                capture("{\"classification\":\"historical_valid\",\"completed\":false,\"completed\":true}", historical(false), "complete"),
                "{\"eligible\":true}", eligible() + " {}", null };
        for (String json : invalid) assertEquals(json, NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(json, complete()).status);
    }

    @Test public void boundedCaptureNeverTreatsOverflowAsFresh() {
        String oversized = new String(new char[1025]).replace('\0', 'x');
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(oversized, complete()).status);
    }

    @Test public void utf8CaptureBoundRejectsMultibyteInputWithinCharacterBound() {
        // Whitespace padding would fit characters; a string field holds bounded
        // multibyte content so the byte gate, before schema parsing, must reject.
        String text = new String(new char[400]).replace('\0', '\u4e00');
        String json = missing().replace("\"coverage\":\"unknown\"", "\"coverage\":\"" + text + "\"");
        assertTrue(json.length() <= 1024);
        assertTrue(json.getBytes(StandardCharsets.UTF_8).length > 1024);
        assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(json, complete()).status);
    }

    @Test public void schemaNumbersRequireExactIntegerLexeme() {
        for (String number : new String[]{"1.0", "1e0", "-0"}) {
            String capture = eligible().replace("\"version\":1", "\"version\":" + number);
            assertEquals(NEEDS_RECOVERY, new Fixture().seals.sealCapturedBeforeWriters(capture, code8()).status);
            Fixture f = new Fixture();
            String marker = "{\"schema\":" + number + ",\"status\":\"eligible\",\"ruleVersion\":\"v1\"}";
            assertTrue(f.storage.write(BillingStore.FileKind.LEGACY, marker));
            byte[] before = f.disk.bytes.get(BillingStore.FileKind.LEGACY).clone();
            LegacyGrantStore.Result result = f.seals.sealCapturedBeforeWriters(eligible(), code8());
            assertEquals(NEEDS_RECOVERY, result.status); assertFalse(result.persisted);
            assertArrayEquals(before, f.disk.bytes.get(BillingStore.FileKind.LEGACY)); assertEquals(1, f.disk.writes);
        }
    }

    @Test public void unreadableExistingValidMarkerRequiresRecoveryWithoutMutation() {
        Fixture f = new Fixture(); assertTrue(f.seals.sealCapturedBeforeWriters(eligible(), code8()).persisted);
        byte[] before = f.disk.bytes.get(BillingStore.FileKind.LEGACY).clone(); f.disk.failRead = true;
        LegacyGrantStore.Result result = f.seals.sealCapturedBeforeWriters(missing(), complete());
        assertEquals(NEEDS_RECOVERY, result.status); assertFalse(result.persisted);
        assertArrayEquals(before, f.disk.bytes.get(BillingStore.FileKind.LEGACY)); assertEquals(1, f.disk.writes);
        f.disk.failRead = false;
        assertEquals(ELIGIBLE, f.seals.sealCapturedBeforeWriters(missing(), complete()).status);
    }

    @Test public void corruptUnauthenticatedOrLostKeyPreservesOriginalEvidence() {
        Fixture f = new Fixture(); f.disk.bytes.put(BillingStore.FileKind.LEGACY, new byte[]{0});
        LegacyGrantStore.Result result = f.seals.sealCapturedBeforeWriters(eligible(), complete());
        assertEquals(NEEDS_RECOVERY, result.status); assertFalse(result.persisted);
        assertArrayEquals(new byte[]{0}, f.disk.bytes.get(BillingStore.FileKind.LEGACY)); assertEquals(0, f.disk.writes);
        Fixture lost = new Fixture(); lost.seals.sealCapturedBeforeWriters(eligible(), code8()); lost.keys.lost = true;
        byte[] before = lost.disk.bytes.get(BillingStore.FileKind.LEGACY).clone();
        assertFalse(lost.seals.sealCapturedBeforeWriters(missing(), complete()).persisted);
        assertArrayEquals(before, lost.disk.bytes.get(BillingStore.FileKind.LEGACY));
    }

    @Test public void authenticatedButInvalidMarkerIsNeverOverwritten() {
        String[] invalid = {"{}", "{\"schema\":1,\"status\":\"eligible\",\"ruleVersion\":\"v1\",\"grant\":true}",
                "{\"schema\":1,\"status\":\"eligible\",\"status\":\"ineligible\",\"ruleVersion\":\"v1\"}",
                "{\"schema\":1,\"status\":\"future\",\"ruleVersion\":\"v1\"}"};
        for (String json : invalid) {
            Fixture f = new Fixture(); assertTrue(f.storage.write(BillingStore.FileKind.LEGACY, json));
            byte[] before = f.disk.bytes.get(BillingStore.FileKind.LEGACY).clone();
            assertFalse(f.seals.sealCapturedBeforeWriters(eligible(), complete()).persisted);
            assertArrayEquals(before, f.disk.bytes.get(BillingStore.FileKind.LEGACY)); assertEquals(1, f.disk.writes);
        }
    }

    @Test public void writeFailureGivesEligibleSessionOnlyAndNoFreshWriterPermission() {
        Fixture f = new Fixture(); f.disk.failWrite = true;
        LegacyGrantStore.Result result = f.seals.sealCapturedBeforeWriters(eligible(), code8());
        assertEquals(ELIGIBLE, result.status); assertFalse(result.persisted); assertFalse(result.trustedSealedState().persisted);
        assertEquals(NEEDS_RECOVERY, f.seals.sealCapturedBeforeWriters(missing(), complete()).status);
        assertEquals(NEEDS_RECOVERY, f.seals.sealCapturedBeforeWriters(null, complete()).status);
        assertFalse(f.disk.bytes.containsKey(BillingStore.FileKind.LEGACY));
        f.disk.failWrite = false; assertTrue(f.seals.sealCapturedBeforeWriters(eligible(), code8()).persisted);
    }

    @Test public void concurrentOwnersUseOneImmutableMarker() throws Exception {
        Fixture f = new Fixture(); CountDownLatch start = new CountDownLatch(1);
        AtomicReference<LegacyGrantStore.Result> a = new AtomicReference<>(), b = new AtomicReference<>();
        Thread first = new Thread(() -> { await(start); a.set(f.seals.sealCapturedBeforeWriters(eligible(), code8())); });
        Thread second = new Thread(() -> { await(start); b.set(new LegacyGrantStore(f.storage).sealCapturedBeforeWriters(missing(), complete())); });
        first.start(); second.start(); start.countDown(); first.join(5000); second.join(5000);
        assertFalse(first.isAlive()); assertFalse(second.isAlive()); assertNotNull(a.get()); assertNotNull(b.get());
        assertEquals(a.get().status, b.get().status); assertTrue(a.get().persisted); assertTrue(b.get().persisted); assertEquals(1, f.disk.writes);
    }
    private static void await(CountDownLatch latch) { try { latch.await(); } catch (InterruptedException e) { throw new AssertionError(e); } }
}
