package com.lightningmcqueen.driver;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AlertDialog;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * One sponsor's catalog, priced in that sponsor's points, with checkout.
 * The driver confirms before anything is charged, and the server re-checks
 * price, stock and balance; whatever it reports back is shown here.
 */
public class CatalogActivity extends SignedInActivity {

    static final String EXTRA_SPONSOR_ID = "sponsorId";
    static final String EXTRA_SPONSOR_NAME = "sponsorName";

    private static final class Product {
        final int id;
        final String title;
        final String category;
        final String imageUrl;
        double price;
        long pointCost;
        Integer stock;

        Product(JSONObject json) {
            id = json.optInt("productId");
            title = json.optString("title");
            category = json.optString("displayCategory", json.optString("category"));
            imageUrl = json.optString("imageUrl", "");
            price = json.optDouble("price", 0);
            pointCost = json.optLong("pointCost", 0);
            stock = json.isNull("stockQuantity") ? null : json.optInt("stockQuantity");
        }
    }

    private int sponsorId;
    private String sponsorName;
    private Long balance;
    private String shipsTo;
    private final List<Product> products = new ArrayList<>();

    private View balanceBanner;
    private TextView balanceView;
    private TextView status;
    private TextView error;
    private Button retry;
    private LinearLayout productList;
    private AlertDialog busyDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_catalog);
        sponsorId = getIntent().getIntExtra(EXTRA_SPONSOR_ID, 0);
        sponsorName = getIntent().getStringExtra(EXTRA_SPONSOR_NAME);
        setUpHeader(getString(R.string.catalog_title, sponsorName), true);

        balanceBanner = findViewById(R.id.balance_banner);
        balanceView = findViewById(R.id.balance);
        status = findViewById(R.id.status);
        error = findViewById(R.id.error);
        retry = findViewById(R.id.retry);
        productList = findViewById(R.id.products);
        ((TextView) findViewById(R.id.balance_label)).setText(getString(R.string.your_balance_with, sponsorName));
        retry.setOnClickListener(view -> loadCatalog());
    }

    // Loads on first show and whenever the screen comes back, so the balance
    // and stock never lag behind an order placed elsewhere.
    @Override
    protected void onResume() {
        super.onResume();
        loadCatalog();
        loadAddress();
    }

    private void loadCatalog() {
        status.setText(R.string.loading);
        status.setVisibility(View.VISIBLE);
        error.setVisibility(View.GONE);
        retry.setVisibility(View.GONE);
        ApiClient.get().get("/api/sponsors/" + sponsorId + "/catalog", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                if (gone()) return;
                products.clear();
                JSONArray list = body.optJSONArray("products");
                for (int i = 0; list != null && i < list.length(); i++) {
                    JSONObject item = list.optJSONObject(i);
                    if (item != null) products.add(new Product(item));
                }
                balance = body.isNull("pointBalance") ? null : body.optLong("pointBalance");
                findViewById(R.id.stale).setVisibility(body.optBoolean("stale") ? View.VISIBLE : View.GONE);
                render();
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

    private void loadAddress() {
        ApiClient.get().get("/api/driver/shipping-address", new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject body) {
                if (gone()) return;
                JSONObject address = body.optJSONObject("address");
                if (address == null) return;
                boolean complete = !address.optString("streetAddress").trim().isEmpty()
                    && !address.optString("city").trim().isEmpty()
                    && !address.optString("zipCode").trim().isEmpty()
                    && !address.optString("country").trim().isEmpty();
                shipsTo = complete ? Points.addressLine(address.optString("streetAddress"), address.optString("city"),
                    address.optString("state"), address.optString("zipCode"), address.optString("country")) : null;
            }

            @Override
            public void onError(ApiError apiError) {
                if (!gone()) handledSignedOut(apiError);
            }
        });
    }

    private void render() {
        if (balance != null) {
            balanceView.setText(Points.format(balance));
            balanceBanner.setVisibility(View.VISIBLE);
        }
        if (products.isEmpty()) {
            status.setText(getString(R.string.catalog_empty, sponsorName));
            status.setVisibility(View.VISIBLE);
        } else {
            status.setVisibility(View.GONE);
        }

        productList.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(this);
        for (Product product : products) {
            View card = inflater.inflate(R.layout.item_product, productList, false);
            ImageLoader.load(product.imageUrl, (ImageView) card.findViewById(R.id.product_image));
            ((TextView) card.findViewById(R.id.product_category)).setText(product.category);
            ((TextView) card.findViewById(R.id.product_title)).setText(product.title);
            ((TextView) card.findViewById(R.id.product_price)).setText(Points.dollars(product.price));

            long shortBy = balance == null ? 0 : Points.shortfall(product.pointCost, balance);
            TextView pointsView = card.findViewById(R.id.product_points);
            pointsView.setText(Points.format(product.pointCost));
            pointsView.setTextColor(ContextCompat.getColor(this, shortBy > 0 ? R.color.negative : R.color.positive));
            TextView need = card.findViewById(R.id.product_need);
            need.setVisibility(shortBy > 0 ? View.VISIBLE : View.GONE);
            need.setText(getString(R.string.need_more, Points.number(shortBy)));
            ((TextView) card.findViewById(R.id.product_stock)).setText(Points.stockLabel(product.stock));

            Button redeem = card.findViewById(R.id.product_redeem);
            boolean outOfStock = product.stock != null && product.stock <= 0;
            redeem.setText(outOfStock ? Points.stockLabel(0) : getString(R.string.redeem_for, Points.format(product.pointCost)));
            redeem.setEnabled(!outOfStock && balance != null);
            redeem.setOnClickListener(view -> confirm(product));
            productList.addView(card);
        }
    }

    // Step one of checkout: show exactly what will be charged before placing
    // anything. An order that can't go through only gets an OK button.
    private void confirm(Product product) {
        long current = balance == null ? 0 : balance;
        long shortBy = Points.shortfall(product.pointCost, current);
        StringBuilder message = new StringBuilder()
            .append("Item: ").append(product.title)
            .append("\nCost: ").append(Points.format(product.pointCost))
            .append("\nCurrent balance: ").append(Points.format(current))
            .append("\nBalance after order: ").append(shortBy > 0 ? "—" : Points.format(current - product.pointCost))
            .append("\nShips to: ").append(shipsTo == null ? "No address saved" : shipsTo);

        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle(R.string.confirm_order);
        if (shortBy > 0) {
            message.append("\n\n").append(getString(R.string.not_enough_points, Points.number(shortBy)));
            dialog.setPositiveButton(R.string.ok, null);
        } else if (shipsTo == null) {
            message.append("\n\n").append(getString(R.string.no_address));
            dialog.setPositiveButton(R.string.ok, null);
        } else {
            dialog.setPositiveButton(R.string.place_order, (d, which) -> placeOrder(product))
                .setNegativeButton(R.string.cancel, null);
        }
        dialog.setMessage(message).show();
    }

    private void placeOrder(Product product) {
        JSONObject body = new JSONObject();
        try {
            body.put("sponsorId", sponsorId);
            body.put("productId", product.id);
            body.put("expectedPointCost", product.pointCost);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        busyDialog = new AlertDialog.Builder(this).setMessage(R.string.placing_order).setCancelable(false).show();

        ApiClient.get().post("/api/orders", body, new ApiClient.Callback() {
            @Override
            public void onSuccess(JSONObject response) {
                if (gone()) return;
                busyDialog.dismiss();
                JSONObject order = response.optJSONObject("order");
                balance = response.optLong("pointBalance", balance == null ? 0 : balance);
                if (response.has("stockQuantity")) {
                    product.stock = response.isNull("stockQuantity") ? null : response.optInt("stockQuantity");
                }
                render();
                long spent = order == null ? product.pointCost : order.optLong("pointCost", product.pointCost);
                String text = "Order #" + (order == null ? "" : order.optInt("orderId")) + " for " + product.title + " is confirmed."
                    + "\n\nPoints spent: " + Points.format(spent)
                    + "\nNew balance: " + Points.format(balance)
                    + "\nShips to: " + shipsTo;
                new AlertDialog.Builder(CatalogActivity.this)
                    .setTitle(R.string.order_placed)
                    .setMessage(text)
                    .setPositiveButton(R.string.ok, null)
                    .show();
            }

            @Override
            public void onError(ApiError apiError) {
                if (gone()) return;
                busyDialog.dismiss();
                if (handledSignedOut(apiError)) return;
                AlertDialog.Builder dialog = new AlertDialog.Builder(CatalogActivity.this).setMessage(apiError.message);
                switch (apiError.code) {
                    case "PRICE_CHANGED":
                        product.pointCost = apiError.body.optLong("pointCost", product.pointCost);
                        product.price = apiError.body.optDouble("price", product.price);
                        render();
                        dialog.setPositiveButton(R.string.review_order, (d, which) -> confirm(product))
                            .setNegativeButton(R.string.cancel, null);
                        break;
                    case "INSUFFICIENT_POINTS":
                        if (apiError.body.has("pointBalance")) balance = apiError.body.optLong("pointBalance");
                        render();
                        dialog.setPositiveButton(R.string.ok, null);
                        break;
                    case "OUT_OF_STOCK":
                        product.stock = 0;
                        render();
                        dialog.setPositiveButton(R.string.ok, null);
                        break;
                    case "ADDRESS_REQUIRED":
                        shipsTo = null;
                        dialog.setPositiveButton(R.string.ok, null);
                        break;
                    default:
                        dialog.setPositiveButton(R.string.ok, null);
                }
                dialog.show();
            }
        });
    }
}
