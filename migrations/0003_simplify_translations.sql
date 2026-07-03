DROP INDEX IF EXISTS translations_cache_key_idx;
DROP INDEX IF EXISTS translations_created_at_idx;
DROP INDEX IF EXISTS translations_lang_model_idx;

CREATE TABLE translations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO translations_new (
  id,
  source_text,
  translated_text,
  cache_key,
  created_at
)
SELECT
  id,
  source_text,
  translated_text,
  cache_key,
  created_at
FROM translations;

DROP TABLE translations;

ALTER TABLE translations_new RENAME TO translations;

CREATE UNIQUE INDEX translations_cache_key_idx
ON translations (cache_key);

CREATE INDEX translations_created_at_idx
ON translations (created_at DESC);
