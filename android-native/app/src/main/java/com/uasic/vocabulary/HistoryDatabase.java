package com.uasic.vocabulary;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

final class HistoryDatabase extends SQLiteOpenHelper {
  private static final String DATABASE_NAME = "history.db";
  private static final int DATABASE_VERSION = 1;

  HistoryDatabase(Context context) {
    super(context, DATABASE_NAME, null, DATABASE_VERSION);
  }

  @Override
  public void onCreate(SQLiteDatabase database) {
    database.execSQL(
      "CREATE TABLE history (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT," +
      "source_text TEXT NOT NULL," +
      "translated_text TEXT NOT NULL," +
      "phonetic_text TEXT NOT NULL," +
      "speech_text TEXT NOT NULL," +
      "created_at TEXT NOT NULL" +
      ")"
    );
  }

  @Override
  public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {}

  synchronized void insert(String source, String translation, String phonetic, String speech) {
    ContentValues values = new ContentValues();
    values.put("source_text", source);
    values.put("translated_text", translation);
    values.put("phonetic_text", phonetic);
    values.put("speech_text", speech);
    values.put(
      "created_at",
      new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date())
    );
    getWritableDatabase().insertOrThrow("history", null, values);
  }

  synchronized List<Entry> list(int limit, int offset) {
    List<Entry> entries = new ArrayList<>();
    try (
      Cursor cursor = getReadableDatabase().query(
        "history",
        new String[] {
          "id",
          "source_text",
          "translated_text",
          "phonetic_text",
          "speech_text",
          "created_at",
        },
        null,
        null,
        null,
        null,
        "id DESC",
        offset + "," + limit
      )
    ) {
      while (cursor.moveToNext()) {
        entries.add(
          new Entry(
            cursor.getLong(0),
            cursor.getString(1),
            cursor.getString(2),
            cursor.getString(3),
            cursor.getString(4),
            cursor.getString(5)
          )
        );
      }
    }
    return entries;
  }

  synchronized int count() {
    try (Cursor cursor = getReadableDatabase().rawQuery("SELECT count(*) FROM history", null)) {
      return cursor.moveToFirst() ? cursor.getInt(0) : 0;
    }
  }

  synchronized void delete(long id) {
    getWritableDatabase().delete("history", "id = ?", new String[] { String.valueOf(id) });
  }

  static final class Entry {
    final long id;
    final String source;
    final String translation;
    final String phonetic;
    final String speech;
    final String createdAt;

    Entry(long id, String source, String translation, String phonetic, String speech, String createdAt) {
      this.id = id;
      this.source = source;
      this.translation = translation;
      this.phonetic = phonetic;
      this.speech = speech;
      this.createdAt = createdAt;
    }
  }
}
