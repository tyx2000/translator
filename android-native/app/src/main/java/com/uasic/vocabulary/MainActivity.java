package com.uasic.vocabulary;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.net.SocketTimeoutException;
import java.net.UnknownHostException;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
  private static final int COLOR_TEXT = Color.rgb(17, 24, 39);
  private static final int COLOR_MUTED = Color.rgb(107, 114, 128);
  private static final int COLOR_BORDER = Color.rgb(229, 231, 235);
  private static final int HISTORY_PAGE_SIZE = 15;
  private static final String SPELL_ERROR = "SPELL ERROR";
  private static final Pattern SINGLE_ENGLISH_WORD = Pattern.compile(
    "^[\\p{IsLatin}]+(?:['-][\\p{IsLatin}]+)*$"
  );

  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final Handler mainHandler = new Handler(Looper.getMainLooper());
  private final ApiClient apiClient = new ApiClient();

  private DictionaryDatabase dictionaryDatabase;
  private HistoryDatabase historyDatabase;
  private EditText input;
  private TextView output;
  private TextView status;
  private TextView phonetic;
  private LinearLayout pronunciation;
  private Button translateButton;
  private Button speakButton;
  private HexagramLoaderView loader;
  private TextToSpeech textToSpeech;
  private boolean textToSpeechInitialized;
  private boolean textToSpeechReady;
  private String currentSpeechText = "";
  private String pendingSpeechText;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.WHITE);
    getWindow().setNavigationBarColor(Color.WHITE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      getWindow().setDecorFitsSystemWindows(false);
    } else {
      getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
      );
    }

    dictionaryDatabase = new DictionaryDatabase(this);
    historyDatabase = new HistoryDatabase(this);
    textToSpeech = new TextToSpeech(this, this);
    setContentView(createContentView());

    if (savedInstanceState != null) restoreState(savedInstanceState);
    executor.execute(() -> {
      try {
        dictionaryDatabase.prepare();
      } catch (IOException error) {
        mainHandler.post(() -> setStatus("Dictionary unavailable"));
      }
    });
  }

  private View createContentView() {
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);
    int horizontalPadding = dp(16);
    int topPadding = dp(12);
    int bottomPadding = dp(12);
    root.setPadding(horizontalPadding, topPadding, horizontalPadding, bottomPadding);
    root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
      int left;
      int top;
      int right;
      int bottom;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Insets systemBars = windowInsets.getInsets(WindowInsets.Type.systemBars());
        left = systemBars.left;
        top = systemBars.top;
        right = systemBars.right;
        bottom = systemBars.bottom;
      } else {
        left = windowInsets.getSystemWindowInsetLeft();
        top = windowInsets.getSystemWindowInsetTop();
        right = windowInsets.getSystemWindowInsetRight();
        bottom = windowInsets.getSystemWindowInsetBottom();
      }
      view.setPadding(
        horizontalPadding + left,
        topPadding + top,
        horizontalPadding + right,
        bottomPadding + bottom
      );
      return windowInsets;
    });
    root.setLayoutParams(matchParent());
    root.requestApplyInsets();

    root.addView(createHeader());
    root.addView(createInputHeader());

    input = new EditText(this);
    input.setTextColor(COLOR_TEXT);
    input.setHintTextColor(Color.rgb(156, 163, 175));
    input.setHint("输入中文或英文");
    input.setTextSize(16);
    input.setGravity(Gravity.TOP | Gravity.START);
    input.setPadding(dp(12), dp(12), dp(12), dp(12));
    input.setBackground(null);
    input.setInputType(
      InputType.TYPE_CLASS_TEXT |
      InputType.TYPE_TEXT_FLAG_MULTI_LINE |
      InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    );
    input.setImeOptions(EditorInfo.IME_ACTION_DONE);
    input.setMaxLines(7);
    input.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(190)));
    input.setOnEditorActionListener((view, actionId, event) -> {
      boolean enter = event != null &&
        event.getKeyCode() == KeyEvent.KEYCODE_ENTER &&
        event.getAction() == KeyEvent.ACTION_DOWN;
      if (actionId == EditorInfo.IME_ACTION_DONE || enter) {
        startTranslation();
        return true;
      }
      return false;
    });
    root.addView(input);
    root.addView(divider());
    root.addView(createResultHeader());

    FrameLayout resultArea = new FrameLayout(this);
    resultArea.setLayoutParams(
      new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f)
    );

    ScrollView resultScroll = new ScrollView(this);
    resultScroll.setFillViewport(true);
    resultScroll.setLayoutParams(matchParent());
    output = new TextView(this);
    output.setTextColor(COLOR_TEXT);
    output.setTextSize(16);
    output.setGravity(Gravity.TOP | Gravity.START);
    output.setTextIsSelectable(true);
    output.setPadding(dp(12), dp(14), dp(12), dp(14));
    resultScroll.addView(output, matchWidthWrap());
    resultArea.addView(resultScroll);

    loader = new HexagramLoaderView(this);
    loader.setVisibility(View.GONE);
    loader.setLayoutParams(matchParent());
    resultArea.addView(loader);
    root.addView(resultArea);
    root.addView(createBottomActions());
    return root;
  }

  private View createHeader() {
    LinearLayout header = new LinearLayout(this);
    header.setOrientation(LinearLayout.HORIZONTAL);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setPadding(0, 0, 0, dp(10));
    header.setLayoutParams(
      new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    );

    LinearLayout brand = new LinearLayout(this);
    brand.setOrientation(LinearLayout.VERTICAL);
    brand.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    TextView title = label("Vocabulary", 21, COLOR_TEXT);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    brand.addView(title);
    TextView meta = label("English / Chinese", 12, COLOR_MUTED);
    meta.setPadding(0, dp(2), 0, 0);
    brand.addView(meta);
    header.addView(brand);

    status = label("Ready", 12, COLOR_MUTED);
    status.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
    status.setMaxLines(1);
    status.setEllipsize(TextUtils.TruncateAt.END);
    header.addView(status, new LinearLayout.LayoutParams(dp(130), dp(40)));
    return header;
  }

  private View createInputHeader() {
    LinearLayout row = paneHeader();
    TextView title = label("Input", 14, COLOR_MUTED);
    row.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    translateButton = createButton("Translate", true);
    translateButton.setOnClickListener(view -> startTranslation());
    row.addView(translateButton, buttonParams(92));
    return row;
  }

  private View createResultHeader() {
    LinearLayout row = paneHeader();
    TextView title = label("Result", 14, COLOR_MUTED);
    row.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

    pronunciation = new LinearLayout(this);
    pronunciation.setOrientation(LinearLayout.HORIZONTAL);
    pronunciation.setGravity(Gravity.CENTER_VERTICAL);
    pronunciation.setVisibility(View.GONE);

    phonetic = label("", 13, COLOR_MUTED);
    phonetic.setSingleLine(true);
    phonetic.setEllipsize(TextUtils.TruncateAt.END);
    pronunciation.addView(
      phonetic,
      new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    );

    speakButton = createButton("Speak", false);
    speakButton.setOnClickListener(view -> speakCurrentText());
    LinearLayout.LayoutParams speakParams = buttonParams(68);
    speakParams.setMarginStart(dp(8));
    pronunciation.addView(speakButton, speakParams);
    row.addView(pronunciation, new LinearLayout.LayoutParams(dp(205), dp(32)));
    return row;
  }

  private View createBottomActions() {
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
    row.setPadding(0, dp(12), 0, 0);
    row.setLayoutParams(
      new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44))
    );

    Button clear = createButton("Clear", false);
    clear.setOnClickListener(view -> clear());
    row.addView(clear, buttonParams(76));

    Button history = createButton("History", false);
    history.setOnClickListener(view -> showHistory());
    LinearLayout.LayoutParams historyParams = buttonParams(82);
    historyParams.setMarginStart(dp(8));
    row.addView(history, historyParams);
    return row;
  }

  private void startTranslation() {
    String source = input.getText().toString().trim();
    hideKeyboard();
    if (source.isEmpty()) {
      setStatus("Text required");
      return;
    }

    setLoading(true);
    setPronunciation("", "");
    setStatus(isSingleEnglishWord(source) ? "Searching offline" : "Translating");

    executor.execute(() -> {
      try {
        DisplayResult result = isSingleEnglishWord(source)
          ? lookupOffline(source)
          : translateOnline(source);
        if (!SPELL_ERROR.equals(result.translation)) {
          historyDatabase.insert(
            result.text,
            result.translation,
            result.phonetic,
            result.speech
          );
        }
        mainHandler.post(() -> showResult(result));
      } catch (Exception error) {
        mainHandler.post(() -> showError(error));
      }
    });
  }

  private DisplayResult lookupOffline(String source) throws IOException {
    DictionaryDatabase.Entry entry = dictionaryDatabase.lookup(source);
    if (entry == null) return new DisplayResult(source, SPELL_ERROR, "", "");
    return new DisplayResult(
      entry.word,
      entry.translation,
      normalizePhonetic(entry.phonetic),
      entry.word
    );
  }

  private DisplayResult translateOnline(String source) throws IOException {
    ApiClient.Result result = apiClient.translate(source);
    return new DisplayResult(
      result.text,
      result.translatedText,
      result.phoneticText,
      result.speechText
    );
  }

  private void showResult(DisplayResult result) {
    if (!result.text.equals(input.getText().toString().trim())) input.setText(result.text);
    output.setText(result.translation);
    setPronunciation(result.phonetic, result.speech);
    setLoading(false);
    setStatus("Done");
  }

  private void showError(Exception error) {
    setLoading(false);
    if (error instanceof UnknownHostException) {
      setStatus("Network unavailable");
    } else if (error instanceof SocketTimeoutException) {
      setStatus("Request timed out");
    } else {
      String message = error.getMessage();
      setStatus(message == null || message.trim().isEmpty() ? "Request failed" : message);
    }
  }

  private void clear() {
    input.setText("");
    output.setText("");
    setPronunciation("", "");
    setLoading(false);
    setStatus("Ready");
    input.requestFocus();
    input.post(() -> {
      InputMethodManager manager = (InputMethodManager) getSystemService(
        Context.INPUT_METHOD_SERVICE
      );
      if (manager != null) manager.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
    });
  }

  private void setLoading(boolean loading) {
    translateButton.setEnabled(!loading);
    loader.setVisibility(loading ? View.VISIBLE : View.GONE);
    if (loading) loader.start(); else loader.stop();
  }

  private void setPronunciation(String phoneticText, String speechText) {
    currentSpeechText = speechText == null ? "" : speechText.trim();
    String cleanPhonetic = phoneticText == null ? "" : phoneticText.trim();
    phonetic.setText(cleanPhonetic);
    pronunciation.setVisibility(currentSpeechText.isEmpty() ? View.GONE : View.VISIBLE);
    speakButton.setEnabled(!currentSpeechText.isEmpty());
  }

  private void setStatus(String value) {
    status.setText(value);
  }

  private boolean isSingleEnglishWord(String value) {
    return SINGLE_ENGLISH_WORD.matcher(DictionaryDatabase.normalizeWord(value)).matches();
  }

  private String normalizePhonetic(String value) {
    String clean = value == null ? "" : value.trim();
    if (clean.isEmpty() || (clean.startsWith("/") && clean.endsWith("/"))) return clean;
    if (clean.startsWith("[") && clean.endsWith("]")) return clean;
    return "/" + clean + "/";
  }

  private void hideKeyboard() {
    input.clearFocus();
    InputMethodManager manager = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
    if (manager != null) manager.hideSoftInputFromWindow(input.getWindowToken(), 0);
  }

  private void showHistory() {
    Dialog dialog = new Dialog(this, R.style.AppTheme);
    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setBackgroundColor(Color.WHITE);

    LinearLayout header = new LinearLayout(this);
    header.setGravity(Gravity.CENTER_VERTICAL);
    header.setPadding(dp(32), 0, dp(32), 0);
    TextView title = label("History", 16, COLOR_TEXT);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    Button close = createButton("Close", false);
    close.setOnClickListener(view -> dialog.dismiss());
    header.addView(close, buttonParams(72));
    root.addView(header, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40)));
    root.addView(divider());

    ScrollView scroll = new ScrollView(this);
    scroll.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
    scroll.setScrollbarFadingEnabled(false);
    LinearLayout historyItems = new LinearLayout(this);
    historyItems.setOrientation(LinearLayout.VERTICAL);
    historyItems.setPadding(dp(32), 0, dp(32), 0);
    scroll.addView(historyItems, matchWidthWrap());
    root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

    LinearLayout footer = new LinearLayout(this);
    footer.setGravity(Gravity.CENTER_VERTICAL);
    footer.setPadding(dp(32), dp(8), dp(32), 0);
    TextView pageState = label("Page 1", 13, COLOR_MUTED);
    footer.addView(pageState, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    Button previous = createButton("Prev", false);
    Button next = createButton("Next", false);
    footer.addView(previous, buttonParams(68));
    LinearLayout.LayoutParams nextParams = buttonParams(68);
    nextParams.setMarginStart(dp(8));
    footer.addView(next, nextParams);
    footer.setVisibility(View.GONE);
    root.addView(footer, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40)));

    int[] currentPage = { 0 };
    Runnable[] loadPage = new Runnable[1];
    loadPage[0] = () -> loadHistoryPage(
      dialog,
      historyItems,
      footer,
      pageState,
      previous,
      next,
      currentPage,
      loadPage[0]
    );
    previous.setOnClickListener(view -> {
      if (currentPage[0] > 0) {
        currentPage[0] -= 1;
        loadPage[0].run();
      }
    });
    next.setOnClickListener(view -> {
      currentPage[0] += 1;
      loadPage[0].run();
    });

    int contentPadding = dp(32);
    root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
      int left;
      int top;
      int right;
      int bottom;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Insets systemBars = windowInsets.getInsets(WindowInsets.Type.systemBars());
        left = systemBars.left;
        top = systemBars.top;
        right = systemBars.right;
        bottom = systemBars.bottom;
      } else {
        left = windowInsets.getSystemWindowInsetLeft();
        top = windowInsets.getSystemWindowInsetTop();
        right = windowInsets.getSystemWindowInsetRight();
        bottom = windowInsets.getSystemWindowInsetBottom();
      }
      view.setPadding(0, top, 0, bottom);
      header.setPadding(contentPadding + left, 0, contentPadding + right, 0);
      historyItems.setPadding(contentPadding + left, 0, contentPadding + right, 0);
      footer.setPadding(contentPadding + left, dp(8), contentPadding + right, 0);
      return windowInsets;
    });

    dialog.setContentView(root);
    Window window = dialog.getWindow();
    if (window != null) {
      window.setBackgroundDrawable(new ColorDrawable(Color.WHITE));
      window.setStatusBarColor(Color.WHITE);
      window.setNavigationBarColor(Color.WHITE);
      int systemUiFlags =
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
        View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        systemUiFlags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
      }
      window.getDecorView().setSystemUiVisibility(systemUiFlags);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        window.setDecorFitsSystemWindows(false);
      }
      window.setLayout(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      );
    }
    dialog.setOnShowListener(ignored -> {
      Window shownWindow = dialog.getWindow();
      if (shownWindow != null) {
        shownWindow.setLayout(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT
        );
      }
      root.requestApplyInsets();
      loadPage[0].run();
    });
    dialog.show();
  }

  private void loadHistoryPage(
    Dialog dialog,
    LinearLayout container,
    LinearLayout footer,
    TextView pageState,
    Button previous,
    Button next,
    int[] currentPage,
    Runnable reload
  ) {
    executor.execute(() -> {
      int count = historyDatabase.count();
      int pageCount = Math.max(1, (count + HISTORY_PAGE_SIZE - 1) / HISTORY_PAGE_SIZE);
      if (currentPage[0] >= pageCount) currentPage[0] = pageCount - 1;
      List<HistoryDatabase.Entry> entries = historyDatabase.list(
        HISTORY_PAGE_SIZE,
        currentPage[0] * HISTORY_PAGE_SIZE
      );
      mainHandler.post(() -> {
        if (!dialog.isShowing()) return;
        container.removeAllViews();
        if (entries.isEmpty()) {
          TextView empty = label("No records", 13, COLOR_MUTED);
          empty.setPadding(0, dp(18), 0, 0);
          container.addView(empty);
        } else {
          for (HistoryDatabase.Entry entry : entries) {
            container.addView(createHistoryItem(entry, reload));
          }
        }
        pageState.setText(getString(R.string.history_page, currentPage[0] + 1));
        previous.setEnabled(currentPage[0] > 0);
        next.setEnabled(currentPage[0] + 1 < pageCount);
        footer.setVisibility(pageCount > 1 ? View.VISIBLE : View.GONE);
      });
    });
  }

  private View createHistoryItem(HistoryDatabase.Entry entry, Runnable reload) {
    LinearLayout item = new LinearLayout(this);
    item.setOrientation(LinearLayout.VERTICAL);
    item.setPadding(0, dp(14), 0, dp(14));

    TextView source = label(entry.source, 13, COLOR_TEXT);
    source.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    item.addView(source);
    TextView translation = label(entry.translation, 13, Color.rgb(55, 65, 81));
    translation.setPadding(0, dp(7), 0, dp(7));
    item.addView(translation);

    LinearLayout actions = new LinearLayout(this);
    actions.setGravity(Gravity.CENTER_VERTICAL);
    TextView time = label(entry.createdAt, 12, COLOR_MUTED);
    actions.addView(time, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    Button delete = createTextButton("Delete", Color.rgb(159, 18, 57));
    delete.setOnClickListener(view -> executor.execute(() -> {
      historyDatabase.delete(entry.id);
      mainHandler.post(reload);
    }));
    actions.addView(delete, buttonParams(62));
    item.addView(actions, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(32)));
    item.addView(divider());
    return item;
  }

  @Override
  public void onInit(int result) {
    textToSpeechInitialized = true;
    if (result != TextToSpeech.SUCCESS || textToSpeech == null) return;
    textToSpeechReady = configureLanguage(Locale.US) || configureLanguage(Locale.ENGLISH);
    if (!textToSpeechReady) return;

    textToSpeech.setSpeechRate(0.9f);
    textToSpeech.setPitch(1.05f);
    selectAmericanVoice();
    if (pendingSpeechText != null) {
      String pending = pendingSpeechText;
      pendingSpeechText = null;
      speak(pending);
    }
  }

  private boolean configureLanguage(Locale locale) {
    int result = textToSpeech.setLanguage(locale);
    return result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED;
  }

  private void selectAmericanVoice() {
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
      if (
        name != null &&
        name.toLowerCase(Locale.US).matches(
          ".*(female|woman|samantha|victoria|allison|ava|susan|zira|jenny|aria|joanna|kendra|salli).*"
        )
      ) {
        textToSpeech.setVoice(voice);
        return;
      }
    }
    if (fallback != null) textToSpeech.setVoice(fallback);
  }

  private void speakCurrentText() {
    if (currentSpeechText.isEmpty()) return;
    if (!textToSpeechInitialized) {
      pendingSpeechText = currentSpeechText;
      setStatus("Preparing speech");
      return;
    }
    if (!textToSpeechReady) {
      setStatus("Speech unavailable");
      return;
    }
    speak(currentSpeechText);
  }

  private void speak(String text) {
    textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vocabulary-speech");
    setStatus("Speaking");
  }

  private LinearLayout paneHeader() {
    LinearLayout row = new LinearLayout(this);
    row.setOrientation(LinearLayout.HORIZONTAL);
    row.setGravity(Gravity.CENTER_VERTICAL);
    row.setLayoutParams(
      new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(40))
    );
    return row;
  }

  private Button createButton(String text, boolean primary) {
    Button button = new Button(this);
    button.setText(text);
    button.setTextSize(13);
    button.setAllCaps(false);
    button.setGravity(Gravity.CENTER);
    button.setMinHeight(0);
    button.setMinimumHeight(0);
    button.setMinWidth(0);
    button.setMinimumWidth(0);
    button.setPadding(dp(10), 0, dp(10), 0);
    button.setElevation(0);
    button.setStateListAnimator(null);
    button.setTextColor(primary ? Color.WHITE : COLOR_TEXT);
    GradientDrawable background = new GradientDrawable();
    background.setColor(primary ? COLOR_TEXT : Color.WHITE);
    background.setCornerRadius(0);
    if (!primary) background.setStroke(dp(1), Color.rgb(209, 213, 219));
    button.setBackground(background);
    return button;
  }

  private Button createTextButton(String text, int color) {
    Button button = createButton(text, false);
    button.setTextColor(color);
    button.setBackgroundColor(Color.TRANSPARENT);
    button.setPadding(0, 0, 0, 0);
    return button;
  }

  private TextView label(String text, float size, int color) {
    TextView view = new TextView(this);
    view.setText(text);
    view.setTextSize(size);
    view.setTextColor(color);
    view.setGravity(Gravity.CENTER_VERTICAL | Gravity.START);
    return view;
  }

  private View divider() {
    View divider = new View(this);
    divider.setBackgroundColor(COLOR_BORDER);
    divider.setLayoutParams(
      new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
    );
    return divider;
  }

  private LinearLayout.LayoutParams buttonParams(int widthDp) {
    return new LinearLayout.LayoutParams(dp(widthDp), dp(32));
  }

  private ViewGroup.LayoutParams matchParent() {
    return new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    );
  }

  private ViewGroup.LayoutParams matchWidthWrap() {
    return new ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    );
  }

  private int dp(float value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private void restoreState(Bundle state) {
    input.setText(state.getString("input", ""));
    output.setText(state.getString("output", ""));
    setPronunciation(state.getString("phonetic", ""), state.getString("speech", ""));
  }

  @Override
  protected void onSaveInstanceState(Bundle state) {
    super.onSaveInstanceState(state);
    state.putString("input", input.getText().toString());
    state.putString("output", output.getText().toString());
    state.putString("phonetic", phonetic.getText().toString());
    state.putString("speech", currentSpeechText);
  }

  @Override
  protected void onDestroy() {
    loader.stop();
    executor.shutdownNow();
    dictionaryDatabase.close();
    historyDatabase.close();
    if (textToSpeech != null) {
      textToSpeech.stop();
      textToSpeech.shutdown();
    }
    super.onDestroy();
  }

  private static final class DisplayResult {
    final String text;
    final String translation;
    final String phonetic;
    final String speech;

    DisplayResult(String text, String translation, String phonetic, String speech) {
      this.text = text;
      this.translation = translation;
      this.phonetic = phonetic;
      this.speech = speech;
    }
  }
}
