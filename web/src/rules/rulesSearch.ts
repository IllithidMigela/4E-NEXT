import type { RuleEntry } from "./types";
import { rulePlainText } from "./rulesWiki";

/**
 * 万律速查检索：先按「全部关键词都命中」严格匹配，再按标题/章节/正文/术语分层打分；
 * 严格匹配无结果时自动降级为「任一关键词命中」的宽松模式，并标出模糊命中。
 * 中文没有词边界，因此除子串匹配外，还提供「查询字按序出现」的模糊命中（如「借攻」→「借机攻击」）。
 */

export interface RuleDoc {
  entry: RuleEntry;
  title: string;
  titleEn: string;
  chapter: string;
  section: string;
  tags: string;
  body: string;
}

export interface RuleHit {
  entry: RuleEntry;
  score: number;
  snippet: string;
  /** 是否仅在宽松/模糊规则下命中 */
  loose: boolean;
}

/** 全角 → 半角、去掉多余空白；长度与实际字符一一对应，便于按位置取摘要 */
export function normalize(s: string): string {
  return s
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, " ")
    .toLowerCase();
}

export function termsOf(query: string): string[] {
  const q = normalize(query).trim();
  if (!q) return [];
  const parts = q.split(/[\s,，、。;；]+/).filter(Boolean);
  return parts.length ? parts : [q];
}

export function buildDocs(entries: RuleEntry[]): RuleDoc[] {
  return entries.map((entry) => ({
    entry,
    title: normalize(entry.title),
    titleEn: normalize(entry.titleEn ?? ""),
    chapter: normalize(entry.chapter ?? ""),
    section: normalize(entry.section ?? ""),
    tags: normalize(entry.tags.join(" ")),
    body: normalize(rulePlainText(entry.text)).replace(/\n/g, " "),
  }));
}

/** 查询字在目标里按顺序出现时的密集度（1 = 完全连缀），未全部出现返回 0 */
function subsequenceScore(hay: string, term: string): number {
  if (!term || hay.length < term.length) return 0;
  let idx = 0;
  let first = -1;
  let last = 0;
  for (let i = 0; i < term.length; i++) {
    const found = hay.indexOf(term[i], idx);
    if (found < 0) return 0;
    if (first < 0) first = found;
    last = found;
    idx = found + 1;
  }
  const span = last - first + 1;
  return Math.max(0.25, (term.length / span) * (term.length / Math.max(term.length, hay.length * 0.02)));
}

function countOccurrences(hay: string, needle: string, cap: number): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0 && n < cap) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/** 单个关键词的字段分层打分（标题 > 英文名 > 小节 > 章节 > 标签 > 正文 > 模糊） */
export function termScore(doc: RuleDoc, term: string): number {
  if (!term) return 0;
  if (doc.title === term) return 1000;
  if (doc.title.startsWith(term)) return 720;
  if (doc.title.includes(term)) return 520;
  if (doc.titleEn && doc.titleEn.includes(term)) return 420;
  if (doc.section.includes(term)) return 300;
  if (doc.chapter.includes(term)) return 240;
  if (doc.tags.includes(term)) return 220;
  const hits = countOccurrences(doc.body, term, 6);
  if (hits > 0) return 160 + Math.min(60, (hits - 1) * 12);
  const sub = subsequenceScore(doc.title, term);
  if (sub > 0) return 90 * sub;
  if (subsequenceScore(doc.body, term) > 0) return 40;
  return 0;
}

export function snippetOf(doc: RuleDoc, terms: string[]): string {
  const body = doc.body;
  if (!body) return "";
  let best = -1;
  let bestTerm = "";
  for (const t of terms) {
    const i = body.indexOf(t);
    if (i >= 0 && (best < 0 || i < best)) {
      best = i;
      bestTerm = t;
    }
  }
  if (best < 0) return body.slice(0, 96) + (body.length > 96 ? "…" : "");
  const start = Math.max(0, best - 34);
  const end = Math.min(body.length, best + bestTerm.length + 58);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

export interface SearchOutcome {
  hits: RuleHit[];
  /** 严格匹配无果、已降级为宽松匹配 */
  loose: boolean;
  terms: string[];
}

export function searchRules(docs: RuleDoc[], query: string, limit = 60): SearchOutcome {
  const terms = termsOf(query);
  const phrase = normalize(query).replace(/\s+/g, "");
  if (terms.length === 0) return { hits: [], loose: false, terms };

  const scored: { doc: RuleDoc; score: number; loose: boolean }[] = [];
  for (const doc of docs) {
    const scores = terms.map((t) => termScore(doc, t));
    const missing = scores.filter((s) => s === 0).length;
    if (missing === 0) {
      let total = scores.reduce((a, b) => a + b, 0);
      if (doc.body.includes(phrase) || doc.title.includes(phrase)) total += 180;
      scored.push({ doc, score: total, loose: false });
    } else if (missing < terms.length) {
      scored.push({ doc, score: scores.reduce((a, b) => a + b, 0) * 0.5, loose: true });
    }
  }

  const strict = scored.filter((s) => !s.loose);
  const pool = strict.length > 0 ? strict : scored;
  pool.sort((a, b) => b.score - a.score || a.doc.entry.order - b.doc.entry.order);

  return {
    loose: strict.length === 0 && pool.length > 0,
    terms,
    hits: pool.slice(0, limit).map((s) => ({
      entry: s.doc.entry,
      score: s.score,
      loose: s.loose,
      snippet: snippetOf(s.doc, terms),
    })),
  };
}

/** 查无结果时给出「最接近的标题」建议：按查询字重合度排序 */
export function suggestEntries(docs: RuleDoc[], query: string, limit = 5): RuleEntry[] {
  const q = normalize(query).replace(/[^\p{Script=Han}a-z0-9]/gu, "");
  if (!q) return [];
  const chars = new Set(q.split(""));
  return docs
    .map((d) => {
      const title = d.entry.title;
      let overlap = 0;
      for (const c of new Set(title.split(""))) if (chars.has(c)) overlap++;
      return { entry: d.entry, score: overlap / Math.max(4, title.length + chars.size) };
    })
    .filter((x) => x.score > 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

export function highlightHtml(text: string, terms: string[]): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const list = terms.filter(Boolean).sort((a, b) => b.length - a.length);
  if (list.length === 0) return escaped;
  let out = "";
  let i = 0;
  const hay = escaped.toLowerCase();
  while (i < escaped.length) {
    let hit = -1;
    let hitLen = 0;
    for (const t of list) {
      const at = hay.indexOf(t, i);
      if (at >= 0 && (hit < 0 || at < hit || (at === hit && t.length > hitLen))) {
        hit = at;
        hitLen = t.length;
      }
    }
    if (hit < 0) {
      out += escaped.slice(i);
      break;
    }
    out += escaped.slice(i, hit) + "<mark>" + escaped.slice(hit, hit + hitLen) + "</mark>";
    i = hit + hitLen;
  }
  return out;
}
