import { join } from "node:path";
import { readJsonl, writeJson } from "../lib/io.js";
import { RAW_FILE, CATEGORIES_DIR } from "../lib/paths.js";
import type { RawTiddler } from "../schema/raw.js";
import { classifyOne, type Category } from "./classify.js";
import { extractTransclusions, extractLinks, extractMacros, extractHeadings } from "../lib/wikitext.js";
import { parseName } from "../lib/name.js";

const USAGE_EN: Record<string, string> = { 随意: "at-will", 遭遇: "encounter", 每日: "daily" };
const TIER_EN: Record<string, string> = { 英雄: "heroic", 典范: "paragon", 传奇: "epic" };
const ROLE_EN: Record<string, string> = { 打击者: "striker", 领导者: "leader", 控制者: "controller", 防御者: "defender" };
const POWER_SOURCE_EN: Record<string, string> = { 奥术: "arcane", 神术: "divine", 原力: "primal", 武术: "martial", 灵能: "psionic", 影能: "shadow" };
const RARITY_EN: Record<string, string> = { 普通: "common", 非普通: "uncommon", 稀有: "rare" };

interface WikiInfo {
  transclusions: string[];
  links: { target: string; alias?: string }[];
  macros: string[];
  headings: string[];
}

export interface Normalized {
  id: string;
  name: string;
  nameEn?: string;
  category: Category;
  tags: string[];
  source?: string;
  magazine?: string;
  sourceText: string;
  fields: Record<string, string>;
  wiki: WikiInfo;
  [key: string]: unknown;
}

// power-type 形如「来源+后缀」，后缀有 攻击/辅助/特性/种族威能/专长威能/套装威能
function parsePowerType(raw: string | undefined): { grantedBy?: string; powerKind?: string } {
  if (!raw) return {};
  if (raw.endsWith("种族威能")) return { grantedBy: raw.slice(0, -4).trim(), powerKind: "racial" };
  if (raw.endsWith("种族辅助")) return { grantedBy: raw.slice(0, -4).trim(), powerKind: "racial" };
  if (raw.endsWith("种族攻击")) return { grantedBy: raw.slice(0, -4).trim(), powerKind: "racial" };
  if (raw.endsWith("专长威能")) return { grantedBy: raw.slice(0, -4).trim(), powerKind: "feat" };
  if (raw.endsWith("套装威能")) return { grantedBy: raw.slice(0, -4).trim(), powerKind: "item-set" };
  if (raw.endsWith("特性")) return { grantedBy: raw.slice(0, -2).trim(), powerKind: "feature" };
  if (raw.endsWith("攻击")) return { grantedBy: raw.slice(0, -2).trim(), powerKind: "attack" };
  if (raw.endsWith("辅助")) return { grantedBy: raw.slice(0, -2).trim(), powerKind: "utility" };
  return {};
}

// 译名数据字典："英文: 中文" 逐行解析为 { en: zh }
function parseDictionary(text: string): Record<string, string> {
  const terms: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const en = line.slice(0, idx).trim();
    const zh = line.slice(idx + 1).trim();
    if (en && zh) terms[en] = zh;
  }
  return terms;
}

function wikiContent(t: RawTiddler): string {
  const parts = [t.text];
  for (const k of ["details", "prerequisite", "benefit", "flavorText"]) {
    if (t.fields[k]) parts.push(t.fields[k]);
  }
  return parts.join("\n");
}

function makeBase(t: RawTiddler, category: Category): Normalized {
  const { name, nameEn } = parseName(t.title);
  const content = wikiContent(t);
  return {
    id: t.title,
    name,
    nameEn,
    category,
    tags: t.tags,
    source: t.fields.source,
    magazine: t.fields.magazine,
    sourceText: t.text,
    fields: t.fields,
    wiki: {
      transclusions: extractTransclusions(content),
      links: extractLinks(content),
      macros: extractMacros(content),
      headings: extractHeadings(content),
    },
  };
}

function pick(out: Normalized, t: RawTiddler, srcKey: string, dstKey: string): void {
  const v = t.fields[srcKey];
  if (v !== undefined) out[dstKey] = v;
}

function normalizeOne(t: RawTiddler): Normalized {
  const cat = classifyOne(t).category;
  const out = makeBase(t, cat);

  switch (cat) {
    case "power": {
      pick(out, t, "usage", "usageZh");
      if (t.fields.usage && USAGE_EN[t.fields.usage]) out.usage = USAGE_EN[t.fields.usage];
      pick(out, t, "actionType", "actionType");
      pick(out, t, "keywords", "keywords");
      pick(out, t, "range", "range");
      pick(out, t, "level", "level");
      pick(out, t, "power-type", "powerType");
      const pt = parsePowerType(t.fields["power-type"]);
      if (pt.grantedBy) out.grantedBy = pt.grantedBy;
      if (pt.powerKind) out.powerKind = pt.powerKind;
      pick(out, t, "flavorText", "flavorText");
      pick(out, t, "details", "details");
      pick(out, t, "skill", "skill");
      break;
    }
    case "feat": {
      pick(out, t, "tier", "tierZh");
      if (t.fields.tier && TIER_EN[t.fields.tier]) out.tier = TIER_EN[t.fields.tier];
      pick(out, t, "prerequisite", "prerequisite");
      pick(out, t, "benefit", "benefit");
      break;
    }
    case "equipment": {
      pick(out, t, "item-level", "itemLevel");
      pick(out, t, "item-category", "itemCategory");
      pick(out, t, "item-suitable", "itemSuitable");
      pick(out, t, "rarity", "rarity");
      if (t.fields.rarity && RARITY_EN[t.fields.rarity]) out.rarityEn = RARITY_EN[t.fields.rarity];
      pick(out, t, "level", "level");
      pick(out, t, "flavorText", "flavorText");
      pick(out, t, "details", "details");
      break;
    }
    case "ritual": {
      pick(out, t, "ritual-level", "ritualLevel");
      pick(out, t, "key-skill", "keySkill");
      pick(out, t, "ritual-catagory", "ritualCategory");
      break;
    }
    case "race": {
      pick(out, t, "race-size", "size");
      pick(out, t, "race-speed", "speed");
      pick(out, t, "race-vision", "vision");
      pick(out, t, "race-abilityone", "abilityOne");
      pick(out, t, "race-abilitytwo", "abilityTwo");
      break;
    }
    case "class": {
      pick(out, t, "role", "role");
      if (t.fields.role && ROLE_EN[t.fields.role]) out.roleEn = ROLE_EN[t.fields.role];
      pick(out, t, "power source", "powerSource");
      if (t.fields["power source"] && POWER_SOURCE_EN[t.fields["power source"]]) {
        out.powerSourceEn = POWER_SOURCE_EN[t.fields["power source"]];
      }
      pick(out, t, "hybrid", "hybrid");
      break;
    }
    case "paragon-path":
    case "epic-destiny": {
      pick(out, t, "prerequisite", "prerequisite");
      break;
    }
    case "item-set": {
      pick(out, t, "tier", "tier");
      break;
    }
    case "dictionary": {
      out.terms = parseDictionary(t.text);
      break;
    }
    default:
      break;
  }

  return out;
}

const EXCLUDE_FROM_OUTPUT = new Set(["meta", "unknown"]);

// 职业正文合并：基础职业存在两份——正文页（无标签、id 为纯中文、含完整职业数据，如「诗人」）
// 与 tabs 壳页（带「职业」标签、id 为「中文 英文」、正文只有 <<tabs>> 动态威能列表，如「诗人 Bard」）。
// 将正文页 sourceText 合并进壳页（保留壳页的 id/标签/字段），删除正文页条目。
// 仅对同 name 组内判定：正文页须无标签、id 无空格、且组内存在以「本 id + 空格」开头的壳页。
// 不影响同名但不同条目的内容（威能/专长中文译名撞车、契约 Binder 变体等均有标签）。
function mergeIntroPages(items: Normalized[]): Normalized[] {
  const byName = new Map<string, Normalized[]>();
  for (const it of items) {
    const key = it.name;
    const arr = byName.get(key);
    if (arr) arr.push(it);
    else byName.set(key, [it]);
  }
  const out: Normalized[] = [];
  for (const group of byName.values()) {
    if (group.length < 2) {
      out.push(...group);
      continue;
    }
    const intro = group.find(
      (g) => g.tags.length === 0 && !g.id.includes(" ") && group.some((x) => x.id.startsWith(g.id + " "))
    );
    if (!intro) {
      out.push(...group);
      continue;
    }
    for (const g of group) {
      if (g === intro) continue;
      if (g.sourceText.trimStart().startsWith("<<tabs") && intro.sourceText.length > g.sourceText.length) {
        g.sourceText = intro.sourceText;
      }
      out.push(g);
    }
  }
  return out;
}

export function runNormalize(): Record<string, number> {
  const tiddlers = readJsonl<RawTiddler>(RAW_FILE);
  const byCat: Record<string, Normalized[]> = {};
  for (const t of tiddlers) {
    if (t.isSystem) continue;
    const n = normalizeOne(t);
    if (EXCLUDE_FROM_OUTPUT.has(n.category)) continue;
    (byCat[n.category] ??= []).push(n);
  }
  const counts: Record<string, number> = {};
  for (const [cat, items] of Object.entries(byCat)) {
    const cleaned = mergeIntroPages(items);
    writeJson(join(CATEGORIES_DIR, cat + ".json"), cleaned);
    counts[cat] = cleaned.length;
  }
  return counts;
}
