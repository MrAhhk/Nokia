package com.nokialauncher.billing;

import android.content.Context;
import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import java.nio.charset.StandardCharsets;
import java.lang.ref.WeakReference;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Application-owned bootstrap. The caller checks the native rollout flag BEFORE get/start.
 * Only the packaged pre-writer capture may reach start; JSON does not authenticate JS origin.
 * Only weak main-thread Home bindings belong here; no PluginCall, receipt, polling or autocharge.
 * A UI timeout must show recovery from read(), not cancel/reset the process worker or re-capture.
 * Local seal and SDK availability are separate: local legacy remains usable while SDK hangs.
 */
public final class BillingRuntime {
    public enum Phase { NOT_STARTED, SEALING, LOCAL_SEALED, SDK_READY, RECOVERY }
    public enum BootstrapIssue { NONE, STORAGE, CONFIGURATION, PROVIDER, WORKER }
    public interface Observer { void changed(State state); }
    public interface AttemptReader { BillingAttempt load() throws Exception; }
    /** Pure injection seam. seal must run before configure, and configure must not wait for network. */
    public interface Dependencies {
        Legacy seal(String originalCapture) throws Exception;
        boolean configured();
        /** Native build policy only. Never controlled by a bridge argument or UI state. */
        default boolean checkoutEnabled() { return false; }
        Session configure() throws Exception;
        /** Cached identifier only. Must not initialize the SDK or perform network/storage work. */
        default String supportId() { return null; }
        default void bindHome(Activity home) { }
        default void unbindHome(Activity home) { }
        /** Explicit Retry only. Lifecycle binding never constructs SDK/provider/resources. */
        default void retryResources() { }
    }
    interface HomeResource<T> extends BillingController.PurchaseTransport {
        void bindHome(T home);
        void unbindHome(T home);
        boolean nativeGate();
    }
    /** SDK/bootstrap work never waits for main. One queued main construction, explicit retries
     * after rejection/failure, and weak identity-specific Home binding share this resource owner.
     * Missing resources prove no SDK entry; they do not resolve an existing journal on their own.
     */
    static final class CheckoutResources<T> implements BillingController.PurchaseTransport {
        private final Executor main;
        private final BooleanSupplier onMain;
        private final Object lock = new Object();
        private volatile Supplier<HomeResource<T>> factory;
        private boolean queued;
        private volatile HomeResource<T> host;
        private WeakReference<T> home = new WeakReference<>(null); // main-thread only
        CheckoutResources(Executor main, BooleanSupplier onMain) {
            this.main = Objects.requireNonNull(main); this.onMain = Objects.requireNonNull(onMain);
        }
        void prepare(Supplier<HomeResource<T>> factory) {
            synchronized (lock) {
                if (this.factory != null) throw new IllegalStateException("billing_resource_already_prepared");
                this.factory = Objects.requireNonNull(factory);
            }
            retry();
        }
        void retry() {
            synchronized (lock) {
                if (host != null || queued || factory == null) return;
                queued = true;
            }
            try { main.execute(() -> {
                try {
                    requireMain();
                    HomeResource<T> created = Objects.requireNonNull(factory.get());
                    // Publish before binding: a failed binding cannot cause duplicate installation.
                    host = created;
                    T live = home.get(); if (live != null) created.bindHome(live);
                } catch (RuntimeException unavailable) { /* Fail closed; explicit Retry may try construction again. */ }
                finally { synchronized (lock) { queued = false; } }
            }); } catch (RuntimeException rejected) { synchronized (lock) { queued = false; } }
        }
        void bindHome(T target) {
            requireMain(); home = new WeakReference<>(Objects.requireNonNull(target));
            HomeResource<T> current = host; if (current != null) current.bindHome(target);
        }
        void unbindHome(T target) {
            requireMain(); if (home.get() == target) home = new WeakReference<>(null);
            HomeResource<T> current = host; if (current != null) current.unbindHome(target);
        }
        boolean nativeGate() {
            HomeResource<T> current = host;
            try { return current != null && current.nativeGate(); }
            catch (RuntimeException unavailable) { return false; }
        }
        @Override public void launch(RevenueCatCatalog.Selection selection, String id, BillingController.PurchaseCallback callback) {
            HomeResource<T> current = host;
            if (current == null) { callback.complete(BillingController.PurchaseOutcome.NOT_LAUNCHED); return; }
            current.launch(selection, id, callback);
        }
        private void requireMain() { if (!onMain.getAsBoolean()) throw new IllegalStateException("billing_main_required"); }
    }
    public static final class Session {
        public final String owner;
        public final BillingController.Provider provider;
        public final BillingController.Storage cache;
        public final BillingController.Time time;
        public final AttemptReader attempts;
        public final Executor actor, disk;
        public final BillingController.CatalogProvider catalog;
        public final BillingController.CheckoutDependencies checkout;
        public Session(String owner, BillingController.Provider provider, BillingController.Storage cache,
                BillingController.Time time, AttemptReader attempts, Executor actor, Executor disk) {
            this(owner, provider, cache, time, attempts, actor, disk,
                    callback -> callback.complete(RevenueCatCatalog.unavailable()));
        }
        public Session(String owner, BillingController.Provider provider, BillingController.Storage cache,
                BillingController.Time time, AttemptReader attempts, Executor actor, Executor disk,
                BillingController.CatalogProvider catalog) {
            this(owner, provider, cache, time, attempts, actor, disk, catalog, null);
        }
        /** Native-only injection; default constructors retain disabled checkout. */
        public Session(String owner, BillingController.Provider provider, BillingController.Storage cache,
                BillingController.Time time, AttemptReader attempts, Executor actor, Executor disk,
                BillingController.CatalogProvider catalog, BillingController.CheckoutDependencies checkout) {
            this.checkout = checkout;
            this.catalog = Objects.requireNonNull(catalog);
            this.owner = requiredText(owner); this.provider = Objects.requireNonNull(provider);
            this.cache = Objects.requireNonNull(cache); this.time = Objects.requireNonNull(time);
            this.attempts = Objects.requireNonNull(attempts); this.actor = Objects.requireNonNull(actor);
            this.disk = Objects.requireNonNull(disk);
        }
    }
    public static final class State {
        public final Phase phase;
        public final boolean localDecisionSealed, sdkAvailable, journalUnknown;
        public final BootstrapIssue bootstrapIssue;
        /** Null before a local decision exists. Absence is never an access denial. */
        public final BillingSnapshot snapshot;
        private State(Phase phase, boolean local, boolean sdk, boolean unknown,
                BootstrapIssue issue, BillingSnapshot billing) {
            this.phase = phase; localDecisionSealed = local; sdkAvailable = sdk;
            journalUnknown = unknown; bootstrapIssue = issue; this.snapshot = billing;
        }
        /** Launcher writers require a durable decision, except established eligible session access. */
        public boolean writersMayStart() {
            return localDecisionSealed && snapshot != null
                    && (snapshot.legacy.persisted || snapshot.legacy.status == LegacyStatus.ELIGIBLE);
        }
    }
    public final class Handle implements AutoCloseable {
        private final AtomicReference<Observer> observer;
        private final AtomicBoolean queued = new AtomicBoolean();
        private Handle(Observer observer) { this.observer = new AtomicReference<>(observer); }
        @Override public void close() {
            synchronized (lock) {
                if (observer.getAndSet(null) == null) return;
                subscribers.remove(this); syncCoreObserver();
            }
        }
        private void emit() {
            if (observer.get() == null || !queued.compareAndSet(false, true)) return;
            try { delivery.execute(() -> {
                queued.set(false);
                Observer target = observer.get();
                if (target != null) try { target.changed(read()); } catch (RuntimeException ignored) { }
            }); } catch (RejectedExecutionException rejected) { queued.set(false); }
        }
    }
    /** One request lease; close releases callback references, never rights or initialization. */
    public final class Request implements AutoCloseable {
        private final AtomicReference<BillingController.Observer> callback;
        private final AtomicReference<BillingController.Handle> core = new AtomicReference<>();
        private Request(BillingController.Observer callback) { this.callback = new AtomicReference<>(callback); }
        @Override public void close() {
            callback.set(null);
            BillingController.Handle handle = core.getAndSet(null); if (handle != null) handle.close();
            synchronized (lock) { retries.remove(this); }
        }
        private void bind(BillingController.Handle handle) {
            core.set(handle); if (callback.get() == null) { BillingController.Handle stale = core.getAndSet(null); if (stale != null) stale.close(); }
        }
        private void deliverLatest() {
            if (callback.get() == null) return;
            try { delivery.execute(() -> {
                BillingController.Observer target = callback.getAndSet(null);
                BillingController.Handle handle = core.getAndSet(null); if (handle != null) handle.close();
                if (target != null) try { target.changed(snapshot()); } catch (RuntimeException ignored) { }
            }); } catch (RejectedExecutionException unavailable) { close(); }
        }
    }
    private static BillingRuntime shared;
    private static final int MAX_SUBSCRIBERS = 64;
    private final Object lock = new Object();
    private final Dependencies dependencies;
    private final Executor bootstrap, delivery;
    private final List<Handle> subscribers = new ArrayList<>();
    private final List<Request> retries = new ArrayList<>();
    private final String localEpoch = "bootstrap-" + UUID.randomUUID();
    private final String coreEpoch = UUID.randomUUID().toString();
    private volatile State state = new State(Phase.NOT_STARTED, false, false, false, BootstrapIssue.NONE, null);
    private volatile BillingController controller;
    private BillingController.Handle coreObserver;
    private String originalCapture;
    private boolean started, bootstrapRunning, initialRefreshStarted;
    private long localSequence;
    private final BillingProviderConfig nativeConfig;

    /** Lazy singleton retains exclusively ApplicationContext through native dependencies. */
    public static synchronized BillingRuntime existing() { return shared; }
    public static synchronized BillingRuntime get(Context context, BillingProviderConfig config) {
        Objects.requireNonNull(context); Objects.requireNonNull(config);
        if (shared != null) {
            if (!shared.nativeConfig.hasSameIdentity(config))
                throw new IllegalStateException("billing_configuration_changed_in_process");
            return shared;
        }
        Context application = Objects.requireNonNull(context.getApplicationContext());
        Handler main = new Handler(Looper.getMainLooper());
        Executor delivery = runnable -> {
            if (!main.post(runnable)) throw new RejectedExecutionException("Billing delivery unavailable");
        };
        shared = new BillingRuntime(new NativeDependencies(application, config, delivery),
                BillingController.newWorker("billing-bootstrap"), delivery, config);
        return shared;
    }
    /** Tests exercise real bootstrap sequencing without Android/SDK construction. */
    public BillingRuntime(Dependencies dependencies, Executor bootstrap, Executor delivery) {
        this(dependencies, bootstrap, delivery, null);
    }
    private BillingRuntime(Dependencies dependencies, Executor bootstrap, Executor delivery, BillingProviderConfig config) {
        this.dependencies = Objects.requireNonNull(dependencies); this.bootstrap = Objects.requireNonNull(bootstrap);
        this.delivery = Objects.requireNonNull(delivery); nativeConfig = config;
    }
    /** First capture, including null, is immutable. Repeated calls never configure or mint again. */
    public void start(String captureJson) {
        synchronized (lock) {
            if (started) {
                // A caller retry after the very first worker rejection has no snapshot yet.
                // Retain the first capture; do not let a repeated initialize replace evidence.
                if (!bootstrapRunning && state.phase == Phase.RECOVERY && state.snapshot == null) {
                    bootstrapRunning = true;
                    state = new State(Phase.SEALING, false, false, false, BootstrapIssue.NONE, null);
                    emitAll();
                    try { bootstrap.execute(this::initialize); }
                    catch (RejectedExecutionException unavailable) {
                        bootstrapRunning = false;
                        state = new State(Phase.RECOVERY, false, false, false, BootstrapIssue.WORKER, null); emitAll();
                    }
                }
                return;
            }
            started = true;
            bootstrapRunning = true;
            // Oversized hostile bridge input is retained as an invalid capture without allocating more.
            originalCapture = captureJson != null && captureJson.length() <= 1024 ? captureJson : null;
            state = new State(Phase.SEALING, false, false, false, BootstrapIssue.NONE, null);
            emitAll();
            try { bootstrap.execute(this::initialize); }
            catch (RejectedExecutionException unavailable) {
                bootstrapRunning = false;
                state = new State(Phase.RECOVERY, false, false, false, BootstrapIssue.WORKER, null); emitAll();
            }
        }
    }
    /** Lock-free local read; no disk/network work and no wait behind SDK initialization. */
    public State read() {
        State captured = state;
        BillingController current = controller;
        if (!captured.sdkAvailable || current == null) return captured;
        BillingController.RuntimeView view = current.runtimeView();
        boolean unknown = view.journalKnown == null ? captured.journalUnknown : !view.journalKnown;
        BootstrapIssue issue = captured.bootstrapIssue;
        if (issue == BootstrapIssue.STORAGE && view.journalKnown != null && !unknown
                && view.snapshot.legacy.persisted) issue = BootstrapIssue.NONE;
        return new State(captured.phase, captured.localDecisionSealed, true, unknown,
                issue, commandCapabilities(view.snapshot,
                        unknown || issue == BootstrapIssue.STORAGE, true,
                        captured.phase == Phase.SDK_READY && issue == BootstrapIssue.NONE
                                && captured.localDecisionSealed && dependencies.checkoutEnabled()));
    }
    public BillingSnapshot snapshot() { return read().snapshot; }
    /** Native packaged Home owner only. Binding never starts/seals/configures the runtime. */
    public void bindHome(Activity home) { requireMainHome(); dependencies.bindHome(Objects.requireNonNull(home)); }
    public void unbindHome(Activity home) { requireMainHome(); dependencies.unbindHome(Objects.requireNonNull(home)); }
    private static void requireMainHome() {
        if (Looper.myLooper() != Looper.getMainLooper()) throw new IllegalStateException("billing_main_required");
    }
    /** Called only by an explicit support action; never included in snapshots/events. */
    public String supportSummary(String version) {
        State current = read();
        String id = null;
        try { id = dependencies.supportId(); } catch (RuntimeException unavailable) { /* Omit unavailable ID. */ }
        return BillingSupportSummary.create(version, id, current.snapshot, current.bootstrapIssue.name());
    }
    /** Close on pause/destroy. Closing never cancels initialization, access or persistence. */
    public Handle subscribe(Observer observer) {
        Objects.requireNonNull(observer);
        synchronized (lock) {
            if (subscribers.size() >= MAX_SUBSCRIBERS) throw new RejectedExecutionException("Billing subscriber limit");
            Handle handle = new Handle(observer); subscribers.add(handle);
            try { syncCoreObserver(); }
            catch (RuntimeException rejected) { subscribers.remove(handle); handle.observer.set(null); throw rejected; }
            handle.emit(); return handle;
        }
    }
    /** Explicit Retry: local seal/config recovery uses original capture; ready requests join
     * one canonical fetch. Bootstrap retries coalesce, remain bounded and never reset the owner.
     */
    public Request refresh(BillingController.Observer completion) {
        Objects.requireNonNull(completion);
        synchronized (lock) {
            if (!started) throw new IllegalStateException("billing_requires_bootstrap");
            Request request = new Request(completion);
            BillingController current = controller;
            if (!bootstrapRunning && state.sdkAvailable && current != null && state.snapshot.legacy.persisted) {
                dependencies.retryResources();
                request.bind(current.refresh(value -> request.deliverLatest()));
                return request;
            }
            if (retries.size() >= MAX_SUBSCRIBERS) throw new RejectedExecutionException("Billing retry limit");
            retries.add(request);
            if (!bootstrapRunning) {
                bootstrapRunning = true;
                try { bootstrap.execute(this::initialize); }
                catch (RejectedExecutionException rejected) { fail(BootstrapIssue.WORKER); finishBootstrap(); }
            }
            return request;
        }
    }
    /** Explicit presentation refresh only; never initializes SDK or runs on idle startup. */
    public Request refreshCatalog(BillingController.Observer completion) {
        Objects.requireNonNull(completion);
        synchronized (lock) {
            if (!state.sdkAvailable || controller == null) throw new IllegalStateException("billing_not_ready");
            Request request = new Request(completion);
            request.bind(controller.refreshCatalog(value -> request.deliverLatest()));
            return request;
        }
    }
    /** Explicit user Restore. Never resolves or resets the purchase journal. */
    public Request restore(BillingController.Observer completion) {
        Objects.requireNonNull(completion);
        synchronized (lock) {
            if (!state.sdkAvailable || controller == null) throw new IllegalStateException("billing_not_ready");
            Request request = new Request(completion);
            request.bind(controller.restore(value -> request.deliverLatest()));
            return request;
        }
    }
    /** Acceptance is UI acknowledgement only. Closing drops callbacks, never native Restore. */
    public BillingController.Handle restore(BillingController.Observer completion,
            BillingController.OperationAcknowledgement acknowledgement) {
        Objects.requireNonNull(completion); Objects.requireNonNull(acknowledgement);
        synchronized (lock) {
            requireCommandReady();
            return controller.restore(value -> completion.changed(snapshot()), acknowledgement);
        }
    }
    /** Explicit checkout intent; the public presentation gate must agree with this native gate.
     * Native rollout policy and the controller's current admission decision must both allow it.
     * Controller rechecks rights, exact catalog revision, journal and host on its serial actor.
     */
    public BillingController.Handle purchase(Plan plan, String revision, boolean acceptedImmediateCharge,
            BillingController.Observer completion, BillingController.OperationAcknowledgement acknowledgement) {
        BillingPurchaseInput.validate(plan, revision, acceptedImmediateCharge);
        Objects.requireNonNull(completion); Objects.requireNonNull(acknowledgement);
        synchronized (lock) {
            State current = requireCommandReady();
            if (!current.snapshot.legacy.persisted || current.journalUnknown
                    || current.bootstrapIssue == BootstrapIssue.STORAGE)
                throw new IllegalStateException("billing_storage_recovery");
            if (!current.snapshot.capabilities.checkout) throw new IllegalStateException("billing_checkout_disabled");
            return controller.purchase(plan, revision, value -> completion.changed(snapshot()), acknowledgement);
        }
    }
    private State requireCommandReady() {
        State current = read();
        if (!current.sdkAvailable || controller == null || !current.localDecisionSealed || current.snapshot == null)
            throw new IllegalStateException("billing_not_ready");
        return current;
    }
    /** Never interpret a lifecycle return as a payment result. */
    public State checkoutRecovery() { return read(); }
    /** Explicit native recovery action. Reads authenticated journal/qualified receipts;
     * never launches a purchase or treats an Activity return as payment evidence.
     * Observe normal runtime state for asynchronous progress and completion.
     */
    public void reconcilePurchase() {
        synchronized (lock) {
            requireCommandReady();
            controller.reconcilePurchase();
        }
    }
    private void initialize() {
        State previous = read();
        Legacy legacy;
        BootstrapIssue sealIssue = BootstrapIssue.NONE;
        if (previous.snapshot != null && previous.snapshot.legacy.persisted) legacy = previous.snapshot.legacy;
        else {
            try { legacy = Objects.requireNonNull(dependencies.seal(originalCapture)); }
            catch (Exception unavailable) { legacy = previous.snapshot == null
                    ? new Legacy(LegacyStatus.NEEDS_RECOVERY, false) : previous.snapshot.legacy; }
            // A newly unreadable marker cannot erase historically established session access.
            if (previous.snapshot != null && previous.snapshot.legacy.status == LegacyStatus.ELIGIBLE
                    && legacy.status != LegacyStatus.ELIGIBLE) legacy = previous.snapshot.legacy;
        }
        if (!legacy.persisted) sealIssue = BootstrapIssue.STORAGE;
        BillingSnapshot local = BillingPolicy.snapshot(localEpoch, localSequence++, "local-seal", legacy, null, null, 0,
                Operation.idle(), null, false, false, false,
                sealIssue == BootstrapIssue.STORAGE ? Issue.STORAGE : Issue.NONE, RevenueCatCatalog.unavailable().items);
        local = unavailableCommands(local, false);
        synchronized (lock) {
            if (controller == null) {
                state = new State(Phase.LOCAL_SEALED, true, false, false, sealIssue, local); emitAll();
            }
        }
        final Legacy sealed = legacy;
        final BootstrapIssue localIssue = sealIssue;
        try {
            if (controller != null) {
                dependencies.retryResources();
                BillingController core = controller;
                core.updateSealedLegacy(sealed, () -> {
                    try {
                        synchronized (lock) {
                            state = new State(Phase.SDK_READY, true, true, state.journalUnknown,
                                    state.journalUnknown ? BootstrapIssue.STORAGE : localIssue,
                                    unavailableCommands(core.snapshot(), state.journalUnknown || localIssue == BootstrapIssue.STORAGE));
                            syncCoreObserver(); emitAll();
                        }
                        // Explicit storage retry, not a fresh receipt or another purchase.
                        core.retryPersistence();
                        core.initialize();
                        core.refresh(value -> {}).close();
                    } catch (RejectedExecutionException busy) {
                        synchronized (lock) {
                            State current = read();
                            state = new State(current.phase, true, true, current.journalUnknown,
                                    BootstrapIssue.WORKER, current.snapshot); emitAll();
                        }
                    } finally { finishBootstrap(); }
                });
                return;
            }
            if (!dependencies.configured()) { fail(BootstrapIssue.CONFIGURATION); finishBootstrap(); return; }
            Session session = Objects.requireNonNull(dependencies.configure());
            BillingAttempt attempt = null; boolean journalUnknown = false;
            try {
                attempt = session.attempts.load();
                if (attempt != null && !session.owner.equals(attempt.ownerEpoch)) { attempt = null; journalUnknown = true; }
            } catch (Exception unknown) { journalUnknown = true; }
            BillingController core = new BillingController(session.owner, coreEpoch, session.provider, session.cache,
                    session.time, session.actor, session.disk, delivery, legacy, attempt, BillingController.DEFAULT_SCHEDULER,
                    session.catalog, session.checkout);
            synchronized (lock) {
                controller = core;
                state = new State(Phase.SDK_READY, true, true, journalUnknown,
                        journalUnknown ? BootstrapIssue.STORAGE : sealIssue, unavailableCommands(core.snapshot(), journalUnknown));
                syncCoreObserver(); emitAll();
            }
            core.initialize();
            // Exactly one process-start refresh, queued after local cache load. Never wait for its
            // network callback, retain a UI completion, or convert initialization into Restore.
            if (!initialRefreshStarted) { initialRefreshStarted = true; core.refresh(value -> {}).close(); }
            finishBootstrap();
        } catch (Exception unavailable) { fail(BootstrapIssue.PROVIDER); finishBootstrap(); }
    }
    private void finishBootstrap() {
        synchronized (lock) {
            bootstrapRunning = false;
            List<Request> completed = new ArrayList<>(retries); retries.clear();
            for (Request request : completed) request.deliverLatest();
        }
    }
    private void fail(BootstrapIssue issue) {
        synchronized (lock) {
            State previous = read();
            state = new State(Phase.RECOVERY, previous.localDecisionSealed, false, previous.journalUnknown,
                    previous.bootstrapIssue == BootstrapIssue.STORAGE ? BootstrapIssue.STORAGE : issue,
                    previous.snapshot == null ? null : unavailableCommands(previous.snapshot, previous.journalUnknown, false));
            if (coreObserver != null) { coreObserver.close(); coreObserver = null; }
            emitAll();
        }
    }
    private void emitAll() { for (Handle handle : new ArrayList<>(subscribers)) handle.emit(); }
    /** At most one foreground core binding. It holds this owner, never a UI callback. */
    private void syncCoreObserver() {
        if (controller == null || !state.sdkAvailable) return;
        if (subscribers.isEmpty()) {
            if (coreObserver != null) { coreObserver.close(); coreObserver = null; }
        } else if (coreObserver == null) {
            coreObserver = controller.attach(value -> { synchronized (lock) { emitAll(); } });
            // A direct injected delivery can close its last subscriber during attach's initial emit.
            if (subscribers.isEmpty()) { coreObserver.close(); coreObserver = null; }
        }
    }
    private static BillingSnapshot unavailableCommands(BillingSnapshot value, boolean journalUnknown) {
        return unavailableCommands(value, journalUnknown, false);
    }
    private static BillingSnapshot unavailableCommands(BillingSnapshot value, boolean journalUnknown, boolean restoreReady) {
        return commandCapabilities(value, journalUnknown, restoreReady, false);
    }
    static BillingSnapshot commandCapabilities(BillingSnapshot value, boolean journalUnknown,
            boolean restoreReady, boolean checkoutEnabled) {
        return new BillingSnapshot(value.controllerEpoch, value.sequence, value.legacy, value.access,
                new Capabilities(checkoutEnabled && !journalUnknown && value.legacy.persisted
                        && value.capabilities.checkout, restoreReady && value.capabilities.restore, true), value.operation, value.unresolvedPurchase, value.store,
                journalUnknown ? Issue.STORAGE : value.issue, value.catalog);
    }
    /** Collision-resistant length-prefixed identity of native public config plus SDK anonymous ID.
     * Not a UI/process UUID, support log, purchase credential or fabricated customer identity.
     */
    public static String ownerIdentity(BillingProviderConfig config, String anonymousId) {
        Objects.requireNonNull(config);
        if (!config.isConfigured() || anonymousId == null || anonymousId.isEmpty() || anonymousId.length() > 1024)
            throw new IllegalArgumentException("Billing identity unavailable");
        for (int i = 0; i < anonymousId.length(); i++) if (Character.isISOControl(anonymousId.charAt(i)))
            throw new IllegalArgumentException("Billing identity unavailable");
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String part : new String[]{"nokia-billing-owner-v1", config.publicKey, config.subscriptionProduct,
                    config.monthlyPlan, config.yearlyPlan, config.lifetimeProduct, config.offering, anonymousId}) {
                byte[] bytes = part.getBytes(StandardCharsets.UTF_8);
                digest.update(new byte[]{(byte)(bytes.length >>> 24), (byte)(bytes.length >>> 16),
                        (byte)(bytes.length >>> 8), (byte)bytes.length}); digest.update(bytes);
            }
            StringBuilder out = new StringBuilder("owner-v1-");
            for (byte b : digest.digest()) { out.append(Character.forDigit((b >>> 4) & 15, 16)); out.append(Character.forDigit(b & 15, 16)); }
            return out.toString();
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    /** Relative OS installation metadata only; device current date never grants access.
     * Updated or inconsistent packages are not declared fresh by missing browser keys.
     */
    static boolean freshInstallMetadata(long installedVersion, long packagedVersion, long first, long updated) {
        return installedVersion == packagedVersion && installedVersion > 0 && first > 0 && first == updated;
    }
    private static final class NativeDependencies implements Dependencies {
        private final Context application;
        private final BillingProviderConfig config;
        private BillingStore store;
        private volatile String supportId;
        private final CheckoutResources<Activity> resources;
        private Session session;
        NativeDependencies(Context application, BillingProviderConfig config, Executor main) {
            this.application = application; this.config = config;
            resources = new CheckoutResources<>(main, () -> Looper.myLooper() == Looper.getMainLooper());
        }
        @Override public Legacy seal(String capture) {
            if (store == null) store = new BillingStore(application);
            return new LegacyGrantStore(store).sealCapturedBeforeWriters(capture,
                    new LegacyGrantStore.ReleasedRules("code8-install-evidence-v2", true, true, false),
                    nativeFreshInstall()).trustedSealedState();
        }
        private boolean nativeFreshInstall() {
            try {
                android.content.pm.PackageInfo info = application.getPackageManager()
                        .getPackageInfo(application.getPackageName(), 0);
                return freshInstallMetadata(androidx.core.content.pm.PackageInfoCompat.getLongVersionCode(info), com.nokialauncher.BuildConfig.VERSION_CODE,
                        info.firstInstallTime, info.lastUpdateTime);
            } catch (android.content.pm.PackageManager.NameNotFoundException | RuntimeException unavailable) {
                return false;
            }
        }
        @Override public boolean configured() { return config.isConfigured(); }
        @Override public boolean checkoutEnabled() {
            return com.nokialauncher.BuildConfig.BILLING_ROLLOUT_ENABLED && config.isConfigured();
        }
        @Override public String supportId() { return supportId; }
        @Override public void bindHome(Activity home) { resources.bindHome(home); }
        @Override public void unbindHome(Activity home) { resources.unbindHome(home); }
        @Override public void retryResources() { resources.retry(); }
        @Override public Session configure() {
            if (session != null) { resources.retry(); return session; }
            RevenueCatAdapter sdk = RevenueCatAdapter.initialize(application, config);
            String anonymousId = sdk.getSupportId();
            String owner = ownerIdentity(config, anonymousId);
            supportId = anonymousId;
            BillingPlatformTime time = new BillingPlatformTime(application);
            BillingAttemptStorage attempts = new BillingAttemptStorage(store, owner);
            BillingController.AttemptJournal journal = new BillingController.AttemptJournal() {
                @Override public BillingAttempt load() throws Exception { return attempts.load(); }
                @Override public boolean save(BillingAttempt next, BillingAttempt prior) { return attempts.save(next, prior); }
            };
            Executor disk = BillingController.newWorker("billing-disk");
            RevenueCatReceiptMapper receipts = new RevenueCatReceiptMapper(sdk, config, owner, time);
            RevenueCatCheckoutPreflight preflight = new RevenueCatCheckoutPreflight(sdk, config);
            session = new Session(owner, new RevenueCatProvider(sdk, config, owner, time),
                    new BillingCacheStorage(store, owner), time, attempts::load,
                    BillingController.newWorker("billing-state"), disk,
                    new RevenueCatCatalogProvider(sdk, config), new BillingController.CheckoutDependencies(
                            receipts::fetchCurrent, preflight::prepare, journal, resources, resources::nativeGate));
            resources.prepare(() -> BillingPurchaseHost.create(application, owner, journal, disk, sdk));
            return session;
        }
    }
}
