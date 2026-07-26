# Vocabulary Native Android

Native Android application for the Vocabulary translator. It uses standard Android Java views and does not contain a WebView.

## Query routing

- A single English word is looked up in the bundled SQLite ECDICT database. This path works without a network connection.
- Chinese, English phrases, and English sentences are sent to the existing Cloudflare Worker API.
- Successful results are stored in the app's local history database. Spelling errors are not stored.
- English results can be read with the device's US English text-to-speech engine.

## Rebuild the bundled dictionary

From the repository root:

```bash
npm run dictionary:download
npm run dictionary:build:android
```

The generated asset contains about 400,000 single-word entries. Phrase entries remain on the Worker because non-word input uses the online API.

## Build

The project requires JDK 17 and Android SDK 35:

```bash
cd android-native
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
./gradlew :app:assembleDebug
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```
