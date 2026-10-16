package com.nokialauncher.billing;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import static com.nokialauncher.billing.BillingSnapshot.*;
import static com.nokialauncher.billing.BillingPolicy.*;

/** Process-owned normalized core wired through BillingRuntime; checkout remains disabled.
 * Actor owns all mutations; disk executor owns blocking load/save; delivery executor is the
 * Android main executor in production. Provider initiation must return without waiting for network.
 * No Activity, Context, PluginCall, SDK receipt or polling lives here. One cancellable expiry
 * deadline is armed while a foreground observer is attached; close its Handle on pause. The worker is application-owned; an absent signed anchor has a 30-second live decision lease
 * followed by verification recovery, not an invented subscription expiry or trusted clock.
 * ownerEpoch is stable billing/customer configuration; controllerEpoch is a new process ID.
 * UI bindings must close their Handle on teardown. Closing never cancels rights/persistence.
 * Application owner must surface native recovery before terminal worker shutdown; shutdown
 * is not a detach mechanism. Pending completions remain retained and shutdown rejection is explicit.
 */
public final class BillingController {
    public interface Provider {
        void fetchCurrent(Callback callback);
        /** User action only. Implementations must return fresh verified receipt-post evidence;
         * an SDK cache/listener echo is not a successful Restore. */
        default void restoreCurrent(Callback callback) { callback.complete(null, Issue.PROVIDER); }
    }
    /** Presentation-only, possibly SDK-cache-backed. Never evidence of fresh checkout terms. */
    public interface CatalogProvider { void fetchCatalog(CatalogCallback callback); }
    public interface CatalogCallback { void complete(RevenueCatCatalog catalog); }
    public interface ReceiptSource { void fetchCurrent(RevenueCatReceiptMapper.Callback callback); }
    public interface CheckoutPreflight {
        void prepare(RevenueCatCatalog prior, Plan plan, String revision, RevenueCatCheckoutPreflight.Callback callback);
    }
    public interface AttemptJournal {
        BillingAttempt load() throws Exception;
        boolean save(BillingAttempt next, BillingAttempt expectedPrevious) throws Exception;
    }
    public enum PurchaseOutcome { NOT_LAUNCHED, PRODUCT_UNAVAILABLE, CANCELED, PENDING, UNCERTAIN, COMPLETED }
    public interface PurchaseCallback { void complete(PurchaseOutcome outcome); }
    /** UI delivery acknowledgement, before waiting for provider/payment completion.
     * Null means the actor rejected the intent. An ID proves acceptance only, never payment.
     */
    public interface OperationAcknowledgement { void complete(String operationId); }
    /** Native host validates live Activity/generation and maps only proven SDK cancellation.
     * COMPLETED is a signal to query receipts, never an entitlement or journal resolution. */
    public interface PurchaseTransport {
        void launch(RevenueCatCatalog.Selection selection, String attemptId, PurchaseCallback callback);
    }
    public static final class CheckoutDependencies {
        final ReceiptSource receipts; final CheckoutPreflight preflight; final AttemptJournal journal;
        final PurchaseTransport purchase; final java.util.function.BooleanSupplier nativeGate;
        public CheckoutDependencies(ReceiptSource receipts, CheckoutPreflight preflight, AttemptJournal journal,
                PurchaseTransport purchase, java.util.function.BooleanSupplier nativeGate) {
            this.receipts = Objects.requireNonNull(receipts); this.preflight = Objects.requireNonNull(preflight);
            this.journal = Objects.requireNonNull(journal); this.purchase = Objects.requireNonNull(purchase);
            this.nativeGate = Objects.requireNonNull(nativeGate);
        }
    }
    public interface Callback { void complete(Record record, Issue failure); }
    public interface Storage {
        /** Validated authenticated normalized cache, null for missing; throw for unknown/corrupt. */
        StoreRecord load() throws Exception;
        /** Serialize normalized record through BillingStore ACCESS; true only after verified write. */
        boolean save(StoreRecord record) throws Exception;
    }
    public interface Time { String bootToken(); long elapsedRealtimeMs(); }
    public interface Cancellation { void cancel(); }
    /** Application-owned one-shot scheduler. Cancellation removes obsolete queued deadlines. */
    public interface Scheduler { Cancellation schedule(Runnable callback, long delayMs); }
    private static final ScheduledThreadPoolExecutor EXPIRY_WORKER = new ScheduledThreadPoolExecutor(1,
            runnable -> { Thread thread = new Thread(runnable, "billing-expiry"); thread.setDaemon(true); return thread; });
    static { EXPIRY_WORKER.setRemoveOnCancelPolicy(true); }
    static final Scheduler DEFAULT_SCHEDULER = (callback, delay) -> {
        java.util.concurrent.ScheduledFuture<?> future = EXPIRY_WORKER.schedule(callback, delay, TimeUnit.MILLISECONDS);
        return () -> future.cancel(false);
    };
    // An unanchored fresh response authorizes a bounded live evaluation, never durable offline access.
    static final long UNANCHORED_LIVE_MS = 30_000;
    public interface Observer { void changed(BillingSnapshot snapshot); }
    /** Proven normalized SDK input. FETCH_CURRENT/requestDate alone never proves REMOTE or clock.
     * Production SDK mapping must prove verification per M02; absent trusted time means null clock.
     */
    public static final class Record {
        public final String ownerEpoch;
        public final Store store;
        public final ClockAnchor clock;
        public Record(String ownerEpoch, Store store, ClockAnchor clock) {
            this.ownerEpoch = requiredText(ownerEpoch); this.store = Objects.requireNonNull(store);
            if (clock != null && store.verification != Verification.REMOTE)
                throw new IllegalArgumentException("Unverified clock");
            this.clock = clock;
        }
    }
    public static final class Handle implements AutoCloseable {
        private final AtomicReference<Observer> observer;
        private final AtomicReference<OperationAcknowledgement> acknowledgement;
        private final Runnable onClose;
        private Handle(Observer observer) { this(observer, () -> {}); }
        private Handle(Observer observer, Runnable onClose) {
            this(observer, onClose, null);
        }
        private Handle(Observer observer, Runnable onClose, OperationAcknowledgement acknowledgement) {
            this.observer = new AtomicReference<>(Objects.requireNonNull(observer)); this.onClose = onClose;
            this.acknowledgement = new AtomicReference<>(acknowledgement);
        }
        public void close() { acknowledgement.set(null); if (observer.getAndSet(null) != null) onClose.run(); }
    }
    private static final int MAX_BINDINGS = 64;
    private final String ownerEpoch, controllerEpoch;
    private final CatalogProvider catalogProvider;
    private final CheckoutDependencies checkout;
    private boolean journalKnown, startupReconciled;
    private final AtomicInteger checkoutBindings = new AtomicInteger();
    private Handle checkoutJoiner;
    private RevenueCatCatalog catalog = RevenueCatCatalog.unavailable();
    private boolean catalogInFlight;
    private long catalogRequest;
    private final AtomicInteger catalogBindings = new AtomicInteger();
    private final List<Handle> catalogJoiners = new ArrayList<>();
    private final Provider provider; private final Storage storage; private final Time time;
    private final Executor actor, disk, delivery;
    private final AtomicReference<Projection> latest = new AtomicReference<>();
    private final Scheduler scheduler;
    private Cancellation expiry;
    private StoreRecord expiryRefreshRecord;
    private final AtomicBoolean expiryCompletionPending = new AtomicBoolean();
    private long liveUntil = -1;
    private String liveBoot;
    /** Both variants are allocated on the actor with distinct reserved sequences. Readers only
     * select immutable data: they never mutate actor fields or publish competing revisions. */
    private static final class Projection {
        final BillingSnapshot current, expired;
        final long deadline, elapsedFloor;
        final String boot;
        final Boolean journalKnown;
        Projection(BillingSnapshot current, BillingSnapshot expired, long deadline, long elapsedFloor, String boot,
                Boolean journalKnown) {
            this.current = current; this.expired = expired; this.deadline = deadline;
            this.elapsedFloor = elapsedFloor; this.boot = boot;
            this.journalKnown = journalKnown;
        }
        boolean invalid(Time time) {
            long elapsed = time.elapsedRealtimeMs();
            return deadline >= 0 && (elapsed >= deadline || elapsed < elapsedFloor
                    || (boot != null && !boot.equals(time.bootToken())));
        }
    }
    // Reserved non-dropping completion lane. Bounded producers: load 1, canonical fetch 1, restore 1,
    // catalog 1, disk saves at most 128, one coalesced expiry/lifecycle notification. Only wrapped actor work drains it; callbacks never mutate state.
    private final ConcurrentLinkedQueue<Runnable> completions = new ConcurrentLinkedQueue<>();
    private final AtomicInteger scheduledActorTasks = new AtomicInteger();
    private final List<Handle> observers = new ArrayList<>(), joiners = new ArrayList<>();
    private final List<Handle> restoreJoiners = new ArrayList<>();
    private Operation operation = Operation.idle();
    private Legacy legacy; private BillingAttempt attempt;
    private StoreRecord accepted;
    private Issue issue = Issue.NONE;
    private long sequence, requestSequence, activeRequest;
    private long restoreRequest, decisionFloor;
    private int pendingWrites;
    private boolean initialized, loading, inFlight, refreshPending, freshRemote;

    /** Executors are application-owned, serialized, bounded, and must never run disk on main.
     * Injection keeps tests independent of Android. No default provider invents SDK rights.
     * Public actor submission may throw RejectedExecutionException to its caller; RPC wiring
     * must report that explicit failure. Never retry submission by blocking the actor.
     */
    public BillingController(String ownerEpoch, String controllerEpoch, Provider provider, Storage storage,
            Time time, Executor actor, Executor disk, Executor delivery, Legacy legacy, BillingAttempt attempt) {
        this(ownerEpoch, controllerEpoch, provider, storage, time, actor, disk, delivery, legacy, attempt, DEFAULT_SCHEDULER);
    }
    public BillingController(String ownerEpoch, String controllerEpoch, Provider provider, Storage storage,
            Time time, Executor actor, Executor disk, Executor delivery, Legacy legacy, BillingAttempt attempt,
            Scheduler scheduler) {
        this(ownerEpoch, controllerEpoch, provider, storage, time, actor, disk, delivery, legacy, attempt,
                scheduler, callback -> callback.complete(RevenueCatCatalog.unavailable()));
    }
    public BillingController(String ownerEpoch, String controllerEpoch, Provider provider, Storage storage,
            Time time, Executor actor, Executor disk, Executor delivery, Legacy legacy, BillingAttempt attempt,
            Scheduler scheduler, CatalogProvider catalogProvider) {
        this(ownerEpoch, controllerEpoch, provider, storage, time, actor, disk, delivery, legacy, attempt,
                scheduler, catalogProvider, null);
    }
    public BillingController(String ownerEpoch, String controllerEpoch, Provider provider, Storage storage,
            Time time, Executor actor, Executor disk, Executor delivery, Legacy legacy, BillingAttempt attempt,
            Scheduler scheduler, CatalogProvider catalogProvider, CheckoutDependencies checkout) {
        this.checkout = checkout;
        this.catalogProvider = Objects.requireNonNull(catalogProvider);
        this.scheduler = Objects.requireNonNull(scheduler);
        this.ownerEpoch = requiredText(ownerEpoch); this.controllerEpoch = requiredText(controllerEpoch);
        this.provider = Objects.requireNonNull(provider); this.storage = Objects.requireNonNull(storage);
        this.time = Objects.requireNonNull(time); this.actor = Objects.requireNonNull(actor);
        this.disk = Objects.requireNonNull(disk); this.delivery = Objects.requireNonNull(delivery);
        this.legacy = Objects.requireNonNull(legacy); this.attempt = attempt;
        if (attempt != null && !attempt.ownerEpoch.equals(ownerEpoch)) throw new IllegalArgumentException("Wrong journal owner");
        latest.set(project());
    }
    /** Production worker factory; app owner controls shutdown. Rejection is explicit, never drops work. */
    public static ThreadPoolExecutor newWorker(String name) {
        requiredText(name);
        return new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(128),
                runnable -> { Thread thread = new Thread(runnable, name); thread.setDaemon(true); return thread; },
                new ThreadPoolExecutor.AbortPolicy());
    }
    /** Lock-free local read, independent of a hung provider or disk write. */
    public BillingSnapshot snapshot() {
        Projection projection = latest.get();
        return projection.invalid(time) ? projection.expired : projection.current;
    }
    public Handle attach(Observer observer) {
        Handle handle = new Handle(observer, this::requestLocalWake);
        executeActor(() -> {
            prune(observers); if (observers.size() >= MAX_BINDINGS) { handle.close(); return; }
            publish(); observers.add(handle); armExpiry(latest.get()); emit(handle);
        });
        return handle;
    }
    /** Local cache bootstrap never waits for the provider. Repeated init is idempotent. */
    public void initialize() { executeActor(this::startLoad); }
    private void startLoad() {
        if (initialized || loading) return;
        loading = true;
        try { disk.execute(() -> {
            StoreRecord cached = null; boolean failed = false;
            try { cached = storage.load(); } catch (Exception unavailable) { failed = true; }
            BillingAttempt loadedAttempt = null; boolean journalFailed = false;
            if (checkout != null) try {
                loadedAttempt = checkout.journal.load();
                if (loadedAttempt != null && !ownerEpoch.equals(loadedAttempt.ownerEpoch)) journalFailed = true;
            } catch (Exception unavailable) { journalFailed = true; }
            final BillingAttempt journal = loadedAttempt; final boolean unknownJournal = journalFailed;
            final StoreRecord result = cached; final boolean unknown = failed;
            postCompletion(() -> {
                loading = false; initialized = true;
                if (checkout != null) {
                    journalKnown = !unknownJournal;
                    if (journalKnown) attempt = journal;
                    else issue = Issue.STORAGE;
                }
                if (result != null && result.generation.equals(ownerEpoch)) {
                    if (accepted == null) {
                        accepted = accept(null, result, ownerEpoch).record;
                        if (accepted == null) issue = Issue.STORAGE;
                        else {
                            // Seed authenticated local metadata, never untrusted input. Exhausted cache
                            // counters can rebase in a NEW process: no old process callback exists here.
                            if (accepted.requestSequence == Long.MAX_VALUE)
                                accepted = new StoreRecord(accepted.store, ownerEpoch, 0, accepted.clock, true);
                            requestSequence = Math.max(requestSequence, accepted.requestSequence);
                        }
                    }
                }
                if (unknown) issue = Issue.STORAGE;
                publish(); afterLoad();
            });
        }); } catch (RejectedExecutionException unavailable) {
            loading = false; initialized = true; issue = Issue.STORAGE;
            publish(); afterLoad();
        }
    }
    /** Explicit/lifecycle-armed refresh only. Concurrent requests join a single fetch. */
    public Handle refresh(Observer completion) {
        Handle handle = new Handle(completion);
        executeActor(() -> {
            prune(joiners); if (joiners.size() >= MAX_BINDINGS) { handle.close(); return; }
            joiners.add(handle); refreshPending = true;
            if (!initialized) startLoad(); else if (!inFlight && !operation.isBusy()) beginFetch();
        });
        return handle;
    }
    private void afterLoad() {
        if (operation.state == OperationState.RESTORING && restoreRequest == 0) beginRestore();
        else if (checkout != null && !startupReconciled && !operation.isBusy()) {
            startupReconciled = true;
            if (journalKnown && attempt != null && attempt.unresolved()) beginReconciliation();
            else if (refreshPending && !inFlight) beginFetch();
        }
        else if (refreshPending && !inFlight && !operation.isBusy()) beginFetch();
    }
    /** One interactive Restore, coalescing at most 64 UI completions. Closing a Handle only
     * detaches that UI. Restore never creates/resolves a checkout attempt or purchases anything.
     * A hung background fetch keeps its sole network slot until its callback arrives; Restore
     * uses a separate slot and supersedes its evidence. Refresh waiters join the newer Restore. */
    public Handle restore(Observer completion) {
        return restore(completion, null);
    }
    public Handle restore(Observer completion, OperationAcknowledgement acknowledgement) {
        Handle handle = new Handle(completion, () -> {}, acknowledgement);
        executeActor(() -> {
            prune(restoreJoiners);
            if (restoreJoiners.size() >= MAX_BINDINGS) { acknowledge(handle, null, true); return; }
            if (operation.isBusy() && operation.state != OperationState.RESTORING) { acknowledge(handle, null); emit(handle); return; }
            restoreJoiners.add(handle);
            if (operation.isBusy()) { acknowledge(handle, operation.id); return; }
            operation = new Operation(UUID.randomUUID().toString(), OperationState.RESTORING, null);
            publish();
            acknowledge(handle, operation.id);
            if (!initialized) startLoad(); else beginRestore();
        });
        return handle;
    }
    private void beginRestore() {
        restoreRequest = nextRequest(); decisionFloor = restoreRequest;
        final long request = restoreRequest;
        AtomicBoolean completed = new AtomicBoolean();
        try { provider.restoreCurrent((record, failure) -> {
            if (completed.compareAndSet(false, true))
                postCompletion(() -> finishRestore(request, record, failure));
        }); }
        catch (RuntimeException unavailable) {
            if (completed.compareAndSet(false, true)) finishRestore(request, null, Issue.PROVIDER);
            else if (unavailable instanceof RejectedExecutionException) throw unavailable;
        }
    }
    private void finishRestore(long request, Record record, Issue failure) {
        if (operation.state != OperationState.RESTORING || restoreRequest != request) return;
        restoreRequest = 0; operation = Operation.idle(); refreshPending = false;
        apply(failure != null && failure != Issue.NONE ? null : record, request, failure, true);
        // apply may reject stale/conflicting input without publishing; the definitive SDK callback
        // still releases the interactive operation. A UI deadline/detach never reaches this path.
        publish();
        List<Handle> completed = new ArrayList<>(restoreJoiners); restoreJoiners.clear();
        completed.addAll(joiners); joiners.clear();
        for (Handle handle : completed) emit(handle);
        // A pre-bootstrap user Restore can own the first interactive slot. Its Record is
        // rights evidence only; finish the separately qualified one-shot journal recovery next.
        if (checkout != null && !startupReconciled) afterLoad();
    }
    /** Native runtime view from one immutable publication. Null knowledge retains bootstrap
     * evidence until optional checkout has completed its authoritative journal load.
     */
    static final class RuntimeView {
        final BillingSnapshot snapshot;
        final Boolean journalKnown;
        RuntimeView(BillingSnapshot snapshot, Boolean journalKnown) {
            this.snapshot = snapshot; this.journalKnown = journalKnown;
        }
    }
    RuntimeView runtimeView() {
        Projection projection = latest.get();
        return new RuntimeView(projection.invalid(time) ? projection.expired : projection.current,
                projection.journalKnown);
    }
    /** Optional native seam only; not exposed by runtime/bridge. One intent, fresh UUID and
     * proven host gate. Closing its handle only releases UI, never money processing. */
    public Handle purchase(Plan plan, String shownRevision, Observer completion) {
        return purchase(plan, shownRevision, completion, null);
    }
    public Handle purchase(Plan plan, String shownRevision, Observer completion,
            OperationAcknowledgement acknowledgement) {
        Objects.requireNonNull(plan); requiredText(shownRevision); Objects.requireNonNull(completion);
        if (checkoutBindings.incrementAndGet() > MAX_BINDINGS) {
            checkoutBindings.decrementAndGet(); throw new RejectedExecutionException("Billing checkout binding limit");
        }
        AtomicBoolean released = new AtomicBoolean();
        Handle handle = new Handle(completion, () -> {
            if (released.compareAndSet(false, true)) checkoutBindings.decrementAndGet();
        }, acknowledgement);
        try { executeActor(() -> {
            if (checkout == null || !initialized || !journalKnown || operation.isBusy()
                    || (attempt != null && attempt.unresolved()) || legacy.status != LegacyStatus.INELIGIBLE
                    || catalog.resolve(plan, shownRevision) == null || !checkoutGate()) {
                acknowledge(handle, null); emit(handle); handleRelease(handle, released); return;
            }
            checkoutJoiner = handle;
            operation = new Operation(UUID.randomUUID().toString(), OperationState.CHECKING, plan);
            publish();
            String id = operation.id;
            acknowledge(handle, id);
            fetchCheckoutEvidence(id, result -> {
                if (!checkoutAllowed(result.record.store, plan) || !checkoutGate()) { finishCheckout(); return; }
                AtomicBoolean done = new AtomicBoolean();
                try { checkout.preflight.prepare(catalog, plan, shownRevision, fresh -> {
                    if (done.compareAndSet(false, true)) postCompletion(() -> {
                        if (!checkoutOperation(id)) return;
                        if (fresh == null || fresh.plan != plan || !shownRevision.equals(fresh.shownRevision)) {
                            issue = Issue.PROVIDER; finishCheckout(); return;
                        }
                        catalog = fresh.catalog;
                        if (fresh.status != RevenueCatCheckoutPreflight.Status.READY || fresh.selection == null) {
                            if (fresh.status == RevenueCatCheckoutPreflight.Status.UNAVAILABLE) issue = Issue.PROVIDER;
                            finishCheckout(); return; // changed terms always require another user intent
                        }
                        if (legacy.status != LegacyStatus.INELIGIBLE || !checkoutGate()) { finishCheckout(); return; }
                        BillingAttempt prepared;
                        try { prepared = result.prepareAttempt(id, fresh.selection); }
                        catch (RuntimeException invalid) { issue = Issue.VERIFICATION; finishCheckout(); return; }
                        saveAttempt(prepared, attempt, () -> launchPrepared(id, fresh.selection));
                    });
                }); } catch (RuntimeException unavailable) {
                    if (done.compareAndSet(false, true)) { issue = Issue.PROVIDER; finishCheckout(); }
                    else if (unavailable instanceof RejectedExecutionException) throw unavailable;
                }
            });
        }); } catch (RejectedExecutionException unavailable) { handle.close(); throw unavailable; }
        return handle;
    }
    private void acknowledge(Handle handle, String id) { acknowledge(handle, id, false); }
    private void acknowledge(Handle handle, String id, boolean closeAfter) {
        if (handle.acknowledgement.get() == null) { if (closeAfter) handle.close(); return; }
        try { delivery.execute(() -> {
            OperationAcknowledgement target = handle.acknowledgement.getAndSet(null);
            try { if (target != null) target.complete(id); }
            catch (RuntimeException ignored) { /* UI cannot cancel native work. */ }
            finally { if (closeAfter) handle.close(); }
        }); } catch (RejectedExecutionException unavailable) {
            handle.acknowledgement.set(null); if (closeAfter) handle.close();
            /* Latest native state remains recoverable. */
        }
    }
    private void handleRelease(Handle handle, AtomicBoolean released) {
        // Completion delivery may still read the observer; release the bounded reservation only.
        if (released.compareAndSet(false, true)) checkoutBindings.decrementAndGet();
    }
    private boolean checkoutGate() {
        try { return checkout != null && checkout.nativeGate.getAsBoolean(); }
        catch (RuntimeException unavailable) { return false; }
    }
    private boolean checkoutOperation(String id) {
        return operation.isBusy() && Objects.equals(operation.id, id);
    }
    private static boolean checkoutAllowed(Store store, Plan plan) {
        if (store.verification != Verification.REMOTE || store.lifetimeActive || store.billingProblem
                || store.pausedUntilMs != null) return false;
        // A verified empty configured subscription is absence. Active replacement remains
        // disabled. A corroborated canceled period ending before this signed response can
        // be purchased again; elapsed device time or willRenew alone never admits checkout.
        if (store.plan == null) return !store.subscriptionActive && store.expiresAtMs == null;
        if (!store.subscriptionActive && store.renewState == RenewState.OFF
                && store.expiresAtMs != null && store.fetchedAtMs != null
                && store.expiresAtMs <= store.fetchedAtMs) return true;
        return plan == Plan.LIFETIME && store.subscriptionActive && store.renewState == RenewState.OFF;
    }
    private void launchPrepared(String id, RevenueCatCatalog.Selection selection) {
        if (!checkoutOperation(id)) return;
        if (!checkoutGate() || legacy.status != LegacyStatus.INELIGIBLE) {
            // This live continuation has not invoked the transport. It may persist a safe
            // preparation abort. Startup/recovery cannot infer the same fact from PREPARED.
            BillingAttempt aborted = attempt.abortUnlaunchedPreparation(id);
            saveAttempt(aborted, attempt, () -> { issue = Issue.NONE; finishCheckout(); });
            return;
        }
        operation = new Operation(id, OperationState.CHECKOUT, selection.plan); publish();
        AtomicBoolean done = new AtomicBoolean();
        try { checkout.purchase.launch(selection, id, outcome -> {
            if (done.compareAndSet(false, true)) postCompletion(() -> finishPurchase(id, outcome));
        }); } catch (RuntimeException unavailable) {
            if (done.compareAndSet(false, true)) finishPurchase(id, PurchaseOutcome.UNCERTAIN);
            else if (unavailable instanceof RejectedExecutionException) throw unavailable;
        }
    }
    private void finishPurchase(String id, PurchaseOutcome outcome) {
        if (!checkoutOperation(id) || attempt == null || !attempt.id.equals(id)) return;
        if (outcome == PurchaseOutcome.PRODUCT_UNAVAILABLE) {
            BillingAttempt rejected = attempt.rejectUnavailableProduct(id);
            if (rejected == attempt) { issue = Issue.UNCERTAIN; finishCheckout(); return; }
            saveAttempt(rejected, attempt, () -> { issue = Issue.PRODUCT_UNAVAILABLE; finishCheckout(); });
            return;
        }
        if (outcome == PurchaseOutcome.NOT_LAUNCHED) {
            // Host proves its native request never entered SDK, not recovered Intent extras.
            BillingAttempt aborted = attempt.abortUnlaunchedPreparation(id);
            if (aborted == attempt) { issue = Issue.UNCERTAIN; finishCheckout(); return; }
            saveAttempt(aborted, attempt, () -> { issue = Issue.NONE; finishCheckout(); });
            return;
        }
        if (outcome == PurchaseOutcome.COMPLETED) {
            operation = new Operation(id, OperationState.CHECKING, attempt.plan); publish();
            reconcileCurrent(id); return;
        }
        BillingAttempt next = outcome == PurchaseOutcome.CANCELED ? attempt.definitiveUserCancel(id)
                : attempt.recordUnresolved(id, outcome == PurchaseOutcome.PENDING
                    ? BillingAttempt.State.PENDING : BillingAttempt.State.UNCERTAIN);
        saveAttempt(next, attempt, () -> {
            issue = outcome == PurchaseOutcome.CANCELED ? Issue.NONE
                    : outcome == PurchaseOutcome.PENDING ? Issue.PENDING : Issue.UNCERTAIN;
            finishCheckout();
        });
    }
    /** Explicit recovery does not charge, poll, clear by timeout, or reconstruct unknown inventory. */
    public void reconcilePurchase() { executeActor(() -> {
        if (checkout == null || !initialized || operation.isBusy()) return;
        if (journalKnown) { beginReconciliation(); return; }
        // A failed CAS/write has unknown disk outcome. Explicit retry re-reads native evidence;
        // never overwrite it with the remembered in-memory stage or clear it as a timeout.
        operation = new Operation(UUID.randomUUID().toString(), OperationState.CHECKING, null); publish();
        try { disk.execute(() -> {
            BillingAttempt loaded = null; boolean known = false;
            try {
                loaded = checkout.journal.load(); known = loaded == null || ownerEpoch.equals(loaded.ownerEpoch);
            } catch (Exception unavailable) { /* retain recovery */ }
            final BillingAttempt result = loaded; final boolean success = known;
            postCompletion(() -> {
                journalKnown = success;
                if (success) { attempt = result; issue = Issue.NONE; }
                else issue = Issue.STORAGE;
                finishCheckout();
                if (success) beginReconciliation();
            });
        }); } catch (RejectedExecutionException unavailable) { issue = Issue.STORAGE; finishCheckout(); }
    }); }
    private void beginReconciliation() {
        if (checkout == null || !initialized || !journalKnown || operation.isBusy()
                || attempt == null || !attempt.unresolved()) return;
        operation = new Operation(UUID.randomUUID().toString(), OperationState.CHECKING, attempt.plan);
        publish(); reconcileCurrent(operation.id);
    }
    private void reconcileCurrent(String id) {
        fetchCheckoutEvidence(id, result -> {
            BillingAttempt next = result.reconcileAttempt(attempt);
            if (next == attempt) { issue = Issue.UNCERTAIN; finishCheckout(); }
            else saveAttempt(next, attempt, () -> { issue = Issue.NONE; finishCheckout(); });
        });
    }
    private void fetchCheckoutEvidence(String id, java.util.function.Consumer<RevenueCatReceiptMapper.Result> next) {
        long request = nextRequest(); decisionFloor = request;
        AtomicBoolean done = new AtomicBoolean();
        try { checkout.receipts.fetchCurrent((result, failure) -> {
            if (done.compareAndSet(false, true)) postCompletion(() -> {
                if (!checkoutOperation(id)) return;
                if (result == null || failure != Issue.NONE || !ownerEpoch.equals(result.record.ownerEpoch)) {
                    issue = failure != null && failure != Issue.NONE ? failure : Issue.VERIFICATION;
                    finishCheckout(); return;
                }
                Record record = result.record;
                StoreRecord normalized = new StoreRecord(record.store, ownerEpoch, request, record.clock, true);
                Update update = accept(accepted, normalized, ownerEpoch);
                if (update.acceptance != Acceptance.ACCEPTED) {
                    issue = Issue.VERIFICATION; finishCheckout(); return;
                }
                accepted = update.record; freshRemote = true; issue = Issue.NONE;
                liveBoot = time.bootToken(); liveUntil = saturatingAdd(time.elapsedRealtimeMs(), UNANCHORED_LIVE_MS);
                publish();
                enqueueWrite(accepted, false, success -> {
                    if (!checkoutOperation(id)) return;
                    if (success) next.accept(result); else finishCheckout();
                });
            });
        }); } catch (RuntimeException unavailable) {
            if (done.compareAndSet(false, true)) { issue = Issue.PROVIDER; finishCheckout(); }
            else if (unavailable instanceof RejectedExecutionException) throw unavailable;
        }
    }
    private void saveAttempt(BillingAttempt next, BillingAttempt prior, Runnable continuation) {
        try { disk.execute(() -> {
            boolean saved;
            try { saved = checkout.journal.save(next, prior); } catch (Exception unavailable) { saved = false; }
            boolean success = saved;
            postCompletion(() -> {
                if (!success) { issue = Issue.STORAGE; journalKnown = false; finishCheckout(); return; }
                attempt = next; publish(); continuation.run();
            });
        }); } catch (RejectedExecutionException unavailable) {
            issue = Issue.STORAGE; finishCheckout();
        }
    }
    private void finishCheckout() {
        operation = Operation.idle(); publish();
        Handle completed = checkoutJoiner; checkoutJoiner = null;
        if (completed != null) {
            emit(completed);
            // Keep delivery alive; reservation is bounded by one active checkout intent.
            completed.onClose.run();
        }
        List<Handle> waiters = new ArrayList<>(joiners); joiners.clear();
        for (Handle handle : waiters) emit(handle);
    }
    private long nextRequest() {
        if (requestSequence == Long.MAX_VALUE) throw new IllegalStateException("Request sequence exhausted");
        return ++requestSequence;
    }
    private void beginFetch() {
        refreshPending = false; inFlight = true; activeRequest = nextRequest();
        final long request = activeRequest;
        // Background fetch is not an interactive operation. Recovery/Restore remains reachable.
        AtomicBoolean completed = new AtomicBoolean();
        try { provider.fetchCurrent((record, failure) -> {
            if (completed.compareAndSet(false, true))
                postCompletion(() -> finishFetch(request, record, failure));
        }); }
        catch (RuntimeException unavailable) {
            if (completed.compareAndSet(false, true)) finishFetch(request, null, Issue.PROVIDER);
            else if (unavailable instanceof RejectedExecutionException) throw unavailable;
        }
    }
    private void finishFetch(long request, Record record, Issue failure) {
        if (!inFlight || activeRequest != request) return; // duplicate/late callback
        inFlight = false; refreshPending = false;
        if (request >= decisionFloor && !operation.isBusy()) apply(record, request, failure, true);
        if (operation.isBusy()) return; // waiters complete with the newer Restore, not its stale fetch
        List<Handle> completed = new ArrayList<>(joiners); joiners.clear();
        for (Handle handle : completed) emit(handle);
    }
    /** Explicit plan-screen request. Coalesces one SDK fetch; detaching UI does not cancel it.
     * Failures replace all selections/cards without touching rights, cache or purchase journal. */
    public Handle refreshCatalog(Observer completion) {
        Objects.requireNonNull(completion);
        if (catalogBindings.incrementAndGet() > MAX_BINDINGS) {
            catalogBindings.decrementAndGet(); throw new RejectedExecutionException("Billing catalog binding limit");
        }
        AtomicBoolean released = new AtomicBoolean();
        Handle handle = new Handle(completion, () -> {
            if (released.compareAndSet(false, true)) catalogBindings.decrementAndGet();
        });
        try { executeActor(() -> {
            prune(catalogJoiners);
            catalogJoiners.add(handle);
            if (catalogInFlight) return;
            catalogInFlight = true;
            final long request = ++catalogRequest;
            AtomicBoolean completed = new AtomicBoolean();
            try { catalogProvider.fetchCatalog(value -> {
                if (completed.compareAndSet(false, true))
                    postCompletion(() -> finishCatalog(request, value));
            }); } catch (RuntimeException unavailable) {
                if (completed.compareAndSet(false, true)) finishCatalog(request, null);
                else throw unavailable;
            }
        }); } catch (RejectedExecutionException rejected) { handle.close(); throw rejected; }
        return handle;
    }
    private void finishCatalog(long request, RevenueCatCatalog value) {
        if (!catalogInFlight || catalogRequest != request) return;
        catalogInFlight = false;
        catalog = value == null ? RevenueCatCatalog.unavailable() : value;
        publish();
        List<Handle> completed = new ArrayList<>(catalogJoiners); catalogJoiners.clear();
        for (Handle handle : completed) { handle.onClose.run(); emit(handle); }
    }
    /** SDK listener payload is a notification, never a new fetch or fresh checkout decision.
     * requestToken must be the owner-issued token of the request that produced the payload;
     * unknown listener provenance uses 0 and is ignored. Do not assign a new token to cached SDK data.
     */
    public void notifyProvider(Record record, long requestToken) {
        executeActor(() -> {
            // Only the canonical callback may finish an in-flight decision. Applying its listener
            // echo first would consume the same sequence and make that callback a conflict.
            if (!initialized || inFlight || operation.isBusy() || requestToken < decisionFloor
                    || requestToken <= 0 || requestToken > requestSequence) return;
            apply(record, requestToken, Issue.NONE, false);
        });
    }
    private void apply(Record incoming, long request, Issue failure, boolean freshDecision) {
        if (incoming != null && !incoming.ownerEpoch.equals(ownerEpoch)) {
            freshRemote = false; issue = Issue.VERIFICATION; publish(); return;
        }
        StoreRecord normalized = incoming == null ? null
                : new StoreRecord(incoming.store, incoming.ownerEpoch, request, incoming.clock, true);
        Update update = accept(accepted, normalized, ownerEpoch);
        if (update.acceptance == Acceptance.STALE || update.acceptance == Acceptance.CONFLICT) return;
        if (update.acceptance != Acceptance.ACCEPTED) {
            freshRemote = false;
            issue = failure != null && failure != Issue.NONE ? failure : Issue.VERIFICATION;
            publish(); return;
        }
        accepted = update.record; freshRemote = freshDecision; issue = Issue.NONE;
        liveBoot = time.bootToken();
        liveUntil = freshDecision ? saturatingAdd(time.elapsedRealtimeMs(), UNANCHORED_LIVE_MS) : -1;
        // Publish authoritative memory BEFORE blocking/failed persistence, including verified revoke.
        publish(); enqueueWrite(accepted, false);
    }
    private void enqueueWrite(StoreRecord writing, boolean retry) {
        enqueueWrite(writing, retry, ignored -> {});
    }
    private void enqueueWrite(StoreRecord writing, boolean retry, java.util.function.Consumer<Boolean> completed) {
        if (pendingWrites >= 128) { issue = Issue.STORAGE; publish(); completed.accept(false); return; }
        pendingWrites++;
        try { disk.execute(() -> {
            boolean saved;
            try { saved = storage.save(writing); } catch (Exception unavailable) { saved = false; }
            final boolean success = saved;
            postCompletion(() -> {
                pendingWrites--;
                if (accepted != writing) { completed.accept(false); return; } // old write outcome cannot alter newer evidence
                if (!success) { issue = Issue.STORAGE; publish(); }
                else if (retry && issue == Issue.STORAGE) { issue = Issue.NONE; publish(); }
                completed.accept(success);
            });
        }); } catch (RejectedExecutionException unavailable) {
            pendingWrites--; issue = Issue.STORAGE; publish();
            completed.accept(false);
        }
    }
    /** Bounded explicit retry, never a background job and never a provider call. */
    public void retryPersistence() {
        executeActor(() -> {
            if (accepted == null || issue != Issue.STORAGE || pendingWrites != 0) return;
            enqueueWrite(accepted, true);
        });
    }
    /** Native bootstrap owner only: retry authenticated seal persistence using its original
     * capture, never a JS-supplied grant or current browser evidence. Already durable decisions
     * and established eligible session access cannot be replaced. Callback runs on the actor,
     * so completing owner work does not depend on best-effort UI delivery or a provider request.
     */
    public void updateSealedLegacy(Legacy sealed, Runnable applied) {
        Objects.requireNonNull(sealed); Objects.requireNonNull(applied);
        executeActor(() -> {
            if ((!legacy.persisted || (legacy.status == sealed.status && sealed.persisted))
                    && (legacy.status != LegacyStatus.ELIGIBLE || sealed.status == LegacyStatus.ELIGIBLE)) {
                legacy = sealed; publish();
            }
            applied.run();
        });
    }
    /** Armed expiry/lifecycle event recomputes cache policy without starting network. */
    public void reevaluateCache() { executeActor(this::reevaluateLocal); }
    private void reevaluateLocal() { freshRemote = false; liveUntil = -1; publish(); }
    private static long saturatingAdd(long left, long right) {
        return right > Long.MAX_VALUE - left ? Long.MAX_VALUE : left + right;
    }
    private long deadline(long elapsed) {
        if (accepted == null || !accepted.store.subscriptionActive) return -1;
        ClockAnchor anchor = accepted.clock;
        Long expiryAt = accepted.store.expiresAtMs;
        // Signed request-start bounds can expire a live decision even when boot identity is
        // unavailable. They do not manufacture boot provenance for an offline cache grant.
        if (anchor != null && expiryAt != null && elapsed >= anchor.elapsedRealtimeMs
                && (anchor.bootToken == null ? freshRemote : anchor.bootToken.equals(time.bootToken()))) {
            if (expiryAt <= anchor.remoteTimeMs) return elapsed;
            return saturatingAdd(anchor.elapsedRealtimeMs, expiryAt - anchor.remoteTimeMs);
        }
        return freshRemote && liveUntil >= 0 ? liveUntil : elapsed;
    }
    private void armExpiry(Projection projection) {
        if (expiry != null) { expiry.cancel(); expiry = null; }
        prune(observers);
        if (observers.isEmpty() || projection.deadline < 0 || projection.invalid(time)) return;
        long delay = projection.deadline - time.elapsedRealtimeMs();
        if (delay <= 0) return;
        expiry = scheduler.schedule(() -> {
            // A canceled callback cannot revoke a replacement. All expiry producers share one
            // completion slot, including cancellation races while the actor queue is saturated.
            if (latest.get() == projection) requestLocalWake();
        }, delay);
    }
    private void requestLocalWake() {
        if (!expiryCompletionPending.compareAndSet(false, true)) return;
        postCompletion(() -> {
            expiryCompletionPending.set(false);
            Projection current = latest.get();
            if (current.invalid(time)) {
                // Revoke at the signed deadline first. A renewal is new provider evidence,
                // never extra local grace. One foreground request per accepted period keeps
                // renewal recovery event-driven without turning Home into a polling loop.
                prune(observers);
                long elapsed = time.elapsedRealtimeMs();
                boolean checkRenewal = !observers.isEmpty() && accepted != null
                        && accepted != expiryRefreshRecord && current.deadline >= 0
                        && elapsed >= current.deadline && elapsed >= current.elapsedFloor
                        && (current.boot == null || current.boot.equals(time.bootToken()))
                        && current.current.access.sources.contains(Source.SUBSCRIPTION)
                        && !current.expired.access.full && !operation.isBusy();
                if (checkRenewal) expiryRefreshRecord = accepted;
                reevaluateLocal();
                if (checkRenewal && !inFlight) beginFetch();
            }
            else armExpiry(current); // early wake/detach, never poll or fetch
        });
    }
    private void executeActor(Runnable work) {
        scheduledActorTasks.incrementAndGet();
        try { actor.execute(() -> {
            try { drainCompletions(); work.run(); }
            finally { try { drainCompletions(); } finally { scheduledActorTasks.decrementAndGet(); } }
        }); } catch (RejectedExecutionException unavailable) {
            scheduledActorTasks.decrementAndGet(); throw unavailable;
        }
    }
    private void drainCompletions() {
        Runnable work;
        while ((work = completions.poll()) != null) work.run();
    }
    private void postCompletion(Runnable completion) {
        completions.add(completion);
        try { executeActor(() -> {}); }
        catch (RejectedExecutionException unavailable) {
            // A full bounded queue already contains wrapped work which drains this lane. When
            // no work exists, rejection means the owner cannot operate: terminal/shutdown boundary.
            // Preserve the completion and report explicitly; app owner must surface native recovery
            // and recreate/restart its process owner. Never block or mutate billing off actor.
            if (actor instanceof ThreadPoolExecutor && ((ThreadPoolExecutor) actor).isShutdown()) throw unavailable;
            if (scheduledActorTasks.get() == 0 && !completions.isEmpty()) throw unavailable;
        }
    }
    private BillingSnapshot view(long revision, boolean fresh, StoreRecord record) {
        return BillingPolicy.snapshot(controllerEpoch, revision, ownerEpoch, legacy, record,
                time.bootToken(), time.elapsedRealtimeMs(), operation, attempt == null ? null : attempt.barrier(),
                false, fresh, false, issue, catalog.items);
    }
    private Projection project() {
        long elapsed = time.elapsedRealtimeMs();
        long deadline = deadline(elapsed);
        BillingSnapshot current = view(sequence, freshRemote, accepted);
        // Expiry removes only the subscription source. Lifetime and sealed local grants survive.
        List<Source> retained = new ArrayList<>(current.access.sources);
        retained.remove(Source.SUBSCRIPTION);
        BillingSnapshot expired = new BillingSnapshot(controllerEpoch, sequence + 1, current.legacy,
                new Access(retained), new Capabilities(false, current.capabilities.restore, current.capabilities.manage),
                current.operation, current.unresolvedPurchase, current.store, current.issue, current.catalog);
        String boot = accepted != null && accepted.clock != null && accepted.clock.bootToken != null
                ? accepted.clock.bootToken : liveBoot;
        return new Projection(current, expired, deadline, elapsed, boot,
                checkout != null && initialized ? journalKnown : null);
    }
    private void publish() {
        sequence += 2; Projection projection = project(); latest.set(projection); armExpiry(projection); prune(observers);
        for (Handle handle : new ArrayList<>(observers)) emit(handle);
    }
    private static void prune(List<Handle> handles) { handles.removeIf(handle -> handle.observer.get() == null); }
    private void emit(Handle handle) {
        try { delivery.execute(() -> {
            Observer observer = handle.observer.get();
            if (observer != null) try { observer.changed(snapshot()); } catch (RuntimeException ignored) { /* isolate UI */ }
        }); } catch (RejectedExecutionException unavailable) {
            // UI delivery is best effort. Atomic latest state and native persistence still proceed;
            // a later attachment/read obtains the newest snapshot without replaying old callbacks.
        }
    }
}
