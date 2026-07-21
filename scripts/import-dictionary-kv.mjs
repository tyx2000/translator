import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2];
if (mode !== "--local" && mode !== "--remote") {
  throw new Error(
    "Usage: node scripts/import-dictionary-kv.mjs --local|--remote [--from=filename]",
  );
}

const inputDir = path.resolve(".dictionary/kv");
const from = process.argv.find((argument) => argument.startsWith("--from="))?.slice("--from=".length);
const files = (await readdir(inputDir))
  .filter((file) => file.endsWith(".json"))
  .sort()
  .filter((file) => !from || file >= from);
if (!files.length) throw new Error(`No KV bulk files found in ${inputDir}`);

for (const [index, file] of files.entries()) {
  console.log(`[${index + 1}/${files.length}] Uploading ${file}`);
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "wrangler",
    "kv",
    "bulk",
    "put",
    path.join(inputDir, file),
    "--binding=TRANSLATION_CACHE",
    mode,
  ];
  if (mode === "--local") args.push("--persist-to=.wrangler/state");

  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
