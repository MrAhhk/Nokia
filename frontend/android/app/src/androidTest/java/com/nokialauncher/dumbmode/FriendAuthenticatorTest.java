package com.nokialauncher.dumbmode;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;
import java.lang.reflect.*;
import static org.junit.Assert.*;

/** Three isolated identities on one device exercise real Android Keystore and atomic files. */
@RunWith(AndroidJUnit4.class)
public class FriendAuthenticatorTest {
    private Context isolated() {
        Context base=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File directory=new File(base.getCacheDir(),"friend-auth-test-"+UUID.randomUUID());assertTrue(directory.mkdirs());
        return new ContextWrapper(base){@Override public File getNoBackupFilesDir(){return directory;}};
    }
    private FriendAuthenticatorController controller(Context context)throws Exception {FriendAuthenticatorController value=new FriendAuthenticatorController(context);value.load();return value;}
    // Existing protocol scenarios assume full billing authority; recovery-only
    // and authority revocation are exercised explicitly below.
    private JSObject operate(FriendAuthenticatorController controller,String action,JSONObject input,boolean active)throws Exception {
        return controller.operation(action,input,active,true,()->true);
    }
    private JSONObject args(FriendAuthenticatorController controller)throws Exception{return new JSONObject().put("expectedRevision",controller.revision());}
    private String pair(FriendAuthenticatorController owner,FriendAuthenticatorController holder,String label)throws Exception {
        JSObject begin=operate(owner,"beginFriendPairing",args(owner).put("label",label),false);String id=begin.getString("pendingId");
        JSObject accept=operate(holder,"acceptFriendPairing",args(holder).put("label","Owner").put("invitation",begin.getString("invitation")),false);
        JSObject inspect=operate(owner,"inspectFriendPairing",new JSONObject().put("pendingId",id).put("response",accept.getString("response")),false);
        assertEquals(accept.getString("fingerprint"),inspect.getString("fingerprint"));
        JSObject code=operate(holder,"getHeldFriendCode",new JSONObject().put("pairingId",id),false);
        JSObject complete=operate(owner,"completeFriendPairing",args(owner).put("pendingId",id).put("response",accept.getString("response")).put("fingerprintAcknowledged",true).put("code",code.getString("code")),false);
        operate(holder,"acknowledgeFriendPairing",args(holder).put("pendingId",id).put("receipt",complete.getString("receipt")),false);
        assertTrue(owner.snapshot().getJSONArray("owners").getJSONObject(owner.snapshot().getJSONArray("owners").length()-1).getBoolean("confirmed"));
        return id;
    }
    private void fails(String code,Throwing operation)throws Exception {try{operation.run();fail("Expected "+code);}catch(IllegalArgumentException expected){assertEquals(code,expected.getMessage());}}
    private interface Throwing {void run()throws Exception;}
    @Test public void revokedAuthorityPreventsCommitAndConfirmedCodesSurviveRecovery()throws Exception {
        FriendAuthenticatorController owner=controller(isolated()),holder=controller(isolated());
        String before=owner.snapshot().toString();long revision=owner.revision();
        fails("billing_access_required",()->owner.operation("beginFriendPairing",args(owner).put("label","Denied"),false,true,()->false));
        assertEquals(revision,owner.revision());assertEquals(before,owner.snapshot().toString());
        JSObject begin=operate(owner,"beginFriendPairing",args(owner).put("label","Friend"),false);
        String id=begin.getString("pendingId");
        operate(holder,"acceptFriendPairing",args(holder).put("label","Owner").put("invitation",begin.getString("invitation")),false);
        fails("billing_access_required",()->holder.operation("getHeldFriendCode",new JSONObject().put("pairingId",id),false,false,()->true));
        // A separate completed pairing proves that established offline obligations
        // remain available after billing access ends.
        FriendAuthenticatorController secondOwner=controller(isolated()),secondHolder=controller(isolated());
        String confirmed=pair(secondOwner,secondHolder,"Confirmed");
        assertEquals(8,secondHolder.operation("getHeldFriendCode",new JSONObject().put("pairingId",confirmed),true,false,()->true).getString("code").length());
    }
    @Test public void pairingRolesPersistenceReplayAndCooldown()throws Exception {
        Context ownerContext=isolated();FriendAuthenticatorController owner=controller(ownerContext),holder=controller(isolated()),other=controller(isolated());
        String first=pair(owner,holder,"First"),second=pair(owner,other,"Second");
        fails("code_unavailable",()->operate(owner,"getHeldFriendCode",new JSONObject().put("pairingId",first),false));
        assertEquals(2,owner.validateFriends(new JSONArray().put(first).put(second)).size());
        fails("already_active",()->operate(owner,"removeFriendPairing",args(owner).put("pairingId",first),true));
        JSONObject off=new JSONObject().put("version",2).put("active",false).put("revision",2);
        String replay=operate(holder,"getHeldFriendCode",new JSONObject().put("pairingId",first),true).getString("code");
        fails("incorrect_or_expired_code",()->owner.unlock(first,replay,new HashSet<>(Arrays.asList(first,second)),off));
        // Owner confirmation consumed the current period. Verify acceptance of next period without waiting.
        FriendAuthenticatorStore storage=new FriendAuthenticatorStore(ownerContext);JSONObject persisted=storage.read();JSONArray records=persisted.getJSONArray("records");
        JSONObject secondRow=null;for(int i=0;i<records.length();i++)if(second.equals(records.getJSONObject(i).getString("id")))secondRow=records.getJSONObject(i);
        assertNotNull(secondRow);long nextPeriod=System.currentTimeMillis()/30000+1;
        String valid=TotpPolicy.code(PairingProtocol.decode(secondRow.getString("secret")),nextPeriod);
        owner.unlock(second,valid,new HashSet<>(Arrays.asList(first,second)),off);
        assertFalse(owner.mode().getBoolean("active"));
        FriendAuthenticatorController restarted=controller(ownerContext);
        assertFalse(restarted.mode().getBoolean("active"));
        fails("incorrect_or_expired_code",()->restarted.unlock(second,valid,new HashSet<>(Arrays.asList(second)),off));
        for(int i=0;i<4;i++)fails("friend_not_selected",()->restarted.unlock(first,"00000000",Collections.singleton(second),off));
        assertTrue(restarted.cooldownUntil()>System.currentTimeMillis());
        FriendAuthenticatorController restartedAgain=controller(ownerContext);
        fails("verification_cooldown",()->restartedAgain.unlock(second,valid,Collections.singleton(second),off));
        // Holding another person's codes is allowed while the holder's own session is active.
        operate(holder,"removeFriendPairing",args(holder).put("pairingId",first),true);
        assertEquals(0,holder.snapshot().getJSONArray("holders").length());
    }
    @Test public void publicProtocolRejectsTamperingAndResumesPending()throws Exception {
        Context ownerContext=isolated();FriendAuthenticatorController owner=controller(ownerContext),holder=controller(isolated());
        JSObject begin=operate(owner,"beginFriendPairing",args(owner).put("label","Friend"),false);String id=begin.getString("pendingId");String invitation=begin.getString("invitation");
        PairingProtocol.validatePublicPayload(invitation);
        fails("self_pairing",()->operate(owner,"acceptFriendPairing",args(owner).put("label","Me").put("invitation",invitation),false));
        String tainted=new JSONObject(invitation).put("secret","do not export").toString();
        fails("invalid_pairing_message",()->PairingProtocol.validatePublicPayload(tainted));
        JSObject accept=operate(holder,"acceptFriendPairing",args(holder).put("label","Person").put("invitation",invitation),false);
        fails("duplicate_pairing",()->operate(holder,"acceptFriendPairing",args(holder).put("label","Person").put("invitation",invitation),false));
        String response=accept.getString("response");
        assertEquals(invitation,controller(ownerContext).snapshot().getJSONArray("pending").getJSONObject(0).getString("invitation"));
        String badResponse=new JSONObject(response).put("inviteHash",PairingProtocol.nonce()).toString();
        fails("transcript_mismatch",()->operate(owner,"inspectFriendPairing",new JSONObject().put("pendingId",id).put("response",badResponse),false));
        String code=operate(holder,"getHeldFriendCode",new JSONObject().put("pairingId",id),false).getString("code");
        fails("fingerprint_required",()->operate(owner,"completeFriendPairing",args(owner).put("pendingId",id).put("response",response).put("code",code),false));
        String pub=owner.snapshot().toString();assertFalse(pub.contains("privateKey"));assertFalse(pub.contains("secret"));assertFalse(pub.contains("confirmationKey"));
    }
    @Test public void atomicFailedUnlockRetainsActiveModeAndReplayLedger()throws Exception {
        Context ownerContext=isolated();FriendAuthenticatorController owner=controller(ownerContext),holder=controller(isolated());
        String id=pair(owner,holder,"Friend");JSONObject on=new JSONObject().put("version",2).put("active",true).put("revision",1);
        owner.saveMode(on);
        JSONObject before=new FriendAuthenticatorStore(ownerContext).read(),row=before.getJSONArray("records").getJSONObject(0);
        long nextPeriod=System.currentTimeMillis()/30000+1;
        String code=TotpPolicy.code(PairingProtocol.decode(row.getString("secret")),nextPeriod);
        File directory=ownerContext.getNoBackupFilesDir(),retained=new File(directory.getParentFile(),directory.getName()+"-retained");
        assertTrue(directory.renameTo(retained));assertTrue(directory.createNewFile());
        try {
            try {owner.unlock(id,code,Collections.singleton(id),new JSONObject().put("active",false));fail("Write must fail");}
            catch(java.io.IOException expected) {assertTrue(owner.mode().getBoolean("active"));}
        } finally {assertTrue(directory.delete());assertTrue(retained.renameTo(directory));}
        JSONObject after=new FriendAuthenticatorStore(ownerContext).read();assertEquals(before.toString(),after.toString());
        owner.unlock(id,code,Collections.singleton(id),new JSONObject().put("active",false));assertFalse(owner.mode().getBoolean("active"));
    }
    @Test public void mutualRelationshipsStayIndependentAndMalformedStorageFailsClosed()throws Exception {
        Context leftContext=isolated();FriendAuthenticatorController left=controller(leftContext),right=controller(isolated());
        String first=pair(left,right,"Right"),reverse=pair(right,left,"Left");
        assertNotEquals(first,reverse);
        assertEquals(8,operate(left,"getHeldFriendCode",new JSONObject().put("pairingId",reverse),true).getString("code").length());
        assertEquals(8,operate(right,"getHeldFriendCode",new JSONObject().put("pairingId",first),true).getString("code").length());
        FriendAuthenticatorStore store=new FriendAuthenticatorStore(leftContext);JSONObject damaged=store.read();
        damaged.getJSONArray("records").getJSONObject(0).put("lastAccepted",-9);store.write(damaged);
        fails("storage_unavailable",()->controller(leftContext));
    }
    @Test public void oversizedWriteNeverReplacesLastCompleteEnvelope()throws Exception {
        Context context=isolated();FriendAuthenticatorController owner=controller(context),holder=controller(isolated());pair(owner,holder,"Friend");
        FriendAuthenticatorStore store=new FriendAuthenticatorStore(context);JSONObject previous=store.read(),oversized=new JSONObject(previous.toString());
        char[] characters=new char[262144];Arrays.fill(characters,'x');oversized.put("oversized",new String(characters));
        try {store.write(oversized);fail("Oversized encrypted envelope must be rejected before the atomic write");}
        catch(java.io.IOException expected) {assertEquals("storage_unavailable",expected.getMessage());}
        assertEquals(previous.toString(),store.read().toString());
        assertEquals(1,controller(context).snapshot().getJSONArray("owners").length());
    }
    private static final class CaptureCall extends PluginCall {
        final CountDownLatch completed=new CountDownLatch(1);volatile JSObject result;volatile String failure;
        CaptureCall(String method,JSObject args){super(null,"LauncherApps","friend-auth-test",method,args);}
        @Override public void resolve(JSObject value){result=value;completed.countDown();}
        @Override public void resolve(){result=new JSObject();completed.countDown();}
        @Override public void reject(String message,String code){failure=code;completed.countDown();}
        JSObject await()throws Exception {assertTrue("Native operation timed out",completed.await(15,TimeUnit.SECONDS));assertNull(failure);assertNotNull(result);return result;}
    }
    private static Object field(Object target,String name)throws Exception {Field field=target.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(target);}
    @Test public void legacyV1ActiveSessionLoadsAndOriginalCodeStillUnlocks()throws Exception {
        Context context=isolated();String session=UUID.randomUUID().toString(),code="AbCdEf123456";
        DumbModeStore legacy=new DumbModeStore(context);JSONObject state=new JSONObject();state.put("version",1);state.put("active",true);state.put("revision",2);
        state.put("blocked",new JSONArray().put("snake"));state.put("seen",new JSONArray().put("snake"));state.put("sessionId",session);
        state.put("verifier",android.util.Base64.encodeToString(legacy.mac(session+":"+code,true),android.util.Base64.NO_WRAP));legacy.write(state);
        Constructor<DumbModeController> constructor=DumbModeController.class.getDeclaredConstructor(Context.class);constructor.setAccessible(true);DumbModeController controller=constructor.newInstance(context);
        try {
            CaptureCall read=new CaptureCall("getDumbModeState",new JSObject());controller.getState(read);JSObject loaded=read.await();
            assertTrue(loaded.getBoolean("active"));assertEquals("legacy_static",loaded.getString("unlockMethod"));assertTrue(loaded.getLong("revision")>=2);
            JSObject unlockArgs=new JSObject();unlockArgs.put("code",code);unlockArgs.put("expectedRevision",loaded.getLong("revision"));
            CaptureCall unlock=new CaptureCall("unlockDumbMode",unlockArgs);controller.unlock(unlock);JSObject unlocked=unlock.await();assertFalse(unlocked.getBoolean("active"));assertEquals("OFF",unlocked.getString("state"));
            JSONObject persisted=legacy.read();assertFalse(persisted.getBoolean("active"));assertFalse(persisted.has("verifier"));
            assertNull(new FriendAuthenticatorStore(context).read());
        } finally {
            context.unregisterReceiver((android.content.BroadcastReceiver)field(controller,"packageReceiver"));
            ((android.os.Handler)field(controller,"main")).removeCallbacksAndMessages(null);
            ((ThreadPoolExecutor)field(controller,"executor")).shutdownNow();
        }
    }
}

