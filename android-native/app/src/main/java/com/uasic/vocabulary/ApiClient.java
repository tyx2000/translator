package com.uasic.vocabulary;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONException;
import org.json.JSONObject;

final class ApiClient {
  private static final String TRANSLATE_URL =
    "https://vocabulary-worker.uasic.workers.dev/api/translate";

  Result translate(String text) throws IOException {
    HttpURLConnection connection = (HttpURLConnection) new URL(TRANSLATE_URL).openConnection();
    connection.setRequestMethod("POST");
    connection.setConnectTimeout(15_000);
    connection.setReadTimeout(60_000);
    connection.setDoOutput(true);
    connection.setRequestProperty("Accept", "application/json");
    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");

    try {
      byte[] requestBody;
      try {
        requestBody = new JSONObject().put("text", text).toString().getBytes(StandardCharsets.UTF_8);
      } catch (JSONException error) {
        throw new IOException("Could not create the translation request", error);
      }

      connection.setFixedLengthStreamingMode(requestBody.length);
      try (OutputStream output = connection.getOutputStream()) {
        output.write(requestBody);
      }

      int status = connection.getResponseCode();
      InputStream stream = status >= 200 && status < 300
        ? connection.getInputStream()
        : connection.getErrorStream();
      String body = readBody(stream);

      try {
        JSONObject json = new JSONObject(body);
        if (status < 200 || status >= 300) {
          throw new IOException(json.optString("error", "Translation request failed"));
        }

        String translatedText = json.optString("translatedText", "").trim();
        if (translatedText.isEmpty()) throw new IOException("The service returned an empty translation");
        return new Result(
          json.optString("text", text).trim(),
          translatedText,
          json.optString("phoneticText", "").trim(),
          json.optString("speechText", "").trim()
        );
      } catch (JSONException error) {
        throw new IOException("The service returned an invalid response", error);
      }
    } finally {
      connection.disconnect();
    }
  }

  private static String readBody(InputStream stream) throws IOException {
    if (stream == null) return "";
    StringBuilder result = new StringBuilder();
    try (
      BufferedReader reader = new BufferedReader(
        new InputStreamReader(stream, StandardCharsets.UTF_8)
      )
    ) {
      char[] buffer = new char[4096];
      int read;
      while ((read = reader.read(buffer)) != -1) result.append(buffer, 0, read);
    }
    return result.toString();
  }

  static final class Result {
    final String text;
    final String translatedText;
    final String phoneticText;
    final String speechText;

    Result(String text, String translatedText, String phoneticText, String speechText) {
      this.text = text;
      this.translatedText = translatedText;
      this.phoneticText = phoneticText;
      this.speechText = speechText;
    }
  }
}
