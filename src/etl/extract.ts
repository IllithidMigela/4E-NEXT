import { readFileSync } from "node:fs";
import { RAW_FILE } from "../lib/paths.js";
import { writeJsonl } from "../lib/io.js";
import { extractStoreTiddlers } from "../lib/store.js";

export interface ExtractSummary {
  source: string;
  total: number;
  system: number;
  content: number;
  rawFile: string;
}

export function runExtract(source: string): ExtractSummary {
  const html = readFileSync(source, "utf8");
  const all = extractStoreTiddlers(html);
  writeJsonl(RAW_FILE, all);
  return {
    source,
    total: all.length,
    system: all.filter((t) => t.isSystem).length,
    content: all.filter((t) => !t.isSystem).length,
    rawFile: RAW_FILE,
  };
}
