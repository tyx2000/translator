type TranslationRequest = {
  text?: unknown;
};

type TranslationRow = {
  id: number;
  source_text: string;
  translated_text: string;
  phonetic_text: string | null;
  speech_text: string | null;
  cache_key: string;
  created_at: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const ICON_HEADERS = {
  "content-type": "image/png",
  "cache-control": "public, max-age=31536000, immutable",
};

const FIXED_MODEL = "deepseek-v4-flash";
const PROMPT_VERSION = "plain-translation-v21";
const FAVICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAA1vSURBVFhHXZZ3VNRnvsbn/3vPPeee3T0n5+5uNrvJZs1NbhJDorFERUFiEOnD0HuvUocu0qQIVgQVQbqIgkhRehGBkWpBI4gtCbY3YKzIzHzuq7t/7XvOM+9v/vo+3/Y8ryJkWDsTotGLjNFFsUPzRjg3LYn8qSXR+0wrel9oRbe8O59qxeCiVtzWa8VjvU78pteLxX/h8RudeLKkE3OvXom5+w/Em+4x8ab9knh2tl+Iuk6h7xwVszV9InrPbfFN6guxJuOF2Jj7Wpgc0AujPN2Mwn9E90w9Bd5D4NoDQRpoeQYL/BO/SdyW6HgJj+S9KPHvRyuxoF3i6dQtfqls4lp5HaXxaZxKyGKuuoVfT/VzcM8g2QduoMx9wpqsJTbvB+Pd+mcK31Gd8B0Dtwt6XHt1qMd1nFzQMYqen9AxL+8xrZ78K3rKp18xJ4M9l3hL5LXEE4l7ErPzv7FwY5r9KUnsSoknKTaOvoPHKApOYK6sgYtlA9gljBKTdQmPjCnWpS+wIWtRvCPgPwG+l3R4XdSTMKWj7ImO/bd0NEoiIzJ4z/PXpDVewyurhfTaQepnHjC5uMS116+5KtPXPNfT/rOWlku/0FBRyfMnM7x58YSalFziTNwo9IznRU0TvcWdrIu9jmXqNJZpt1mz46EkMPJPArIVBFzS49Grx++CjpB+PZlX9ZTc01I69CNR+c0EpDfjEncKY+c0kk8OUveLngpJtHJGR6Gs0AHNEhWNMzR33GBJ3KMgLo3t9n5Em3tz1C2Rp1VNjFQP4Zo5iXfePbx3XBIKb0nA718V8Nfoce+WJLp1RAxLErItYV2vOHF1jsRDHbipj2Pmt59vzSIxMPYisHSc2D496i4d4e16Yup/Q116i4jsBlpPluPs6orKyQWltQOeRi4UOsegr21BUzNEUulV4g9eEQr3ITkD42+HUEfQiJ5QWYngizpiRrR4dUoybXqOjdzHNTidkqIDFOzPwUy5nU83efHDzvO4NIKqVo9dtZ5t5RC2p5nECH9CgrZjZWWDo70Lpt+b8+E/DFCFV1K2s5TXxxu43jZEYeesUKRc1go/OYTeQ3r8ZdaRozqybmqJlbeXzCpQtiKy6Q7bM4tkX+VYzt/FyDYA28p7uHWAdZ0eyxN6zCpBWf6SnWk5xEVFERMZh7OTG/Z2TlibW2K2fC2xKWfZf3WR0b5xXlY0c+V0i1A81mpF/l0Iltn7D+rIkf088rOsgEaLW5sOb1lix1Nz5J6+SHNrE3dujBOVXYRqdxP2ja+wbwGb0zrM68C+7CFJySkkxMTi4+WHk8z+8y9XceJkE+15h4g1jyS77xGtL/QMXbjCVGGdUEy+WRLVctmDZOnjrunIuCH7L9vhI+fAreMt9Ni2Q/PNX6nYl0FaUhLu9k64mJth7J2MvayCfaskcUqPqSQReGgQf0fHd8E93bxYsdqEvSdGGS0vZfvmQOKbH7Pn8iI1ctM0w9eFQqPTig650IfltO+bWeLMQy2Jl7Qoz8vM26Q+dIFnp5b61jZCfX3w8wjAy8UbB6UjBssNWL7RCmXNzzieA6uz4JN1BidzC2wsbHF39WLLlm14e/hRkFXO7ppJame1lM/oqX2ko/nCDaG4LuVUdoCnUnRe63TyV8+83P2zd7Qkyzlw7pXtOT7A6YpiYmVfE6MTJQEvvjc2ZdnHy/hixXpUpx/jeB5smyThpGLclXaorO1RSZJKGxXfrVzFOjMvjo4+4rKM1fk2+M9vaJ+aE4qbOp2QKsuSxL+fRlkNZSfsPD9L26kqfDx98fPyx8PJgx+MTNjkvB3zM/MoJUnrZinlzXqi4tNxUTni4xuCn3+kRDgWNo588P6fMZL6EVmuoWhCy7CU++rrS0JxSw7h22A6ibfSuiAr8EjinkSj0BIit8O3X0dYXDqONrbYKx2wk9ltMTYhKDmf+NbHRJXfxL7qMW5nFonJryA2NIykiDgiYjOJiU0jNCKeNYZb+GqFId+sNkV9eoEDI5DWrhWKC6+14lcZ+L4M+NZ0pC/R/1K24IlUwVkdCVIj/Pu1hMWk4enggruzB6F+QRyMikQT7o/GzowpV1vOSdGpDkkiOvUgqQFBJISqCVenExWTSnRsKr6BURgam/H11ytQJZ8jqEGKX8UboTh4XyvKpe11Lerpff2GxukblN7VUzgDOZOQJZF9bYmw6GSc7Z2xsXWmOCeXW9FhaII86A/1ZdB2K93WEuabyXV0IDA8kYj4DCLiMlAn7CIqKhF1ZDyBkvgmw40Yqi9idhi25D8XivtvtGKvtLgUGbD4zgJ1k0MU/ThP2fQCBVdfsf+GXEG5MlHJ6bh7+ZKWEcdw2SHaHaypV4dTVJRGqTqMYQcbepUWlGzZzA7vAMJDY4gOipQtSMY/+RhWORpMo09jkTrI1iIdpoekHee9lGv4SicqhY6muw+Yna3h+XQq9ycyeX0zmYFbA6TfgvI7S+zK3klVoT9790YztjuDYz72dDYeY/p6Gz9eHqDWUUWLhSnpJkYkbDBkt5x+tZsnQb5JWFYuYnECzKskysCyWN5H4Id90o6rf9GLcwtaHty9hKYhgYnmIO4PRjLd7Ibm4j7ipmVlxn5koCECdYwnFip39sbFURkfKSf3sZwYeCCr5r96LdHrNxKnkusWv5O2oFA6wsMI29GAley3bbUOm0od1uUSpTqsSmBboU4oih/rRa18YXRdH6e1toqJnlLOFHqTHW7HzEgGpzorpMUWk5STh42TD0YmJri4OBEX4kjz0VTGT1dwf7SfAO9AVhmb45bewOXsPC6kpPHqRBUxuV3vCDic1KGq0eFQC04nwVHCovCVUByf14uSV3InJQnd0rzMZ4G+4kTyC+Ipm+jk9AFnYrf7kRgVSnqQBcFO3+Pt6clWGwdWL/ucMJUKTW87j25PcTQ1ka+MVPSU1DOz/xBPqmsI3t2Pg1RJT+kZHlIpbYofsnlnL2u2l/OhiY0UoofzonF6jvi+G0yMTHCzshKNKpTEDRvJ2RdP1cUS6s4Wc3ivmsx4T9ylGDm4BeLlHcTxklKuTwwxM9xDw+EDWG824o9fbGRPURv6lhbmjpTgm3oO89J7bEqu5xufDD6SVfrLt1/yPwZ/4w+f/UUoDOyixP9ahvNf0iiSrcLoXb2NqjVmlEsddw7zxCzUlezDaaSkpuDg7kd25knfEyPlr2Hr97779Za7gSSycv7N2DheI7U4UwMvtPqo4cpLOjnpaek1TuTSXBV4nayRQHk7UsX/mNzFhw9+5tbt+5xfWpKWJluYv27EUdHYN3aOS7FoSpk/ENDmfzFjPMLVVYy82xlCvp5uFCYJAPXl6eeHt74x8QQEJiEpFRMUKRnhnyrKSsgLjYndyaGOH47jzWrd2InTSWHdERZGVl0dQqpUyeZ8/mmb19i6xde/ALCEepdJX2aoJKzoWPty9Hjhylvb2DgYGLjIyOMT5xmfHJy0xevia/r3L12nUm5f/RkTEmxiflo1TzTDE2OjUzNTUjerr7xJWRYVFXVS3qTp0RTU3NYmB4SPRd6BNzD34Wi69filuz0yJ9V56Ijk8SMep4ER4RLcrKy0Vba7MYHhoQV65dFuOTY2J0YlSMjI2IMfk9OTkpRkfHxMDAoBgcHBI9PT2iq6tL9Pf3i/b29pn/B1prQWO0l3IOAAAAAElFTkSuQmCC";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return html(simpleAppHtml());
    }

    if (request.method === "GET" && url.pathname === "/favicon.ico") {
      return png(FAVICON_PNG_BASE64);
    }

    try {
      if (request.method === "POST" && url.pathname === "/api/translate") {
        return await translate(request, env, ctx);
      }

      if (request.method === "GET" && url.pathname === "/api/translations") {
        return await listTranslations(url, env);
      }

      const translationId = matchId(url.pathname, "/api/translations/");
      if (translationId && request.method === "DELETE") {
        return await deleteTranslation(translationId, env);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof HttpError ? error.message : "Internal server error";
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error(error);
      return json({ error: message }, status);
    }
  },
} satisfies ExportedHandler<Env>;

async function translate(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson<TranslationRequest>(request);
  const text = requiredString(body.text, "text");
  const cacheKey = await sha256(JSON.stringify({ text, model: FIXED_MODEL, promptVersion: PROMPT_VERSION }));

  const cached = await env.TRANSLATION_CACHE.get(`translation:${cacheKey}`, "json");
  if (isCachedTranslation(cached)) {
    const payload = translationPayload(cached);
    if (payload.translatedText === "拼写错误") {
      ctx.waitUntil(env.TRANSLATION_CACHE.delete(`translation:${cacheKey}`));
      return spellingErrorResponse(payload.text);
    }
    return json({ ...payload, cached: true });
  }

  const existing = await env.DB.prepare(
    `SELECT * FROM translations WHERE cache_key = ? LIMIT 1`,
  )
    .bind(cacheKey)
    .first<TranslationRow>();

  if (existing) {
    const payload = translationResponse(existing);
    if (payload.translatedText === "拼写错误") {
      return spellingErrorResponse(payload.text);
    }
    ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
    return json({ ...payload, cached: true });
  }

  if (!isSingleEnglishWord(text)) {
    const existingByText = await env.DB.prepare(
      `
        SELECT * FROM translations
        WHERE lower(source_text) = lower(?)
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
      .bind(text)
      .first<TranslationRow>();

    if (existingByText) {
      const payload = translationResponse(existingByText);
      if (payload.translatedText === "拼写错误") {
        return spellingErrorResponse(payload.text);
      }
      ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
      return json({ ...payload, cached: true });
    }
  }

  const deepseek = await requestDeepSeekTranslation(env, text);
  if (deepseek.translatedText === "拼写错误") {
    return spellingErrorResponse(deepseek.correctedText);
  }

  await env.DB.prepare(
    `
      INSERT INTO translations (
        source_text,
        translated_text,
        phonetic_text,
        speech_text,
        cache_key
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        translated_text = excluded.translated_text,
        phonetic_text = excluded.phonetic_text,
        speech_text = excluded.speech_text
    `,
  )
    .bind(
      deepseek.correctedText,
      deepseek.translatedText,
      deepseek.phoneticText,
      deepseek.speechText,
      cacheKey,
    )
    .run();

  const saved = await env.DB.prepare(`SELECT * FROM translations WHERE cache_key = ? LIMIT 1`)
    .bind(cacheKey)
    .first<TranslationRow>();

  if (!saved) {
    throw new HttpError(500, "Translation was generated but could not be saved");
  }

  const payload = translationResponse(saved);
  ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
  return json({ ...payload, cached: false }, 201);
}

async function requestDeepSeekTranslation(
  env: Env,
  text: string,
): Promise<{ correctedText: string; translatedText: string; phoneticText: string; speechText: string }> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new HttpError(500, "DEEPSEEK_API_KEY secret is not configured");
  }

  const baseUrl = trimTrailingSlash(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  const parsed = await requestDeepSeekCompletion(env, baseUrl, text, buildSystemPrompt(), jsonTokenBudget(text));
  const normalized = normalizeDeepSeekResult(parsed, text);
  if (normalized.translatedText) {
    if (shouldVerifySpellingError(text, normalized.translatedText)) {
      const verified = normalizeDeepSeekResult(await requestPlainTranslation(env, baseUrl, text), text);
      if (verified.translatedText && verified.translatedText !== "拼写错误") return verified;
    }
    if (shouldExpandSingleWordTranslation(text, normalized.translatedText)) {
      const expanded = normalizeDeepSeekResult(await requestPlainTranslation(env, baseUrl, text), text);
      if (expanded.translatedText && expanded.translatedText !== "拼写错误") return expanded;
    }
    return normalized;
  }

  const fallbackParsed = await requestDeepSeekCompletion(env, baseUrl, text, buildFallbackSystemPrompt(), jsonTokenBudget(text));
  const fallbackNormalized = normalizeDeepSeekResult(fallbackParsed, text);
  if (shouldVerifySpellingError(text, fallbackNormalized.translatedText)) {
    const verified = normalizeDeepSeekResult(await requestPlainTranslation(env, baseUrl, text), text);
    if (verified.translatedText && verified.translatedText !== "拼写错误") return verified;
  }
  if (shouldExpandSingleWordTranslation(text, fallbackNormalized.translatedText)) {
    const expanded = normalizeDeepSeekResult(await requestPlainTranslation(env, baseUrl, text), text);
    if (expanded.translatedText && expanded.translatedText !== "拼写错误") return expanded;
  }
  if (!fallbackNormalized.translatedText) {
    const plain = await requestPlainTranslation(env, baseUrl, text);
    const plainNormalized = normalizeDeepSeekResult(plain, text);
    if (plainNormalized.translatedText) {
      return plainNormalized;
    }
    if (isSingleEnglishWord(text)) {
      return {
        correctedText: text,
        translatedText: "拼写错误",
        phoneticText: "",
        speechText: "",
      };
    }
    throw new HttpError(502, "DeepSeek returned an empty translation");
  }

  return fallbackNormalized;
}

async function requestDeepSeekCompletion(
  env: Env,
  baseUrl: string,
  text: string,
  systemPrompt: string,
  maxTokens: number,
): Promise<{ correctedText: string; translatedText: string; phoneticText: string; speechText: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: FIXED_MODEL,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: JSON.stringify({ text }),
        },
      ],
    }),
  });

  const result = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new HttpError(response.status, result.error?.message ?? "DeepSeek request failed");
  }

  return parseDeepSeekTranslation(result.choices?.[0]?.message?.content?.trim() ?? "", text);
}

async function requestPlainTranslation(
  env: Env,
  baseUrl: string,
  text: string,
): Promise<{ correctedText: string; translatedText: string; phoneticText: string; speechText: string }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: FIXED_MODEL,
      temperature: 0,
      max_tokens: Math.min(800, Math.max(80, text.length * 2)),
      messages: [
        { role: "system", content: buildPlainTranslationPrompt() },
        {
          role: "user",
          content: text,
        },
      ],
    }),
  });

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!response.ok) {
    return { correctedText: text, translatedText: "", phoneticText: "", speechText: "" };
  }

  return {
    correctedText: text,
    translatedText: result.choices?.[0]?.message?.content?.trim() ?? "",
    phoneticText: "",
    speechText: "",
  };
}

function normalizeDeepSeekResult(
  parsed: { correctedText: string; translatedText: string; phoneticText: string; speechText: string },
  text: string,
): { correctedText: string; translatedText: string; phoneticText: string; speechText: string } {
  const normalized = normalizePlainTextOutput(parsed.translatedText, text);
  // A translation that still looks like JSON means parsing failed; treat it as
  // empty so the caller retries instead of storing and displaying raw JSON.
  const translatedText = looksLikeJsonPayload(normalized) ? "" : normalized;
  const isSpellingError = translatedText === "拼写错误";
  const correctedText = isSpellingError ? text : normalizeCorrectedText(parsed.correctedText, text);
  const phoneticText = normalizeMetadataText(parsed.phoneticText);
  const speechText = isSpellingError ? "" : normalizeSpeechText(parsed.speechText, text, translatedText);
  return { correctedText, translatedText, phoneticText, speechText };
}

async function listTranslations(url: URL, env: Env): Promise<Response> {
  const limit = clampNumber(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100000, 0);

  const result = await env.DB.prepare(
    `
      SELECT * FROM translations
      WHERE translated_text NOT LIKE '拼写%'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(limit, offset)
    .all<TranslationRow>();

  return json({ items: result.results.map(translationResponse), limit, offset });
}

async function deleteTranslation(id: number, env: Env): Promise<Response> {
  const row = await env.DB.prepare(`SELECT cache_key FROM translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ cache_key: string }>();
  if (!row) throw new HttpError(404, "Translation not found");

  await env.DB.prepare(`DELETE FROM translations WHERE id = ?`).bind(id).run();
  await env.TRANSLATION_CACHE.delete(`translation:${row.cache_key}`);
  return json({ ok: true });
}

function spellingErrorResponse(text: string): Response {
  return json(
    {
      id: null,
      text,
      translatedText: "拼写错误",
      phoneticText: "",
      speechText: "",
      createdAt: currentTimestamp(),
      cached: false,
    },
    200,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are an English-Chinese bidirectional translator.",
    "Return one strict JSON object only, with exactly these string fields: correctedText, translatedText, phoneticText, and speechText.",
    "Do not wrap the JSON in Markdown or code fences.",
    "The user message is JSON with a text field. Process only that text.",
    "Return only the direct corresponding translation in translatedText: English to Simplified Chinese, Chinese to natural English.",
    "Do not output explanations, examples, parts of speech, verb forms, IPA, Markdown, labels, or extra notes.",
    "For a single valid English word, return 2 to 6 common concise Simplified Chinese meanings separated by Chinese semicolons when the word has multiple senses.",
    "For issue return meanings like 问题；议题；发行；发布. For claim return meanings like 声称；主张；要求；索赔.",
    "Treat common English words such as claim, issue, fine, right, light, matter, charge, and file as valid words. Do not mark them as spelling errors.",
    "Only when the input is exactly one English word and it is clearly misspelled or not a valid English word, set translatedText to exactly 拼写错误 and keep correctedText as the original input.",
    "English phrases and English sentences are valid English input; translate them to Simplified Chinese, never return empty text for them.",
    "For any valid English input, set speechText to the original English text so it can be read aloud.",
    "For Chinese input, set speechText to the English translatedText so it can be read aloud.",
    "Set phoneticText to an empty string.",
    "Never leave translatedText empty.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFallbackSystemPrompt(): string {
  return [
    "Return strict JSON only: correctedText, translatedText, phoneticText, speechText.",
    "Translate only between English and Simplified Chinese.",
    "If input contains Chinese, translate to English.",
    "If input is English with spaces or punctuation, translate to Simplified Chinese.",
    "If input is exactly one misspelled English word, translatedText must be exactly 拼写错误.",
    "If input is a valid single English word, return 2 to 6 common concise Simplified Chinese meanings separated by Chinese semicolons when applicable.",
    "Common words like claim and issue are valid words, not spelling errors.",
    "No examples, word forms, definitions, labels, IPA, Markdown, or extra notes.",
    "speechText is English source text for valid English input, English translation for Chinese input, otherwise empty.",
    "phoneticText is empty. translatedText must not be empty.",
  ].join("\n");
}

function buildPlainTranslationPrompt(): string {
  return [
    "Translate only between English and Simplified Chinese.",
    "Return only the translated text, with no labels or explanation.",
    "For a valid single English word, return 2 to 6 common concise Chinese meanings separated by Chinese semicolons when the word has multiple senses.",
    "For issue return 问题；议题；发行；发布. For claim return 声称；主张；要求；索赔.",
    "Do not mark common valid English words as spelling errors. claim, issue, fine, right, light, matter, charge, file are valid words.",
    "Only if the input is exactly one clearly misspelled/nonexistent English word, return exactly 拼写错误.",
  ].join("\n");
}

function parseDeepSeekTranslation(
  value: string,
  originalText: string,
): { correctedText: string; translatedText: string; phoneticText: string; speechText: string } {
  const jsonText = stripCodeFences(value);

  try {
    const parsed = JSON.parse(jsonText) as {
      correctedText?: unknown;
      phoneticText?: unknown;
      speechText?: unknown;
    } & Record<string, unknown>;
    const translatedText = pickTranslationField(parsed);
    if (typeof translatedText === "string") {
      const nested = parseNestedTranslationObject(translatedText);
      return {
        correctedText: nested?.correctedText ?? (typeof parsed.correctedText === "string" ? parsed.correctedText : originalText),
        translatedText: nested?.translatedText ?? translatedText,
        phoneticText: nested?.phoneticText ?? (typeof parsed.phoneticText === "string" ? parsed.phoneticText : ""),
        speechText: nested?.speechText ?? (typeof parsed.speechText === "string" ? parsed.speechText : ""),
      };
    }
    // Valid JSON without a usable translation field: never surface the raw
    // JSON; an empty translatedText makes the caller retry with a fallback prompt.
    return { correctedText: originalText, translatedText: "", phoneticText: "", speechText: "" };
  } catch {
    const nested = parseNestedTranslationObject(value);
    if (nested) {
      return {
        correctedText: nested.correctedText ?? originalText,
        translatedText: nested.translatedText,
        phoneticText: nested.phoneticText ?? "",
        speechText: nested.speechText ?? "",
      };
    }
  }

  if (looksLikeJsonPayload(value)) {
    return { correctedText: originalText, translatedText: "", phoneticText: "", speechText: "" };
  }

  return {
    correctedText: originalText,
    translatedText: value,
    phoneticText: "",
    speechText: "",
  };
}

function parseNestedTranslationObject(
  value: string,
): { correctedText?: string; translatedText: string; phoneticText?: string; speechText?: string } | null {
  const trimmed = stripCodeFences(value);
  const start = trimmed.indexOf("{");
  if (start === -1) return null;

  const body = trimmed.slice(start);
  const end = body.lastIndexOf("}");
  const candidates = end > 0 ? [body.slice(0, end + 1), body] : [body];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        correctedText?: unknown;
        phoneticText?: unknown;
        speechText?: unknown;
      } & Record<string, unknown>;
      const translatedText = pickTranslationField(parsed);
      if (typeof translatedText !== "string") continue;
      return {
        correctedText: typeof parsed.correctedText === "string" ? parsed.correctedText : undefined,
        translatedText,
        phoneticText: typeof parsed.phoneticText === "string" ? parsed.phoneticText : undefined,
        speechText: typeof parsed.speechText === "string" ? parsed.speechText : undefined,
      };
    } catch {
      // fall through to regex extraction
    }
  }

  const translatedText =
    extractJsonStringField(body, "translatedText") ??
    extractJsonStringField(body, "translation") ??
    extractJsonStringField(body, "translated_text");
  if (!translatedText) return null;

  return {
    correctedText: extractJsonStringField(body, "correctedText"),
    translatedText,
    phoneticText: extractJsonStringField(body, "phoneticText"),
    speechText: extractJsonStringField(body, "speechText"),
  };
}

function pickTranslationField(parsed: Record<string, unknown>): string | undefined {
  for (const key of ["translatedText", "translation", "translated_text", "translated"]) {
    const candidate = parsed[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

function stripCodeFences(value: string): string {
  return value
    .replace(/^\s*```[a-zA-Z0-9_-]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function looksLikeJsonPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/"(?:correctedText|translatedText|translation|translated_text|phoneticText|speechText)"\s*:/.test(trimmed)) {
    return true;
  }
  return /^[{[]/.test(trimmed) && /"\s*:/.test(trimmed);
}

function extractJsonStringField(value: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    value.match(new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, "s")) ??
    // Truncated output: the string value never got its closing quote.
    value.match(new RegExp(`"${escapedField}"\\s*:\\s*"((?:\\\\.|[^"\\\\])+)$`, "s"));
  if (!match) return undefined;

  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  }
}

function translationResponse(row: TranslationRow) {
  const translatedText = normalizePlainTextOutput(row.translated_text, row.source_text);
  return {
    id: row.id,
    text: row.source_text,
    translatedText,
    phoneticText: normalizeMetadataText(row.phonetic_text),
    speechText: normalizeSpeechText(row.speech_text, row.source_text, translatedText),
    createdAt: row.created_at,
  };
}

function translationPayload(value: ReturnType<typeof translationResponse>) {
  const translatedText = normalizePlainTextOutput(value.translatedText, value.text);
  return {
    id: value.id,
    text: value.text,
    translatedText,
    phoneticText: normalizeMetadataText(value.phoneticText),
    speechText: normalizeSpeechText(value.speechText, value.text, translatedText),
    createdAt: value.createdAt,
  };
}

async function writeTranslationCache(
  env: Env,
  cacheKey: string,
  payload: ReturnType<typeof translationResponse>,
): Promise<void> {
  const ttl = clampNumber(env.CACHE_TTL_SECONDS, 60, 31536000, 2592000);
  await env.TRANSLATION_CACHE.put(`translation:${cacheKey}`, JSON.stringify(payload), {
    expirationTtl: ttl,
  });
}

async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new HttpError(415, "Content-Type must be application/json");
  }

  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

function clampNumber(input: string | null, min: number, max: number, fallback: number): number {
  const value = Number(input);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matchId(pathname: string, prefix: string): number | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return Number(rest);
}

function isCachedTranslation(value: unknown): value is ReturnType<typeof translationResponse> {
  return (
    typeof value === "object" &&
    value !== null &&
    "translatedText" in value &&
    typeof (value as { translatedText?: unknown }).translatedText === "string"
  );
}

function jsonTokenBudget(text: string): number {
  // The JSON reply repeats the input in correctedText/speechText plus the
  // translation itself, so scale the budget with the input length.
  return Math.min(1200, Math.max(300, text.length * 3));
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function currentTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function normalizeCorrectedText(value: string, fallback: string): string {
  const trimmed = value
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("[")) return fallback;
  return trimmed;
}

function normalizeMetadataText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpeechText(value: unknown, sourceText: string, translatedText: string): string {
  if (translatedText.trim() === "拼写错误") return "";
  const provided = normalizeMetadataText(value);
  if (provided) return provided;
  if (containsCjk(sourceText) && containsLatin(translatedText)) return translatedText.trim();
  if (containsLatin(sourceText)) return sourceText.trim();
  return "";
}

function normalizePlainTextOutput(value: string, sourceText: string): string {
  const nested = parseNestedTranslationObject(value);
  if (nested) return normalizePlainTextOutput(nested.translatedText, nested.correctedText ?? sourceText);

  const cleaned = value
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+(?:Example|例句)\s*[:：]\s*/gi, "\n  ")
    .replace(/\s+(?:Translation|翻译)\s*[:：]\s*/gi, "\n  ")
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s*[-*+]\s+/, "  ")
        .replace(/^(\s*)(?:Example|Translation|例句|翻译)\s*[:：]\s*/i, "$1"),
    )
    .join("\n")
    .trim();
  const lines = cleaned.split("\n");
  const withoutTitle =
    lines.length > 1 && lines[0]?.trim().toLowerCase() === sourceText.trim().toLowerCase()
      ? lines.slice(1).join("\n").trim()
      : cleaned;
  return normalizeTranslationBySource(withoutTitle, sourceText);
}

function containsCjk(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function containsLatin(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function isSingleEnglishWord(value: string): boolean {
  return /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(value.trim());
}

function normalizeTranslationBySource(value: string, sourceText: string): string {
  const trimmed = value.trim();
  if (isSingleEnglishWord(sourceText)) {
    if (/^(?:拼写|拼错|拼写有误|拼写错误)[。.!！]?$/i.test(trimmed)) {
      return "拼写错误";
    }
    return trimmed.replace(/\s*;\s*/g, "；");
  }
  return trimmed;
}

function shouldVerifySpellingError(sourceText: string, translatedText: string): boolean {
  return isSingleEnglishWord(sourceText) && translatedText.trim() === "拼写错误";
}

function shouldExpandSingleWordTranslation(sourceText: string, translatedText: string): boolean {
  const trimmed = translatedText.trim();
  return isSingleEnglishWord(sourceText) && trimmed !== "拼写错误" && !trimmed.includes("；");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

function html(markup: string): Response {
  return new Response(markup, {
    status: 200,
    headers: HTML_HEADERS,
  });
}

function png(base64: string): Response {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: ICON_HEADERS,
  });
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function simpleAppHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" type="image/png" href="/favicon.ico" />
  <title>Vocabulary</title>
  <style>
    :root {
      color-scheme: light;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #ffffff;
      color: #111827;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: #ffffff;
    }

    button,
    textarea {
      font: inherit;
    }

    button {
      height: 32px;
      border: 1px solid #111827;
      border-radius: 0;
      background: #ffffff;
      color: #111827;
      cursor: pointer;
      padding: 0 14px;
      transition-property: transform, background-color, color, opacity;
      transition-duration: 120ms;
      transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
    }

    button:active {
      transform: scale(0.96);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    button.primary {
      background: #111827;
      color: #ffffff;
    }

    button.primary:hover {
      background: #374151;
    }

    .shell {
      width: min(1080px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0;
    }

    .top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 18px;
      border-bottom: 1px solid #e5e7eb;
    }

    .brand {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: 0;
      text-wrap: balance;
    }

    .meta {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.4;
    }

    .status {
      color: #4b5563;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .workspace {
      display: grid;
      grid-template-rows: auto minmax(300px, 1fr);
      border-bottom: 1px solid #e5e7eb;
    }

    .workspace > * {
      display: flex;
      min-width: 0;
      flex-direction: column;
    }

    .pane-head {
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 14px;
      border-bottom: 1px solid #e5e7eb;
      color: #4b5563;
      font-size: 13px;
    }

    .pane-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }

    .pane-actions .primary {
      height: 30px;
      padding: 0 12px;
    }

    .result-actions {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      flex-shrink: 0;
    }

    .pronunciation {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 8px;
      color: #111827;
    }

    .pronunciation[hidden] {
      display: none;
    }

    .phonetic {
      overflow: hidden;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .speak-button {
      width: auto;
      height: 30px;
      padding: 0 10px;
    }

    .text-button {
      width: auto;
      height: auto;
      border: 0;
      background: transparent;
      color: #4b5563;
      padding: 0;
    }

    .text-button:hover {
      background: transparent;
      color: #111827;
      text-decoration: underline;
    }

    textarea,
    .output {
      width: 100%;
      border: 0;
      border-radius: 0;
      margin: 0;
      padding: 16px 14px;
      outline: none;
      background: #ffffff;
      color: #111827;
      font-size: 16px;
      line-height: 1.7;
      resize: none;
      white-space: pre-wrap;
      overflow: auto;
      text-wrap: pretty;
    }

    textarea {
      flex: 0 0 auto;
      min-height: 200px;
      height: 200px;
      overflow: hidden;
    }

    .output {
      flex: 1;
      min-height: 0;
    }

    .output-wrap {
      position: relative;
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .translation-loader {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(255, 255, 255, 0.72);
      pointer-events: none;
    }

    .translation-loader[hidden] {
      display: none;
    }

    .hexagram-loader {
      width: 72px;
      height: 72px;
      color: #111827;
    }

    .hexagram-path {
      fill: none;
      stroke: currentColor;
      stroke-width: 4;
      stroke-linejoin: round;
      stroke-linecap: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: trace-hexagram 1.6s ease-in-out infinite;
    }

    .hexagram-path:nth-child(2) {
      animation-delay: 180ms;
    }

    @keyframes trace-hexagram {
      0% {
        opacity: 0.25;
        stroke-dashoffset: 1;
      }

      70%,
      100% {
        opacity: 1;
        stroke-dashoffset: 0;
      }
    }

    .workspace > :first-child {
      border-bottom: 1px solid #e5e7eb;
    }

    textarea:focus {
      background: #fafafa;
    }

    .actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 16px;
    }

    .hint {
      color: #6b7280;
      font-size: 13px;
      line-height: 1.45;
    }

    .buttons {
      display: flex;
      gap: 8px;
    }

    .modal {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(255, 255, 255, 0.84);
      padding: 32px;
    }

    .modal[hidden] {
      display: none;
    }

    .history-dialog {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      width: 100%;
      max-width: 760px;
      height: min(80vh, 720px);
      max-height: 100%;
      min-width: 0;
      border: 1px solid #111827;
      background: #ffffff;
    }

    .dialog-head,
    .dialog-foot {
      display: flex;
      min-height: 48px;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 20px;
      border-bottom: 1px solid #e5e7eb;
    }

    .dialog-foot {
      border-top: 1px solid #e5e7eb;
      border-bottom: 0;
    }

    .dialog-foot[hidden] {
      display: none;
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 600;
    }

    .history-scroll {
      overflow: auto;
      min-width: 0;
      padding: 8px 20px 20px;
    }

    .history-list {
      display: grid;
      gap: 0;
    }

    .history-item {
      display: grid;
      gap: 8px;
      padding: 14px 0;
      border-bottom: 1px solid #e5e7eb;
      color: #111827;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .history-empty {
      padding: 18px 0;
      color: #6b7280;
      font-size: 13px;
    }

    .history-source,
    .history-result {
      white-space: pre-wrap;
      font-size: 13px;
    }

    .history-source {
      font-weight: 600;
    }

    .history-result {
      color: #374151;
    }

    .history-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .history-time {
      color: #6b7280;
      font-size: 12px;
      white-space: nowrap;
    }

    .delete-history {
      width: auto;
      height: auto;
      border: 0;
      background: transparent;
      color: #9f1239;
      padding: 0;
    }

    .delete-history:hover {
      background: transparent;
      text-decoration: underline;
    }

    .pager {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .pager-state {
      color: #4b5563;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    @media (max-width: 760px) {
      body {
        min-height: 100dvh;
      }

      .shell {
        display: flex;
        min-height: 100dvh;
        width: min(100% - 20px, 1080px);
        flex-direction: column;
        padding: 12px 0;
      }

      .top {
        align-items: center;
        gap: 8px;
        padding-bottom: 10px;
      }

      .brand {
        gap: 6px;
      }

      h1 {
        font-size: 20px;
      }

      .meta,
      .status {
        font-size: 12px;
      }

      .actions {
        align-items: stretch;
        flex-direction: column;
      }

      .workspace {
        flex: 1;
        min-height: 0;
        grid-template-rows: auto minmax(0, 1fr);
      }

      .pane-head {
        min-height: 38px;
      }

      .pane-actions {
        gap: 8px;
      }

      .pane-actions .primary {
        height: 28px;
        padding: 0 10px;
      }

      .result-actions {
        gap: 8px;
      }

      .phonetic {
        max-width: 46vw;
      }

      .speak-button {
        height: 28px;
        padding: 0 8px;
      }

      .hexagram-loader {
        width: 60px;
        height: 60px;
      }

      textarea,
      .output {
        padding: 12px;
        font-size: 15px;
        line-height: 1.6;
      }

      .actions {
        gap: 0;
        padding-top: 10px;
      }

      .hint {
        display: none;
      }

      .buttons {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        width: 100%;
      }

      .buttons button {
        min-width: 0;
        width: 100%;
        padding: 0 6px;
        font-size: 13px;
      }

      .modal {
        padding: 12px;
      }

      .history-dialog {
        width: 100%;
        height: min(78vh, 680px);
        min-height: 0;
      }

      .dialog-head {
        padding: 0 14px;
      }

      .dialog-foot {
        padding: 10px 14px;
      }

      .history-scroll {
        padding: 6px 14px 14px;
      }

      .pager {
        justify-content: flex-end;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div class="brand">
        <h1>Vocabulary</h1>
        <div class="meta">English / Chinese · deepseek-v4-flash</div>
      </div>
      <div class="status" id="status">Ready</div>
    </header>

    <section class="workspace" aria-label="Translator">
      <form id="translateForm">
        <div class="pane-head">
          <span>Input</span>
          <div class="pane-actions">
            <button class="primary" id="translateButton" type="submit">Translate</button>
          </div>
        </div>
        <textarea id="text" name="text" placeholder="输入中文或英文"></textarea>
      </form>

      <section aria-label="Result">
        <div class="pane-head">
          <span>Result</span>
          <div class="result-actions">
            <span class="pronunciation" id="pronunciation" hidden>
              <span class="phonetic" id="phoneticText"></span>
              <button class="speak-button" type="button" id="speakButton">Speak</button>
            </span>
          </div>
        </div>
        <div class="output-wrap">
          <pre class="output" id="output"></pre>
          <div class="translation-loader" id="translationLoader" aria-label="Translating" hidden>
            <svg class="hexagram-loader" viewBox="0 0 100 100" aria-hidden="true">
              <polygon class="hexagram-path" pathLength="1" points="50 12 84 72 16 72 50 12"></polygon>
              <polygon class="hexagram-path" pathLength="1" points="50 88 16 28 84 28 50 88"></polygon>
            </svg>
          </div>
        </div>
      </section>
    </section>

    <div class="actions">
      <div class="hint">单个单词会返回 n. / v. / adj. 等词性解释和例句；句子和段落会直接英中互译。</div>
      <div class="buttons">
        <button type="button" id="clearButton">Clear</button>
        <button type="button" id="historyButton">History</button>
      </div>
    </div>
  </main>

  <div class="modal" id="historyModal" role="dialog" aria-modal="true" aria-labelledby="historyTitle" hidden>
    <section class="history-dialog">
      <div class="dialog-head">
        <div class="dialog-title" id="historyTitle">History</div>
        <button type="button" id="closeHistoryButton">Close</button>
      </div>
      <div class="history-scroll" id="historyScroll">
        <div class="history-list" id="historyBody">
          <div class="history-empty">No records</div>
        </div>
      </div>
      <div class="dialog-foot" id="historyPager" hidden>
        <div class="pager-state" id="historyPageState">Page 1</div>
        <div class="pager">
          <button type="button" id="prevHistoryButton">Prev</button>
          <button type="button" id="nextHistoryButton">Next</button>
        </div>
      </div>
    </section>
  </div>

  <script>
    const text = document.querySelector("#text");
    const output = document.querySelector("#output");
    const status = document.querySelector("#status");
    const pronunciation = document.querySelector("#pronunciation");
    const phoneticText = document.querySelector("#phoneticText");
    const speakButton = document.querySelector("#speakButton");
    const translationLoader = document.querySelector("#translationLoader");
    const translateButton = document.querySelector("#translateButton");
    const clearButton = document.querySelector("#clearButton");
    const historyButton = document.querySelector("#historyButton");
    const historyModal = document.querySelector("#historyModal");
    const closeHistoryButton = document.querySelector("#closeHistoryButton");
    const prevHistoryButton = document.querySelector("#prevHistoryButton");
    const nextHistoryButton = document.querySelector("#nextHistoryButton");
    const historyScroll = document.querySelector("#historyScroll");
    const historyBody = document.querySelector("#historyBody");
    const historyPager = document.querySelector("#historyPager");
    const historyPageState = document.querySelector("#historyPageState");
    const historyPageSize = 15;
    let historyPage = 0;
    let historyHasNext = false;
    let currentSpeechText = "";

    function setStatus(value) {
      status.textContent = value;
    }

    function setLoading(isLoading) {
      translationLoader.hidden = !isLoading;
    }

    function setPronunciation(phonetic, speechText) {
      const cleanPhonetic = String(phonetic || "").trim();
      const cleanSpeechText = String(speechText || "").trim();
      currentSpeechText = cleanSpeechText;
      phoneticText.textContent = cleanPhonetic;
      pronunciation.hidden = !currentSpeechText;
      speakButton.disabled = !currentSpeechText;
    }

    function getAmericanVoice() {
      if (!("speechSynthesis" in window)) return null;
      const voices = window.speechSynthesis.getVoices();
      const americanVoices = voices.filter((voice) => voice.lang.toLowerCase() === "en-us");
      const femaleVoice = americanVoices.find((voice) =>
        /female|woman|samantha|victoria|allison|ava|susan|zira|jenny|aria|joanna|kendra|salli/i.test(voice.name)
      );
      return femaleVoice || americanVoices[0] || voices.find((voice) => voice.lang.toLowerCase().startsWith("en-")) || null;
    }

    function speakWithAndroidBridge(value) {
      const bridge = window.AndroidTts;
      if (!bridge || typeof bridge.speak !== "function") return false;
      try {
        if (!bridge.speak(value)) return false;
        setStatus("Speaking");
        return true;
      } catch {
        return false;
      }
    }

    function speakCurrentWord() {
      if (!currentSpeechText) {
        setStatus("Speech unavailable");
        return;
      }
      if (speakWithAndroidBridge(currentSpeechText)) return;
      if (!("speechSynthesis" in window)) {
        setStatus("Speech unavailable");
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(currentSpeechText);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      utterance.pitch = 1.05;
      const voice = getAmericanVoice();
      if (voice) utterance.voice = voice;
      window.speechSynthesis.speak(utterance);
      setStatus("Speaking");
    }

    function resizeInput() {
      text.style.height = "auto";
      text.style.height = Math.max(200, text.scrollHeight) + "px";
    }

    async function translate(value) {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: value })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    }

    function formatHistoryTime(value) {
      const textValue = String(value || "").trim();
      const match = textValue.match(/^(\\d{4})[-/](\\d{2})[-/](\\d{2})[ T](\\d{2}):(\\d{2}):(\\d{2})/);
      if (!match) return textValue;
      return match.slice(1, 4).join("-") + " " + match.slice(4, 7).join(":");
    }

    function fillHistory(items) {
      historyBody.innerHTML = "";
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = "No records";
        historyBody.appendChild(empty);
        return;
      }

      for (const item of items) {
        const row = document.createElement("article");
        const source = document.createElement("div");
        const result = document.createElement("div");
        const action = document.createElement("div");
        const time = document.createElement("time");
        const deleteButton = document.createElement("button");
        row.className = "history-item";
        source.className = "history-source";
        result.className = "history-result";
        action.className = "history-actions";
        time.className = "history-time";
        deleteButton.className = "delete-history";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        source.textContent = item.text;
        result.textContent = item.translatedText;
        time.dateTime = String(item.createdAt || "");
        time.textContent = formatHistoryTime(item.createdAt);
        deleteButton.addEventListener("click", async (event) => {
          event.stopPropagation();
          await deleteHistoryItem(item.id);
        });
        action.append(time, deleteButton);
        row.append(source, result, action);
        historyBody.appendChild(row);
      }
    }

    async function loadHistory(page) {
      const offset = page * historyPageSize;
      const response = await fetch("/api/translations?limit=" + (historyPageSize + 1) + "&offset=" + offset);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "History request failed");
      historyHasNext = data.items.length > historyPageSize;
      const visibleItems = data.items.slice(0, historyPageSize);
      fillHistory(visibleItems);
      historyScroll.scrollTop = 0;
      historyPageState.textContent = "Page " + (page + 1);
      prevHistoryButton.disabled = page === 0;
      nextHistoryButton.disabled = !historyHasNext;
      historyPager.hidden = page === 0 && !historyHasNext;
      return visibleItems.length;
    }

    async function deleteHistoryItem(id) {
      setStatus("Deleting");
      const response = await fetch("/api/translations/" + id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || "Delete failed");
        return;
      }
      const visibleCount = await loadHistory(historyPage);
      if (visibleCount === 0 && historyPage > 0 && !historyHasNext) {
        historyPage -= 1;
        await loadHistory(historyPage);
      }
      setStatus("Deleted");
    }

    async function openHistory() {
      historyModal.hidden = false;
      setStatus("Loading history");
      try {
        await loadHistory(historyPage);
        setStatus("Ready");
      } catch (error) {
        setStatus(error.message);
      }
    }

    function closeHistory() {
      historyModal.hidden = true;
    }

    document.querySelector("#translateForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = text.value.trim();
      text.blur();
      if (!value) {
        setStatus("Text required");
        return;
      }

      translateButton.disabled = true;
      setLoading(true);
      setPronunciation("", "");
      setStatus("Translating");

      try {
        const data = await translate(value);
        if (typeof data.text === "string" && data.text !== text.value.trim()) {
          text.value = data.text;
          resizeInput();
        }
        output.textContent = data.translatedText;
        setPronunciation(data.phoneticText, data.speechText);
        setStatus("Done");
      } catch (error) {
        setStatus(error.message);
      } finally {
        setLoading(false);
        translateButton.disabled = false;
      }
    });

    text.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      text.blur();
      document.querySelector("#translateForm").requestSubmit();
    });

    text.addEventListener("input", resizeInput);
    resizeInput();

    clearButton.addEventListener("click", () => {
      text.value = "";
      resizeInput();
      text.focus();
      setStatus("Ready");
    });

    speakButton.addEventListener("click", speakCurrentWord);

    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", getAmericanVoice);
    }

    historyButton.addEventListener("click", () => {
      historyPage = 0;
      openHistory();
    });

    closeHistoryButton.addEventListener("click", closeHistory);

    historyModal.addEventListener("click", (event) => {
      if (event.target === historyModal) closeHistory();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !historyModal.hidden) closeHistory();
    });

    prevHistoryButton.addEventListener("click", async () => {
      if (historyPage === 0) return;
      historyPage -= 1;
      await loadHistory(historyPage);
    });

    nextHistoryButton.addEventListener("click", async () => {
      if (!historyHasNext) return;
      historyPage += 1;
      await loadHistory(historyPage);
    });
  </script>
</body>
</html>`;
}
