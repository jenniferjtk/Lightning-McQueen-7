package com.lightningmcqueen.driver;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.CookieManager;
import java.net.CookieStore;
import java.net.HttpCookie;
import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Keeps the session cookie across app restarts when the driver chose "Keep me
 * signed in" (story 29621). Cookies live in memory as usual and are mirrored
 * to private SharedPreferences; with remembering off, nothing is written and
 * any saved cookie is erased.
 */
final class PersistentCookieStore implements CookieStore {

    private static final String PREFS = "session";
    private static final String KEY_COOKIES = "cookies";
    private static final String KEY_REMEMBER = "remember";

    private final CookieStore memory = new CookieManager().getCookieStore();
    private final Map<String, Long> expiresAt = new HashMap<>();
    private final SharedPreferences prefs;
    private final URI baseUri;

    PersistentCookieStore(Context context, URI baseUri) {
        this.prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        this.baseUri = baseUri;
        load();
    }

    boolean remembers() {
        return prefs.getBoolean(KEY_REMEMBER, true);
    }

    void setRemember(boolean remember) {
        prefs.edit().putBoolean(KEY_REMEMBER, remember).apply();
        save();
    }

    /** True when a cookie from an earlier run is still waiting to be checked. */
    boolean hasSavedCookies() {
        return remembers() && !memory.getCookies().isEmpty();
    }

    @Override
    public synchronized void add(URI uri, HttpCookie cookie) {
        memory.add(uri, cookie);
        long maxAge = cookie.getMaxAge();
        expiresAt.put(cookie.getName(), maxAge < 0 ? -1L : System.currentTimeMillis() + maxAge * 1000L);
        save();
    }

    @Override
    public List<HttpCookie> get(URI uri) {
        return memory.get(uri);
    }

    @Override
    public List<HttpCookie> getCookies() {
        return memory.getCookies();
    }

    @Override
    public List<URI> getURIs() {
        return memory.getURIs();
    }

    @Override
    public synchronized boolean remove(URI uri, HttpCookie cookie) {
        boolean removed = memory.remove(uri, cookie);
        expiresAt.remove(cookie.getName());
        save();
        return removed;
    }

    @Override
    public synchronized boolean removeAll() {
        boolean removed = memory.removeAll();
        expiresAt.clear();
        save();
        return removed;
    }

    private void save() {
        if (!remembers()) {
            prefs.edit().remove(KEY_COOKIES).apply();
            return;
        }
        JSONArray saved = new JSONArray();
        for (HttpCookie cookie : memory.getCookies()) {
            Long expiry = expiresAt.get(cookie.getName());
            // Browser-session cookies (no expiry) end with the app, as in a browser.
            if (cookie.hasExpired() || expiry == null || expiry < 0) continue;
            try {
                saved.put(new JSONObject()
                    .put("name", cookie.getName())
                    .put("value", cookie.getValue())
                    .put("domain", cookie.getDomain())
                    .put("path", cookie.getPath())
                    .put("secure", cookie.getSecure())
                    .put("httpOnly", cookie.isHttpOnly())
                    .put("expiresAt", expiry));
            } catch (JSONException impossible) {
                throw new IllegalStateException(impossible);
            }
        }
        prefs.edit().putString(KEY_COOKIES, saved.toString()).apply();
    }

    private void load() {
        if (!remembers()) return;
        try {
            JSONArray saved = new JSONArray(prefs.getString(KEY_COOKIES, "[]"));
            long now = System.currentTimeMillis();
            for (int i = 0; i < saved.length(); i++) {
                JSONObject entry = saved.getJSONObject(i);
                long expiry = entry.getLong("expiresAt");
                if (expiry <= now) continue;
                HttpCookie cookie = new HttpCookie(entry.getString("name"), entry.getString("value"));
                if (!entry.isNull("domain")) cookie.setDomain(entry.optString("domain"));
                if (!entry.isNull("path")) cookie.setPath(entry.optString("path"));
                cookie.setSecure(entry.optBoolean("secure"));
                cookie.setHttpOnly(entry.optBoolean("httpOnly"));
                cookie.setVersion(0);
                cookie.setMaxAge((expiry - now) / 1000L);
                memory.add(baseUri, cookie);
                expiresAt.put(cookie.getName(), expiry);
            }
        } catch (JSONException corrupt) {
            prefs.edit().remove(KEY_COOKIES).apply();
        }
    }
}
