package com.nokialauncher.billing;

import org.junit.Test;
import java.io.*;
import java.util.*;
import javax.crypto.*;
import static org.junit.Assert.*;
import static com.nokialauncher.billing.BillingStore.*;

public class BillingStoreTest {
    private static final class Disk implements Files {
        final Map<FileKind, byte[]> bytes = new EnumMap<>(FileKind.class);
        boolean failWrite, failRead, corruptReadback;
        public boolean exists(FileKind kind) { return bytes.containsKey(kind); }
        public InputStream open(FileKind kind) throws IOException {
            if (failRead) throw new IOException("Injected disk failure");
            return new ByteArrayInputStream(bytes.get(kind));
        }
        public void replace(FileKind kind, byte[] value) throws IOException {
            if (failWrite) throw new IOException("Injected full disk");
            bytes.put(kind, corruptReadback ? new byte[]{0} : value.clone());
        }
    }
    private static final class Keys implements Crypto {
        SecretKey value; boolean lost; int created;
        public SecretKey key(boolean create) throws Exception {
            if (lost) return null;
            if (value == null && create) { value = KeyGenerator.getInstance("AES").generateKey(); created++; }
            return value;
        }
    }
    @Test public void authenticRoundTripUsesThreeIndependentFilesAndExactUnicode() {
        Disk disk = new Disk(); Keys keys = new Keys(); BillingStore store = new BillingStore(disk, keys);
        for (FileKind kind : FileKind.values()) {
            assertEquals(Status.MISSING, store.read(kind).status);
            String payload = "{\"schema\":1,\"text\":\"quyền " + kind + "\"}";
            assertTrue(store.write(kind, payload)); assertEquals(payload, store.read(kind).json);
            assertFalse(new String(disk.bytes.get(kind), java.nio.charset.StandardCharsets.UTF_8).contains("quyền"));
        }
        assertEquals(1, keys.created);
    }
    @Test public void tamperingAndCrossFileSwapAreUnknownAndPreserved() {
        Disk disk = new Disk(); Keys keys = new Keys(); BillingStore store = new BillingStore(disk, keys);
        assertTrue(store.write(FileKind.ACCESS, "{\"schema\":1}"));
        disk.bytes.put(FileKind.LEGACY, disk.bytes.get(FileKind.ACCESS).clone());
        assertEquals(Status.UNKNOWN, store.read(FileKind.LEGACY).status);
        byte[] original = disk.bytes.get(FileKind.LEGACY).clone();
        assertFalse(store.write(FileKind.LEGACY, "{}")); assertArrayEquals(original, disk.bytes.get(FileKind.LEGACY));
        byte[] corrupt = disk.bytes.get(FileKind.ACCESS); corrupt[corrupt.length - 5] ^= 1;
        assertEquals(Status.UNKNOWN, store.read(FileKind.ACCESS).status);
    }
    @Test public void missingKeyCannotOverwriteRightsOrCreateSiblingResetKey() {
        Disk disk = new Disk(); Keys keys = new Keys(); BillingStore store = new BillingStore(disk, keys);
        assertTrue(store.write(FileKind.ACCESS, "{\"lifetimeActive\":true}")); byte[] previous = disk.bytes.get(FileKind.ACCESS).clone();
        keys.lost = true;
        assertEquals(Status.UNKNOWN, store.read(FileKind.ACCESS).status);
        assertFalse(store.write(FileKind.ACCESS, "{}")); assertFalse(store.write(FileKind.ATTEMPT, "{}"));
        assertArrayEquals(previous, disk.bytes.get(FileKind.ACCESS)); assertEquals(1, keys.created);
    }
    @Test public void diskFailureRetainsPriorAndBadReadbackDoesNotReportSuccess() {
        Disk disk = new Disk(); BillingStore store = new BillingStore(disk, new Keys());
        assertTrue(store.write(FileKind.ACCESS, "{\"lifetimeActive\":true}"));
        disk.failWrite = true; assertFalse(store.write(FileKind.ACCESS, "{}"));
        assertEquals("{\"lifetimeActive\":true}", store.read(FileKind.ACCESS).json);
        disk.failRead = true; assertEquals(Status.UNKNOWN, store.read(FileKind.ACCESS).status);
        disk.failRead = false; disk.failWrite = false; disk.corruptReadback = true;
        assertFalse(store.write(FileKind.ATTEMPT, "{}"));
    }
    @Test public void oversizedFileAndMalformedUtf8HaveBoundedUnknownOutcome() {
        Disk disk = new Disk(); BillingStore store = new BillingStore(disk, new Keys());
        disk.bytes.put(FileKind.ACCESS, new byte[MAX_ENVELOPE_BYTES + 1]);
        assertEquals(Status.UNKNOWN, store.read(FileKind.ACCESS).status);
        disk.bytes.put(FileKind.LEGACY, new byte[]{(byte)0xc3, (byte)0x28});
        assertEquals(Status.UNKNOWN, store.read(FileKind.LEGACY).status);
        assertFalse(store.write(FileKind.ATTEMPT, String.join("", Collections.nCopies(MAX_PAYLOAD_BYTES + 1, "x"))));
        assertFalse(store.write(FileKind.ATTEMPT, "\ud800"));
        assertEquals(Status.MISSING, store.read(FileKind.ATTEMPT).status);
    }
}
