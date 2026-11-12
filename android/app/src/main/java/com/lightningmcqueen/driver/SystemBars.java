package com.lightningmcqueen.driver;

import android.app.Activity;
import android.view.View;
import android.view.ViewGroup;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/**
 * Android 15+ draws apps behind the status and navigation bars. This pads
 * the given top view (which keeps its dark background behind the clock) and
 * the screen's bottom edge by the bars' sizes so nothing sits under them.
 */
final class SystemBars {

    private SystemBars() {
    }

    static void fit(Activity activity, View top) {
        WindowCompat.getInsetsController(activity.getWindow(), top).setAppearanceLightStatusBars(false);
        View screen = ((ViewGroup) activity.findViewById(android.R.id.content)).getChildAt(0);
        int topPadding = top.getPaddingTop();
        int bottomPadding = screen.getPaddingBottom();
        ViewCompat.setOnApplyWindowInsetsListener(screen, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            top.setPadding(top.getPaddingLeft(), topPadding + bars.top, top.getPaddingRight(), top.getPaddingBottom());
            view.setPadding(view.getPaddingLeft(), view.getPaddingTop(), view.getPaddingRight(), bottomPadding + bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
    }
}
