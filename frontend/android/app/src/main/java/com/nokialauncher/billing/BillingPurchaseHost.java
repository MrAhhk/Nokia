package com.nokialauncher.billing;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import com.nokialauncher.dumbmode.DumbModeController;
import com.revenuecat.purchases.CustomerInfo;
import com.revenuecat.purchases.PurchasesError;
import com.revenuecat.purchases.models.StoreTransaction;
import java.lang.ref.WeakReference;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;
import java.util.function.Predicate;
import static com.nokialauncher.billing.BillingController.PurchaseOutcome;

/** Application-owned transport resource, not another billing state authority.
 * Only Controller's durable PREPARED continuation may call launch. Runtime wires this
 * host without enabling checkout. DumbMode's process owner supplies atomic global lock exclusion,
 * including bootstrap/loading, activation persistence, and error.
 * Process death loses this request, never the authenticated journal. No intent can rebuild it.
 */
public final class BillingPurchaseHost implements BillingRuntime.HomeResource<Activity> {
    static final String ATTEMPT = "billing_attempt", CAPABILITY = "billing_host_capability";
    private static volatile BillingPurchaseHost installed;
    interface Surface { boolean alive(); void close(); }
    interface Opener {
        void open(String attemptId, String capability);
        default boolean bound() { return true; }
    }
    interface WindowLaunch<T> { void open(T home, String attemptId, String capability); }
    /** Weak window binding can be renewed after same-process Home recreation. */
    static final class WindowOpener<T> implements Opener {
        private volatile WeakReference<T> home = new WeakReference<>(null);
        private final Predicate<T> alive;
        private final WindowLaunch<T> launch;
        WindowOpener(Predicate<T> alive, WindowLaunch<T> launch) { this.alive = alive; this.launch = launch; }
        void bind(T target) { home = new WeakReference<>(Objects.requireNonNull(target)); }
        void unbind(T target) { if (home.get() == target) home = new WeakReference<>(null); }
        @Override public boolean bound() { return home.get() != null; }
        @Override public void open(String id, String capability) {
            T live = home.get();
            if (live == null || !alive.test(live)) throw new IllegalStateException("billing_home_unavailable");
            launch.open(live, id, capability);
        }
    }
    interface Buyer {
        void purchase(Surface surface, RevenueCatCatalog.Selection selection, BillingController.PurchaseCallback callback);
    }
    interface LaunchAuthorization { boolean runIfAllowed(Runnable entry); }
    private static final class Request {
        final String id, capability = UUID.randomUUID().toString();
        final RevenueCatCatalog.Selection selection;
        final BillingController.PurchaseCallback callback;
        final AtomicBoolean terminal = new AtomicBoolean();
        volatile boolean entered;
        boolean resumeQueued;
        Request(String id, RevenueCatCatalog.Selection selection, BillingController.PurchaseCallback callback) {
            this.id = BillingSnapshot.requiredText(id); this.selection = Objects.requireNonNull(selection);
            this.callback = Objects.requireNonNull(callback);
        }
    }
    private final String owner;
    private final BillingController.AttemptJournal journal;
    private final Executor main, disk;
    private final BooleanSupplier onMain, lockAllowsLaunch;
    private final LaunchAuthorization authorization;
    private final Opener opener;
    private final Buyer buyer;
    private final Object requestLock = new Object();
    private Request request;
    private String lastAttempt;
    private WeakReference<Surface> surface = new WeakReference<>(null);
    private Request surfaceRequest;
    private long generation;
    private boolean resumed;
    private WindowOpener<Activity> nativeOpener;

    /** Package-only fixture seam; production cannot inject an optimistic lock predicate. */
    BillingPurchaseHost(String owner, BillingController.AttemptJournal journal, Executor main, Executor disk,
            BooleanSupplier onMain, BooleanSupplier lockAllowsLaunch, Opener opener, Buyer buyer) {
        this(owner, journal, main, disk, onMain, lockAllowsLaunch,
                entry -> { if (!lockAllowsLaunch.getAsBoolean()) return false; entry.run(); return true; }, opener, buyer);
    }
    BillingPurchaseHost(String owner, BillingController.AttemptJournal journal, Executor main, Executor disk,
            BooleanSupplier onMain, BooleanSupplier lockAllowsLaunch, LaunchAuthorization authorization, Opener opener, Buyer buyer) {
        this.owner = BillingSnapshot.requiredText(owner); this.journal = Objects.requireNonNull(journal);
        this.main = Objects.requireNonNull(main); this.disk = Objects.requireNonNull(disk);
        this.onMain = Objects.requireNonNull(onMain); this.lockAllowsLaunch = Objects.requireNonNull(lockAllowsLaunch);
        this.authorization = Objects.requireNonNull(authorization);
        this.opener = Objects.requireNonNull(opener); this.buyer = Objects.requireNonNull(buyer);
    }
    /** Main-only application factory. No Activity is needed or captured during construction.
     * Starting from a later weak Home binding creates no Home/Capacitor/WebView copy.
     */
    static BillingPurchaseHost create(Context context, String owner, BillingController.AttemptJournal journal,
            Executor disk, RevenueCatAdapter adapter) {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("billing_main_required");
        Context application = Objects.requireNonNull(Objects.requireNonNull(context).getApplicationContext());
        Objects.requireNonNull(adapter);
        if (installed != null) throw new IllegalStateException("billing_host_already_owned");
        WindowOpener<Activity> launcher = new WindowOpener<>(
                live -> !live.isFinishing() && !live.isDestroyed(), (live, id, capability) ->
                live.startActivity(new Intent(live, BillingActivity.class).putExtra(ATTEMPT, id).putExtra(CAPABILITY, capability)));
        Handler handler = new Handler(Looper.getMainLooper());
        DumbModeController mode = DumbModeController.get(application);
        Executor main = action -> {
            if (!handler.post(action)) throw new java.util.concurrent.RejectedExecutionException("billing_host_main");
        };
        BillingPurchaseHost result = new BillingPurchaseHost(owner, journal, main, disk,
                () -> Looper.myLooper() == Looper.getMainLooper(), mode::allowsPaymentLaunch,
                mode::runPaymentLaunchIfAllowed, launcher, (target, selection, completion) -> {
            if (!(target instanceof BillingActivity)) throw new IllegalStateException("billing_wrong_host");
            adapter.purchase((BillingActivity) target, selection, new com.revenuecat.purchases.interfaces.PurchaseCallback() {
                @Override public void onCompleted(StoreTransaction transaction, CustomerInfo info) {
                    // Raw SDK models are intentionally discarded: Controller requests qualified receipts.
                    completion.complete(PurchaseOutcome.COMPLETED);
                }
                @Override public void onError(PurchasesError error, boolean userCancelled) {
                    String diagnostic = RevenueCatAdapter.acceptanceErrorDiagnostic(
                            com.nokialauncher.BuildConfig.BUILD_TYPE, error, userCancelled);
                    if (diagnostic != null) android.util.Log.w("NokiaBillingAcceptance", diagnostic);
                    completion.complete(RevenueCatAdapter.classifyPurchaseError(error, userCancelled));
                }
            });
        });
        result.nativeOpener = launcher;
        synchronized (BillingPurchaseHost.class) {
            if (installed != null) throw new IllegalStateException("billing_host_already_owned");
            installed = result;
        }
        return result;
    }
    static BillingPurchaseHost installed() { return installed; }
    /** Existing application owner rebinds on Home recreation; never creates another host/SDK. */
    @Override public void bindHome(Activity home) {
        requireMain();
        if (nativeOpener == null) throw new IllegalStateException("billing_fixture_host");
        nativeOpener.bind(home);
    }
    /** Identity-specific release cannot clear a newer recreated Home binding. */
    @Override public void unbindHome(Activity home) {
        requireMain();
        if (nativeOpener == null) throw new IllegalStateException("billing_fixture_host");
        nativeOpener.unbind(home);
    }
    /** Actor preflight only; final SDK entry requires the shared native authorization mutex. */
    @Override public boolean nativeGate() {
        try { return opener.bound() && lockGate(); }
        catch (RuntimeException unavailable) { return false; }
    }
    private boolean lockGate() {
        try { return lockAllowsLaunch.getAsBoolean(); }
        catch (RuntimeException unavailable) { return false; }
    }
    @Override public void launch(RevenueCatCatalog.Selection selection, String attemptId,
            BillingController.PurchaseCallback callback) {
        Request next = new Request(attemptId, selection, callback);
        synchronized (requestLock) {
            if (request != null || next.id.equals(lastAttempt)) throw new IllegalStateException("billing_host_busy_or_reused");
            request = next; lastAttempt = next.id;
        }
        // Re-read authenticated proof off main; no selection or SDK data goes through Intent.
        try { disk.execute(() -> {
            boolean prepared = false;
            try {
                BillingAttempt value = journal.load();
                prepared = value != null && value.state == BillingAttempt.State.PREPARED
                        && next.id.equals(value.id) && owner.equals(value.ownerEpoch)
                        && next.selection.plan == value.plan && next.selection.productId.equals(value.productId)
                        && Objects.equals(next.selection.basePlanId, value.basePlanId);
            } catch (Exception unavailable) { /* Unknown proof denies launch. */ }
            final boolean proven = prepared;
            dispatch(next, () -> {
                requireMain();
                if (!active(next)) return;
                if (!proven || !nativeGate()) { notLaunched(next); return; }
                try { opener.open(next.id, next.capability); }
                catch (RuntimeException unavailable) { notLaunched(next); }
            });
        }); } catch (RuntimeException unavailable) { notLaunched(next); }
    }
    long attach(Surface target, String id, String capability) {
        requireMain(); Request current = current();
        if (current == null || current.terminal.get() || !current.id.equals(id) || !current.capability.equals(capability)) return 0;
        // A duplicate Activity cannot steal a live generation. Recreation follows detach.
        Surface previous = surface.get();
        if (previous != null && previous != target && previous.alive()) {
            if (surfaceRequest == current) return 0;
            previous.close();
        }
        surface = new WeakReference<>(target); surfaceRequest = current;
        resumed = false; return ++generation;
    }
    void resume(Surface target, long lease) {
        requireMain(); if (!matches(target, lease)) return;
        resumed = true; Request current = current();
        if (current == null || current.entered || current.resumeQueued) return;
        current.resumeQueued = true;
        WeakReference<Surface> pending = new WeakReference<>(target);
        // Queue once to let pause/destroy or a lock change invalidate the generation.
        dispatch(current, () -> {
            requireMain();
            current.resumeQueued = false;
            Surface live = pending.get();
            if (!active(current) || current.entered || !resumed) return;
            if (live == null || !matches(live, lease)) {
                // Coalesced resume belongs to a newer recreated generation. Requalify it once.
                Surface replacement = surface.get();
                if (replacement != null && surfaceRequest == current) resume(replacement, generation);
                return;
            }
            // Opening BillingActivity normally pauses/unbinds Home. Its own resumed generation
            // and the global mode gate authorize entry; a second bound Home is not required.
            if (!live.alive() || !lockGate()) { notLaunched(current); return; }
            try {
                boolean allowed = authorization.runIfAllowed(() -> {
                    // Lock order is mode gate -> requestLock; never hold requestLock then acquire the gate.
                    if (!tryEnter(current)) return;
                    buyer.purchase(live, current.selection, outcome -> complete(current,
                            outcome == null ? PurchaseOutcome.UNCERTAIN : outcome));
                });
                if (!allowed) notLaunched(current);
            } catch (RuntimeException unavailable) {
                // No-entry proof is selected atomically from entered; post-entry failures are UNCERTAIN.
                String diagnostic = acceptanceExceptionDiagnostic(
                        com.nokialauncher.BuildConfig.BUILD_TYPE, unavailable, current.entered);
                if (diagnostic != null) android.util.Log.w("NokiaBillingAcceptance", diagnostic);
                notLaunched(current);
            }
        });
    }
    /** Fixed categories only: exception messages can contain provider/account data. */
    static String acceptanceExceptionDiagnostic(String buildType, RuntimeException error, boolean entered) {
        if (!"internalBilling".equals(buildType)) return null;
        String kind = error instanceof SecurityException ? "security"
                : error instanceof IllegalArgumentException ? "argument"
                : error instanceof IllegalStateException ? "state" : "other";
        return "checkout_host_exception=" + kind + ";after_sdk_entry=" + entered;
    }
    void pause(Surface target, long lease) { requireMain(); if (matches(target, lease)) resumed = false; }
    void detach(Surface target, long lease, boolean recreating) {
        requireMain(); if (!matches(target, lease)) return;
        resumed = false; surface.clear(); surfaceRequest = null; ++generation;
        Request current = current();
        if (current != null && !current.entered && !recreating) notLaunched(current);
        // Once entered, the SDK callback remains application-owned even if UI is destroyed.
    }
    private boolean matches(Surface target, long lease) { return lease != 0 && generation == lease && surface.get() == target; }
    private void requireMain() { if (!onMain.getAsBoolean()) throw new IllegalStateException("billing_main_required"); }
    private Request current() { synchronized (requestLock) { return request; } }
    private boolean active(Request value) { return current() == value && !value.terminal.get(); }
    private void dispatch(Request value, Runnable action) {
        try { main.execute(action); } catch (RuntimeException unavailable) { notLaunched(value); }
    }
    private void notLaunched(Request value) {
        // Live process-owned request only. Never derive no-launch evidence from Intent or disk.
        complete(value, null);
    }
    private boolean tryEnter(Request value) {
        synchronized (requestLock) {
            if (request != value || value.terminal.get() || value.entered) return false;
            value.entered = true; return true; // BEFORE SDK entry; exception/UI death never retries.
        }
    }
    private void complete(Request value, PurchaseOutcome outcome) {
        final PurchaseOutcome terminalOutcome;
        synchronized (requestLock) {
            if (!value.terminal.compareAndSet(false, true)) return;
            // Null denotes the host's live no-entry proof. Choose and commit atomically
            // with tryEnter so no thread can abort a journal then still enter the SDK.
            terminalOutcome = outcome == null
                    ? value.entered ? PurchaseOutcome.UNCERTAIN : PurchaseOutcome.NOT_LAUNCHED : outcome;
            if (request == value) request = null;
        }
        // Callback can enter Controller's reserved completion lane from any SDK/thread.
        try { value.callback.complete(terminalOutcome); }
        finally {
            try { main.execute(() -> {
                requireMain();
                // Never close a newer checkout's surface after late completion of the old one.
                if (surfaceRequest != value) return;
                Surface live = surface.get(); surface.clear(); surfaceRequest = null; resumed = false; ++generation;
                if (live != null) live.close();
            }); } catch (RuntimeException unavailable) { /* Native completion already delivered. */ }
        }
    }
}
