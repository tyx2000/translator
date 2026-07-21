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

type GeneratedTranslation = {
  correctedText: string;
  translatedText: string;
  phoneticText: string;
  speechText: string;
};

type DictionaryMetadata = { ready: boolean; version: string };
type DictionaryShardEntry = [word: string, phonetic: string, translation: string];
type DictionaryShard = Record<string, DictionaryShardEntry>;

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

const FIXED_MODEL = "deepseek-v4-flash";
const PROMPT_VERSION = "dictionary-phrases-v24";
const SPELL_ERROR = "SPELL ERROR";
const DICTIONARY_PREFIX = "dictionary:ecdict:v1";
const DICTIONARY_METADATA_KEY = `${DICTIONARY_PREFIX}:metadata`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return html(simpleAppHtml());
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
  const dictionaryKey = normalizeDictionaryKey(text);
  const isDictionaryCandidate = isDictionaryLookupKey(dictionaryKey);
  const isSingleWordInput = isDictionaryCandidate && isSingleEnglishWord(dictionaryKey);
  const cacheKey = await sha256(JSON.stringify({ text, model: FIXED_MODEL, promptVersion: PROMPT_VERSION }));

  const cached = await env.TRANSLATION_CACHE.get(`translation:${cacheKey}`, "json");
  if (isCachedTranslation(cached)) {
    const payload = translationPayload(cached);
    if (payload.translatedText === SPELL_ERROR) {
      ctx.waitUntil(env.TRANSLATION_CACHE.delete(`translation:${cacheKey}`));
      return spellingErrorResponse(payload.text);
    }
    if (isUsableTranslation(payload.translatedText, payload.text)) {
      return json({ ...payload, cached: true });
    }
    // Bad legacy entry (empty or raw JSON): drop it and translate fresh.
    ctx.waitUntil(env.TRANSLATION_CACHE.delete(`translation:${cacheKey}`));
  }

  const existing = await env.DB.prepare(
    `SELECT * FROM translations WHERE cache_key = ? LIMIT 1`,
  )
    .bind(cacheKey)
    .first<TranslationRow>();

  if (existing) {
    const payload = translationResponse(existing);
    if (payload.translatedText === SPELL_ERROR) {
      return spellingErrorResponse(payload.text);
    }
    if (isUsableTranslation(payload.translatedText, payload.text)) {
      ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
      return json({ ...payload, cached: true });
    }
    // Bad legacy row: fall through so a fresh translation upserts over it.
  }

  let generated: GeneratedTranslation | null = null;
  if (isDictionaryCandidate) {
    const dictionary = await lookupDictionaryEntry(env, dictionaryKey);
    if (dictionary.ready && dictionary.entry) {
      generated = dictionary.entry;
    } else if (dictionary.ready && isSingleWordInput) {
      return spellingErrorResponse(text);
    }
  }

  if (!generated && !isSingleWordInput) {
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
      if (payload.translatedText === SPELL_ERROR) {
        return spellingErrorResponse(payload.text);
      }
      if (isUsableTranslation(payload.translatedText, payload.text)) {
        ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
        return json({ ...payload, cached: true });
      }
    }
  }

  if (!generated) {
    generated = await requestDeepSeekTranslation(env, text);
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
      generated.correctedText,
      generated.translatedText,
      generated.phoneticText,
      generated.speechText,
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
): Promise<GeneratedTranslation> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new HttpError(500, "DEEPSEEK_API_KEY secret is not configured");
  }

  const baseUrl = trimTrailingSlash(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  let lastError: HttpError | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    let parsed: { correctedText: string; translatedText: string; phoneticText: string; speechText: string };
    try {
      parsed = await requestPlainTranslation(env, baseUrl, text);
    } catch (error) {
      lastError = error instanceof HttpError ? error : new HttpError(502, "DeepSeek request failed");
      continue;
    }

    const normalized = normalizeDeepSeekResult(parsed, text);
    if (!normalized.translatedText) continue;
    if (normalized.translatedText === SPELL_ERROR) continue;
    return normalized;
  }

  if (lastError) throw lastError;
  throw new HttpError(502, "DeepSeek returned an empty translation");
}

async function lookupDictionaryEntry(
  env: Env,
  dictionaryKey: string,
): Promise<{ ready: boolean; entry: GeneratedTranslation | null }> {
  const shardKey = `${DICTIONARY_PREFIX}:shard:${dictionaryShardName(dictionaryKey)}`;
  const [metadata, shard] = await Promise.all([
    env.TRANSLATION_CACHE.get<DictionaryMetadata>(DICTIONARY_METADATA_KEY, "json"),
    env.TRANSLATION_CACHE.get<DictionaryShard>(shardKey, "json"),
  ]);

  if (!metadata?.ready) return { ready: false, entry: null };
  const dictionaryEntry = shard?.[dictionaryKey];
  if (!dictionaryEntry) return { ready: true, entry: null };

  const [word, phonetic, translation] = dictionaryEntry;

  return {
    ready: true,
    entry: {
      correctedText: word,
      translatedText: normalizePlainTextOutput(translation, word),
      phoneticText: normalizeDictionaryPhonetic(phonetic),
      speechText: word,
    },
  };
}

function dictionaryShardName(value: string): string {
  const first = value[0] ?? "_";
  const second = value[1];
  return `${first}${second && /[a-z]/.test(second) ? second : "_"}`;
}

function normalizeDictionaryKey(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/, "")
    .trim();
}

function isDictionaryLookupKey(value: string): boolean {
  if (!value || value.length > 160 || !/^[a-z]/.test(value) || containsCjk(value)) return false;
  if (value.split(" ").length > 12) return false;
  return /^[a-z0-9][a-z0-9 '&(),./:-]*$/.test(value);
}

async function readCompletionBody(response: Response): Promise<{
  choices?: Array<{ message?: { content?: string } }>;
}> {
  const raw = await response.text();
  let result: {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  } = {};
  try {
    result = JSON.parse(raw) as typeof result;
  } catch {
    // Gateways can answer with HTML or plain text; keep result empty.
  }

  if (!response.ok) {
    throw new HttpError(response.status, result.error?.message ?? "DeepSeek request failed");
  }
  return result;
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
      max_tokens: Math.min(2000, Math.max(100, 50 + text.length * 2)),
      messages: [
        { role: "system", content: buildPlainTranslationPrompt() },
        {
          role: "user",
          content: text,
        },
      ],
    }),
  });

  const result = await readCompletionBody(response);
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
  // Exception: when the source itself is JSON-like, its translation legitimately is too.
  const translatedText = looksLikeJsonPayload(normalized) && !looksLikeJsonPayload(text) ? "" : normalized;
  const isSpellingError = translatedText === SPELL_ERROR;
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
      WHERE translated_text NOT LIKE 'SPELL ERROR%'
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
      translatedText: SPELL_ERROR,
      phoneticText: "",
      speechText: "",
      createdAt: currentTimestamp(),
      cached: false,
    },
    200,
  );
}

function buildPlainTranslationPrompt(): string {
  return [
    "Translate between English and Simplified Chinese.",
    "Return only the translation.",
    "For a single English word with multiple senses, return 2 to 6 common meanings separated by ；.",
  ].join("\n");
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

function isUsableTranslation(translatedText: string, sourceText: string): boolean {
  const trimmed = translatedText.trim();
  if (!trimmed) return false;
  return !looksLikeJsonPayload(trimmed) || looksLikeJsonPayload(sourceText);
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

function normalizeDictionaryPhonetic(value: unknown): string {
  const phonetic =
    typeof value === "string"
      ? value
          .replace(/\s+/g, " ")
          .trim()
      : "";
  if (!phonetic || /^[/\[].*[/\]]$/.test(phonetic)) return phonetic;
  return `/${phonetic}/`;
}

function normalizeSpeechText(value: unknown, sourceText: string, translatedText: string): string {
  if (translatedText.trim() === SPELL_ERROR) return "";
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
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(value.trim());
}

function normalizeTranslationBySource(value: string, sourceText: string): string {
  const trimmed = value.trim();
  if (/^spell[\s_-]*error[。.!！]?$/i.test(trimmed)) {
    return SPELL_ERROR;
  }
  if (isSingleEnglishWord(sourceText)) {
    return trimmed.replace(/\s*;\s*/g, "；");
  }
  return trimmed;
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
      justify-content: flex-end;
      gap: 12px;
      padding-top: 16px;
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
