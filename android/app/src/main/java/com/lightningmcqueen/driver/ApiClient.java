package com.lightningmcqueen.driver;

import android.os.Handler;
import android.os.Looper;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Talks to the same Express API the website uses. The login session is the
 * same cookie the browser gets; CookieManager keeps it for the app's
 * lifetime, so every request after login is signed in.
 */
public final class ApiClient {

    public interface Callback {
        void onSuccess(JSONObject body);

        void onError(ApiError error);
    }

    private static final ApiClient INSTANCE = new ApiClient();

    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private final Handler mainThread = new Handler(Looper.getMainLooper());

    private ApiClient() {
        CookieHandler.setDefault(new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER));
    }

    public static ApiClient get() {
        return INSTANCE;
    }

    public void get(String path, Callback callback) {
        request("GET", path, null, callback);
    }

    public void post(String path, JSONObject body, Callback callback) {
        request("POST", path, body, callback);
    }

    /** Forgets the session cookie, so the next request is signed out. */
    public void clearSession() {
        CookieHandler handler = CookieHandler.getDefault();
        if (handler instanceof CookieManager) ((CookieManager) handler).getCookieStore().removeAll();
    }

    private void request(String method, String path, JSONObject body, Callback callback) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(BuildConfig.API_BASE_URL + path).openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(20_000);
                connection.setRequestProperty("Accept", "application/json");
                if (body != null) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    try (OutputStream out = connection.getOutputStream()) {
                        out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                    }
                }
                int status = connection.getResponseCode();
                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                JSONObject json = parseObject(stream == null ? "" : readAll(stream));
                if (status >= 200 && status < 300) {
                    mainThread.post(() -> callback.onSuccess(json));
                } else {
                    ApiError error = ApiError.fromResponse(status, json);
                    mainThread.post(() -> callback.onError(error));
                }
            } catch (IOException exception) {
                mainThread.post(() -> callback.onError(ApiError.network()));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    // Error pages (an HTML 404, an empty 204) become an empty object, so
    // callers only ever deal with JSON.
    private static JSONObject parseObject(String text) {
        try {
            return text.trim().startsWith("{") ? new JSONObject(text) : new JSONObject();
        } catch (JSONException exception) {
            return new JSONObject();
        }
    }

    static String readAll(InputStream stream) throws IOException {
        return new String(readBytes(stream), StandardCharsets.UTF_8);
    }

    static byte[] readBytes(InputStream stream) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int read;
        while ((read = stream.read(chunk)) != -1) buffer.write(chunk, 0, read);
        return buffer.toByteArray();
    }
}
