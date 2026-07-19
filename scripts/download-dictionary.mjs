import { mkdir, rename, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

const sourceUrl = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";
const outputDir = path.resolve(".dictionary");
const outputPath = path.join(outputDir, "ecdict.csv");
const temporaryPath = `${outputPath}.download`;

await mkdir(outputDir, { recursive: true });
await rm(temporaryPath, { force: true });

const response = await fetch(sourceUrl, {
  headers: { "user-agent": "vocabulary-worker-dictionary-import" },
});
if (!response.ok || !response.body) {
  throw new Error(`Dictionary download failed: HTTP ${response.status}`);
}

await pipeline(Readable.fromWeb(response.body), createWriteStream(temporaryPath));
await rename(temporaryPath, outputPath);
console.log(`Downloaded ECDICT to ${outputPath}`);
