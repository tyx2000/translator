# Vocabulary WebView Android

Minimal Android WebView shell for the Vocabulary Cloudflare Worker app.

The target URL is defined in:

```text
app/src/main/java/com/uasic/vocabulary/MainActivity.java
```

Change `APP_URL` and the allowed host in `shouldOverrideUrlLoading` if the Worker domain changes.

Build a debug APK:

```powershell
.\gradlew.bat assembleDebug
```

APK output:

```text
app/build/outputs/apk/debug/app-debug.apk
```
