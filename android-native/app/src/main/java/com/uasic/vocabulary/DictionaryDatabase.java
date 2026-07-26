package com.uasic.vocabulary;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.Normalizer;
import java.util.Locale;

final class DictionaryDatabase {
  private static final String ASSET_NAME = "dictionary.db";
  private static final String DATABASE_NAME = "dictionary-v1.db";

  private final Context context;
  private SQLiteDatabase database;

  DictionaryDatabase(Context context) {
    this.context = context.getApplicationContext();
  }

  synchronized void prepare() throws IOException {
    ensureOpen();
  }

  synchronized Entry lookup(String input) throws IOException {
    ensureOpen();
    String key = normalizeWord(input);
    try (
      Cursor cursor = database.rawQuery(
        "SELECT word, phonetic, translation FROM entries WHERE key = ? LIMIT 1",
        new String[] { key }
      )
    ) {
      if (!cursor.moveToFirst()) return null;
      return new Entry(cursor.getString(0), cursor.getString(1), cursor.getString(2));
    }
  }

  synchronized void close() {
    if (database != null) {
      database.close();
      database = null;
    }
  }

  static String normalizeWord(String value) {
    return Normalizer.normalize(value, Normalizer.Form.NFKC)
      .trim()
      .toLowerCase(Locale.US)
      .replace('\u2018', '\'')
      .replace('\u2019', '\'')
      .replace('\u2010', '-')
      .replace('\u2011', '-')
      .replace('\u2012', '-')
      .replace('\u2013', '-')
      .replace('\u2014', '-')
      .replace('\u2015', '-');
  }

  private void ensureOpen() throws IOException {
    if (database != null && database.isOpen()) return;

    File target = context.getDatabasePath(DATABASE_NAME);
    if (!target.exists()) copyAsset(target);
    database = SQLiteDatabase.openDatabase(target.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
  }

  private void copyAsset(File target) throws IOException {
    File parent = target.getParentFile();
    if (parent != null && !parent.exists() && !parent.mkdirs()) {
      throw new IOException("Could not create the dictionary directory");
    }

    File temporary = new File(target.getAbsolutePath() + ".tmp");
    if (temporary.exists() && !temporary.delete()) {
      throw new IOException("Could not replace the temporary dictionary");
    }

    try (
      InputStream input = context.getAssets().open(ASSET_NAME);
      FileOutputStream output = new FileOutputStream(temporary)
    ) {
      byte[] buffer = new byte[64 * 1024];
      int read;
      while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
      output.getFD().sync();
    }

    if (!temporary.renameTo(target)) {
      temporary.delete();
      throw new IOException("Could not install the offline dictionary");
    }
  }

  static final class Entry {
    final String word;
    final String phonetic;
    final String translation;

    Entry(String word, String phonetic, String translation) {
      this.word = word;
      this.phonetic = phonetic;
      this.translation = translation;
    }
  }
}
