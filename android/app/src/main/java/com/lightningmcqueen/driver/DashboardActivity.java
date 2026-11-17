package com.lightningmcqueen.driver;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

/** The driver's balance, sponsor catalogs, and recent point changes. */
public class DashboardActivity extends SignedInActivity {

    private TextView greeting;
    private TextView balance;
    private TextView error;
    private Button retry;
    private LinearLayout sponsors;
    private LinearLayout updates;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_dashboard);
        setUpHeader(getString(R.string.brand), false);
        greeting = findViewById(R.id.greeting);
        balance = findViewById(R.id.balance);
        error = findViewById(R.id.error);
        retry = findViewById(R.id.retry);
        sponsors = findViewById(R.id.sponsors);
        updates = findViewById(R.id.updates);
        retry.setOnClickListener(view -> load());
    }

    // Reloads every time the screen comes back, so the balance reflects an
    // order placed in a catalog a moment ago.
    @Override
    protected void onResume() {
        super.onResume();
        load();
    }

    private void load() {
        error.setVisibility(View.GONE);
        retry.setVisibility(View.GONE);
        ApiClient.get().get("/api/driver", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                if (gone()) return;
                show(body);
            }

            @Override
            public void onError(ApiError apiError) {
                if (gone() || handledSignedOut(apiError)) return;
                error.setText(apiError.message);
                error.setVisibility(View.VISIBLE);
                retry.setVisibility(View.VISIBLE);
            }
        });
    }

    private void show(JSONObject body) {
        String name = body.optString("name", "").trim();
        greeting.setText(name.isEmpty() ? getString(R.string.brand) : "Hi, " + name.split("\\s+")[0]);
        balance.setText(Points.format(body.optLong("points", 0)));

        sponsors.removeAllViews();
        JSONArray sponsorList = body.optJSONArray("sponsors");
        if (sponsorList == null || sponsorList.length() == 0) {
            TextView empty = new TextView(this);
            empty.setTextAppearance(R.style.Text_Body);
            empty.setText(R.string.no_sponsors);
            sponsors.addView(empty);
        } else {
            for (int i = 0; i < sponsorList.length(); i++) {
                JSONObject sponsor = sponsorList.optJSONObject(i);
                if (sponsor == null) continue;
                sponsors.addView(sponsorButton(sponsor.optInt("id"), sponsor.optString("name")));
            }
        }

        updates.removeAllViews();
        JSONArray recent = body.optJSONArray("balanceNotifications");
        if (recent == null || recent.length() == 0) {
            TextView empty = new TextView(this);
            empty.setTextAppearance(R.style.Text_Body);
            empty.setText(R.string.no_recent_updates);
            updates.addView(empty);
            return;
        }
        LayoutInflater inflater = LayoutInflater.from(this);
        for (int i = 0; i < recent.length(); i++) {
            JSONObject entry = recent.optJSONObject(i);
            if (entry == null) continue;
            View row = inflater.inflate(R.layout.item_point_update, updates, false);
            long amount = entry.optLong("amount");
            ((TextView) row.findViewById(R.id.update_label)).setText(entry.optString("label"));
            ((TextView) row.findViewById(R.id.update_date)).setText(entry.optString("date"));
            TextView amountView = row.findViewById(R.id.update_amount);
            amountView.setText(Points.signed(amount));
            amountView.setTextColor(ContextCompat.getColor(this, amount >= 0 ? R.color.positive : R.color.negative));
            updates.addView(row);
        }
    }

    private Button sponsorButton(int sponsorId, String sponsorName) {
        Button button = new Button(this, null, 0, R.style.Button_Secondary);
        button.setText(getString(R.string.catalog_title, sponsorName));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        params.bottomMargin = (int) (8 * getResources().getDisplayMetrics().density);
        button.setLayoutParams(params);
        button.setOnClickListener(view -> {
            Intent intent = new Intent(this, CatalogActivity.class);
            intent.putExtra(CatalogActivity.EXTRA_SPONSOR_ID, sponsorId);
            intent.putExtra(CatalogActivity.EXTRA_SPONSOR_NAME, sponsorName);
            startActivity(intent);
        });
        return button;
    }
}
