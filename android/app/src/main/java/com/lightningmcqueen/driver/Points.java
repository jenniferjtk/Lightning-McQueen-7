package com.lightningmcqueen.driver;

import java.text.NumberFormat;
import java.util.Locale;

/** Formatting and arithmetic shared by the screens; plain Java so it's unit tested. */
final class Points {

    private Points() {
    }

    static String format(long points) {
        return NumberFormat.getIntegerInstance(Locale.US).format(points) + " pts";
    }

    static String number(long points) {
        return NumberFormat.getIntegerInstance(Locale.US).format(points);
    }

    static String signed(long points) {
        return (points > 0 ? "+" : "") + format(points);
    }

    static String dollars(double amount) {
        return NumberFormat.getCurrencyInstance(Locale.US).format(amount);
    }

    /** How many more points an item needs; 0 when the balance covers it. */
    static long shortfall(long cost, long balance) {
        return Math.max(0, cost - balance);
    }

    /** Matches the website's stock wording; null means the sponsor doesn't track stock. */
    static String stockLabel(Integer stock) {
        if (stock == null) return "Stock not set";
        if (stock <= 0) return "Out of stock";
        return stock + " in stock";
    }

    /** The largest power-of-two downscale that keeps both sides at least target pixels. */
    static int sampleSize(int width, int height, int target) {
        int sample = 1;
        while (width / (sample * 2) >= target && height / (sample * 2) >= target) sample *= 2;
        return sample;
    }

    /** One line for a shipping address, skipping blank parts. */
    static String addressLine(String... parts) {
        StringBuilder line = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.trim().isEmpty()) continue;
            if (line.length() > 0) line.append(", ");
            line.append(part.trim());
        }
        return line.toString();
    }
}
