package com.nokialauncher.billing;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.EnumMap;
import java.util.Map;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingPolicy.*;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingStore.*;

/** Real strict Gson parser and real AES/GCM; only filesystem and Android Keystore are substituted. */
public class BillingCacheCodecTest {
    private static final String OWNER = "config:customer:epoch";
    private final BillingCacheCodec codec = new BillingCacheCodec();
    private static final class Disk implements Files {
        final Map<FileKind, byte[]> bytes = new EnumMap<>(FileKind.class);
        boolean failWrite, failRead, corruptReadback;
        public boolean exists(FileKind kind) { return bytes.containsKey(kind); }
        public InputStream open(FileKind kind) throws IOException {
            if (failRead) throw new IOException("Injected read failure");
            return new ByteArrayInputStream(bytes.get(kind));
        }
        public void replace(FileKind kind, byte[] value) throws IOException {
            if (failWrite) throw new IOException("Injected full disk");
            bytes.put(kind, corruptReadback ? new byte[]{0} : value.clone());
        }
    }
    private static final class Keys implements Crypto {
        SecretKey value; boolean lost;
        public SecretKey key(boolean create) throws Exception {
            if (lost) return null;
            if (value == null && create) value = KeyGenerator.getInstance("AES").generateKey();
            return value;
        }
    }
    private static final class Fixture {
        final Disk disk = new Disk(); final Keys keys = new Keys();
        final BillingStore store = new BillingStore(disk, keys);
        final BillingCacheStorage storage = new BillingCacheStorage(store, OWNER);
    }
    private static StoreRecord record(String owner, long sequence, ClockAnchor clock, boolean integrity) {
        return new StoreRecord(new Store(Verification.REMOTE, 123L, true, true, 900L,
                RenewState.OFF, Plan.YEARLY, false, null), owner, sequence, clock, integrity);
    }
    private String valid() throws IOException { return codec.encode(record(OWNER, 8, null, true)); }
    private StoreRecord decode(String json) throws Exception {
        Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.ACCESS, json));
        return codec.decode(f.store.read(FileKind.ACCESS));
    }
    private void rejects(String json) throws Exception {
        try { decode(json); fail("Malformed normalized cache was accepted"); }
        catch (IOException expected) { /* No invalid data reaches an authenticated StoreRecord. */ }
    }
    @Test public void roundTripPreservesLongOwnerAndNullableFields() throws Exception {
        StoreRecord decoded = decode(codec.encode(record("quyền:😀:owner", Long.MAX_VALUE, null, true)));
        assertEquals("quyền:😀:owner", decoded.generation); assertEquals(Long.MAX_VALUE, decoded.requestSequence);
        assertTrue(decoded.integrityValid); assertNull(decoded.clock); assertNull(decoded.store.pausedUntilMs);
        assertEquals(123L, decoded.store.fetchedAtMs.longValue()); assertEquals(900L, decoded.store.expiresAtMs.longValue());
        assertTrue(decoded.store.lifetimeActive); assertTrue(decoded.store.subscriptionActive);
        assertEquals(RenewState.OFF, decoded.store.renewState); assertEquals(Plan.YEARLY, decoded.store.plan);
    }
    @Test public void nullablePlanExpiryAndUnknownRenewalRoundTrip() throws Exception {
        StoreRecord original = new StoreRecord(new Store(Verification.REMOTE, 0L, false, false, null,
                RenewState.UNKNOWN, null, true, 9007199254740991L), OWNER, 0, null, true);
        StoreRecord decoded = decode(codec.encode(original));
        assertNull(decoded.store.plan); assertNull(decoded.store.expiresAtMs); assertTrue(decoded.store.billingProblem);
        assertEquals(9007199254740991L, decoded.store.pausedUntilMs.longValue()); assertEquals(0, decoded.requestSequence);
    }
    @Test public void trustedAnchorPreservesProvenanceAndBootBoundary() throws Exception {
        ClockAnchor anchor = new ClockAnchor(500, 40, "boot-a", TimeProvenance.SIGNED_REMOTE_BODY_TIME);
        StoreRecord decoded = decode(codec.encode(record(OWNER, 1, anchor, true)));
        assertEquals(TimeProvenance.SIGNED_REMOTE_BODY_TIME, decoded.clock.provenance);
        assertEquals(Long.valueOf(510), trustedNow(decoded.clock, "boot-a", 50));
        assertNull(trustedNow(decoded.clock, "boot-b", 50)); assertNull(trustedNow(decoded.clock, "boot-a", 39));
        assertNull(decode(valid()).clock); // fetchedAtMs/requestDate does not become a trusted clock.
    }
    @Test public void schemaDuplicatesUnknownMissingAndTrailingDataAreRejected() throws Exception {
        String json = valid();
        rejects(json.replace("\"schema\":1", "\"schema\":2"));
        rejects(json.replace("\"schema\":1", "\"schema\":1,\"schema\":1"));
        rejects(json.replace("\"lifetimeActive\":true", "\"lifetimeActive\":true,\"lifetimeActive\":false"));
        rejects(json.replace("\"schema\":1", "\"schema\":1,\"token\":\"secret\""));
        rejects(json.replace("\"schema\":1,", ""));
        rejects(json.replace("\"clock\":null", "\"clock\":null,\"integrityValid\":true"));
        rejects(json + " {}"); rejects(json + " garbage");
        rejects(json.replace("\"schema\":1", "'schema':1")); rejects("/*comment*/" + json);
    }
    @Test public void signedRequestTimeRoundTripsWithoutChangingBodyProvenance() throws Exception {
        ClockAnchor anchor = new ClockAnchor(600, 40, "boot-a", TimeProvenance.SIGNED_REMOTE_REQUEST_TIME);
        StoreRecord decoded = decode(codec.encode(record(OWNER, 1, anchor, true)));
        assertEquals(TimeProvenance.SIGNED_REMOTE_REQUEST_TIME, decoded.clock.provenance);
        assertEquals(Long.valueOf(610), trustedNow(decoded.clock, "boot-a", 50));
        rejects(valid().replace("\"pausedUntilMs\":null", "\"pausedUntilMs\":9007199254740992"));
    }
    @Test public void integerCoercionFractionsExponentsNegativeAndOverflowAreRejected() throws Exception {
        for (String value : new String[]{"8.0", "8e0", "-1", "-0", "08", "\"8\"", "true", "null", "9223372036854775808", "NaN"})
            rejects(valid().replace("\"requestSequence\":8", "\"requestSequence\":" + value));
        rejects(valid().replace("\"fetchedAtMs\":123", "\"fetchedAtMs\":123.5"));
        rejects(valid().replace("\"expiresAtMs\":900", "\"expiresAtMs\":\"900\""));
        rejects(valid().replace("\"schema\":1", "\"schema\":1.0"));
    }
    @Test public void exactBooleanEnumsAndObjectShapeAreRequired() throws Exception {
        rejects(valid().replace("\"lifetimeActive\":true", "\"lifetimeActive\":\"true\""));
        rejects(valid().replace("\"renewState\":\"off\"", "\"renewState\":\"OFF\""));
        rejects(valid().replace("\"plan\":\"yearly\"", "\"plan\":\"trial\""));
        rejects(valid().replace("\"clock\":null", "\"clock\":[]"));
        rejects(valid().replace("\"clock\":null", "\"clock\":true"));
        rejects(valid().replace("\"generation\":\"" + OWNER + "\"", "\"generation\":42"));
    }
    @Test public void deviceAndUnverifiedProvenanceCannotBeSealedOrDecoded() throws Exception {
        for (Verification verification : new Verification[]{Verification.DEVICE, Verification.UNVERIFIED}) {
            Store untrusted = new Store(verification, null, true, true, null, RenewState.UNKNOWN, null, false, null);
            try { codec.encode(new StoreRecord(untrusted, OWNER, 1, null, true)); fail("Untrusted save"); }
            catch (IOException expected) { }
            rejects(valid().replace("\"verification\":\"remote\"", "\"verification\":\"" + verification.wire + "\""));
        }
        try { codec.encode(record(OWNER, 1, null, false)); fail("Invalid integrity save"); }
        catch (IOException expected) { }
        String anchored = codec.encode(record(OWNER, 1, new ClockAnchor(500, 40, "boot", TimeProvenance.SIGNED_REMOTE_BODY_TIME), true));
        rejects(anchored.replace("SIGNED_REMOTE_BODY_TIME", "DEVICE_REQUEST_DATE"));
        rejects(anchored.replace("\"remoteTimeMs\":500", "\"remoteTimeMs\":-1"));
        rejects(anchored.replace("\"elapsedRealtimeMs\":40", "\"elapsedRealtimeMs\":40.0"));
    }
    @Test public void boundsAndInvalidIdentifiersAreRejected() throws Exception {
        rejects(valid().replace(OWNER, "")); rejects(valid().replace(OWNER, "\\u0000"));
        rejects(valid().replace(OWNER, "\\ud800"));
        rejects(valid().replace(OWNER, new String(new char[129]).replace('\0', 'a')));
        rejects(valid() + new String(new char[BillingCacheCodec.MAX_JSON_BYTES]).replace('\0', ' '));
        rejects(valid().replace("\"clock\":null", "\"clock\":{\"remoteTimeMs\":1}"));
    }
    @Test public void missingReturnsNullAndAuthenticatedRoundTripReturnsTrustedRecord() throws Exception {
        Fixture f = new Fixture(); assertNull(f.storage.load());
        assertTrue(f.storage.save(record(OWNER, Long.MAX_VALUE, null, true)));
        StoreRecord loaded = f.storage.load(); assertTrue(loaded.integrityValid); assertEquals(Long.MAX_VALUE, loaded.requestSequence);
        assertFalse(new String(f.disk.bytes.get(FileKind.ACCESS), java.nio.charset.StandardCharsets.UTF_8).contains(OWNER));
        try { codec.decode(f.store.read(FileKind.ATTEMPT)); fail("Missing decode"); } catch (IOException expected) { }
    }
    @Test public void wrongOwnerRequiresRecoveryAndCannotOverwritePriorBytes() throws Exception {
        Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.ACCESS, codec.encode(record("another-owner", 1, null, true))));
        byte[] prior = f.disk.bytes.get(FileKind.ACCESS).clone();
        try { f.storage.load(); fail("Owner mismatch"); } catch (IOException expected) { }
        assertFalse(f.storage.save(record(OWNER, 2, null, true))); assertArrayEquals(prior, f.disk.bytes.get(FileKind.ACCESS));
        Fixture empty = new Fixture(); assertFalse(empty.storage.save(record("another-owner", 2, null, true)));
        assertFalse(empty.disk.bytes.containsKey(FileKind.ACCESS));
    }
    @Test public void authenticatedMalformedSchemaIsPreservedEvenOnSave() throws Exception {
        Fixture f = new Fixture(); assertTrue(f.store.write(FileKind.ACCESS, "{\"schema\":1}"));
        byte[] prior = f.disk.bytes.get(FileKind.ACCESS).clone();
        try { f.storage.load(); fail("Malformed schema"); } catch (IOException expected) { }
        assertFalse(f.storage.save(record(OWNER, 2, null, true))); assertArrayEquals(prior, f.disk.bytes.get(FileKind.ACCESS));
    }
    @Test public void keyLossTamperAndUnknownReadsArePreservedAsRecovery() throws Exception {
        Fixture f = new Fixture(); assertTrue(f.storage.save(record(OWNER, 1, null, true)));
        byte[] prior = f.disk.bytes.get(FileKind.ACCESS).clone(); f.keys.lost = true;
        try { f.storage.load(); fail("Lost key"); } catch (IOException expected) { }
        assertFalse(f.storage.save(record(OWNER, 2, null, true))); assertArrayEquals(prior, f.disk.bytes.get(FileKind.ACCESS));
        f.keys.lost = false; f.disk.failRead = true;
        try { f.storage.load(); fail("Unknown disk read"); } catch (IOException expected) { }
        assertFalse(f.storage.save(record(OWNER, 2, null, true))); assertArrayEquals(prior, f.disk.bytes.get(FileKind.ACCESS));
        f.disk.failRead = false; f.disk.bytes.get(FileKind.ACCESS)[0] ^= 1;
        try { f.storage.load(); fail("Tampered envelope"); } catch (IOException expected) { }
        assertFalse(f.storage.save(record(OWNER, 2, null, true)));
    }
    @Test public void failedWriteAndReadbackNeverReportSuccess() throws Exception {
        Fixture f = new Fixture(); assertTrue(f.storage.save(record(OWNER, 1, null, true)));
        byte[] prior = f.disk.bytes.get(FileKind.ACCESS).clone(); f.disk.failWrite = true;
        assertFalse(f.storage.save(record(OWNER, 2, null, true))); assertArrayEquals(prior, f.disk.bytes.get(FileKind.ACCESS));
        assertEquals(1, f.storage.load().requestSequence);
        f.disk.failWrite = false; f.disk.corruptReadback = true;
        assertFalse(f.storage.save(record(OWNER, 2, null, true)));
    }
}
