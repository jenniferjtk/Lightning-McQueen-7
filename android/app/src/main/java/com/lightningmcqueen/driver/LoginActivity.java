package com.lightningmcqueen.driver;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import org.json.JSONException;
import org.json.JSONObject;

/** Signs a driver in with the same accounts as the website. */
public class LoginActivity extends AppCompatActivity {

    static final String EXTRA_MESSAGE = "message";

    private EditText email;
    private EditText password;
    private TextView error;
    private Button logIn;
    private CheckBox remember;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);
        SystemBars.fit(this, findViewById(R.id.login_root));
        email = findViewById(R.id.email);
        password = findViewById(R.id.password);
        error = findViewById(R.id.error);
        logIn = findViewById(R.id.log_in);
        remember = findViewById(R.id.remember);
        remember.setChecked(ApiClient.get().remembersSignIn());

        String message = getIntent().getStringExtra(EXTRA_MESSAGE);
        if (message != null) {
            showError(message);
        } else if (savedInstanceState == null && ApiClient.get().hasSavedSession()) {
            resumeSavedSession();
        }

        logIn.setOnClickListener(view -> submit());
        password.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId != EditorInfo.IME_ACTION_DONE) return false;
            submit();
            return true;
        });
    }

    /** Skips the form when a sign-in saved on an earlier run is still valid (story 29621). */
    private void resumeSavedSession() {
        setBusy(true);
        ApiClient.get().get("/api/auth/me", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject response) {
                if (isFinishing() || isDestroyed()) return;
                JSONObject user = response.optJSONObject("user");
                if (user != null && "driver".equals(user.optString("role"))) {
                    openDashboard();
                    return;
                }
                ApiClient.get().clearSession();
                setBusy(false);
            }

            @Override
            public void onError(ApiError apiError) {
                if (isFinishing() || isDestroyed()) return;
                // An expired session just means signing in again; keep the
                // saved cookie only when the server couldn't be reached.
                if (apiError.status > 0) ApiClient.get().clearSession();
                setBusy(false);
                if (apiError.status <= 0) showError(apiError.message);
            }
        });
    }

    private void openDashboard() {
        startActivity(new Intent(LoginActivity.this, DashboardActivity.class));
        finish();
    }

    private void submit() {
        String emailText = email.getText().toString().trim();
        String passwordText = password.getText().toString();
        if (emailText.isEmpty() || passwordText.isEmpty()) {
            showError(getString(R.string.enter_email_password));
            return;
        }
        error.setVisibility(View.GONE);
        setBusy(true);
        ApiClient.get().setRememberSignIn(remember.isChecked());

        JSONObject body = new JSONObject();
        try {
            body.put("email", emailText);
            body.put("password", passwordText);
            body.put("rememberMe", remember.isChecked());
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        ApiClient.get().post("/api/auth/login", body, new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject response) {
                if (isFinishing() || isDestroyed()) return;
                JSONObject user = response.optJSONObject("user");
                if (user == null || !"driver".equals(user.optString("role"))) {
                    // Sponsor and admin tools stay on the website for now.
                    ApiClient.get().post("/api/auth/logout", null, ignoreResult());
                    ApiClient.get().clearSession();
                    setBusy(false);
                    showError(getString(R.string.drivers_only));
                    return;
                }
                password.setText("");
                openDashboard();
            }

            @Override
            public void onError(ApiError apiError) {
                if (isFinishing() || isDestroyed()) return;
                setBusy(false);
                showError(apiError.message);
            }
        });
    }

    private void setBusy(boolean busy) {
        logIn.setEnabled(!busy);
        logIn.setText(busy ? R.string.signing_in : R.string.log_in);
    }

    private void showError(String message) {
        error.setText(message);
        error.setVisibility(View.VISIBLE);
    }

    static ApiClient.Callback ignoreResult() {
        return new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
            }

            @Override
            public void onError(ApiError error) {
            }
        };
    }
}
