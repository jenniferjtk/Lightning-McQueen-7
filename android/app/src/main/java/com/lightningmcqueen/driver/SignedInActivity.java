package com.lightningmcqueen.driver;

import android.content.Intent;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/** Header bar and sign-out handling shared by the screens behind login. */
abstract class SignedInActivity extends AppCompatActivity {

    protected void setUpHeader(String title, boolean showBack) {
        SystemBars.fit(this, findViewById(R.id.header));
        TextView headerTitle = findViewById(R.id.header_title);
        headerTitle.setText(title);
        Button back = findViewById(R.id.header_back);
        back.setVisibility(showBack ? Button.VISIBLE : Button.GONE);
        back.setOnClickListener(view -> finish());
        findViewById(R.id.header_log_out).setOnClickListener(view -> logOut(null));
    }

    protected void logOut(String message) {
        ApiClient.get().post("/api/auth/logout", null, LoginActivity.ignoreResult());
        ApiClient.get().clearSession();
        returnToLogin(message);
    }

    /** Sends the driver back to sign in, clearing every screen behind this one. */
    protected void returnToLogin(String message) {
        Intent intent = new Intent(this, LoginActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        if (message != null) intent.putExtra(LoginActivity.EXTRA_MESSAGE, message);
        startActivity(intent);
        finish();
    }

    /** True once this screen is closing; responses that arrive late are ignored. */
    protected boolean gone() {
        return isFinishing() || isDestroyed();
    }

    /** Handles a 401 from any call; returns true when it did. */
    protected boolean handledSignedOut(ApiError error) {
        if (!error.isSignedOut()) return false;
        ApiClient.get().clearSession();
        returnToLogin(getString(R.string.session_expired));
        return true;
    }
}
