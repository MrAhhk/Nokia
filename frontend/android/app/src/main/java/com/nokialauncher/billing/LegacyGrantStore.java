package com.nokialauncher.billing;

import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import java.io.IOException;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import static com.nokialauncher.billing.BillingSnapshot.LegacyStatus;

/** Isolated M05 seal, deliberately not wired to startup. Call on the billing worker before
 * any launcher writers. The bootstrap must establish that capture came from this launch's
 * packaged synchronous helper, reject preexisting/accessor collisions, and validate its
 * frozen descriptor/objects before serialization. JSON shape cannot authenticate JS origin.
 * No bridge may expose rules or a caller-supplied grant boolean. Rules are native release
 * evidence: completeness requires explicit coverage of ALL historical shipped cohorts,
 * including cohorts without keys. The current release matrix does not establish it.
 * Decisions are immutable for this installed app; explicit migrations are out of scope.
 */
public final class LegacyGrantStore {
    private static final int MAX_JSON_BYTES = 1024;
    private static final Set<String> CAPTURE = fields("version", "coverage", "readStatus", "onboarding", "checkIn");
    private static final Set<String> MARKER = fields("schema", "status", "ruleVersion");
    private static final Set<String> CLASSIFICATIONS = fields("missing", "unreadable", "oversized", "unsupported", "malformed", "historical_valid", "current_valid");

    /** Supplied only by the native owner after release evidence review, never bridge JSON. */
    public static final class ReleasedRules {
        public final String version;
        public final boolean recognizesHistoricalOnboarding, recognizesHistoricalCheckIn, allHistoricalCohortsCovered;
        public ReleasedRules(String version, boolean onboarding, boolean checkIn, boolean complete) {
            if (version == null || !version.matches("[A-Za-z0-9._-]{1,64}")) throw new IllegalArgumentException("Invalid release rule version");
            this.version = version; recognizesHistoricalOnboarding = onboarding;
            recognizesHistoricalCheckIn = checkIn; allHistoricalCohortsCovered = complete;
        }
        public static ReleasedRules unavailable() { return new ReleasedRules("unavailable", false, false, false); }
    }

    public static final class Result {
        public final LegacyStatus status;
        public final boolean persisted;
        private final BillingSnapshot.Legacy trusted;
        private Result(LegacyStatus status, boolean persisted) {
            this.status = status; this.persisted = persisted;
            trusted = new BillingSnapshot.Legacy(status, persisted);
        }
        /** Derived solely from this native seal. Eligible write failure is session-only. */
        public BillingSnapshot.Legacy trustedSealedState() { return trusted; }
    }

    private final BillingStore store;
    public LegacyGrantStore(BillingStore store) {
        if (store == null) throw new IllegalArgumentException("Missing billing store");
        this.store = store;
    }

    /** Existing authenticated marker always wins, even over malformed new capture/rules.
     * Synchronizing the shared BillingStore serializes read/decide/write across owner instances.
     * Retry uses original capture only. UNKNOWN preserves bytes and never overwrites evidence.
     */
    public Result sealCapturedBeforeWriters(String captureJson, ReleasedRules rules) {
        return sealCapturedBeforeWriters(captureJson, rules, false);
    }
    /** nativeFreshInstall comes only from this package's PackageManager metadata.
     * Restored browser preferences on a new install cannot manufacture historical access.
     */
    public Result sealCapturedBeforeWriters(String captureJson, ReleasedRules rules, boolean nativeFreshInstall) {
        synchronized (store) {
            BillingStore.ReadResult existing = store.read(BillingStore.FileKind.LEGACY);
            if (existing.status == BillingStore.Status.UNKNOWN) return new Result(LegacyStatus.NEEDS_RECOVERY, false);
            if (existing.status == BillingStore.Status.PRESENT) {
                try { return new Result(marker(existing.json), true); }
                catch (IOException invalid) { return new Result(LegacyStatus.NEEDS_RECOVERY, false); }
            }
            ReleasedRules nativeRules = rules == null ? ReleasedRules.unavailable() : rules;
            LegacyStatus decision = LegacyStatus.NEEDS_RECOVERY;
            try { decision = classify(captureJson, nativeRules, nativeFreshInstall); }
            catch (IOException invalid) { /* A collision/invalid capture is recovery, never fresh. */ }
            String marker = "{\"schema\":1,\"status\":\"" + decision.wire + "\",\"ruleVersion\":\"" + nativeRules.version + "\"}";
            boolean persisted = store.write(BillingStore.FileKind.LEGACY, marker);
            return new Result(persisted || decision == LegacyStatus.ELIGIBLE ? decision : LegacyStatus.NEEDS_RECOVERY, persisted);
        }
    }

    private static LegacyStatus classify(String json, ReleasedRules rules, boolean nativeFreshInstall) throws IOException {
        Map<String, Object> root = parse(json, CAPTURE, true);
        if (!Long.valueOf(1).equals(root.get("version")) || !"unknown".equals(root.get("coverage"))) throw invalid();
        @SuppressWarnings("unchecked") Map<String, Object> onboarding = (Map<String, Object>) root.get("onboarding");
        @SuppressWarnings("unchecked") Map<String, Object> checkIn = (Map<String, Object>) root.get("checkIn");
        String first = evidence(onboarding, true), second = evidence(checkIn, false);
        String expectedRead = "unreadable".equals(first) || "unreadable".equals(second) ? "unreadable" : "complete";
        if (!expectedRead.equals(root.get("readStatus"))) throw invalid();
        // Even one unreadable/ambiguous read must not be upgraded by another valid key.
        if (ambiguous(first) || ambiguous(second)) return LegacyStatus.NEEDS_RECOVERY;
        // Android backup may restore old browser keys after uninstall. Those keys do not
        // carry a device gift across a newly installed package; Play Restore remains available.
        if (nativeFreshInstall) return LegacyStatus.INELIGIBLE;
        if ((rules.recognizesHistoricalOnboarding && "historical_valid".equals(first)) ||
                (rules.recognizesHistoricalCheckIn && "historical_valid".equals(second))) return LegacyStatus.ELIGIBLE;
        if (rules.allHistoricalCohortsCovered
                && "missing".equals(first) && "missing".equals(second)) return LegacyStatus.INELIGIBLE;
        return LegacyStatus.NEEDS_RECOVERY;
    }

    // Known current onboarding cannot itself grant, but does not erase independent
    // recognized historical check-in evidence preserved across an app update.
    private static boolean ambiguous(String value) {
        return "malformed".equals(value) || "unsupported".equals(value) ||
                "oversized".equals(value) || "unreadable".equals(value);
    }

    private static String evidence(Map<String, Object> values, boolean onboarding) throws IOException {
        if (values == null || !(values.get("classification") instanceof String)) throw invalid();
        String classification = (String) values.get("classification");
        if (!CLASSIFICATIONS.contains(classification) || (!onboarding && "current_valid".equals(classification))) throw invalid();
        boolean valid = "historical_valid".equals(classification) || "current_valid".equals(classification);
        Set<String> expected = valid ? fields("classification", onboarding ? "completed" : "shown") : fields("classification");
        if (!values.keySet().equals(expected) || (valid && !(values.get(onboarding ? "completed" : "shown") instanceof Boolean))) throw invalid();
        return classification;
    }

    private static LegacyStatus marker(String json) throws IOException {
        Map<String, Object> root = parse(json, MARKER, false);
        if (!Long.valueOf(1).equals(root.get("schema")) || !(root.get("ruleVersion") instanceof String) ||
                !((String) root.get("ruleVersion")).matches("[A-Za-z0-9._-]{1,64}")) throw invalid();
        for (LegacyStatus status : LegacyStatus.values()) if (status.wire.equals(root.get("status"))) return status;
        throw invalid();
    }

    private static Map<String, Object> parse(String json, Set<String> allowed, boolean capture) throws IOException {
        if (json == null || json.length() > MAX_JSON_BYTES || json.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES) throw invalid();
        try (JsonReader in = new JsonReader(new StringReader(json))) {
            in.setStrictness(Strictness.STRICT);
            Map<String, Object> result = object(in, allowed, capture);
            if (in.peek() != JsonToken.END_DOCUMENT) throw invalid();
            return result;
        } catch (IllegalArgumentException | IllegalStateException error) { throw invalid(); }
    }

    private static Map<String, Object> object(JsonReader in, Set<String> allowed, boolean nested) throws IOException {
        if (in.peek() != JsonToken.BEGIN_OBJECT) throw invalid();
        in.beginObject(); Map<String, Object> values = new HashMap<>();
        while (in.hasNext()) {
            String name = in.nextName();
            if (!allowed.contains(name) || values.containsKey(name)) throw invalid();
            Object value;
            if (nested && ("onboarding".equals(name) || "checkIn".equals(name))) {
                value = object(in, fields("classification", "completed", "shown"), false);
            } else {
                switch (in.peek()) {
                    case STRING: value = in.nextString(); if (((String) value).length() > 64) throw invalid(); break;
                    case BOOLEAN: value = in.nextBoolean(); break;
                    case NUMBER:
                        String digits = in.nextString();
                        if (!"1".equals(digits)) throw invalid(); value = 1L; break;
                    default: throw invalid();
                }
            }
            values.put(name, value);
        }
        in.endObject();
        if (nested || allowed == MARKER) { if (!values.keySet().equals(allowed)) throw invalid(); }
        return values;
    }

    private static Set<String> fields(String... names) { return new HashSet<>(Arrays.asList(names)); }
    private static IOException invalid() { return new IOException("Invalid legacy seal data"); }
}
