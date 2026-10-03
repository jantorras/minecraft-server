package cat.servidor.bridge.api;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** Lectura validada de camps del cos JSON. */
public final class Json {

    private Json() {
    }

    /** Retorna el text, o null si el camp és null o buit. Llança 400 si no és text o és massa llarg. */
    public static String string(JsonObject body, String key, int maxLength) {
        JsonElement el = body.get(key);
        if (el == null || el.isJsonNull()) {
            return null;
        }
        if (!el.isJsonPrimitive() || !el.getAsJsonPrimitive().isString()) {
            throw ApiException.badRequest("'" + key + "' ha de ser text");
        }
        String value = el.getAsString();
        if (value.length() > maxLength) {
            throw ApiException.badRequest("'" + key + "' pot tenir com a màxim " + maxLength + " caràcters");
        }
        return value.isBlank() ? null : value;
    }

    public static String requiredString(JsonObject body, String key, int maxLength) {
        String value = string(body, key, maxLength);
        if (value == null) {
            throw ApiException.badRequest("Falta el camp '" + key + "'");
        }
        return value;
    }

    /** Retorna el número, o null si el camp no hi és. */
    public static Long number(JsonObject body, String key, long min, long max) {
        JsonElement el = body.get(key);
        if (el == null || el.isJsonNull()) {
            return null;
        }
        if (!el.isJsonPrimitive() || !el.getAsJsonPrimitive().isNumber()) {
            throw ApiException.badRequest("'" + key + "' ha de ser un número");
        }
        long value;
        try {
            value = el.getAsBigDecimal().longValueExact();
        } catch (ArithmeticException e) {
            throw ApiException.badRequest("'" + key + "' ha de ser un enter");
        }
        if (value < min || value > max) {
            throw ApiException.badRequest("'" + key + "' ha d'estar entre " + min + " i " + max);
        }
        return value;
    }

    public static List<String> stringList(JsonObject body, String key, int maxItems) {
        JsonElement el = body.get(key);
        if (el == null || el.isJsonNull()) {
            return List.of();
        }
        if (!el.isJsonArray()) {
            throw ApiException.badRequest("'" + key + "' ha de ser una llista");
        }
        JsonArray array = el.getAsJsonArray();
        if (array.size() > maxItems) {
            throw ApiException.badRequest("'" + key + "' té massa elements");
        }
        List<String> out = new ArrayList<>();
        for (JsonElement item : array) {
            if (!item.isJsonPrimitive() || !item.getAsJsonPrimitive().isString()) {
                throw ApiException.badRequest("'" + key + "' només pot contenir text");
            }
            out.add(item.getAsString());
        }
        return out;
    }
}
