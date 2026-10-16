package com.nokialauncher.billing;

import com.google.gson.Strictness;
import com.google.gson.stream.JsonReader;
import com.google.gson.stream.JsonToken;
import com.google.gson.stream.JsonWriter;
import java.io.IOException;
import java.io.StringReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Strict private journal schema; only authenticated ATTEMPT reads belong here. No SDK token/receipt JSON. */
public final class BillingAttemptCodec {
    static final int MAX_JSON_BYTES = BillingStore.MAX_PAYLOAD_BYTES;
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList("schema", "id", "ownerEpoch",
            "plan", "productId", "basePlanId", "startedAtMs", "state", "baselineIds", "resolvedTransactionId"));

    public String encode(BillingAttempt attempt) throws IOException {
        if (attempt == null) throw invalid();
        StringWriter buffer = new StringWriter();
        try (JsonWriter out = new JsonWriter(buffer)) {
            out.setStrictness(Strictness.STRICT); out.setSerializeNulls(true);
            out.beginObject();
            for (Map.Entry<String, Object> field : attempt.toMap().entrySet()) {
                out.name(field.getKey()); Object value = field.getValue();
                if (value == null) out.nullValue();
                else if (value instanceof Number) out.value((Number) value);
                else if (value instanceof List) {
                    out.beginArray();
                    for (Object item : (List<?>) value) out.value(text((String) item));
                    out.endArray();
                } else out.value(text((String) value));
            }
            out.endObject();
        }
        String json = buffer.toString(); bounded(json); return json;
    }

    public BillingAttempt decode(BillingStore.ReadResult authenticated) throws IOException {
        if (authenticated == null || authenticated.status != BillingStore.Status.PRESENT) throw invalid();
        bounded(authenticated.json);
        try (JsonReader in = new JsonReader(new StringReader(authenticated.json))) {
            in.setStrictness(Strictness.STRICT);
            if (in.peek() != JsonToken.BEGIN_OBJECT) throw invalid();
            in.beginObject(); Map<String, Object> fields = new LinkedHashMap<>();
            while (in.hasNext()) {
                String name = in.nextName();
                if (!FIELDS.contains(name) || fields.containsKey(name)) throw invalid();
                Object value;
                if ("baselineIds".equals(name)) {
                    if (in.peek() != JsonToken.BEGIN_ARRAY) throw invalid();
                    in.beginArray(); List<String> ids = new ArrayList<>(); Set<String> unique = new HashSet<>();
                    while (in.hasNext()) {
                        if (ids.size() == 256 || in.peek() != JsonToken.STRING) throw invalid();
                        String id = text(in.nextString());
                        if (!unique.add(id)) throw invalid();
                        ids.add(id);
                    }
                    in.endArray(); value = ids;
                } else if ("schema".equals(name) || "startedAtMs".equals(name)) {
                    if (in.peek() != JsonToken.NUMBER) throw invalid();
                    String digits = in.nextString();
                    if (!digits.matches("0|[1-9][0-9]{0,15}")) throw invalid();
                    value = Long.valueOf(digits);
                } else if (("basePlanId".equals(name) || "resolvedTransactionId".equals(name))
                        && in.peek() == JsonToken.NULL) {
                    in.nextNull(); value = null;
                } else {
                    if (in.peek() != JsonToken.STRING) throw invalid();
                    value = text(in.nextString());
                }
                fields.put(name, value);
            }
            in.endObject();
            if (!fields.keySet().equals(FIELDS) || in.peek() != JsonToken.END_DOCUMENT) throw invalid();
            return BillingAttempt.fromMap(fields);
        } catch (IllegalArgumentException | IllegalStateException error) { throw invalid(); }
    }

    private static String text(String value) throws IOException {
        try { BillingSnapshot.requiredText(value); } catch (IllegalArgumentException error) { throw invalid(); }
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isHighSurrogate(c)) {
                if (++i == value.length() || !Character.isLowSurrogate(value.charAt(i))) throw invalid();
            } else if (Character.isLowSurrogate(c)) throw invalid();
        }
        return value;
    }
    private static void bounded(String json) throws IOException {
        if (json == null || json.length() > MAX_JSON_BYTES
                || json.getBytes(StandardCharsets.UTF_8).length > MAX_JSON_BYTES) throw invalid();
    }
    private static IOException invalid() { return new IOException("Invalid normalized billing attempt"); }
}
