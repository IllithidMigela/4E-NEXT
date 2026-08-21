import type { Entry, SearchEntry } from "../data/types";
import { loadSearchIndex } from "../data/loaders";
import { loadUserEntries } from "./userdata";

// .d4e 资源包：单文件 JSON，用于个人资源池的导入导出共享。
// 结构：{ format:"d4e", version:1, meta:{author,exportedAt,count}, entries: Entry[] }

export interface D4eMeta {
  author?: string;
  exportedAt: string;
  count: number;
}

export interface D4eBundle {
  format: "d4e";
  version: 1;
  meta: D4eMeta;
  entries: Entry[];
}

export function createBundle(entries: Entry[], author?: string): D4eBundle {
  return {
    format: "d4e",
    version: 1,
    meta: { author, exportedAt: new Date().toISOString(), count: entries.length },
    entries: entries.map((e) => ({ ...e, origin: "user" })),
  };
}

export function serializeBundle(b: D4eBundle): string {
  return JSON.stringify(b, null, 2);
}

export function parseBundle(text: string): { ok: true; bundle: D4eBundle } | { ok: false; error: string } {
  try {
    const data = JSON.parse(text);
    if (!data || data.format !== "d4e" || data.version !== 1 || !Array.isArray(data.entries)) {
      return { ok: false, error: "不是有效的 .d4e 资源包（format/version/entries 不符）" };
    }
    return { ok: true, bundle: data as D4eBundle };
  } catch {
    return { ok: false, error: "JSON 解析失败" };
  }
}

export type ConflictStrategy = "copy" | "override" | "keep";

export function resolveUniquifiedId(baseId: string, known: Set<string>): string {
  if (!known.has(baseId)) return baseId;
  const m = baseId.match(/^(.*?)(?:#\d*)?$/)?.[1] ?? baseId;
  let n = 1;
  let cand = m + "#" + n;
  while (known.has(cand)) {
    n++;
    cand = m + "#" + n;
  }
  return cand;
}

// 手写轻量校验（前端脚本避免新增 zod 依赖）。返回错误列表，空数组表示通过。
export function validateEntry(e: unknown): string[] {
  const errors: string[] = [];
  if (!e || typeof e !== "object") return ["非对象"];
  const o = e as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) errors.push("缺少 id");
  if (typeof o.name !== "string" || !o.name.trim()) errors.push("缺少 name");
  if (typeof o.category !== "string" || !o.category.trim()) errors.push("缺少 category");
  if (!Array.isArray(o.tags)) errors.push("tags 不是数组");
  if (o.sourceText !== undefined && typeof o.sourceText !== "string") errors.push("sourceText 不是字符串");
  if (o.fields !== undefined && (typeof o.fields !== "object" || o.fields === null)) errors.push("fields 不是对象");
  return errors;
}

// 提取 wikitext 中的 [[目标|别名]] / [[目标]] 链接目标（用于引用完整性检查）。
const LINK_RE = /\[\[([^\]|]+)\|?[^\]]*\]\]/g;

export function extractLinkTargets(e: Entry): string[] {
  const targets = new Set<string>();
  const feed = (s: string | undefined) => {
    if (!s) return;
    for (const m of s.matchAll(LINK_RE)) targets.add(m[1].trim());
  };
  feed(e.sourceText);
  feed(e.details);
  feed(e.flavorText);
  feed(e.prerequisite);
  feed(e.benefit);
  if (Array.isArray(e.wiki?.links)) for (const l of e.wiki.links) if (l?.target) targets.add(l.target);
  return [...targets];
}

// 把用户条目转成搜索索引入口（复用官方 SearchEntry 结构）。
export function toSearchEntry(e: Entry): SearchEntry {
  const parts = [e.name];
  if (e.nameEn) parts.push(e.nameEn);
  parts.push(...e.tags);
  if (e.source) parts.push(e.source);
  for (const k of ["usageZh", "actionType", "keywords", "tierZh", "benefit", "prerequisite", "itemCategory", "rarity", "role", "powerSource", "skill"]) {
    const v = (e as Record<string, unknown>)[k];
    if (typeof v === "string" && v) parts.push(v);
  }
  return { id: e.id, name: e.name, nameEn: e.nameEn, category: e.category, origin: "user", tags: e.tags, source: e.source, text: parts.join(" ") };
}

export interface ImportIssue {
  id: string;
  resolvedId?: string;
  reasons: string[];
}

export interface ImportResult {
  accepted: Entry[];
  rejected: ImportIssue[];
  conflicts: { sourceId: string; resolvedId: string; action: "copy" | "override" | "keep" }[];
}

export async function validateImport(
  entries: Entry[],
  strategy: ConflictStrategy
): Promise<ImportResult> {
  // 已知 id 集合 = 官方全量（search-index 含官方所有条目 id）+ 现有用户条目 + 包内自身
  let official: SearchEntry[] = [];
  try {
    official = await loadSearchIndex();
  } catch {
    official = [];
  }
  const existingUser = loadUserEntries(true);
  const known = new Set<string>();
  for (const s of official) known.add(s.id);
  for (const e of existingUser) known.add(e.id);

  const result: ImportResult = { accepted: [], rejected: [], conflicts: [] };
  for (const e of entries) {
    const base = validateEntry(e);
    const targets = extractLinkTargets(e);
    const dangling = targets.filter((t) => !known.has(t) && !entries.some((x) => x.id === t));
    const reasons = [...base, ...dangling.map((t) => "悬空引用：" + t)];

    const srcId = e.id;
    const isConflict = known.has(srcId);
    let resolvedId = srcId;
    let action: "copy" | "override" | "keep" = "copy";
    if (isConflict) {
      if (strategy === "copy") {
        resolvedId = resolveUniquifiedId(srcId, known);
        action = "copy";
      } else if (strategy === "override") {
        action = "override";
      } else {
        // keep：保留官方/现有，跳过冲突项
        action = "keep";
      }
    }
    if (action === "keep") {
      result.conflicts.push({ sourceId: srcId, resolvedId, action });
      continue;
    }
    if (reasons.length > 0) {
      result.rejected.push({ id: srcId, resolvedId: resolvedId !== srcId ? resolvedId : undefined, reasons });
      if (resolvedId !== srcId) known.add(resolvedId);
      continue;
    }
    // 通过：写入（keep 抓 conflict；但如果 id 本身重复于包内，uniquify）
    const finalId = known.has(resolvedId) ? resolveUniquifiedId(resolvedId, known) : resolvedId;
    if (finalId !== srcId || (isConflict && strategy === "copy")) {
      result.conflicts.push({ sourceId: srcId, resolvedId: finalId, action: action === "override" ? "override" : "copy" });
    }
    const accepted: Entry = { ...e, id: finalId, origin: "user" };
    result.accepted.push(accepted);
    known.add(finalId);
  }
  return result;
}