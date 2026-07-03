CREATE TABLE IF NOT EXISTS translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepseek',
  cache_key TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS translations_cache_key_idx
ON translations (cache_key);

CREATE INDEX IF NOT EXISTS translations_created_at_idx
ON translations (created_at DESC);

CREATE INDEX IF NOT EXISTS translations_lang_model_idx
ON translations (source_lang, target_lang, model);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_text TEXT NOT NULL,
  target_text TEXT NOT NULL,
  source_lang TEXT,
  source_lang_key TEXT NOT NULL DEFAULT '',
  target_lang TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS terms_unique_idx
ON terms (source_text, source_lang_key, target_lang);

CREATE INDEX IF NOT EXISTS terms_target_lang_idx
ON terms (target_lang);
