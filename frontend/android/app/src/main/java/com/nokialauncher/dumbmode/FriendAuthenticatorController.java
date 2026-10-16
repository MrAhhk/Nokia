package com.nokialauncher.dumbmode;

import android.content.Context;
import android.os.SystemClock;
import com.getcapacitor.JSObject;
import org.json.*;
import java.security.*;
import java.util.*;

/** Access only on DumbModeController's serial worker. Copy-on-write keeps failed writes fail-closed. */
final class FriendAuthenticatorController {
    private final FriendAuthenticatorStore store;
    private JSONObject data;
    private long cooldownDeadline;
    private static final long TTL=86400000L;
    FriendAuthenticatorController(Context context) {store=new FriendAuthenticatorStore(context);}
    void load() throws Exception {
        data=store.read();
        if(data==null) {data=new JSONObject();data.put("v",1);data.put("installationId",UUID.randomUUID().toString());data.put("revision",0);data.put("records",new JSONArray());data.put("failedAttempts",0);data.put("cooldownUntil",0);}
        if(data.getInt("v")!=1 || data.getLong("revision")<0) throw fail("storage_unavailable");
        PairingProtocol.uuid(data.getString("installationId"));
        int failed=data.getInt("failedAttempts");if(failed<0||failed>4||data.getLong("cooldownUntil")<0)throw fail("storage_unavailable");
        // A reboot/clock edit cannot erase an outstanding cooldown. Restart conservatively renews its minute.
        if(data.getLong("cooldownUntil")>0)cooldownDeadline=SystemClock.elapsedRealtime()+60000;
        JSONArray records=data.getJSONArray("records");if(records.length()>30)throw fail("storage_unavailable");Set<String> ids=new HashSet<>();int ownerCount=0,holderCount=0;
        for(int i=0;i<records.length();i++) {JSONObject row=records.getJSONObject(i);PairingProtocol.uuid(row.getString("id"));
            if(!ids.add(row.getString("id")))throw fail("storage_unavailable");
            if(!Arrays.asList("owner","holder").contains(row.getString("role")))throw fail("storage_unavailable");
            if("owner".equals(row.getString("role")))ownerCount++;else holderCount++;
            label(row.getString("label"));
            if(row.optBoolean("confirmed")&&!row.has("secret"))throw fail("storage_unavailable");
            if(row.has("secret") && (PairingProtocol.decode(row.getString("secret")).length!=32||row.getLong("lastAccepted") < -1))throw fail("storage_unavailable");
            if(!row.optBoolean("confirmed")) {
                if(row.getLong("expiresAt")<0)throw fail("storage_unavailable");PairingProtocol.parse(row.getJSONObject("invite").toString(),"invite");
                if("holder".equals(row.getString("role"))) {
                    PairingProtocol.parse(row.getJSONObject("response").toString(),"response");
                    if(PairingProtocol.decode(row.getString("confirmationKey")).length!=32)throw fail("storage_unavailable");
                } else KeyFactory.getInstance("EC").generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(PairingProtocol.decode(row.getString("privateKey"))));
            }
        }
        if(ownerCount>10||holderCount>20)throw fail("storage_unavailable");
    }
    JSONObject mode() {return data.optJSONObject("mode");}
    long cooldownUntil(){return cooldownDeadline>SystemClock.elapsedRealtime()?System.currentTimeMillis()+cooldownDeadline-SystemClock.elapsedRealtime():0;}
    long revision(){return data.optLong("revision",0);}
    private JSONObject copy() throws Exception{return new JSONObject(data.toString());}
    private void commit(JSONObject next) throws Exception {store.write(next);data=next;}
    void saveMode(JSONObject mode) throws Exception {JSONObject next=copy();next.put("mode",mode);commit(next);}
    private static IllegalArgumentException fail(String code){return new IllegalArgumentException(code);}
    private static String label(String label) {
        if(label==null || label.trim().isEmpty() || label.length()>40 || label.matches("(?s).*[\\p{Cntrl}].*"))throw fail("invalid_label");return label.trim();
    }
    private void expected(JSONObject args) {if(!(args.opt("expectedRevision") instanceof Number) || args.optDouble("expectedRevision",-1)!=revision())throw fail("stale_revision");}
    private static JSONObject record(JSONObject state,String id) throws Exception {
        JSONArray rows=state.getJSONArray("records");for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).getString("id").equals(id))return rows.getJSONObject(i);throw fail("pairing_not_found");
    }
    private void available(JSONObject row) {if(!row.optBoolean("confirmed") && row.optLong("expiresAt",0)<System.currentTimeMillis())throw fail("pairing_expired");}
    private static void bump(JSONObject state) throws Exception {state.put("revision",state.getLong("revision")+1);}
    private static void capacity(JSONObject next,String role,int limit) throws Exception {
        JSONArray rows=next.getJSONArray("records");int count=0;for(int i=0;i<rows.length();i++)if(role.equals(rows.getJSONObject(i).optString("role")))count++;
        if(count>=limit)throw fail("pairing_limit");
    }
    JSObject snapshot() throws Exception {
        JSObject result=new JSObject();JSONArray owners=new JSONArray(),holders=new JSONArray(),pending=new JSONArray();
        JSONArray rows=data.getJSONArray("records");
        for(int i=0;i<rows.length();i++) {
            JSONObject row=rows.getJSONObject(i),publicRow=new JSONObject();
            publicRow.put("id",row.getString("id"));publicRow.put("pendingId",row.getString("id"));publicRow.put("label",row.getString("label"));publicRow.put("role",row.getString("role"));publicRow.put("confirmed",row.optBoolean("confirmed"));
            publicRow.put("expiresAt",row.optLong("expiresAt",0));
            if(row.has("fingerprint"))publicRow.put("fingerprint",row.getString("fingerprint"));
            if(row.has("receipt"))publicRow.put("receipt",row.getJSONObject("receipt").toString());
            if(!row.optBoolean("confirmed")) {
                if(row.has("invite"))publicRow.put("invitation",row.getJSONObject("invite").toString());
                if(row.has("response"))publicRow.put("response",row.getJSONObject("response").toString());
                pending.put(publicRow);
            }
            if("owner".equals(row.getString("role")))owners.put(publicRow);else holders.put(publicRow);
        }
        result.put("revision",revision());result.put("owners",owners);result.put("holders",holders);result.put("pending",pending);result.put("cooldownUntil",cooldownUntil());return result;
    }
    Set<String> validateFriends(JSONArray ids) throws Exception {
        if(ids==null || ids.length()==0 || ids.length()>10)throw fail("friends_required");Set<String> chosen=new HashSet<>();
        for(int i=0;i<ids.length();i++) {String id=ids.getString(i);JSONObject row=record(data,id);
            if(!"owner".equals(row.getString("role")) || !row.optBoolean("confirmed"))throw fail("friend_not_confirmed");chosen.add(id);}
        return chosen;
    }
    JSObject operation(String action,JSONObject args,boolean active,boolean newPairingAllowed,
            java.util.function.BooleanSupplier commandAllowed) throws Exception {
        if("getFriendAuthenticatorState".equals(action))return snapshot();
        if("getHeldFriendCode".equals(action)) {
            JSONObject row=record(data,args.optString("pairingId",args.optString("id")));available(row);
            if(!"holder".equals(row.getString("role"))||!row.has("secret"))throw fail("code_unavailable");
            if(!com.nokialauncher.billing.BillingCommandPolicy.permitsHeldFriendCode(row.optBoolean("confirmed"),newPairingAllowed))throw fail("billing_access_required");
            long period=System.currentTimeMillis()/30000;JSObject result=new JSObject();result.put("code",TotpPolicy.code(PairingProtocol.decode(row.getString("secret")),period));result.put("expiresAt",(period+1)*30000);return result;
        }
        if("inspectFriendPairing".equals(action)) {
            JSONObject row=record(data,args.getString("pendingId"));available(row);
            if(!"owner".equals(row.getString("role")) || row.optBoolean("confirmed"))throw fail("invalid_pairing_role");
            JSONObject response=response(row,args.getString("response"));JSObject result=new JSObject();result.put("fingerprint",PairingProtocol.fingerprint(PairingProtocol.transcript(row.getJSONObject("invite"),response)));return result;
        }
        expected(args);JSONObject next=copy();JSObject result=new JSObject();
        if("beginFriendPairing".equals(action)) {
            if(active)throw fail("already_active");capacity(next,"owner",10);KeyPair keys=PairingProtocol.keys();String id=UUID.randomUUID().toString();long now=System.currentTimeMillis();
            JSONObject invite=new JSONObject();invite.put("v",1);invite.put("type","invite");invite.put("id",id);invite.put("owner",data.getString("installationId"));invite.put("key",PairingProtocol.encode(keys.getPublic().getEncoded()));invite.put("nonce",PairingProtocol.nonce());invite.put("created",now);
            JSONObject row=new JSONObject();row.put("id",id);row.put("role","owner");row.put("label",label(args.optString("label",args.optString("localLabel"))));row.put("confirmed",false);row.put("expiresAt",now+TTL);row.put("privateKey",PairingProtocol.encode(keys.getPrivate().getEncoded()));row.put("invite",invite);
            next.getJSONArray("records").put(row);result.put("pendingId",id);result.put("invitation",invite.toString());
        } else if("acceptFriendPairing".equals(action)) {
            capacity(next,"holder",20);JSONObject invite=PairingProtocol.parse(args.getString("invitation"),"invite");long created=invite.getLong("created"),now=System.currentTimeMillis();
            if(created>now+90000 || now-created>TTL)throw fail("pairing_expired");if(invite.getString("owner").equals(data.getString("installationId")))throw fail("self_pairing");
            JSONArray records=next.getJSONArray("records");for(int i=0;i<records.length();i++)if(invite.getString("id").equals(records.getJSONObject(i).getString("id")))throw fail("duplicate_pairing");
            KeyPair keys=PairingProtocol.keys();JSONObject response=new JSONObject();response.put("v",1);response.put("type","response");response.put("id",invite.getString("id"));response.put("owner",invite.getString("owner"));response.put("holder",data.getString("installationId"));response.put("key",PairingProtocol.encode(keys.getPublic().getEncoded()));response.put("nonce",PairingProtocol.nonce());response.put("inviteHash",PairingProtocol.invitationHash(invite));
            String transcript=PairingProtocol.transcript(invite,response);JSONObject row=new JSONObject();row.put("id",invite.getString("id"));row.put("role","holder");row.put("label",label(args.optString("label",args.optString("localLabel"))));row.put("confirmed",false);row.put("expiresAt",created+TTL);row.put("peer",invite.getString("owner"));row.put("invite",invite);row.put("response",response);row.put("fingerprint",PairingProtocol.fingerprint(transcript));
            row.put("secret",PairingProtocol.encode(PairingProtocol.derive(PairingProtocol.encode(keys.getPrivate().getEncoded()),invite.getString("key"),transcript,"totp")));row.put("confirmationKey",PairingProtocol.encode(PairingProtocol.derive(PairingProtocol.encode(keys.getPrivate().getEncoded()),invite.getString("key"),transcript,"confirmation")));row.put("lastAccepted",-1);
            records.put(row);result.put("pendingId",row.getString("id"));result.put("response",response.toString());result.put("fingerprint",row.getString("fingerprint"));
        } else if("completeFriendPairing".equals(action)) {
            if(active)throw fail("already_active");checkCooldown();JSONObject row=record(next,args.getString("pendingId"));available(row);
            if(!"owner".equals(row.getString("role")) || row.optBoolean("confirmed"))throw fail("invalid_pairing_role");if(!args.optBoolean("fingerprintAcknowledged"))throw fail("fingerprint_required");
            JSONObject response=response(row,args.getString("response"));String transcript=PairingProtocol.transcript(row.getJSONObject("invite"),response);
            byte[] secret=PairingProtocol.derive(row.getString("privateKey"),response.getString("key"),transcript,"totp");long accepted=TotpPolicy.verify(secret,args.optString("code"),System.currentTimeMillis(),-1);
            if(accepted<0){failureAttempt();throw fail("incorrect_or_expired_code");}
            byte[] confirmation=PairingProtocol.derive(row.getString("privateKey"),response.getString("key"),transcript,"confirmation");
            JSONObject receipt=new JSONObject();receipt.put("v",1);receipt.put("type","receipt");receipt.put("id",row.getString("id"));receipt.put("owner",data.getString("installationId"));receipt.put("holder",response.getString("holder"));receipt.put("proof",PairingProtocol.proof(confirmation,transcript+"|confirmed"));
            row.put("confirmed",true);row.put("secret",PairingProtocol.encode(secret));row.put("lastAccepted",accepted);row.put("peer",response.getString("holder"));row.put("fingerprint",PairingProtocol.fingerprint(transcript));row.put("receipt",receipt);row.remove("privateKey");row.remove("invite");
            resetAttempts(next);result.put("receipt",receipt.toString());
        } else if("acknowledgeFriendPairing".equals(action)) {
            JSONObject row=record(next,args.getString("pendingId"));available(row);if(!"holder".equals(row.getString("role")) || row.optBoolean("confirmed"))throw fail("invalid_pairing_role");
            JSONObject receipt=PairingProtocol.parse(args.getString("receipt"),"receipt"),invite=row.getJSONObject("invite"),response=row.getJSONObject("response");
            String transcript=PairingProtocol.transcript(invite,response);
            if(!receipt.getString("id").equals(row.getString("id"))||!receipt.getString("owner").equals(invite.getString("owner"))||!receipt.getString("holder").equals(data.getString("installationId"))||!MessageDigest.isEqual(PairingProtocol.decode(receipt.getString("proof")),PairingProtocol.decode(PairingProtocol.proof(PairingProtocol.decode(row.getString("confirmationKey")),transcript+"|confirmed"))))throw fail("transcript_mismatch");
            row.put("confirmed",true);row.remove("confirmationKey");row.remove("invite");row.remove("response");
        } else if("cancelFriendPairing".equals(action)||"removeFriendPairing".equals(action)) {
            String id=args.optString("pairingId",args.optString("pendingId",args.optString("id")));JSONObject row=record(next,id);
            if(active && "owner".equals(row.getString("role")))throw fail("already_active");
            if("cancelFriendPairing".equals(action) && row.optBoolean("confirmed"))throw fail("pairing_already_confirmed");
            JSONArray remaining=new JSONArray(),records=next.getJSONArray("records");for(int i=0;i<records.length();i++)if(!records.getJSONObject(i).getString("id").equals(id))remaining.put(records.getJSONObject(i));next.put("records",remaining);
        } else throw fail("invalid_operation");
        if(!commandAllowed.getAsBoolean())throw fail("billing_access_required");
        bump(next);commit(next);result.put("state",snapshot());return result;
    }
    private JSONObject response(JSONObject row,String text) throws Exception {
        JSONObject response=PairingProtocol.parse(text,"response");
        if(response.getString("holder").equals(data.getString("installationId")))throw fail("self_pairing");
        PairingProtocol.transcript(row.getJSONObject("invite"),response);return response;
    }
    private void checkCooldown() throws Exception {
        if(cooldownDeadline>SystemClock.elapsedRealtime())throw fail("verification_cooldown");
        if(data.optLong("cooldownUntil",0)>0) {JSONObject next=copy();resetAttempts(next);bump(next);commit(next);cooldownDeadline=0;}
    }
    private static void resetAttempts(JSONObject next)throws Exception {next.put("failedAttempts",0);next.put("cooldownUntil",0);}
    private void failureAttempt() throws Exception {
        JSONObject next=copy();int failures=next.optInt("failedAttempts",0)+1;
        next.put("failedAttempts",failures>=5?0:failures);if(failures>=5)next.put("cooldownUntil",System.currentTimeMillis()+60000);bump(next);commit(next);
        if(failures>=5)cooldownDeadline=SystemClock.elapsedRealtime()+60000;
    }
    void unlock(String friendId,String code,Set<String> selected,JSONObject offMode) throws Exception {
        checkCooldown();if(!selected.contains(friendId)){failureAttempt();throw fail("friend_not_selected");}
        JSONObject next=copy(),row=record(next,friendId);
        if(!"owner".equals(row.getString("role"))||!row.optBoolean("confirmed"))throw fail("friend_not_confirmed");
        long accepted=TotpPolicy.verify(PairingProtocol.decode(row.getString("secret")),code,System.currentTimeMillis(),row.optLong("lastAccepted",-1));
        if(accepted<0){failureAttempt();throw fail("incorrect_or_expired_code");}
        row.put("lastAccepted",accepted);resetAttempts(next);next.put("mode",offMode);bump(next);commit(next);
    }
}
