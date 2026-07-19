CREATE TABLE IF NOT EXISTS dictionary_entries (
  word TEXT PRIMARY KEY COLLATE NOCASE,
  phonetic TEXT,
  translation TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS dictionary_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source TEXT NOT NULL,
  version TEXT NOT NULL,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  imported_at TEXT
);

INSERT OR IGNORE INTO dictionary_metadata (
  id,
  source,
  version,
  ready
)
VALUES (
  1,
  'ECDICT',
  'uninstalled',
  0
);
