package com.lightningmcqueen.driver;

import android.app.Application;

/** Sets up the API client (and its saved sign-in) before any screen opens. */
public class DriverApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ApiClient.init(this);
    }
}
