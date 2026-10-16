package com.nokialauncher.billing;

import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingAttempt.State.*;
import static com.nokialauncher.billing.BillingStore.*;

/** Actual Gson streaming and AES/GCM roundtrips; filesystem failure injection is below the atomic commit seam. */
public class BillingAttemptStorageTest {
    private static final class Disk implements Files {
        final Map<FileKind, byte[]> bytes = new EnumMap<>(FileKind.class);
        boolean failSync, corruptCommit, unreadable;
        public boolean exists(FileKind kind) { return bytes.containsKey(kind); }
        public InputStream open(FileKind kind) throws IOException {
            if (unreadable) throw new IOException("Injected interrupted read");
            return new ByteArrayInputStream(bytes.get(kind));
        }
        public void replace(FileKind kind, byte[] value) throws IOException {
            // Model failure before atomic finish: committed old bytes remain untouched.
            if (failSync) throw new IOException("Injected sync failure before finish");
            bytes.put(kind, corruptCommit ? new byte[]{0} : value.clone());
        }
    }
    private static final class Keys implements Crypto {
        SecretKey key; boolean lost; int created;
        public SecretKey key(boolean create) throws Exception {
            if (lost) return null;
            if (key == null && create) { key = KeyGenerator.getInstance("AES").generateKey(); created++; }
            return key;
        }
    }
    private static final class Fixture {
        final Disk disk = new Disk(); final Keys keys = new Keys();
        final BillingStore store = new BillingStore(disk, keys);
        final BillingAttemptStorage storage = new BillingAttemptStorage(store, "owner");
        final BillingAttemptCodec codec = new BillingAttemptCodec();
    }
    private static BillingAttempt prepared(String id) {
        return BillingAttempt.prepare(id, "owner", Plan.LIFETIME, "lifetime", null, 123,
                new LinkedHashSet<>(Arrays.asList("old-subscription")));
    }
    private static BillingAttempt completed(BillingAttempt attempt, String receipt) {
        return attempt.reconcile(new BillingAttempt.Receipt("owner", receipt, Plan.LIFETIME,
                "lifetime", null, Verification.REMOTE));
    }
    private static void unknown(BillingAttemptStorage storage) {
        try { storage.load(); fail("Recovery evidence must not become missing"); }
        catch (IOException expected) { /* Unknown remains distinct from missing. */ }
    }
    private static String repeat(String value, int count) {
        StringBuilder out = new StringBuilder(); for (int i = 0; i < count; i++) out.append(value); return out.toString();
    }

    @Test public void preparedSurvivesRestartAndKeepsRealBaselineAndMetadata() throws Exception {
        Fixture f = new Fixture(); assertNull(f.storage.load());
        BillingAttempt a = prepared("purchase"); assertTrue(f.storage.save(a, null));
        BillingAttempt recovered = new BillingAttemptStorage(f.store, "owner").load();
        assertEquals(a.toMap(), recovered.toMap());
        assertEquals(PurchaseStage.PREPARED, recovered.barrier().stage);
        assertFalse(new String(f.disk.bytes.get(FileKind.ATTEMPT), java.nio.charset.StandardCharsets.UTF_8)
                .contains("old-subscription"));
    }

    @Test public void pendingAndUncertainAdvanceButStaleResultsNeverReopenResolution() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase");
        assertTrue(f.storage.save(a, null));
        BillingAttempt pending = a.recordUnresolved(a.id, PENDING);
        BillingAttempt uncertain = pending.recordUnresolved(a.id, UNCERTAIN);
        assertTrue(f.storage.save(pending, a)); assertTrue(f.storage.save(uncertain, pending));
        assertFalse(f.storage.save(pending, uncertain)); assertFalse(f.storage.save(a, uncertain));
        assertFalse(f.storage.save(prepared("second"), uncertain));
        BillingAttempt done = completed(uncertain, "new-receipt"); assertTrue(f.storage.save(done, uncertain));
        assertFalse(new BillingAttemptStorage(f.store, "owner").save(pending, a));
        assertFalse(f.storage.save(a.definitiveUserCancel(a.id), done));
        assertFalse(f.storage.save(completed(a, "other-receipt"), done));
        assertTrue(f.storage.save(done, done)); assertEquals("new-receipt", f.storage.load().resolvedTransactionId);
        BillingAttempt second = prepared("second"); assertTrue(f.storage.save(second, done));
        assertFalse(f.storage.save(done, second)); assertEquals("second", f.storage.load().id);
    }

    @Test public void canceledMayCompleteOnlyWithExactMetadataAndNewVerifiedReceipt() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase");
        assertTrue(f.storage.save(a, null)); BillingAttempt canceled = a.definitiveUserCancel(a.id);
        assertTrue(f.storage.save(canceled, a)); assertFalse(f.storage.save(a.recordUnresolved(a.id, PENDING), canceled));
        assertEquals(CANCELED, completed(canceled, "old-subscription").state);
        assertTrue(f.storage.save(completed(canceled, "new-receipt"), canceled));
        assertEquals(COMPLETED, f.storage.load().state);
    }

    @Test public void sameIdCannotChangeAnyImmutablePurchaseMetadata() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase"); assertTrue(f.storage.save(a, null));
        for (String field : Arrays.asList("ownerEpoch", "plan", "productId", "basePlanId", "startedAtMs", "baselineIds")) {
            Map<String, Object> altered = a.toMap();
            switch (field) {
                case "ownerEpoch": altered.put(field, "other"); break;
                case "plan": altered.put(field, Plan.MONTHLY.wire); altered.put("basePlanId", "monthly"); break;
                case "productId": altered.put(field, "other-product"); break;
                case "basePlanId": altered.put(field, "monthly"); altered.put("plan", Plan.MONTHLY.wire); break;
                case "startedAtMs": altered.put(field, 124L); break;
                default: altered.put(field, Arrays.asList("different-baseline")); break;
            }
            assertFalse(field, f.storage.save(BillingAttempt.fromMap(altered), a));
        }
        assertEquals(a.toMap(), f.storage.load().toMap());
    }

    @Test public void missingCannotStartInResolvedOrPendingStage() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase");
        assertFalse(f.storage.save(a.recordUnresolved(a.id, PENDING), null));
        assertFalse(f.storage.save(a.definitiveUserCancel(a.id), null));
        assertFalse(f.storage.save(completed(a, "new-receipt"), null)); assertNull(f.storage.load());
    }

    @Test public void separateAdaptersSharingDiskOwnerCannotRaceToReplaceAnUnresolvedAttempt() throws Exception {
        Fixture f = new Fixture(); CountDownLatch start = new CountDownLatch(1), finished = new CountDownLatch(2);
        AtomicInteger accepted = new AtomicInteger();
        for (String id : Arrays.asList("first", "second")) {
            Thread worker = new Thread(() -> {
                try {
                    if (start.await(5, TimeUnit.SECONDS)
                            && new BillingAttemptStorage(f.store, "owner").save(prepared(id), null)) accepted.incrementAndGet();
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                finally { finished.countDown(); }
            });
            worker.setDaemon(true); worker.start();
        }
        start.countDown(); assertTrue(finished.await(5, TimeUnit.SECONDS));
        assertEquals(1, accepted.get()); assertEquals(PREPARED, f.storage.load().state);
        assertTrue(Arrays.asList("first", "second").contains(f.storage.load().id));
    }

    @Test public void historicalPreparedReplayCannotReplaceAResolvedNewerJournal() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("native-uuid-a"), b = prepared("native-uuid-b");
        BillingAttempt canceledA = a.definitiveUserCancel(a.id), canceledB = b.definitiveUserCancel(b.id);
        assertTrue(f.storage.save(a, null)); assertTrue(f.storage.save(canceledA, a));
        assertTrue(f.storage.save(b, canceledA)); assertTrue(f.storage.save(canceledB, b));
        byte[] previous = f.disk.bytes.get(FileKind.ATTEMPT).clone();
        // Delayed initial write and queued retry captured their expectation while A was current/missing.
        assertFalse(f.storage.save(a, null)); assertFalse(f.storage.save(a, canceledA));
        assertFalse(f.storage.save(completed(a, "late-a-receipt"), canceledA));
        assertArrayEquals(previous, f.disk.bytes.get(FileKind.ATTEMPT));
        assertEquals(canceledB.toMap(), f.storage.load().toMap());
        // Only a new explicit user intent captures B and supplies a fresh native UUID.
        assertTrue(f.storage.save(prepared("native-uuid-c"), canceledB));
    }

    @Test public void compareAndSaveRequiresTheExactCapturedStateAndMetadata() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase"); assertTrue(f.storage.save(a, null));
        Map<String, Object> changed = a.toMap(); changed.put("startedAtMs", 124L);
        BillingAttempt pending = a.recordUnresolved(a.id, PENDING);
        assertFalse(f.storage.save(pending, BillingAttempt.fromMap(changed)));
        assertFalse(f.storage.save(pending, null)); assertTrue(f.storage.save(pending, a));
        assertFalse(f.storage.save(pending.recordUnresolved(a.id, UNCERTAIN), a));
        assertEquals(pending.toMap(), f.storage.load().toMap());
        // An independently decoded identical snapshot is a valid expectation, not object identity.
        assertTrue(f.storage.save(pending, BillingAttempt.fromMap(pending.toMap())));
    }

    @Test public void concurrentNewIntentsCompareAgainstOneResolvedSnapshotAndOnlyOneWins() throws Exception {
        Fixture f = new Fixture(); BillingAttempt prior = prepared("prior"), canceled = prior.definitiveUserCancel(prior.id);
        assertTrue(f.storage.save(prior, null)); assertTrue(f.storage.save(canceled, prior));
        CountDownLatch start = new CountDownLatch(1), finished = new CountDownLatch(2);
        AtomicInteger accepted = new AtomicInteger();
        for (String id : Arrays.asList("native-uuid-a", "native-uuid-b")) {
            Thread worker = new Thread(() -> {
                try {
                    if (start.await(5, TimeUnit.SECONDS)
                            && new BillingAttemptStorage(f.store, "owner").save(prepared(id), canceled))
                        accepted.incrementAndGet();
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
                finally { finished.countDown(); }
            });
            worker.setDaemon(true); worker.start();
        }
        start.countDown(); assertTrue(finished.await(5, TimeUnit.SECONDS));
        assertEquals(1, accepted.get()); assertEquals(PREPARED, f.storage.load().state);
    }

    @Test public void schemaFaultsAndWrongOwnerPreserveAuthenticatedBytes() throws Exception {
        BillingAttempt a = prepared("purchase");
        Fixture source = new Fixture(); String json = source.codec.encode(a);
        for (String bad : Arrays.asList(
                json.replace("\"schema\":1", "\"schema\":2"),
                json.replace("\"schema\":1", "\"schema\":\"1\""),
                json.replace("\"schema\":1", "\"schema\":1.0"),
                json.replace("\"schema\":1", "\"schema\":1e0"),
                json.replace("\"schema\":1", "\"schema\":1,\"schema\":1"),
                json.replace("\"id\":\"purchase\"", "\"id\":null"),
                json.replace("\"id\":\"purchase\"", "\"id\":true"),
                json.replace("\"startedAtMs\":123", "\"startedAtMs\":9007199254740992"),
                json.replace("\"startedAtMs\":123", "\"startedAtMs\":-1"),
                json.replace("[\"old-subscription\"]", "[42]"),
                json.replace("[\"old-subscription\"]", "[null]"),
                json.replace("[\"old-subscription\"]", "[\"old-subscription\",\"old-subscription\"]"),
                json.replace("[\"old-subscription\"]", "{}"),
                json.replace("\"ownerEpoch\":\"owner\"", "\"ownerEpoch\":\"other\""),
                json.replace("\"schema\":1,", ""),
                json.replace("\"schema\":1", "\"schema\":1,\"token\":\"secret\""),
                json.replace("\"purchase\"", "\"\\ud800\""),
                json.replace("\"purchase\"", "\"\\n\""),
                json + " {}", json.replace("\"id\"", "id"))) {
            Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.ATTEMPT, bad));
            byte[] bytes = f.disk.bytes.get(FileKind.ATTEMPT).clone();
            unknown(f.storage); assertFalse(f.storage.save(a, null));
            assertArrayEquals(bytes, f.disk.bytes.get(FileKind.ATTEMPT));
        }
    }

    @Test public void codecRequiresAnAuthenticatedPresentResultAndStorageUsesAttemptAad() throws Exception {
        Fixture f = new Fixture();
        try { f.codec.decode(f.store.read(FileKind.ATTEMPT)); fail(); } catch (IOException expected) { }
        try { f.codec.decode(null); fail(); } catch (IOException expected) { }
        assertTrue(f.store.write(FileKind.ACCESS, f.codec.encode(prepared("purchase"))));
        f.disk.bytes.put(FileKind.ATTEMPT, f.disk.bytes.get(FileKind.ACCESS).clone());
        byte[] bytes = f.disk.bytes.get(FileKind.ATTEMPT).clone(); unknown(f.storage);
        assertFalse(f.storage.save(prepared("purchase"), null));
        assertArrayEquals(bytes, f.disk.bytes.get(FileKind.ATTEMPT));
    }

    @Test public void atomicSyncFailureAndReadbackFailureNeverReportPreparedAsDurable() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase"); f.disk.failSync = true;
        assertFalse(f.storage.save(a, null)); assertNull(f.storage.load());
        f.disk.failSync = false; assertTrue(f.storage.save(a, null));
        byte[] previous = f.disk.bytes.get(FileKind.ATTEMPT).clone(); f.disk.failSync = true;
        assertFalse(f.storage.save(a.recordUnresolved(a.id, PENDING), a));
        assertArrayEquals(previous, f.disk.bytes.get(FileKind.ATTEMPT));
        assertEquals(PREPARED, new BillingAttemptStorage(f.store, "owner").load().state);
        f.disk.failSync = false; f.disk.corruptCommit = true;
        assertFalse(f.storage.save(a.recordUnresolved(a.id, PENDING), a)); unknown(f.storage);
    }

    @Test public void keyLossAndUnreadableDiskRemainUnknownAndNeverResetKey() throws Exception {
        Fixture f = new Fixture(); BillingAttempt a = prepared("purchase"); assertTrue(f.storage.save(a, null));
        byte[] previous = f.disk.bytes.get(FileKind.ATTEMPT).clone(); f.keys.lost = true;
        unknown(f.storage); assertFalse(f.storage.save(a, a));
        assertArrayEquals(previous, f.disk.bytes.get(FileKind.ATTEMPT)); assertEquals(1, f.keys.created);
        f.keys.lost = false; f.disk.unreadable = true; unknown(f.storage); assertFalse(f.storage.save(a, a));
        assertArrayEquals(previous, f.disk.bytes.get(FileKind.ATTEMPT));
    }

    @Test public void fullAsciiAndNearLimitEscapedBaselinesRoundTripButOversizeIsNonDestructive() throws Exception {
        for (String stem : Arrays.asList(repeat("a", 125), repeat("\\", 120))) {
            Fixture f = new Fixture(); Set<String> ids = new LinkedHashSet<>();
            for (int i = 0; i < 256; i++) ids.add(stem + String.format(java.util.Locale.ROOT, "%03d", i));
            BillingAttempt a = BillingAttempt.prepare("purchase", "owner", Plan.LIFETIME, "lifetime", null, 123, ids);
            assertTrue(f.storage.save(a, null)); assertEquals(a.toMap(), f.storage.load().toMap());
        }
        for (String stem : Arrays.asList(repeat("\\", 125), repeat("\u754c", 125), repeat("\u2028", 125))) {
            Fixture f = new Fixture(); BillingAttempt prior = prepared("prior"); assertTrue(f.storage.save(prior, null));
            assertTrue(f.storage.save(prior.definitiveUserCancel(prior.id), prior));
            byte[] previous = f.disk.bytes.get(FileKind.ATTEMPT).clone(); Set<String> ids = new LinkedHashSet<>();
            for (int i = 0; i < 256; i++) ids.add(stem + String.format(java.util.Locale.ROOT, "%03d", i));
            BillingAttempt oversized = BillingAttempt.prepare("purchase", "owner", Plan.LIFETIME, "lifetime", null, 123, ids);
            assertFalse(f.storage.save(oversized, prior.definitiveUserCancel(prior.id))); assertArrayEquals(previous, f.disk.bytes.get(FileKind.ATTEMPT));
            assertEquals("prior", f.storage.load().id);
        }
    }

    @Test public void typedBoundsRejectOversizedListsAndIdentifiersWithoutTruncation() throws Exception {
        Fixture f = new Fixture(); String json = f.codec.encode(prepared("purchase"));
        for (String baseline : Arrays.asList("[\"" + repeat("a", 129) + "\"]",
                "[\"" + String.join("\",\"", makeIds(257)) + "\"]")) {
            assertTrue(f.store.write(FileKind.ATTEMPT, json.replace("[\"old-subscription\"]", baseline)));
            unknown(f.storage); assertFalse(f.storage.save(prepared("purchase"), null));
        }
    }
    private static Set<String> makeIds(int count) {
        Set<String> ids = new LinkedHashSet<>(); for (int i = 0; i < count; i++) ids.add("id-" + i); return ids;
    }
}
