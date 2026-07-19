import { createReadStream } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";

const sourcePath = path.resolve(process.argv[2] || ".dictionary/ecdict.csv");
const outputDir = path.resolve(process.argv[3] || ".dictionary/kv");
const sourceVersion = new Date().toISOString().slice(0, 10);
const dictionaryPrefix = "dictionary:ecdict:v1";
const bulkFileSize = 100;
const shards = new Map();
let importedRows = 0;

function cleanField(value) {
  return String(value || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function isDictionaryWord(value) {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(value);
}

function shardName(value) {
  const normalized = value.toLowerCase();
  const second = normalized[1];
  return `${normalized[0]}${second && /[a-z]/.test(second) ? second : "_"}`;
}

for (let first = 97; first <= 122; first += 1) {
  const letter = String.fromCharCode(first);
  shards.set(`${letter}_`, {});
  for (let second = 97; second <= 122; second += 1) {
    shards.set(`${letter}${String.fromCharCode(second)}`, {});
  }
}

const parser = createReadStream(sourcePath).pipe(
  parse({
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }),
);

for await (const record of parser) {
  const word = cleanField(record.word);
  const translation = cleanField(record.translation);
  if (!word || !translation || !isDictionaryWord(word)) continue;

  const normalizedWord = word.toLowerCase();
  const shard = shards.get(shardName(normalizedWord));
  shard[normalizedWord] = [word, cleanField(record.phonetic), translation];
  importedRows += 1;
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const disabledMetadata = [
  {
    key: `${dictionaryPrefix}:metadata`,
    value: JSON.stringify({ ready: false, version: sourceVersion, entries: importedRows }),
  },
];
await writeFile(path.join(outputDir, "0000-metadata-disabled.json"), JSON.stringify(disabledMetadata));

const bulkEntries = [...shards.entries()].map(([name, entries]) => ({
  key: `${dictionaryPrefix}:shard:${name}`,
  value: JSON.stringify(entries),
}));

for (let index = 0; index < bulkEntries.length; index += bulkFileSize) {
  const fileNumber = String(index / bulkFileSize + 1).padStart(4, "0");
  const batch = bulkEntries.slice(index, index + bulkFileSize);
  await writeFile(path.join(outputDir, `${fileNumber}-shards.json`), JSON.stringify(batch));
}

const metadata = [
  {
    key: `${dictionaryPrefix}:metadata`,
    value: JSON.stringify({ ready: true, version: sourceVersion, entries: importedRows }),
  },
];
await writeFile(path.join(outputDir, "9999-metadata.json"), JSON.stringify(metadata));

console.log(
  `Prepared ${importedRows.toLocaleString()} dictionary entries in ${bulkEntries.length} KV shards.`,
);
