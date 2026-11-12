# Lightning McQueen driver app (Android)

A native Android app (Java + XML layouts) for drivers. It uses the same
accounts and the same API as the website, so points, catalogs and orders are
shared. The website is not changed by anything in this folder, and the AWS
deploy doesn't package it.

First version: sign in, dashboard (balance, sponsor catalogs, recent point
updates), and each sponsor's catalog with checkout (confirm step, not-enough-
points and out-of-stock handling, order confirmation). Sponsors and admins
keep using the website.

## Run it

1. In Android Studio: **File → Open** and pick this `android/` folder.
2. Let Gradle sync, choose an emulator (e.g. Pixel 8) or a phone, and press **Run**.

The app talks to the live API by default. To try it against a local backend
(`npm run server` on port 4000) from the emulator instead:

```bash
./gradlew installDebug -PapiBaseUrl=http://10.0.2.2:4000
```

`10.0.2.2` is the emulator's address for your computer; plain `http` is only
allowed when the URL itself is `http`.

## Tests

```bash
./gradlew testDebugUnitTest
```
