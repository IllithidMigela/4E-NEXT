import { join } from "node:path";
import { readJsonl, writeJson } from "../lib/io.js";
import { RAW_FILE, CATEGORIES_DIR } from "../lib/paths.js";
import type { RawTiddler } from "../schema/raw.js";

const FIELDS = [
  "usage", "actionType", "tier", "rarity", "item-category", "power-type",
  "item-suitable", "role", "power source", "race-vision", "race-size",
  "race-speed", "key-skill", "ritual-catagory", "source",
];

const USAGE_KNOWN = new Set(["随意", "遭遇", "每日", "辅助"]);
const TIER_KNOWN = new Set(["英雄", "典范", "史诗", "传奇"]);

export interface AuditResult {
  distributions: Record<string, Record<string, number>>;
  flags: { usage: string[]; tier: string[] };
}

export function runAudit(): AuditResult {
  const tiddlers = readJsonl<RawTiddler>(RAW_FILE);
  const distributions: Record<string, Record<string, number>> = {};
  for (const f of FIELDS) distributions[f] = {};

  for (const t of tiddlers) {
    if (t.isSystem) continue;
    for (const f of FIELDS) {
      const v = t.fields[f];
      if (v === undefined || v === "") continue;
      distributions[f][v] = (distributions[f][v] ?? 0) + 1;
    }
  }

  const flags = {
    usage: Object.keys(distributions.usage).filter((v) => !USAGE_KNOWN.has(v)),
    tier: Object.keys(distributions.tier).filter((v) => !TIER_KNOWN.has(v)),
  };

  writeJson(join(CATEGORIES_DIR, "_audit.json"), {
    generatedAt: new Date().toISOString(),
    distributions,
    flags,
  });

  return { distributions, flags };
}
