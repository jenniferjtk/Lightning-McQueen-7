package com.lightningmcqueen.driver;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.widget.ImageView;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Loads product images in the background, scaled down and cached in memory. */
final class ImageLoader {

    private static final int TARGET_PX = 480;
    private static final LruCache<String, Bitmap> CACHE = new LruCache<String, Bitmap>(16 * 1024 * 1024) {
        @Override
        protected int sizeOf(String key, Bitmap bitmap) {
            return bitmap.getByteCount();
        }
    };
    private static final ExecutorService EXECUTOR = Executors.newFixedThreadPool(2);
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private ImageLoader() {
    }

    static void load(String url, ImageView view) {
        view.setTag(url);
        view.setImageDrawable(null);
        if (url == null || url.isEmpty()) return;
        Bitmap cached = CACHE.get(url);
        if (cached != null) {
            view.setImageBitmap(cached);
            return;
        }
        EXECUTOR.execute(() -> {
            Bitmap bitmap = download(url);
            if (bitmap == null) return;
            CACHE.put(url, bitmap);
            // The view may have been reused for another product by now.
            MAIN.post(() -> {
                if (url.equals(view.getTag())) view.setImageBitmap(bitmap);
            });
        });
    }

    private static Bitmap download(String url) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(20_000);
            byte[] bytes;
            try (InputStream in = connection.getInputStream()) {
                bytes = ApiClient.readBytes(in);
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inSampleSize = Points.sampleSize(bounds.outWidth, bounds.outHeight, TARGET_PX);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
        } catch (IOException exception) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
