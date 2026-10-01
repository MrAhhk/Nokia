package com.nokialauncher.dumbmode;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;

/** Only a keyed verifier reaches noBackup storage. Failed writes retain the last complete state. */
final class DumbModeStore {
    private final AtomicFile file;
    private static final String ALIAS = "nokia_dumb_mode_hmac_v1";
    DumbModeStore(Context context) { file = new AtomicFile(new File(context.getNoBackupFilesDir(), "dumb-mode-v1.json")); }
    JSONObject read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return null;
        try (InputStream in = file.openRead(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n;
            while ((n = in.read(buffer)) != -1) {
                if (out.size() + n > 1024 * 1024) throw new IOException("invalid_store");
                out.write(buffer, 0, n);
            }
            return new JSONObject(new String(out.toByteArray(), StandardCharsets.UTF_8));
        }
    }
    void write(JSONObject state) throws Exception {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(state.toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
            file.finishWrite(output);
            output = null;
            // AtomicFile can log a failed rename instead of throwing. Do not report
            // an activation/unlock as durable until its exact state is readable.
            JSONObject persisted = read();
            if (persisted == null || !state.toString().equals(persisted.toString()))
                throw new IOException("state_not_persisted");
        } catch (Exception error) { if (output != null) file.failWrite(output); throw error; }
    }
    byte[] mac(String code, boolean create) throws Exception {
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        SecretKey key = (SecretKey) keys.getKey(ALIAS, null);
        if (key == null) {
            if (!create) throw new IOException("missing_key");
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                    .setDigests(KeyProperties.DIGEST_SHA256).build());
            key = generator.generateKey();
        }
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(key);
        return mac.doFinal(code.getBytes(StandardCharsets.US_ASCII));
    }
}
