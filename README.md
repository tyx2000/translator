# Vocabulary Worker

Personal Cloudflare Worker for English-Chinese translation with DeepSeek, D1 history storage, and KV cache.

## What is included

- `GET /` serves the translation interface.
- `POST /api/translate` translates between English and Chinese through `deepseek-v4-flash`.
- Single-word inputs return plain-text dictionary-style parts of speech, meanings, and example sentences.
- D1 stores translation history.
- KV caches repeated translation responses.
- `GET /health` is public for deployment checks.

## Cloudflare resources

Create the database and KV namespace:

```bash
npx wrangler d1 create vocabulary
npx wrangler kv namespace create TRANSLATION_CACHE
```

Copy the returned IDs into `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "vocabulary"
database_id = "..."

[[kv_namespaces]]
binding = "TRANSLATION_CACHE"
id = "..."
```

`wrangler.toml` is intentionally ignored by Git because it contains Cloudflare resource IDs. Start from the example file:

```bash
cp wrangler.example.toml wrangler.toml
```

For GitHub/Cloudflare automatic deploys, store these as build variables and generate `wrangler.toml` during the build:

```text
D1_DATABASE_ID=...
KV_NAMESPACE_ID=...
```

Then use this deploy command:

```bash
npm run wrangler:from-env && npm run deploy
```

Set secrets:

```bash
npx wrangler secret put DEEPSEEK_API_KEY
```

Apply the schema:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## Development

```bash
npm install
npm run dev
```

Local request example:

```bash
curl -s http://127.0.0.1:8787/api/translate \
  -H "content-type: application/json" \
  -d '{"text":"Hello world"}'
```

## API

### Translate

`POST /api/translate`

```json
{
  "text": "Hello world"
}
```

The service automatically decides English-to-Chinese or Chinese-to-English and always uses `deepseek-v4-flash`. Vocabulary entries use plain text with part-of-speech abbreviations such as `n.`, `v.`, and `adj.`.

### Translation history

```bash
GET /api/translations?limit=50&offset=0
GET /api/translations/:id
DELETE /api/translations/:id
```

### Glossary terms

```bash
GET /api/terms?q=worker&targetLang=zh-CN
POST /api/terms
PATCH /api/terms/:id
DELETE /api/terms/:id
```

Create or update a glossary term:

```json
{
  "sourceText": "Cloudflare Worker",
  "targetText": "Cloudflare Worker",
  "sourceLang": "en",
  "targetLang": "zh-CN",
  "note": "Keep product name unchanged."
}
```

Terms that appear in the source text are added to the DeepSeek system prompt.

## Deploy

```bash
npm run typecheck
npm run deploy
```

If you later want personal access only, put the Worker behind Cloudflare Access or add an application-level token check back to the Worker.
