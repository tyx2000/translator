package com.uasic.vocabulary;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
  private static final String APP_URL = "https://vocabulary-worker.uasic.workers.dev/";

  private WebView webView;
  private TextToSpeech textToSpeech;
  private boolean textToSpeechReady = false;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);
    }

    FrameLayout root = new FrameLayout(this);
    root.setBackgroundColor(Color.WHITE);
    root.setLayoutParams(
      new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    );
    root.setOnApplyWindowInsetsListener(
      (view, insets) -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          Insets systemBars = insets.getInsets(WindowInsets.Type.systemBars());
          view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
        }
        return insets;
      }
    );

    webView = new WebView(this);
    webView.setBackgroundColor(Color.WHITE);
    webView.setLayoutParams(
      new FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    );

    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setLoadWithOverviewMode(true);
    settings.setUseWideViewPort(true);
    settings.setSupportZoom(false);
    settings.setBuiltInZoomControls(false);
    settings.setDisplayZoomControls(false);
    settings.setMediaPlaybackRequiresUserGesture(false);

    textToSpeech = new TextToSpeech(this, this);
    webView.addJavascriptInterface(new TtsBridge(), "AndroidTts");

    webView.setWebViewClient(
      new WebViewClient() {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
          Uri uri = request.getUrl();
          if ("https".equals(uri.getScheme()) && "vocabulary-worker.uasic.workers.dev".equals(uri.getHost())) {
            return false;
          }
          return true;
        }
      }
    );

    root.addView(webView);
    setContentView(root);
    root.requestApplyInsets();

    if (savedInstanceState == null) {
      webView.loadUrl(APP_URL);
    } else {
      webView.restoreState(savedInstanceState);
    }
  }

  @Override
  public void onInit(int status) {
    if (status != TextToSpeech.SUCCESS || textToSpeech == null) return;
    int result = textToSpeech.setLanguage(Locale.US);
    textToSpeechReady =
      result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED;
    if (textToSpeechReady) selectAmericanVoice();
  }

  private void selectAmericanVoice() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP || textToSpeech == null) return;

    Set<Voice> voices = textToSpeech.getVoices();
    if (voices == null) return;

    Voice fallback = null;
    for (Voice voice : voices) {
      Locale locale = voice.getLocale();
      if (locale == null || !"en".equals(locale.getLanguage()) || !"US".equals(locale.getCountry())) {
        continue;
      }
      if (fallback == null) fallback = voice;
      String name = voice.getName();
      if (name != null && name.toLowerCase(Locale.US).matches(".*(female|woman|samantha|victoria|allison|ava|susan|zira|jenny|aria|joanna|kendra|salli).*")) {
        textToSpeech.setVoice(voice);
        return;
      }
    }

    if (fallback != null) textToSpeech.setVoice(fallback);
  }

  @Override
  protected void onSaveInstanceState(Bundle outState) {
    super.onSaveInstanceState(outState);
    webView.saveState(outState);
  }

  @Override
  public void onBackPressed() {
    if (webView.canGoBack()) {
      webView.goBack();
      return;
    }
    super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    if (webView != null) {
      webView.destroy();
    }
    if (textToSpeech != null) {
      textToSpeech.stop();
      textToSpeech.shutdown();
    }
    super.onDestroy();
  }

  private final class TtsBridge {
    @JavascriptInterface
    public void speak(String text) {
      if (text == null || text.trim().isEmpty()) return;
      runOnUiThread(
        () -> {
          if (!textToSpeechReady || textToSpeech == null) return;
          textToSpeech.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, null, "vocabulary-word");
        }
      );
    }
  }
}
