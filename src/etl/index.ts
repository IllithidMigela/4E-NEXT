import { join } from "node:path";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { writeJson } from "../lib/io.js";
import { CATEGORIES_DIR, INDEX_DIR } from "../lib/paths.js";
import type { Normalized } from "./normalize.js";

interface SearchEntry {
  id: string;
  name: string;
  nameEn?: string;
  category: string;
  tags: string[];
  source?: string;
  text: string;
}

const SEARCH_FIELDS = [
  "usageZh", "actionType", "keywords", "powerType", "skill", "grantedBy",
  "tierZh", "benefit", "prerequisite", "itemCategory", "itemSuitable",
  "rarity", "keySkill", "role", "powerSource", "size", "speed", "vision",
];

function searchText(n: Normalized): string {
  const parts: string[] = [n.name];
  if (n.nameEn) parts.push(n.nameEn);
  parts.push(...n.tags);
  if (n.source) parts.push(n.source);
  for (const k of SEARCH_FIELDS) {
    const v = n[k];
    if (typeof v === "string" && v) parts.push(v);
  }
  return parts.join(" ");
}

const SKIP_SEARCH = new Set(["nav"]);

export function runIndex(): { manifest: string; searchIndex: string; relations: string } {
  const categories: Record<string, { count: number; file: string }> = {};
  const entries: SearchEntry[] = [];
  const files = readdirSync(CATEGORIES_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

  for (const f of files) {
    const cat = f.replace(/\.json$/, "");
    const items = JSON.parse(readFileSync(join(CATEGORIES_DIR, f), "utf8")) as Normalized[];
    categories[cat] = { count: items.length, file: "categories/" + f };
    for (const n of items) {
      if (SKIP_SEARCH.has(n.category)) continue;
      entries.push({
        id: n.id,
        name: n.name,
        nameEn: n.nameEn,
        category: n.category,
        tags: n.tags,
        source: n.source,
        text: searchText(n),
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    total: entries.length,
    categories,
  };
  const mf = join(INDEX_DIR, "manifest.json");
  const si = join(INDEX_DIR, "search-index.json");
  writeJson(mf, manifest);
  writeJson(si, entries);

  // 反向关系：grantedBy → 威能 id 列表（支撑「查看某职业全部威能」）
  const powerByGrantedBy: Record<string, string[]> = {};
  const powerFile = join(CATEGORIES_DIR, "power.json");
  if (existsSync(powerFile)) {
    const powers = JSON.parse(readFileSync(powerFile, "utf8")) as Normalized[];
    for (const p of powers) {
      const g = typeof p.grantedBy === "string" && p.grantedBy ? p.grantedBy : "(none)";
      (powerByGrantedBy[g] ??= []).push(p.id);
    }
  }
  const rel = join(INDEX_DIR, "relations.json");
  writeJson(rel, { powerByGrantedBy });

  return { manifest: mf, searchIndex: si, relations: rel };
}
