package com.nokialauncher.dumbmode;

import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.util.*;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Public messages contain only keys/nonces; private material stays inside the encrypted store. */
public final class PairingProtocol {
    public static void validatePublicPayload(String token) throws Exception {
        if(token==null || token.getBytes(StandardCharsets.UTF_8).length>2048) throw new IllegalArgumentException("invalid_pairing_message");
        JSONObject message=new JSONObject(token); parse(token,message.getString("type"));
    }
    static String encode(byte[] bytes) { return Base64.encodeToString(bytes, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING); }
    static byte[] decode(String value) { return Base64.decode(value, Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING); }
    static String nonce() { byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes); return encode(bytes); }
    static KeyPair keys() throws Exception {
        KeyPairGenerator generator=KeyPairGenerator.getInstance("EC"); generator.initialize(new ECGenParameterSpec("secp256r1")); return generator.generateKeyPair();
    }
    static JSONObject parse(String token,String type) throws Exception {
        if(token==null || token.getBytes(StandardCharsets.UTF_8).length>2048) throw new IllegalArgumentException("invalid_pairing_message");
        JSONObject message=new JSONObject(token);
        Set<String> allowed;
        if("invite".equals(type)) allowed=new HashSet<>(Arrays.asList("v","type","id","owner","key","nonce","created"));
        else if("response".equals(type)) allowed=new HashSet<>(Arrays.asList("v","type","id","owner","holder","key","nonce","inviteHash"));
        else if("receipt".equals(type)) allowed=new HashSet<>(Arrays.asList("v","type","id","owner","holder","proof"));
        else throw new IllegalArgumentException("invalid_pairing_message");
        if(message.length()!=allowed.size())throw new IllegalArgumentException("invalid_pairing_message");
        Iterator<String> names=message.keys(); while(names.hasNext()) if(!allowed.contains(names.next())) throw new IllegalArgumentException("invalid_pairing_message");
        if(message.getInt("v")!=1 || !type.equals(message.getString("type"))) throw new IllegalArgumentException("invalid_pairing_message");
        uuid(message.getString("id")); uuid(message.getString("owner"));
        if(!"invite".equals(type)) uuid(message.getString("holder"));
        if(!"receipt".equals(type)) {
            if(decode(message.getString("nonce")).length!=32) throw new IllegalArgumentException("invalid_pairing_message");
            publicKey(message.getString("key"));
        }
        if("invite".equals(type) && (!(message.get("created") instanceof Number)||message.getDouble("created")!=message.getLong("created")||message.getLong("created")<0))throw new IllegalArgumentException("invalid_pairing_message");
        if("response".equals(type) && decode(message.getString("inviteHash")).length!=32)throw new IllegalArgumentException("invalid_pairing_message");
        if("receipt".equals(type) && decode(message.getString("proof")).length!=32)throw new IllegalArgumentException("invalid_pairing_message");
        return message;
    }
    static void uuid(String value) { if(!UUID.fromString(value).toString().equals(value)) throw new IllegalArgumentException("invalid_pairing_message"); }
    static PublicKey publicKey(String value) throws Exception {
        byte[] encoded=decode(value); if(encoded.length>160) throw new IllegalArgumentException("invalid_key");
        PublicKey key=KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(encoded));
        java.security.interfaces.ECPublicKey ec=(java.security.interfaces.ECPublicKey)key;
        if(ec.getParams().getCurve().getField().getFieldSize()!=256 || !ec.getParams().getOrder().equals(new java.math.BigInteger("FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551",16))) throw new IllegalArgumentException("invalid_key");
        java.math.BigInteger prime=((ECFieldFp)ec.getParams().getCurve().getField()).getP(),x=ec.getW().getAffineX(),y=ec.getW().getAffineY();
        if(x==null||y==null||x.signum()<0||y.signum()<0||x.compareTo(prime)>=0||y.compareTo(prime)>=0||
                !y.multiply(y).mod(prime).equals(x.multiply(x).multiply(x).add(ec.getParams().getCurve().getA().multiply(x)).add(ec.getParams().getCurve().getB()).mod(prime)))throw new IllegalArgumentException("invalid_key");
        return key;
    }
    static String hash(String text) throws Exception { return encode(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
    static String invitationHash(JSONObject invite) throws Exception {
        return hash("1|invite|"+invite.getString("id")+"|"+invite.getString("owner")+"|"+invite.getString("key")+"|"+invite.getString("nonce")+"|"+invite.getLong("created"));
    }
    static String transcript(JSONObject invite,JSONObject response) throws Exception {
        if(!invite.getString("id").equals(response.getString("id")) || !invite.getString("owner").equals(response.getString("owner")) || !invitationHash(invite).equals(response.getString("inviteHash"))) throw new IllegalArgumentException("transcript_mismatch");
        return "nokia-friend-auth-v1|owner|"+invite.getString("owner")+"|holder|"+response.getString("holder")+"|"+invite.getString("id")+"|"+invite.getString("key")+"|"+invite.getString("nonce")+"|"+response.getString("key")+"|"+response.getString("nonce");
    }
    static byte[] derive(String privateKey,String peerKey,String transcript,String purpose) throws Exception {
        PrivateKey key=KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(decode(privateKey)));
        KeyAgreement agreement=KeyAgreement.getInstance("ECDH"); agreement.init(key); agreement.doPhase(publicKey(peerKey),true);
        byte[] salt=MessageDigest.getInstance("SHA-256").digest(transcript.getBytes(StandardCharsets.UTF_8));
        return TotpPolicy.hkdf(agreement.generateSecret(),salt,("nokia-"+purpose+"-v1").getBytes(StandardCharsets.US_ASCII),32);
    }
    static String fingerprint(String transcript) throws Exception {
        byte[] digest=MessageDigest.getInstance("SHA-256").digest(transcript.getBytes(StandardCharsets.UTF_8));
        return String.format(Locale.ROOT,"%012d",new java.math.BigInteger(1,digest).mod(new java.math.BigInteger("1000000000000")).longValue());
    }
    static String proof(byte[] key,String text) throws Exception { Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key,"HmacSHA256"));return encode(mac.doFinal(text.getBytes(StandardCharsets.UTF_8))); }
}
