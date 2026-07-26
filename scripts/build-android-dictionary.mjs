import { createReadStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parse } from "csv-parse";

const sourcePath = path.resolve(process.argv[2] || ".dictionary/ecdict.csv");
const outputPath = path.resolve(
  process.argv[3] || "android-native/app/src/main/assets/dictionary.db",
);

function cleanField(value) {
  return String(value || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeWord(value) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-");
}

function isSingleEnglishWord(value) {
  return /^\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*$/u.test(value);
}

await mkdir(path.dirname(outputPath), { recursive: true });
await rm(outputPath, { force: true });

const database = new DatabaseSync(outputPath);
database.exec(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  PRAGMA temp_store = MEMORY;
  CREATE TABLE entries (
    key TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    phonetic TEXT NOT NULL,
    translation TEXT NOT NULL
  ) WITHOUT ROWID;
  BEGIN;
`);

const insert = database.prepare(`
  INSERT INTO entries (key, word, phonetic, translation)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    word = excluded.word,
    phonetic = excluded.phonetic,
    translation = excluded.translation
`);

const parser = createReadStream(sourcePath).pipe(
  parse({
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }),
);

let entryCount = 0;
for await (const record of parser) {
  const word = cleanField(record.word);
  const key = normalizeWord(word);
  const translation = cleanField(record.translation);
  if (!translation || !isSingleEnglishWord(key)) continue;

  insert.run(key, word, cleanField(record.phonetic), translation);
  entryCount += 1;
}

database.exec("COMMIT; ANALYZE; VACUUM;");
const uniqueEntries = database.prepare("SELECT count(*) AS count FROM entries").get().count;
database.close();

console.log(
  `Built Android dictionary with ${Number(uniqueEntries).toLocaleString()} unique entries ` +
    `(${entryCount.toLocaleString()} accepted rows) at ${outputPath}.`,
);
