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
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** One authenticated atomic envelope contains pairings, replay ledger, and friend-mode state. */
final class FriendAuthenticatorStore {
    private static final String ALIAS="nokia_friend_auth_aes_v1";
    private final AtomicFile file;
    FriendAuthenticatorStore(Context context) { file=new AtomicFile(new File(context.getNoBackupFilesDir(),"friend-auth-v1.enc")); }
    private SecretKey key(boolean create) throws Exception {
        KeyStore keys=KeyStore.getInstance("AndroidKeyStore"); keys.load(null); SecretKey key=(SecretKey)keys.getKey(ALIAS,null);
        if(key==null) {
            if(!create) throw new IOException("storage_unavailable");
            KeyGenerator generator=KeyGenerator.getInstance("AES","AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build()); key=generator.generateKey();
        }
        return key;
    }
    JSONObject read() throws Exception {
        if(!file.getBaseFile().exists()&&!new File(file.getBaseFile()+".bak").exists()) return null;
        byte[] bytes;
        try(InputStream input=file.openRead();ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[4096];int count;
            while((count=input.read(buffer))!=-1) {if(output.size()+count>262144)throw new IOException("storage_unavailable");output.write(buffer,0,count);}
            bytes=output.toByteArray();
        }
        JSONObject encrypted=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
        if(encrypted.getInt("v")!=1) throw new IOException("storage_unavailable");
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,Base64.decode(encrypted.getString("iv"),Base64.NO_WRAP)));
        cipher.updateAAD("nokia-friend-envelope-v1".getBytes(StandardCharsets.US_ASCII));
        return new JSONObject(new String(cipher.doFinal(Base64.decode(encrypted.getString("data"),Base64.NO_WRAP)),StandardCharsets.UTF_8));
    }
    void write(JSONObject value) throws Exception {
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE,key(true));
        cipher.updateAAD("nokia-friend-envelope-v1".getBytes(StandardCharsets.US_ASCII));
        JSONObject envelope=new JSONObject(); envelope.put("v",1);envelope.put("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP));
        envelope.put("data",Base64.encodeToString(cipher.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP));
        byte[] serialized=envelope.toString().getBytes(StandardCharsets.UTF_8);
        if(serialized.length>262144)throw new IOException("storage_unavailable");
        FileOutputStream output=null;
        try { output=file.startWrite();output.write(serialized);output.getFD().sync();file.finishWrite(output);output=null;
            if(!value.toString().equals(read().toString())) throw new IOException("storage_unavailable");
        } catch(Exception failure) {if(output!=null)file.failWrite(output);throw failure;}
    }
}
