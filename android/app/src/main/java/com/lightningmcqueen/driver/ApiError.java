package com.lightningmcqueen.driver;

import org.json.JSONObject;

/** A failed API call: the HTTP status, the API's error code, and its message. */
public final class ApiError {

    public final int status;
    /** The API's machine-readable code, e.g. INSUFFICIENT_POINTS; empty when none. */
    public final String code;
    public final String message;
    public final JSONObject body;

    private ApiError(int status, String code, String message, JSONObject body) {
        this.status = status;
        this.code = code;
        this.message = message;
        this.body = body;
    }

    static ApiError fromResponse(int status, JSONObject body) {
        String fallback = status >= 500 ? "Something went wrong on the server. Try again in a moment." : "That request didn't work.";
        return new ApiError(status, body.optString("code", ""), body.optString("message", fallback), body);
    }

    static ApiError network() {
        return new ApiError(0, "", "Can't reach the server. Check your connection and try again.", new JSONObject());
    }

    public boolean isSignedOut() {
        return status == 401;
    }
}
