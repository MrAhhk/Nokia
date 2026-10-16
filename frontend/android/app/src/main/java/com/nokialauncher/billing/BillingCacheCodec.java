package com.nokialauncher.billing;

import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.google.gson.stream.JsonWriter;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import static com.nokialauncher.billing.BillingPolicy.*;
import static com.nokialauncher.billing.BillingSnapshot.*;

/** Normalized cache schema, independent of SDK JSON. Authentication comes only from BillingStore.
 * No receipt, token, UI access flag or serialized integrity flag is accepted here.
 */
public final class BillingCacheCodec {
    static final int MAX_JSON_BYTES = 4096;
    private static final Set<String> ROOT = fields("schema", "generation", "requestSequence", "store", "clock");
    private static final Set<String> STORE = fields("verification", "fetchedAtMs", "lifetimeActive", "subscriptionActive",
            "expiresAtMs", "renewState", "plan", "billingProblem", "pausedUntilMs");
    private static final Set<String> CLOCK = fields("remoteTimeMs", "elapsedRealtimeMs", "bootToken", "provenance");

    /** Only an already trusted remote record can be sealed. Disk encryption cannot upgrade provenance. */
    public String encode(StoreRecord record) throws IOException {
        if (record == null || !record.integrityValid || record.store.verification != Verification.REMOTE)
            throw invalid();
        text(record.generation);
        if (record.clock != null && record.clock.bootToken != null) text(record.clock.bootToken);
        StringWriter buffer = new StringWriter();
        try (JsonWriter out = new JsonWriter(buffer)) {
            out.setStrictness(Strictness.STRICT); out.setSerializeNulls(true);
            out.beginObject().name("schema").value(1).name("generation").value(record.generation)
                    .name("requestSequence").value(record.requestSequence).name("store").beginObject();
            Store s = record.store;
            out.name("verification").value(s.verification.wire).name("fetchedAtMs").value(s.fetchedAtMs)
                    .name("lifetimeActive").value(s.lifetimeActive).name("subscriptionActive").value(s.subscriptionActive)
                    .name("expiresAtMs").value(s.expiresAtMs).name("renewState").value(s.renewState.wire)
                    .name("plan").value(s.plan == null ? null : s.plan.wire).name("billingProblem").value(s.billingProblem)
                    .name("pausedUntilMs").value(s.pausedUntilMs).endObject().name("clock");
            if (record.clock == null) out.nullValue();
            else {
                ClockAnchor c = record.clock;
                out.beginObject().name("remoteTimeMs").value(c.remoteTimeMs).name("elapsedRealtimeMs").value(c.elapsedRealtimeMs)
                        .name("bootToken").value(c.bootToken).name("provenance").value(c.provenance.name()).endObject();
            }
            out.endObject();
        }
        String json = buffer.toString(); bounded(json); return json;
    }

    /** Accepts the authenticated store result, rather than a caller-supplied integrity boolean. */
    public StoreRecord decode(BillingStore.ReadResult authenticated) throws IOException {
        if (authenticated == null || authenticated.status != BillingStore.Status.PRESENT) throw invalid();
        String json = authenticated.json; bounded(json);
        try (JsonReader in = new JsonReader(new StringReader(json))) {
            in.setStrictness(Strictness.STRICT);
            Map<String, Object> root = object(in, ROOT);
            if (in.peek() != JsonToken.END_DOCUMENT || number(root, "schema", false) != 1L) throw invalid();
            @SuppressWarnings("unchecked") Map<String, Object> s = (Map<String, Object>) root.get("store");
            if (s == null || !"remote".equals(string(s, "verification", false))) throw invalid();
            Store store = new Store(Verification.REMOTE, number(s, "fetchedAtMs", false), bool(s, "lifetimeActive"),
                    bool(s, "subscriptionActive"), number(s, "expiresAtMs", true),
                    renew(string(s, "renewState", false)), plan(string(s, "plan", true)), bool(s, "billingProblem"),
                    number(s, "pausedUntilMs", true));
            ClockAnchor clock = null;
            if (root.get("clock") != null) {
                @SuppressWarnings("unchecked") Map<String, Object> c = (Map<String, Object>) root.get("clock");
                TimeProvenance provenance = TimeProvenance.valueOf(string(c, "provenance", false));
                clock = new ClockAnchor(number(c, "remoteTimeMs", false), number(c, "elapsedRealtimeMs", false),
                        string(c, "bootToken", true), provenance);
            }
            return new StoreRecord(store, string(root, "generation", false), number(root, "requestSequence", false), clock, true);
        } catch (IllegalArgumentException | IllegalStateException | ClassCastException error) {
            throw invalid();
        }
    }

    /** Only the two fixed nested objects are allowed, so depth/field/allocation bounds are schema-defined. */
    private static Map<String, Object> object(JsonReader in, Set<String> names) throws IOException {
        if (in.peek() != JsonToken.BEGIN_OBJECT) throw invalid();
        in.beginObject(); Map<String, Object> result = new HashMap<>();
        while (in.hasNext()) {
            String name = in.nextName();
            if (!names.contains(name) || result.containsKey(name)) throw invalid();
            Object value;
            if (names == ROOT && "store".equals(name)) value = object(in, STORE);
            else if (names == ROOT && "clock".equals(name) && in.peek() != JsonToken.NULL) value = object(in, CLOCK);
            else {
                switch (in.peek()) {
                    case NULL: in.nextNull(); value = null; break;
                    case BOOLEAN: value = in.nextBoolean(); break;
                    case STRING: value = in.nextString(); break;
                    case NUMBER:
                        String digits = in.nextString();
                        if (!digits.matches("0|[1-9][0-9]{0,18}")) throw invalid();
                        try { value = Long.valueOf(digits); } catch (NumberFormatException overflow) { throw invalid(); }
                        break;
                    default: throw invalid();
                }
            }
            result.put(name, value);
        }
        in.endObject(); if (!result.keySet().equals(names)) throw invalid(); return result;
    }
    private static Long number(Map<String, Object> values, String key, boolean nullable) throws IOException {
        Object value = values.get(key);
        if (nullable && value == null) return null;
        if (!(value instanceof Long)) throw invalid(); return (Long) value;
    }
    private static boolean bool(Map<String, Object> values, String key) throws IOException {
        Object value = values.get(key); if (!(value instanceof Boolean)) throw invalid(); return (Boolean) value;
    }
    private static String string(Map<String, Object> values, String key, boolean nullable) throws IOException {
        Object value = values.get(key);
        if (nullable && value == null) return null;
        if (!(value instanceof String)) throw invalid(); return text((String) value);
    }
    private static String text(String value) throws IOException {
        try { requiredText(value); } catch (IllegalArgumentException error) { throw invalid(); }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (++i == value.length() || !Character.isLowSurrogate(value.charAt(i))) throw invalid();
            } else if (Character.isLowSurrogate(c)) throw invalid();
        }
        return value;
    }
    private static RenewState renew(String value) throws IOException {
        for (RenewState state : RenewState.values()) if (state.wire.equals(value)) return state;
        throw invalid();
    }
    private static Plan plan(String value) throws IOException {
        if (value == null) return null;
        for (Plan plan : Plan.values()) if (plan.wire.equals(value)) return plan;
        throw invalid();
    }
    private static void bounded(String json) throws IOException {
        if (json == null || json.length() > MAX_JSON_BYTES || json.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES)
            throw invalid();
    }
    private static Set<String> fields(String... names) { return new HashSet<>(Arrays.asList(names)); }
    private static IOException invalid() { return new IOException("Invalid normalized billing cache"); }
}
