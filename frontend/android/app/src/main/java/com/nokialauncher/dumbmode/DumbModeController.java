package com.nokialauncher.dumbmode;

import android.app.Activity;
import android.content.*;
import android.content.pm.*;
import android.os.*;
import android.provider.Settings;
import android.provider.Telephony;
import android.telecom.TelecomManager;
import android.util.Base64;
import android.view.inputmethod.InputMethodManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.nokialauncher.NokiaAccessibilityService;
import org.json.*;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** Process-scoped authority, shared by bridge and accessibility service. All I/O is serialized. */
public final class DumbModeController {
    public interface Listener { void changed(JSObject snapshot); default void friendsChanged(JSObject snapshot) {} }
    private static volatile DumbModeController instance;
    public static DumbModeController get(Context context) {
        if (instance == null) synchronized (DumbModeController.class) {
            if (instance == null) instance = new DumbModeController(context.getApplicationContext());
        }
        return instance;
    }
    private final Context context;
    private final DumbModeStore store;
    private final FriendAuthenticatorController friends;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
            new ArrayBlockingQueue<>(24), runnable -> new Thread(runnable, "nokia-dumb-mode"), new ThreadPoolExecutor.AbortPolicy());
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Set<Listener> listeners = new CopyOnWriteArraySet<>();
    private final AtomicBoolean refreshQueued = new AtomicBoolean();
    private final AtomicBoolean availabilityQueued = new AtomicBoolean();
    private volatile Set<String> enforced = Collections.emptySet();
    private volatile String state = "LOADING";
    private volatile boolean active;
    private boolean storageUnavailableBlock;
    private volatile JSObject published = new JSObject();
    private long revision;
    private String error;
    private Set<String> blocked = new HashSet<>(), seen = new HashSet<>(), mandatory = new HashSet<>();
    private byte[] verifier;
    private String sessionId;
    private String unlockMethod = "friend_totp";
    private Set<String> selectedFriends = new HashSet<>(), pendingFriends;
    private Object setupOwner;
    private String setupId;
    private Set<String> pendingSelected, pendingSeen;
    private final Set<Object> owners = Collections.newSetFromMap(new IdentityHashMap<>());
    private Set<String> essential = Collections.emptySet();
    private volatile boolean pluginAttached;
    private final BroadcastReceiver packageReceiver;

    private DumbModeController(Context context) {
        this.context = context; store = new DumbModeStore(context); friends = new FriendAuthenticatorController(context);
        mandatory.add("snake"); publish();
        packageReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context c, Intent intent) { if (!pluginAttached) packagesChanged(); }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED); filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_CHANGED); filter.addAction(Intent.ACTION_PACKAGE_REPLACED);
        filter.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(packageReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else context.registerReceiver(packageReceiver, filter);
        executor.execute(() -> {
            try {
                friends.load();
                JSONObject data = friends.mode();
                if (data == null) data = store.read();
                if (data != null) {
                    int version = data.getInt("version");
                    if (version != 1 && version != 2) throw new IllegalStateException();
                    active = data.getBoolean("active"); revision = data.getLong("revision");
                    unlockMethod = version == 1 && active ? "legacy_static" : data.optString("unlockMethod", "friend_totp");
                    if (revision < 0) throw new IllegalStateException();
                    blocked = stringSet(data.getJSONArray("blocked")); seen = stringSet(data.getJSONArray("seen"));
                    if (active) {
                        sessionId = data.getString("sessionId");
                        if (sessionId.length() != 36) throw new IllegalStateException();
                        if (!blocked.contains("snake")) throw new IllegalStateException();
                        if ("legacy_static".equals(unlockMethod)) {
                            verifier = Base64.decode(data.getString("verifier"), Base64.NO_WRAP);
                            if (verifier.length != 32) throw new IllegalStateException();
                            store.mac("key-availability-check", false);
                        } else if ("friend_totp".equals(unlockMethod)) {
                            selectedFriends = friends.validateFriends(data.getJSONArray("selectedFriendIds"));
                        } else throw new IllegalStateException();
                    }
                }
                state = active ? "ACTIVE" : "OFF";
                refreshApps();
            } catch (Exception failure) {
                state = "ERROR"; error = "storage_unavailable"; storageUnavailableBlock = true;
                // Unreadable encrypted state cannot prove OFF. Conservatively protect all known
                // nonessential apps once on this worker, never by scanning foreground events.
                try { for (App app : scan()) blocked.add(app.id); }
                catch (Exception unavailable) { blocked.add("snake"); }
                publish();
            }
        });
    }
    public synchronized void attach(Listener listener, Object owner) { owners.add(owner); listeners.add(listener); pluginAttached = true; availabilityChanged(); }
    public void detach(Listener listener, Object owner) {
        listeners.remove(listener); pluginAttached = !listeners.isEmpty();
        // Destroy invalidates pending setup synchronously; pause deliberately does not.
        synchronized (this) { owners.remove(owner); if (setupOwner == owner) clearSetup(); }
    }
    public JSObject snapshot() { return published; }
    public boolean isBlocked(String packageName) { return enforced.contains(packageName); }
    public String launchError(String packageName) {
        if ("LOADING".equals(state)) return "dumb_mode_loading";
        if ("ERROR".equals(state)) return "dumb_mode_error";
        return isBlocked(packageName) ? "dumb_mode_blocked" : null;
    }
    public static int category(ApplicationInfo app) {
        if (Build.VERSION.SDK_INT >= 26 && app.category >= 0) return app.category;
        return (app.flags & ApplicationInfo.FLAG_IS_GAME) != 0 ? 0 : -1;
    }
    public void availabilityChanged() {
        if (!availabilityQueued.compareAndSet(false, true)) return;
        submitInternal(() -> {
            try { essential = essentialPackages(context.getPackageManager()); publish(); }
            finally { availabilityQueued.set(false); }
        });
    }
    public void packagesChanged() {
        if (!refreshQueued.compareAndSet(false, true)) return;
        main.postDelayed(() -> submitInternal(() -> {
            refreshQueued.set(false);
            try { if (!"ERROR".equals(state)) refreshApps(); }
            catch (Exception failure) { error = "app_refresh_failed"; publish(); }
        }), 150);
    }
    private void submitInternal(Runnable action) {
        try { executor.execute(action); }
        catch (RejectedExecutionException busy) { main.postDelayed(() -> submitInternal(action), 250); }
    }
    private interface Operation { void run() throws Exception; }
    private void run(PluginCall call, Operation operation) {
        try { executor.execute(() -> {
            try { operation.run(); }
            catch (ModeFailure failure) { call.reject(failure.getMessage(), failure.getMessage()); }
            catch (IllegalArgumentException failure) { call.reject(failure.getMessage(), failure.getMessage()); }
            catch (java.io.IOException | java.security.GeneralSecurityException failure) { call.reject("storage_unavailable", "storage_unavailable"); }
            catch (Exception failure) { call.reject("dumb_mode_operation_failed", "dumb_mode_operation_failed"); }
        }); } catch (RejectedExecutionException busy) { call.reject("dumb_mode_busy", "dumb_mode_busy"); }
    }
    private static final class ModeFailure extends Exception { ModeFailure(String code) { super(code); } }
    private void ready() throws ModeFailure {
        if ("ERROR".equals(state) || "LOADING".equals(state)) throw new ModeFailure("dumb_mode_" + state.toLowerCase(Locale.ROOT));
    }
    private void checkRevision(PluginCall call) throws ModeFailure {
        Number expected = call.getData().opt("expectedRevision") instanceof Number ? (Number) call.getData().opt("expectedRevision") : null;
        if (expected == null || expected.doubleValue() != revision) throw new ModeFailure("stale_revision");
    }
    public void getState(PluginCall call) { run(call, () -> { publish(false); call.resolve(snapshot()); }); }
    public void friendOperation(String action, PluginCall call, Object owner) { run(call, () -> {
        synchronized (this) { if (!owners.contains(owner)) throw new ModeFailure("plugin_destroyed"); }
        ready(); long before = friends.revision();
        try {
            JSObject result = friends.operation(action, call.getData(), active);
            if (friends.revision() != before) { publish(false); publishFriends(); }
            call.resolve(result);
        } catch (Exception failure) {
            if (friends.revision() != before) { publish(false); publishFriends(); }
            throw failure;
        }
    }); }
    private void publishFriends() throws Exception {
        JSObject result = friends.snapshot();
        for (Listener listener : listeners) main.post(() -> { if (listeners.contains(listener)) listener.friendsChanged(result); });
    }
    public void getApps(PluginCall call) { run(call, () -> {
        ready(); List<App> apps = scan(); JSONArray rows = new JSONArray();
        for (App app : apps) rows.put(app.json(active ? blocked.contains(app.id) : DumbModePolicy.defaultBlocked(app.category)));
        JSObject result = new JSObject(); result.put("apps", rows); result.put("snapshot", snapshot()); call.resolve(result);
    }); }
    public void prepare(PluginCall call, Object owner) { run(call, () -> {
        ready(); checkRevision(call); if (active) throw new ModeFailure("already_active");
        JSONArray selected = call.getData().optJSONArray("selectedIds");
        if (selected == null) throw new ModeFailure("invalid_selection");
        Set<String> allowed = new HashSet<>(), chosen = stringSet(selected);
        for (App app : scan()) { allowed.add(app.id); if (app.category == 0) chosen.add(app.id); }
        if (!allowed.containsAll(chosen)) throw new ModeFailure("invalid_selection");
        Set<String> chosenFriends = friends.validateFriends(call.getData().optJSONArray("selectedFriendIds"));
        synchronized (this) {
            if (!owners.contains(owner)) throw new ModeFailure("plugin_destroyed");
            clearSetup(); pendingSeen = new HashSet<>(allowed); setupOwner = owner; setupId = UUID.randomUUID().toString();
            pendingSelected = chosen; pendingFriends = chosenFriends;
            JSObject result = new JSObject(); result.put("setupId", setupId); result.put("selectedFriendIds", new JSONArray(chosenFriends));
            result.put("snapshot", snapshot()); call.resolve(result);
        }
    }); }
    public void share(PluginCall call, Object owner, Activity activity) { run(call, () -> {
        throw new ModeFailure("static_setup_unavailable");
    }); }
    public void activate(PluginCall call, Object owner) { run(call, () -> {
        ready(); checkRevision(call);
        final String id;
        final Set<String> selected, known, chosenFriends;
        synchronized (this) {
            requireSetup(call.getString("setupId"), owner);
            id = setupId;
            selected = new HashSet<>(pendingSelected); known = new HashSet<>(pendingSeen);
            chosenFriends = new HashSet<>(pendingFriends);
        }
        if (active) throw new ModeFailure("already_active");
        if (!enforcementAvailable()) throw new ModeFailure("enforcement_unavailable");
        List<App> apps = scan(); Map<String,Integer> categories = categories(apps);
        Set<String> next = DumbModePolicy.reconcile(selected, known, categories);
        friends.validateFriends(new JSONArray(chosenFriends));
        // Claim the activation only after expensive preparation. No disk/Keystore work
        // holds the monitor needed by Activity destruction on the main thread.
        synchronized (this) { requireSetup(id, owner); clearSetup(); }
        JSONObject mode = modeJson(true, revision + 1, next, categories.keySet(), null, id, "friend_totp", chosenFriends);
        friends.saveMode(mode);
        sessionId = id; unlockMethod = "friend_totp"; selectedFriends = chosenFriends;
        active = true; revision++; blocked = next; seen = new HashSet<>(categories.keySet()); verifier = null;
        state = "ACTIVE"; error = null; publish(); call.resolve(snapshot());
    }); }
    public void cancel(PluginCall call, Object owner) { run(call, () -> {
        synchronized (this) { requireSetup(call.getString("setupId"), owner); clearSetup(); }
        call.resolve(snapshot());
    }); }
    public void unlock(PluginCall call) { run(call, () -> {
        ready(); checkRevision(call); if (!active) { call.resolve(snapshot()); return; }
        String code = call.getString("code");
        if ("friend_totp".equals(unlockMethod)) {
            long before = friends.revision();
            try { friends.unlock(call.getString("friendId"), code, selectedFriends,
                    modeJson(false, revision + 1, Collections.emptySet(), Collections.emptySet(), null, null, "friend_totp", Collections.emptySet())); }
            finally { if (friends.revision() != before) { publish(false); publishFriends(); } }
        } else {
            if (code == null || !code.matches("[A-Za-z0-9]{12}") || !MessageDigest.isEqual(verifier, store.mac(sessionId + ":" + code, false)))
                throw new ModeFailure("incorrect_code");
            save(false, revision + 1, Collections.emptySet(), Collections.emptySet(), null);
        }
        active = false; revision++; blocked = new HashSet<>(); seen = new HashSet<>(); verifier = null;
        selectedFriends = new HashSet<>(); unlockMethod = "friend_totp"; sessionId = null;
        state = "OFF"; error = null; publish(); call.resolve(snapshot());
    }); }
    private synchronized void requireSetup(String id, Object owner) throws ModeFailure {
        if (!owners.contains(owner) || setupId == null || !setupId.equals(id) || setupOwner != owner) throw new ModeFailure("setup_expired");
    }
    private synchronized void clearSetup() { setupId = null; pendingSelected = null; pendingSeen = null; pendingFriends = null; setupOwner = null; }
    private void save(boolean enabled, long rev, Set<String> ids, Set<String> known, byte[] hash) throws Exception {
        JSONObject json = modeJson(enabled, rev, ids, known, hash, sessionId, unlockMethod, selectedFriends);
        if ("friend_totp".equals(unlockMethod) || friends.mode() != null) friends.saveMode(json); else store.write(json);
    }
    private static JSONObject modeJson(boolean enabled, long rev, Set<String> ids, Set<String> known, byte[] hash, String session, String method, Set<String> friendIds) throws Exception {
        JSONObject json = new JSONObject(); json.put("version", 2); json.put("active", enabled); json.put("revision", rev);
        json.put("blocked", new JSONArray(ids)); json.put("seen", new JSONArray(known));
        json.put("unlockMethod", method); json.put("selectedFriendIds", new JSONArray(friendIds));
        if (session != null) json.put("sessionId", session);
        if (hash != null) json.put("verifier", Base64.encodeToString(hash, Base64.NO_WRAP));
        return json;
    }
    private static Set<String> stringSet(JSONArray array) throws JSONException {
        if (array.length() > 4096) throw new JSONException("too_many_apps");
        Set<String> result = new HashSet<>();
        for (int i = 0; i < array.length(); i++) {
            String value = array.getString(i); if (value.isEmpty() || value.length() > 300) throw new JSONException("invalid_id"); result.add(value);
        }
        return result;
    }
    private boolean enforcementAvailable() {
        return NokiaAccessibilityService.isAvailable() && defaultLauncherAvailable();
    }
    private boolean defaultLauncherAvailable() {
        ResolveInfo home = context.getPackageManager().resolveActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), PackageManager.MATCH_DEFAULT_ONLY);
        return home != null && home.activityInfo != null && context.getPackageName().equals(home.activityInfo.packageName);
    }
    private void publish() {
        publish(true);
    }
    private void publish(boolean notify) {
        boolean available = enforcementAvailable();
        String displayState = state;
        if (!"ERROR".equals(state) && !"LOADING".equals(state)) displayState = active ? (available && error == null ? "ACTIVE" : "DEGRADED") : "OFF";
        Set<String> effective = new HashSet<>(blocked); effective.removeAll(essential);
        enforced = active || storageUnavailableBlock ? Collections.unmodifiableSet(effective) : Collections.emptySet();
        JSObject result = new JSObject(); result.put("state", displayState); result.put("active", active); result.put("revision", revision);
        result.put("blockedIds", new JSONArray(effective)); result.put("mandatoryIds", new JSONArray(mandatory));
        result.put("enforcementAvailable", available);
        result.put("accessibilityAvailable", NokiaAccessibilityService.isAvailable());
        result.put("defaultLauncherAvailable", defaultLauncherAvailable());
        result.put("unlockMethod", unlockMethod); result.put("selectedFriendIds", new JSONArray(selectedFriends));
        result.put("cooldownUntil", friends.cooldownUntil());
        result.put("storageUnavailableBlock", storageUnavailableBlock);
        if (error != null) result.put("error", error);
        else if (active && !available) result.put("error", "enforcement_unavailable");
        published = result;
        if (notify) for (Listener listener : listeners) main.post(() -> { if (listeners.contains(listener)) listener.changed(result); });
    }
    private void refreshApps() throws Exception {
        List<App> apps = scan(); Map<String,Integer> categories = categories(apps);
        Set<String> nextMandatory = new HashSet<>(); for (App app : apps) if (app.category == 0) nextMandatory.add(app.id);
        mandatory = nextMandatory;
        if (active) {
            Set<String> next = DumbModePolicy.reconcile(blocked, seen, categories);
            Set<String> nextSeen = new HashSet<>(seen); nextSeen.addAll(categories.keySet());
            if (!next.equals(blocked) || !nextSeen.equals(seen)) {
                save(true, revision + 1, next, nextSeen, verifier); blocked = next; seen = nextSeen; revision++;
            }
        }
        error = null; publish();
    }
    private static Map<String,Integer> categories(List<App> apps) {
        Map<String,Integer> values = new HashMap<>(); for (App app : apps) values.put(app.id, app.category); return values;
    }
    private List<App> scan() {
        PackageManager pm = context.getPackageManager(); essential = essentialPackages(pm);
        Map<String,App> apps = new TreeMap<>();
        for (ResolveInfo info : pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)) {
            if (info.activityInfo == null || essential.contains(info.activityInfo.packageName)) continue;
            String id = info.activityInfo.packageName;
            apps.put(id, new App(id, String.valueOf(info.loadLabel(pm)), category(info.activityInfo.applicationInfo)));
        }
        apps.put("snake", new App("snake", "Snake", 0)); return new ArrayList<>(apps.values());
    }
    private Set<String> essentialPackages(PackageManager pm) {
        Set<String> ids = new HashSet<>(); ids.add(context.getPackageName()); ids.add("android");
        addResolved(ids, pm, new Intent(Settings.ACTION_SETTINGS));
        addResolved(ids, pm, new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:")));
        addResolved(ids, pm, new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));
        String sms = Telephony.Sms.getDefaultSmsPackage(context); if (sms != null) ids.add(sms);
        TelecomManager telecom = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
        if (telecom != null && telecom.getDefaultDialerPackage() != null) ids.add(telecom.getDefaultDialerPackage());
        InputMethodManager ime = (InputMethodManager) context.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (ime != null) for (android.view.inputmethod.InputMethodInfo info : ime.getEnabledInputMethodList()) ids.add(info.getPackageName());
        addResolved(ids, pm, new Intent("android.intent.action.MANAGE_PERMISSIONS"));
        return ids;
    }
    private static void addResolved(Set<String> ids, PackageManager pm, Intent intent) {
        ResolveInfo info = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
        if (info != null && info.activityInfo != null) ids.add(info.activityInfo.packageName);
    }
    private static final class App {
        final String id, name; final int category;
        App(String id, String name, int category) { this.id=id; this.name=name; this.category=category; }
        JSObject json(boolean selected) {
            JSObject value = new JSObject(); value.put("id", id); value.put("packageName", "snake".equals(id) ? "" : id);
            value.put("name", name); value.put("androidCategory", category); value.put("categoryGroup", DumbModePolicy.group(category));
            value.put("mandatory", category == 0); value.put("selected", selected || category == 0); return value;
        }
    }
}
