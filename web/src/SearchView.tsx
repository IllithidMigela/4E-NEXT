import { useEffect, useMemo, useState } from "react";
import { FilledTextField } from "./components/md";
import { loadSearchIndex, loadCategory } from "./data/loaders";
import type { SearchEntry, Entry } from "./data/types";
import { CATEGORY_LABELS } from "./data/labels";
import EntryCard from "./sheet/EntryCard";

const CAT_ORDER = [
  "race", "class", "paragon-path", "epic-destiny", "feat", "power", "equipment",
  "item-set", "ritual", "theme", "domain", "magic-school", "pact", "vice",
  "virtue", "bloodline", "creature", "reference", "dictionary",
];

export default function SearchView() {
  const [cat, setCat] = useState<string>("race");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<Entry | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [index, setIndex] = useState<SearchEntry[]>([]);

  useEffect(() => {
    setDetail(null);
    if (cat === "all") {
      setEntries([]);
      void loadSearchIndex().then(setIndex).catch(console.error);
    } else {
      setIndex([]);
      void loadCategory(cat).then(setEntries).catch(console.error);
    }
  }, [cat]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (cat === "all") {
      if (!q) return [];
      return index.filter((e) => e.text.toLowerCase().includes(q)).slice(0, 80);
    }
    if (!q) return entries;
    return entries.filter((e) => (e.name + " " + (e.nameEn ?? "") + " " + e.tags.join(" ") + " " + (e.source ?? "")).toLowerCase().includes(q));
  }, [cat, query, entries, index]);

  async function open(e: Entry | SearchEntry) {
    try {
      if (cat === "all") {
        const list = await loadCategory(e.category);
        setDetail(list.find((x) => x.id === e.id) ?? null);
      } else {
        setDetail(e as Entry);
      }
    } catch (err) {
      console.error(err);
    }
  }

  const catLabel = CATEGORY_LABELS[cat] ?? cat;

  return (
    <div className="search-view">
      <div className="search-row">
        <FilledTextField value={query} label={cat === "all" ? "全局搜索（名称/关键词/出处）" : "搜索" + catLabel} onInput={(e) => setQuery((e.target as any).value ?? "")} />
      </div>
      <div className="cat-chips">
        <button type="button" className={cat === "race" ? "chip active" : "chip"} onClick={() => setCat("race")}>种族</button>
        {CAT_ORDER.filter((k) => k !== "race").map((k) => (
          <button key={k} type="button" className={cat === k ? "chip active" : "chip"} onClick={() => setCat(k)}>{CATEGORY_LABELS[k] ?? k}</button>
        ))}
        <button type="button" className={cat === "all" ? "chip active" : "chip"} onClick={() => setCat("all")}>全部 · 全局搜索</button>
      </div>
      <div className="meta">
        {cat === "all"
          ? (query ? "结果 " + results.length + " 条（全局）" : "输入关键词开始全局搜索（索引共 " + index.length + " 条）")
          : catLabel + " 共 " + entries.length + " 条" + (query ? " · 匹配 " + results.length : "")}
      </div>
      <div className="split">
        <div className="result-list">
          {results.map((r) => (
            <button key={r.id} type="button" className="result-item" onClick={() => open(r)}>
              <span className="result-name">{r.name}{r.nameEn ? " " + r.nameEn : ""}</span>
              <span className="result-cat">{(CATEGORY_LABELS[r.category] ?? r.category)}{r.source ? " · " + r.source : ""}</span>
            </button>
          ))}
        </div>
        <div className="entry-detail">
          {detail && <EntryCard entry={detail} />}
        </div>
      </div>
    </div>
  );
}