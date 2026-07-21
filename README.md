# Vocabulary Worker

Personal Cloudflare Worker for English-Chinese translation with an ECDICT-backed word dictionary, DeepSeek sentence translation, D1 history storage, and KV-backed dictionary shards/cache.

## What is included

- `GET /` serves the translation interface.
- `POST /api/translate` looks up English words, phrases, idioms, and fixed expressions in ECDICT and translates other input through `deepseek-v4-flash`.
- Dictionary matches return their available Chinese meanings and phonetic transcription without an AI request.
- Unknown single English words return `SPELL ERROR` and are not added to history.
- Pressing Enter triggers translation. Use Shift+Enter for a line break.
- The History button opens a 15-item paginated translation history table with per-row deletion.
- D1 stores translation history.
- KV caches repeated translation responses.

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

## Dictionary data

ECDICT data is downloaded and imported separately, so the large generated files are never committed to Git. The importer stores the dictionary as small prefix shards in the existing Workers KV namespace:

```bash
npm run dictionary:download
npm run dictionary:build
npm run dictionary:import:local
npm run dictionary:import:remote
```

The metadata key is uploaded last, so translation continues to use DeepSeek during an incomplete import. See `THIRD_PARTY_NOTICES.md` for the dataset license.
If an upload is interrupted, resume from the failed file without rewriting earlier KV keys:

```bash
npm run dictionary:import:remote -- --from=0004-shards.json
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

The service automatically decides English-to-Chinese or Chinese-to-English. English dictionary entries use KV; unmatched phrases, sentences, and Chinese text use `deepseek-v4-flash`.

### Translation history

```bash
GET /api/translations?limit=50&offset=0
DELETE /api/translations/:id
```

## Deploy

```bash
npm run typecheck
npm run deploy
```

If you later want personal access only, put the Worker behind Cloudflare Access or add an application-level token check back to the Worker.
