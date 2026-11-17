package com.lightningmcqueen.driver;

import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.ZoneId;

/** The driver's orders across sponsors, newest first, with cancel for pending ones. */
public class OrdersActivity extends SignedInActivity {

    private TextView notice;
    private TextView error;
    private TextView status;
    private Button retry;
    private LinearLayout orders;
    private boolean canceling;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_orders);
        setUpHeader(getString(R.string.my_orders), true);
        notice = findViewById(R.id.notice);
        error = findViewById(R.id.error);
        status = findViewById(R.id.status);
        retry = findViewById(R.id.retry);
        orders = findViewById(R.id.orders);
        retry.setOnClickListener(view -> load());
    }

    @Override
    protected void onResume() {
        super.onResume();
        load();
    }

    private void load() {
        error.setVisibility(View.GONE);
        retry.setVisibility(View.GONE);
        ApiClient.get().get("/api/orders", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                if (gone()) return;
                render(body.optJSONArray("orders"));
            }

            @Override
            public void onError(ApiError apiError) {
                if (gone() || handledSignedOut(apiError)) return;
                status.setVisibility(View.GONE);
                error.setText(apiError.message);
                error.setVisibility(View.VISIBLE);
                retry.setVisibility(View.VISIBLE);
            }
        });
    }

    private void render(JSONArray list) {
        orders.removeAllViews();
        if (list == null || list.length() == 0) {
            status.setText(R.string.no_orders);
            status.setVisibility(View.VISIBLE);
            return;
        }
        status.setVisibility(View.GONE);
        ZoneId zone = ZoneId.systemDefault();
        LayoutInflater inflater = LayoutInflater.from(this);
        for (int i = 0; i < list.length(); i++) {
            JSONObject order = list.optJSONObject(i);
            if (order == null) continue;
            String state = order.optString("status");
            View card = inflater.inflate(R.layout.item_order, orders, false);
            ((TextView) card.findViewById(R.id.order_title)).setText(order.optString("productTitle"));
            ((TextView) card.findViewById(R.id.order_meta)).setText(getString(R.string.order_meta,
                order.optInt("orderId"), order.optString("sponsorName"), Points.orderDate(order.optString("createdAt"), zone)));
            ((TextView) card.findViewById(R.id.order_points)).setText(Points.format(order.optLong("pointCost")));
            ((TextView) card.findViewById(R.id.order_delivery)).setText(
                Points.deliveryLabel(state, order.isNull("estimatedDelivery") ? null : order.optString("estimatedDelivery")));
            styleBadge(card.findViewById(R.id.order_status), state);

            Button cancel = card.findViewById(R.id.order_cancel);
            if ("pending".equals(state)) {
                cancel.setVisibility(View.VISIBLE);
                cancel.setContentDescription(getString(R.string.cancel_order_described, order.optInt("orderId")));
                cancel.setOnClickListener(view -> confirmCancel(order));
            }
            orders.addView(card);
        }
    }

    // Same colors as the website's status badges.
    private void styleBadge(TextView badge, String state) {
        int background;
        int text;
        switch (state) {
            case "pending": background = 0xFFFFF5DC; text = 0xFF7A5300; break;
            case "shipped": background = 0xFFE3EEFA; text = 0xFF1D4F86; break;
            case "delivered": background = 0xFFE2F3E6; text = 0xFF1F6B35; break;
            default: background = 0xFFEEF1F3; text = 0xFF5B6B79;
        }
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(background);
        shape.setCornerRadius(999f);
        badge.setBackground(shape);
        badge.setTextColor(text);
        badge.setText(Points.statusLabel(state));
    }

    private void confirmCancel(JSONObject order) {
        if (canceling) return;
        String points = Points.format(order.optLong("pointCost"));
        new AlertDialog.Builder(this)
            .setTitle(R.string.cancel_order_title)
            .setMessage(getString(R.string.cancel_order_message, order.optInt("orderId"), order.optString("productTitle"),
                points, order.optString("sponsorName")))
            .setPositiveButton(R.string.yes_cancel_order, (dialog, which) -> cancel(order))
            .setNegativeButton(R.string.keep_order, null)
            .show();
    }

    private void cancel(JSONObject order) {
        canceling = true;
        notice.setVisibility(View.GONE);
        error.setVisibility(View.GONE);
        ApiClient.get().post("/api/orders/" + order.optInt("orderId") + "/cancel", null, new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                canceling = false;
                if (gone()) return;
                notice.setText(getString(R.string.order_canceled, order.optInt("orderId"),
                    Points.format(order.optLong("pointCost")), order.optString("sponsorName")));
                notice.setVisibility(View.VISIBLE);
                load();
            }

            @Override
            public void onError(ApiError apiError) {
                canceling = false;
                if (gone() || handledSignedOut(apiError)) return;
                error.setText(apiError.message);
                error.setVisibility(View.VISIBLE);
                load();
            }
        });
    }
}
