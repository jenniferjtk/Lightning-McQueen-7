package com.lightningmcqueen.driver;

import android.os.Bundle;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import org.json.JSONException;
import org.json.JSONObject;

/** The driver's saved shipping address, the one every order ships to. */
public class AddressActivity extends SignedInActivity {

    private EditText street;
    private EditText city;
    private EditText state;
    private EditText zip;
    private EditText country;
    private TextView notice;
    private TextView error;
    private Button save;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_address);
        setUpHeader(getString(R.string.shipping_address), true);
        street = findViewById(R.id.street);
        city = findViewById(R.id.city);
        state = findViewById(R.id.state);
        zip = findViewById(R.id.zip);
        country = findViewById(R.id.country);
        notice = findViewById(R.id.notice);
        error = findViewById(R.id.error);
        save = findViewById(R.id.save);
        save.setOnClickListener(view -> submit());
        country.setOnEditorActionListener((view, actionId, event) -> {
            if (actionId != EditorInfo.IME_ACTION_DONE) return false;
            submit();
            return true;
        });
        load();
    }

    private void load() {
        ApiClient.get().get("/api/driver/shipping-address", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                if (gone()) return;
                JSONObject address = body.optJSONObject("address");
                if (address != null) {
                    street.setText(text(address, "streetAddress"));
                    city.setText(text(address, "city"));
                    state.setText(text(address, "state"));
                    zip.setText(text(address, "zipCode"));
                    country.setText(text(address, "country"));
                }
                save.setEnabled(true);
            }

            @Override
            public void onError(ApiError apiError) {
                if (gone() || handledSignedOut(apiError)) return;
                showError(apiError.message);
                save.setEnabled(true);
            }
        });
    }

    private static String text(JSONObject address, String key) {
        return address.isNull(key) ? "" : address.optString(key, "");
    }

    private void submit() {
        notice.setVisibility(View.GONE);
        error.setVisibility(View.GONE);
        if (blank(street) || blank(city) || blank(zip) || blank(country)) {
            showError(getString(R.string.address_required_fields));
            return;
        }
        JSONObject body = new JSONObject();
        try {
            body.put("streetAddress", street.getText().toString().trim());
            body.put("city", city.getText().toString().trim());
            body.put("state", state.getText().toString().trim());
            body.put("zipCode", zip.getText().toString().trim());
            body.put("country", country.getText().toString().trim());
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        save.setEnabled(false);
        save.setText(R.string.saving);
        ApiClient.get().put("/api/driver/shipping-address", body, new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject response) {
                if (gone()) return;
                save.setEnabled(true);
                save.setText(R.string.save_address);
                notice.setText(R.string.address_saved);
                notice.setVisibility(View.VISIBLE);
            }

            @Override
            public void onError(ApiError apiError) {
                if (gone() || handledSignedOut(apiError)) return;
                save.setEnabled(true);
                save.setText(R.string.save_address);
                showError(apiError.message);
            }
        });
    }

    private static boolean blank(EditText field) {
        return field.getText().toString().trim().isEmpty();
    }

    private void showError(String message) {
        error.setText(message);
        error.setVisibility(View.VISIBLE);
    }
}
