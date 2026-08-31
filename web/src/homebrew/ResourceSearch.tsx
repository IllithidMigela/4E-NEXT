import { useEffect, useMemo, useState } from "react";
import type { Entry } from "../data/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../data/labels";
import { FilledTextField } from "../components/md";
import type { HomebrewPool } from "../lib/userdata";

// 资源搜索栏：搜索全部已加载 .d4e 资源包内的词条与正文块。

interface Indexed {
  entry: Entry;
  poolId: string;
  poolName: string;
  enabled: boolean;
  hay: string;   // 小写检索文本（名称/标签/字段/正文）
  body: string;  // 正文（用于命中摘要）
}

const MAX_RESULTS = 80;

function plain(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{!!([^}]+)\}\}/g, "$1")
    .replace(/'{2,}|\/{2,}|!{1,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(body: string, q: string): string | null {
  if (!q) return null;
  const i = body.toLowerCase().indexOf(q);
  if (i < 0) return null;
  const start = Math.max(0, i - 24);
  const text = body.slice(start, Math.min(body.length, i + q.length + 48));
  return (start > 0 ? "…" : "") + text + (i + q.length + 48 < body.length ? "…" : "");
}

export default function ResourceSearch({
  pools,
  onOpen,
}: {
  pools: HomebrewPool[];
  onOpen: (entry: Entry, poolId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [poolId, setPoolId] = useState("all");

  const index = useMemo<Indexed[]>(() => {
    const out: Indexed[] = [];
    for (const p of pools) {
      for (const e of p.entries) {
        const fieldText = Object.values(e.fields ?? {}).join(" ");
        const body = plain([e.sourceText ?? "", fieldText].join(" "));
        const hay = [e.name, e.nameEn ?? "", (e.tags ?? []).join(" "), e.source ?? "", CATEGORY_LABELS[e.category] ?? e.category, body]
          .join(" ")
          .toLowerCase();
        out.push({ entry: e, poolId: p.id, poolName: p.name, enabled: p.enabled, hay, body });
      }
    }
    return out;
  }, [pools]);

  const cats = useMemo(() => {
    const set = new Set(index.map((x) => x.entry.category));
    const list = CATEGORY_ORDER.filter((c) => set.has(c));
    for (const c of set) if (!list.includes(c)) list.push(c);
    return list;
  }, [index]);

  // 过滤条件所指的包/分类消失时回落到「全部」
  useEffect(() => {
    if (poolId !== "all" && !pools.some((p) => p.id === poolId)) setPoolId("all");
    if (cat !== "all" && !cats.includes(cat)) setCat("all");
  }, [pools, cats, poolId, cat]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const scoped = index.filter((x) => (cat === "all" || x.entry.category === cat) && (poolId === "all" || x.poolId === poolId));
    if (!q) return scoped.slice(0, MAX_RESULTS);
    return scoped.filter((x) => x.hay.includes(q)).slice(0, MAX_RESULTS);
  }, [index, q, cat, poolId]);

  const totalScoped = useMemo(
    () => index.filter((x) => (cat === "all" || x.entry.category === cat) && (poolId === "all" || x.poolId === poolId)).length,
    [index, cat, poolId],
  );
  const matched = useMemo(() => (q ? index.filter((x) => (cat === "all" || x.entry.category === cat) && (poolId === "all" || x.poolId === poolId) && x.hay.includes(q)).length : totalScoped), [index, q, cat, poolId, totalScoped]);

  return (
    <section className="hb-sec hb-sec-search">
      <div className="hb-sec-head">
        <h3 className="hb-sec-title">
          <span className="material-symbols-outlined">manage_search</span>
          资源搜索
        </h3>
        <span className="hb-sec-sub">{q ? "命中 " + matched + " / " + totalScoped + " 条" : "可检索 " + totalScoped + " 条"}</span>
      </div>

      <div className="hb-search-bar">
        <FilledTextField
          value={query}
          label="搜索全部资源包的词条与正文"
          onInput={(e) => setQuery((e.target as HTMLInputElement).value ?? "")}
        />
      </div>

      <div className="hb-filter-row">
        <div className="cat-chips">
          <button type="button" className={cat === "all" ? "chip active" : "chip"} onClick={() => setCat("all")}>全部类型</button>
          {cats.map((c) => (
            <button key={c} type="button" className={cat === c ? "chip active" : "chip"} onClick={() => setCat(c)}>
              {CATEGORY_LABELS[c] ?? c}
            </button>
          ))}
        </div>
        {pools.length > 1 && (
          <div className="cat-chips">
            <button type="button" className={poolId === "all" ? "chip active" : "chip"} onClick={() => setPoolId("all")}>全部包</button>
            {pools.map((p) => (
              <button key={p.id} type="button" className={poolId === p.id ? "chip active" : "chip"} onClick={() => setPoolId(p.id)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hb-search-results">
        {results.map((x) => {
          const s = snippet(x.body, q);
          return (
            <button key={x.poolId + "/" + x.entry.id} type="button" className="hb-hit" onClick={() => onOpen(x.entry, x.poolId)}>
              <span className="hb-hit-top">
                <span className="hb-hit-name">{x.entry.name}{x.entry.nameEn ? " " + x.entry.nameEn : ""}</span>
                <span className="hb-hit-cat">{CATEGORY_LABELS[x.entry.category] ?? x.entry.category}</span>
              </span>
              <span className="hb-hit-meta">
                <span className="material-symbols-outlined">inventory_2</span>
                {x.poolName}
                {!x.enabled && <em className="hb-hit-off">已禁用</em>}
                {x.entry.tags?.length ? <em className="hb-hit-tags">{x.entry.tags.slice(0, 4).join(" · ")}</em> : null}
              </span>
              {s && <span className="hb-hit-snippet">{s}</span>}
            </button>
          );
        })}
        {results.length === 0 && (
          <p className="hint">
            {index.length === 0
              ? "还没有任何私设条目。先导入或创建一个资源包，再在包内新建条目。"
              : q
                ? "没有匹配的词条。试试更短的关键词，或切换类型/资源包筛选。"
                : "没有符合筛选条件的词条。"}
          </p>
        )}
        {results.length === MAX_RESULTS && <p className="hint">仅显示前 {MAX_RESULTS} 条，请细化关键词。</p>}
      </div>
    </section>
  );
}
