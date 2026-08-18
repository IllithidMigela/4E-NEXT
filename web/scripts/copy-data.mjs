import { cpSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "..", "out");
const dest = join(root, "public", "data");

if (!existsSync(outDir)) {
  console.error("[copy-data] 未找到 out/ 目录，请先运行数据管线（仓库根目录 pnpm pipeline）");
  process.exit(1);
}

mkdirSync(join(dest, "categories"), { recursive: true });

cpSync(join(outDir, "index", "manifest.json"), join(dest, "manifest.json"));
cpSync(join(outDir, "index", "search-index.json"), join(dest, "search-index.json"));
cpSync(join(outDir, "index", "relations.json"), join(dest, "relations.json"));

for (const f of readdirSync(join(outDir, "categories"))) {
  if (f.endsWith(".json") && !f.startsWith("_")) {
    cpSync(join(outDir, "categories", f), join(dest, "categories", f));
  }
}

console.log("[copy-data] 数据已同步到 web/public/data/");
