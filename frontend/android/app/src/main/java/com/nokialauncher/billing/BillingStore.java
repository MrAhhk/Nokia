package com.nokialauncher.billing;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.charset.*;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.Base64;
import java.util.regex.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Blocking storage only: call from the billing worker. No rights are granted or revoked here.
 * The owner supplies schema-validated normalized JSON, never SDK receipts/tokens.
 * UNKNOWN preserves the original file and requires recovery; it never means no purchase.
 */
public final class BillingStore {
    public enum FileKind { LEGACY("legacy.json"), ACCESS("access.json"), ATTEMPT("attempt.json");
        public final String filename; FileKind(String name) { filename = name; } }
    public enum Status { PRESENT, MISSING, UNKNOWN }
    public static final class ReadResult {
        public final Status status; public final String json;
        private ReadResult(Status status, String json) { this.status = status; this.json = json; }
    }
    static final int MAX_PAYLOAD_BYTES = 65536, MAX_ENVELOPE_BYTES = 90000;
    static final String KEY_ALIAS = "nokia_billing_cache_aes_v1";
    private static final Pattern ENVELOPE = Pattern.compile("\\{\"v\":1,\"iv\":\"([A-Za-z0-9+/=]{16})\",\"data\":\"([A-Za-z0-9+/=]+)\"\\}");
    interface Files {
        boolean exists(FileKind kind) throws Exception;
        InputStream open(FileKind kind) throws Exception;
        /** Atomic replacement must sync before finish; failed writes retain previous bytes. */
        void replace(FileKind kind, byte[] bytes) throws Exception;
    }
    interface Crypto { SecretKey key(boolean create) throws Exception; }
    private final Files files; private final Crypto crypto;
    public BillingStore(Context context) { this(new AndroidFiles(new File(context.getNoBackupFilesDir(), "billing")), new AndroidCrypto()); }
    BillingStore(Files files, Crypto crypto) { this.files = files; this.crypto = crypto; }

    public synchronized ReadResult read(FileKind kind) {
        if (kind == null) throw new IllegalArgumentException("Missing billing file kind");
        try {
            if (!files.exists(kind)) return new ReadResult(Status.MISSING, null);
            byte[] bytes;
            try (InputStream input = files.open(kind)) { bytes = boundedRead(input); }
            Matcher envelope = ENVELOPE.matcher(utf8(bytes));
            if (!envelope.matches()) throw new IOException("Invalid billing envelope");
            byte[] iv = Base64.getDecoder().decode(envelope.group(1));
            byte[] encrypted = Base64.getDecoder().decode(envelope.group(2));
            if (iv.length != 12 || encrypted.length < 16 || encrypted.length > MAX_PAYLOAD_BYTES + 16)
                throw new IOException("Invalid billing envelope bounds");
            SecretKey key = crypto.key(false);
            if (key == null) throw new IOException("Missing billing key");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(aad(kind));
            return new ReadResult(Status.PRESENT, utf8(cipher.doFinal(encrypted)));
        } catch (Exception unknown) { return new ReadResult(Status.UNKNOWN, null); }
    }

    /** True only after authenticated exact readback. A failed persistence never publishes denial. */
    public synchronized boolean write(FileKind kind, String json) {
        if (kind == null) throw new IllegalArgumentException("Missing billing file kind");
        try {
            // Refuse to overwrite corrupt/key-lost evidence. Missing key cannot reset any sibling file.
            boolean anyExisting = false;
            for (FileKind file : FileKind.values()) anyExisting |= files.exists(file);
            ReadResult previous = read(kind);
            if (previous.status == Status.UNKNOWN || json == null || json.length() > MAX_PAYLOAD_BYTES) return false;
            byte[] payload = json.getBytes(StandardCharsets.UTF_8);
            if (payload.length > MAX_PAYLOAD_BYTES || !json.equals(utf8(payload))) return false;
            SecretKey key = crypto.key(!anyExisting);
            if (key == null) return false;
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key); cipher.updateAAD(aad(kind));
            String envelope = "{\"v\":1,\"iv\":\"" + Base64.getEncoder().encodeToString(cipher.getIV())
                    + "\",\"data\":\"" + Base64.getEncoder().encodeToString(cipher.doFinal(payload)) + "\"}";
            byte[] bytes = envelope.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_ENVELOPE_BYTES) return false;
            files.replace(kind, bytes);
            ReadResult verified = read(kind);
            return verified.status == Status.PRESENT && json.equals(verified.json);
        } catch (Exception unavailable) { return false; }
    }
    private static byte[] aad(FileKind kind) { return ("nokia-billing-envelope-v1:" + kind.filename).getBytes(StandardCharsets.US_ASCII); }
    private static String utf8(byte[] bytes) throws CharacterCodingException {
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
    }
    private static byte[] boundedRead(InputStream input) throws IOException {
        // Fixed upper bound before any file-controlled allocation, including oversized/sparse files.
        byte[] buffer = new byte[MAX_ENVELOPE_BYTES + 1]; int count = 0;
        while (count < buffer.length) {
            int n = input.read(buffer, count, buffer.length - count);
            if (n < 0) return Arrays.copyOf(buffer, count);
            if (n == 0) { int single = input.read(); if (single < 0) return Arrays.copyOf(buffer, count); buffer[count++] = (byte) single; }
            else count += n;
        }
        throw new IOException("Billing envelope too large");
    }
    private static final class AndroidFiles implements Files {
        private final File directory;
        AndroidFiles(File directory) { this.directory = directory; }
        private AtomicFile file(FileKind kind) { return new AtomicFile(new File(directory, kind.filename)); }
        public boolean exists(FileKind kind) {
            File base = new File(directory, kind.filename);
            return base.exists() || new File(base + ".bak").exists() || new File(base + ".new").exists();
        }
        public InputStream open(FileKind kind) throws IOException {
            File base = new File(directory, kind.filename);
            // AtomicFile may discard an orphan .new on openRead. Preserve sole interrupted evidence.
            if (!base.exists() && !new File(base + ".bak").exists())
                throw new IOException("Uncommitted billing file requires recovery");
            return file(kind).openRead();
        }
        public void replace(FileKind kind, byte[] bytes) throws IOException {
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Billing directory unavailable");
            AtomicFile atomic = file(kind); FileOutputStream output = null;
            try {
                output = atomic.startWrite(); output.write(bytes); output.getFD().sync();
                atomic.finishWrite(output); output = null;
            } finally { if (output != null) atomic.failWrite(output); }
        }
    }
    private static final class AndroidCrypto implements Crypto {
        public SecretKey key(boolean create) throws Exception {
            KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
            SecretKey key = (SecretKey) keys.getKey(KEY_ALIAS, null);
            if (key == null && create) {
                KeyGenerator generator = KeyGenerator.getInstance("AES", "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
                key = generator.generateKey();
            }
            return key;
        }
    }
}
