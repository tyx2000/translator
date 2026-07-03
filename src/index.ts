type TranslationRequest = {
  text?: unknown;
  targetLang?: unknown;
  sourceLang?: unknown;
  model?: unknown;
  force?: unknown;
};

type TermRequest = {
  sourceText?: unknown;
  targetText?: unknown;
  sourceLang?: unknown;
  targetLang?: unknown;
  note?: unknown;
};

type TranslationRow = {
  id: number;
  source_hash: string;
  source_text: string;
  translated_text: string;
  source_lang: string | null;
  target_lang: string;
  model: string;
  provider: string;
  cache_key: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
};

type TermRow = {
  id: number;
  source_text: string;
  target_text: string;
  source_lang: string | null;
  source_lang_key: string;
  target_lang: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const FIXED_MODEL = "deepseek-v4-flash";
const TRANSLATION_PAIR = "en-zh-auto";
const PROMPT_VERSION = "plain-dictionary-v2";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, env: env.APP_ENV ?? "unknown" });
    }

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
      if (translationId && request.method === "GET") {
        return await getTranslation(translationId, env);
      }
      if (translationId && request.method === "DELETE") {
        return await deleteTranslation(translationId, env);
      }

      if (request.method === "GET" && url.pathname === "/api/terms") {
        return await listTerms(url, env);
      }

      if (request.method === "POST" && url.pathname === "/api/terms") {
        return await createTerm(request, env);
      }

      const termId = matchId(url.pathname, "/api/terms/");
      if (termId && request.method === "PATCH") {
        return await updateTerm(termId, request, env);
      }
      if (termId && request.method === "DELETE") {
        return await deleteTerm(termId, env);
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
  const targetLang = TRANSLATION_PAIR;
  const sourceLang = undefined;
  const model = FIXED_MODEL;
  const force = body.force === true;

  const sourceHash = await sha256(text);
  const cacheKey = await sha256(JSON.stringify({ text, targetLang, model, promptVersion: PROMPT_VERSION }));

  if (!force) {
    const cached = await env.TRANSLATION_CACHE.get(`translation:${cacheKey}`, "json");
    if (isCachedTranslation(cached)) {
      return json({ ...cached, cached: true, cacheSource: "kv" });
    }

    const existing = await env.DB.prepare(
      `SELECT * FROM translations WHERE cache_key = ? LIMIT 1`,
    )
      .bind(cacheKey)
      .first<TranslationRow>();

    if (existing) {
      const payload = translationResponse(existing);
      ctx.waitUntil(writeTranslationCache(env, cacheKey, payload));
      return json({ ...payload, cached: true, cacheSource: "d1" });
    }
  }

  const termHints = await findRelevantTerms(env, text, sourceLang, targetLang);
  const deepseek = await requestDeepSeekTranslation(env, {
    text,
    sourceLang,
    targetLang,
    model,
    termHints,
  });

  await env.DB.prepare(
    `
      INSERT INTO translations (
        source_hash,
        source_text,
        translated_text,
        source_lang,
        target_lang,
        model,
        provider,
        cache_key,
        prompt_tokens,
        completion_tokens,
        total_tokens
      )
      VALUES (?, ?, ?, ?, ?, ?, 'deepseek', ?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        translated_text = excluded.translated_text,
        prompt_tokens = excluded.prompt_tokens,
        completion_tokens = excluded.completion_tokens,
        total_tokens = excluded.total_tokens
    `,
  )
    .bind(
      sourceHash,
      text,
      deepseek.translatedText,
      sourceLang ?? null,
      targetLang,
      model,
      cacheKey,
      deepseek.usage.promptTokens,
      deepseek.usage.completionTokens,
      deepseek.usage.totalTokens,
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
  return json({ ...payload, cached: false, cacheSource: null }, 201);
}

async function requestDeepSeekTranslation(
  env: Env,
  input: {
    text: string;
    sourceLang?: string;
    targetLang: string;
    model: string;
    termHints: TermRow[];
  },
): Promise<{
  translatedText: string;
  usage: { promptTokens: number | null; completionTokens: number | null; totalTokens: number | null };
}> {
  if (!env.DEEPSEEK_API_KEY) {
    throw new HttpError(500, "DEEPSEEK_API_KEY secret is not configured");
  }

  const baseUrl = trimTrailingSlash(env.DEEPSEEK_BASE_URL || "https://api.deepseek.com");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(input.targetLang, input.sourceLang, input.termHints),
        },
        {
          role: "user",
          content: input.text,
        },
      ],
    }),
  });

  const result = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  if (!response.ok) {
    throw new HttpError(response.status, result.error?.message ?? "DeepSeek request failed");
  }

  const translatedText = normalizePlainTextOutput(result.choices?.[0]?.message?.content?.trim() ?? "");
  if (!translatedText) {
    throw new HttpError(502, "DeepSeek returned an empty translation");
  }

  return {
    translatedText,
    usage: {
      promptTokens: result.usage?.prompt_tokens ?? null,
      completionTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
    },
  };
}

async function listTranslations(url: URL, env: Env): Promise<Response> {
  const limit = clampNumber(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100000, 0);
  const targetLang = url.searchParams.get("targetLang");

  const query = targetLang
    ? env.DB.prepare(
        `
          SELECT * FROM translations
          WHERE target_lang = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
      ).bind(targetLang, limit, offset)
    : env.DB.prepare(
        `
          SELECT * FROM translations
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
      ).bind(limit, offset);

  const result = await query.all<TranslationRow>();
  return json({ items: result.results.map(translationResponse), limit, offset });
}

async function getTranslation(id: number, env: Env): Promise<Response> {
  const row = await env.DB.prepare(`SELECT * FROM translations WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<TranslationRow>();
  if (!row) throw new HttpError(404, "Translation not found");
  return json(translationResponse(row));
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

async function listTerms(url: URL, env: Env): Promise<Response> {
  const limit = clampNumber(url.searchParams.get("limit"), 1, 100, 50);
  const offset = clampNumber(url.searchParams.get("offset"), 0, 100000, 0);
  const search = url.searchParams.get("q");
  const targetLang = url.searchParams.get("targetLang");

  const filters: string[] = [];
  const binds: Array<string | number> = [];

  if (search) {
    filters.push("(source_text LIKE ? OR target_text LIKE ?)");
    binds.push(`%${search}%`, `%${search}%`);
  }
  if (targetLang) {
    filters.push("target_lang = ?");
    binds.push(targetLang);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `
      SELECT * FROM terms
      ${where}
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `,
  )
    .bind(...binds, limit, offset)
    .all<TermRow>();

  return json({ items: result.results.map(termResponse), limit, offset });
}

async function createTerm(request: Request, env: Env): Promise<Response> {
  const body = await readJson<TermRequest>(request);
  const sourceText = requiredString(body.sourceText, "sourceText");
  const targetText = requiredString(body.targetText, "targetText");
  const sourceLang = optionalString(body.sourceLang);
  const targetLang = requiredString(body.targetLang, "targetLang");
  const note = optionalString(body.note);

  await env.DB.prepare(
    `
      INSERT INTO terms (source_text, target_text, source_lang, source_lang_key, target_lang, note)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_text, source_lang_key, target_lang) DO UPDATE SET
        target_text = excluded.target_text,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `,
  )
    .bind(sourceText, targetText, sourceLang ?? null, sourceLang ?? "", targetLang, note ?? null)
    .run();

  const saved = await env.DB.prepare(
    `
      SELECT * FROM terms
      WHERE source_text = ? AND source_lang_key = ? AND target_lang = ?
      LIMIT 1
    `,
  )
    .bind(sourceText, sourceLang ?? "", targetLang)
    .first<TermRow>();

  if (!saved) throw new HttpError(500, "Term was not saved");
  return json(termResponse(saved), 201);
}

async function updateTerm(id: number, request: Request, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT * FROM terms WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<TermRow>();
  if (!existing) throw new HttpError(404, "Term not found");

  const body = await readJson<TermRequest>(request);
  const sourceText = optionalString(body.sourceText) ?? existing.source_text;
  const targetText = optionalString(body.targetText) ?? existing.target_text;
  const sourceLang = body.sourceLang === null ? null : optionalString(body.sourceLang) ?? existing.source_lang;
  const sourceLangKey = sourceLang ?? "";
  const targetLang = optionalString(body.targetLang) ?? existing.target_lang;
  const note = body.note === null ? null : optionalString(body.note) ?? existing.note;

  await env.DB.prepare(
    `
      UPDATE terms
      SET source_text = ?,
          target_text = ?,
          source_lang = ?,
          source_lang_key = ?,
          target_lang = ?,
          note = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  )
    .bind(sourceText, targetText, sourceLang, sourceLangKey, targetLang, note, id)
    .run();

  const saved = await env.DB.prepare(`SELECT * FROM terms WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<TermRow>();

  if (!saved) throw new HttpError(500, "Term was not updated");
  return json(termResponse(saved));
}

async function deleteTerm(id: number, env: Env): Promise<Response> {
  const existing = await env.DB.prepare(`SELECT id FROM terms WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ id: number }>();
  if (!existing) throw new HttpError(404, "Term not found");

  await env.DB.prepare(`DELETE FROM terms WHERE id = ?`).bind(id).run();
  return json({ ok: true });
}

async function findRelevantTerms(
  env: Env,
  text: string,
  sourceLang: string | undefined,
  targetLang: string,
): Promise<TermRow[]> {
  const result = await env.DB.prepare(
    `
      SELECT * FROM terms
      WHERE target_lang = ?
        AND (source_lang IS NULL OR source_lang = ?)
      ORDER BY updated_at DESC
      LIMIT 100
    `,
  )
    .bind(targetLang, sourceLang ?? "")
    .all<TermRow>();

  return result.results.filter((term) => text.includes(term.source_text)).slice(0, 20);
}

function buildSystemPrompt(targetLang: string, sourceLang: string | undefined, terms: TermRow[]): string {
  const glossary =
    terms.length === 0
      ? ""
      : [
          "",
          "Glossary terms:",
          ...terms.map((term) => `  ${term.source_text} => ${term.target_text}`),
        ].join("\n");

  return [
    "You are an English-Chinese bidirectional translator.",
    "If the input is mainly English, translate it into natural Simplified Chinese.",
    "If the input is mainly Chinese, translate it into natural English.",
    "Always return plain text only.",
    "Do not use Markdown formatting, headings, bold markers, bullet markers, numbered lists, hyphen bullets, asterisks, or backticks.",
    "Use normal line breaks, indentation, and blank lines for structure.",
    "If the input is a single word or a short vocabulary item, produce a compact dictionary-style answer instead of only one translation.",
    "For vocabulary items, use common English part-of-speech abbreviations such as n., v., adj., adv., prep., conj., pron., interj., and phr.",
    "For each important part of speech, include a concise meaning, one natural example sentence in the source language, and the translation of that example sentence.",
    "For verbs, also include common forms: base, third-person singular, past tense, past participle, and present participle when the source item is English; include the closest English verb forms when the source item is Chinese.",
    "Format vocabulary entries like this: word, blank line, part of speech and meaning, indented Forms line for verbs, indented Example line, indented Translation line.",
    "For sentences or longer passages, return only the translation and preserve paragraph breaks, punctuation intent, names, and technical terms.",
    "Do not add unrelated explanations.",
    glossary,
  ]
    .filter(Boolean)
    .join("\n");
}

function translationResponse(row: TranslationRow) {
  return {
    id: row.id,
    text: row.source_text,
    translatedText: row.translated_text,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    model: row.model,
    provider: row.provider,
    usage: {
      promptTokens: row.prompt_tokens,
      completionTokens: row.completion_tokens,
      totalTokens: row.total_tokens,
    },
    createdAt: row.created_at,
  };
}

function termResponse(row: TermRow) {
  return {
    id: row.id,
    sourceText: row.source_text,
    targetText: row.target_text,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function normalizePlainTextOutput(value: string): string {
  return value
    .replace(/```[a-zA-Z0-9_-]*\n?/g, "")
    .replace(/```/g, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*[-*+]\s+/, "  "))
    .join("\n")
    .trim();
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
      min-height: 40px;
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

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.2;
      letter-spacing: 0;
      text-wrap: balance;
    }

    .meta {
      margin-top: 6px;
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
      grid-template-rows: minmax(250px, 36vh) minmax(300px, auto);
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

    textarea,
    .output {
      flex: 1;
      width: 100%;
      min-height: 0;
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
      padding: 20px;
    }

    .modal[hidden] {
      display: none;
    }

    .history-dialog {
      display: grid;
      grid-template-rows: auto 1fr auto;
      width: 60vw;
      height: 60vh;
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
      padding: 0 14px;
      border-bottom: 1px solid #e5e7eb;
    }

    .dialog-foot {
      border-top: 1px solid #e5e7eb;
      border-bottom: 0;
    }

    .dialog-title {
      font-size: 14px;
      font-weight: 600;
    }

    .table-wrap {
      overflow: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 13px;
    }

    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
      text-align: left;
    }

    th {
      color: #4b5563;
      font-weight: 500;
      white-space: nowrap;
    }

    td {
      color: #111827;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }

    .time-cell {
      width: 150px;
      color: #6b7280;
      font-variant-numeric: tabular-nums;
    }

    .history-source,
    .history-result {
      white-space: pre-wrap;
    }

    tbody tr {
      cursor: pointer;
    }

    tbody tr:hover {
      background: #fafafa;
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
      .shell {
        width: min(100% - 20px, 1080px);
        padding: 18px 0;
      }

      .top,
      .actions {
        align-items: stretch;
        flex-direction: column;
      }

      .workspace {
        grid-template-rows: minmax(240px, 38vh) minmax(280px, auto);
      }

      .buttons,
      button {
        width: 100%;
      }

      .history-dialog {
        width: 92vw;
        height: 74vh;
        min-width: 0;
        min-height: 0;
      }

      .dialog-head,
      .dialog-foot {
        align-items: stretch;
        flex-direction: column;
        padding: 10px 12px;
      }

      .pager {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div>
        <h1>Vocabulary</h1>
        <div class="meta">English / Chinese · deepseek-v4-flash</div>
      </div>
      <div class="status" id="status">Ready</div>
    </header>

    <section class="workspace" aria-label="Translator">
      <form id="translateForm">
        <div class="pane-head">
          <span>Input</span>
          <span>Auto direction</span>
        </div>
        <textarea id="text" name="text" placeholder="输入中文或英文"></textarea>
      </form>

      <section aria-label="Result">
        <div class="pane-head">
          <span>Result</span>
          <span id="resultMeta">No result</span>
        </div>
        <pre class="output" id="output"></pre>
      </section>
    </section>

    <div class="actions">
      <div class="hint">单个单词会返回 n. / v. / adj. 等词性解释和例句；句子和段落会直接英中互译。</div>
      <div class="buttons">
        <button type="button" id="historyButton">History</button>
        <button type="button" id="copyButton">Copy</button>
        <button class="primary" form="translateForm" id="translateButton" type="submit">Translate</button>
      </div>
    </div>
  </main>

  <div class="modal" id="historyModal" role="dialog" aria-modal="true" aria-labelledby="historyTitle" hidden>
    <section class="history-dialog">
      <div class="dialog-head">
        <div class="dialog-title" id="historyTitle">History</div>
        <button type="button" id="closeHistoryButton">Close</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="time-cell">Time</th>
              <th>Input</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody id="historyBody">
            <tr>
              <td colspan="3">No records</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="dialog-foot">
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
    const resultMeta = document.querySelector("#resultMeta");
    const translateButton = document.querySelector("#translateButton");
    const copyButton = document.querySelector("#copyButton");
    const historyButton = document.querySelector("#historyButton");
    const historyModal = document.querySelector("#historyModal");
    const closeHistoryButton = document.querySelector("#closeHistoryButton");
    const prevHistoryButton = document.querySelector("#prevHistoryButton");
    const nextHistoryButton = document.querySelector("#nextHistoryButton");
    const historyBody = document.querySelector("#historyBody");
    const historyPageState = document.querySelector("#historyPageState");
    const historyPageSize = 15;
    let historyPage = 0;
    let historyHasNext = false;

    function setStatus(value) {
      status.textContent = value;
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

    function formatTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString();
    }

    function fillHistory(items) {
      historyBody.innerHTML = "";
      if (!items.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 3;
        cell.textContent = "No records";
        row.appendChild(cell);
        historyBody.appendChild(row);
        return;
      }

      for (const item of items) {
        const row = document.createElement("tr");
        const time = document.createElement("td");
        const source = document.createElement("td");
        const result = document.createElement("td");
        time.className = "time-cell";
        source.className = "history-source";
        result.className = "history-result";
        time.textContent = formatTime(item.createdAt);
        source.textContent = item.text;
        result.textContent = item.translatedText;
        row.append(time, source, result);
        row.addEventListener("click", () => {
          text.value = item.text;
          output.textContent = item.translatedText;
          resultMeta.textContent = "History";
          closeHistory();
        });
        historyBody.appendChild(row);
      }
    }

    async function loadHistory(page) {
      const offset = page * historyPageSize;
      const response = await fetch("/api/translations?limit=" + (historyPageSize + 1) + "&offset=" + offset);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "History request failed");
      historyHasNext = data.items.length > historyPageSize;
      fillHistory(data.items.slice(0, historyPageSize));
      historyPageState.textContent = "Page " + (page + 1);
      prevHistoryButton.disabled = page === 0;
      nextHistoryButton.disabled = !historyHasNext;
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
      if (!value) {
        setStatus("Text required");
        return;
      }

      translateButton.disabled = true;
      setStatus("Translating");

      try {
        const data = await translate(value);
        output.textContent = data.translatedText;
        resultMeta.textContent = data.cached ? "Cached" : "Fresh";
        setStatus("Done");
      } catch (error) {
        setStatus(error.message);
      } finally {
        translateButton.disabled = false;
      }
    });

    text.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      document.querySelector("#translateForm").requestSubmit();
    });

    copyButton.addEventListener("click", async () => {
      const value = output.textContent.trim();
      if (!value) return;
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    });

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
