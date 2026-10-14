import { useMemo, useState } from "react";
import { useIncremental } from "../lib/incremental";
import { createPortal } from "react-dom";
import EntryCard from "./EntryCard";
import type { Entry } from "../data/types";
import { DeepSearchField, matchByName, matchDeep } from "./DeepSearch";
import { COMPANION_BEAST_KINDS, companionBeastKind, companionBeastRank, type CompanionBeastKind } from "./companionBeast";

// 「魔宠与坐骑 · 本体」的选择器：只在生物库里挑（数据卡 = 该生物的全部正文）。
// 与物品选择器（ItemSlotPicker）同一套交互语言：一级 chip 多选、无选中即全部、搜索 + 增量渲染。
// 区别只在于：这里的条目没有等级/增强加值，因此不出现那两行筛选。
interface Props {
  entries: Entry[];        // 生物库（creature）全量；组件内按 魔宠/坐骑/伙伴 分类排序
  slotName: string;        // 段名（用于标题，如「魔宠/坐骑 1」）
  currentId?: string;
  onSelect: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export default function CompanionBeastPicker({ entries, slotName, currentId, onSelect, onClear, onClose }: Props) {
  const [sel, setSel] = useState<CompanionBeastKind[]>([]);
  const [query, setQuery] = useState("");
  const [deep, setDeep] = useState(false);

  // 魔宠/坐骑/伙伴排在前面，其余按中文名排序
  const sorted = useMemo(
    () => [...entries].sort((a, b) => companionBeastRank(a) - companionBeastRank(b) || a.name.localeCompare(b.name, "zh")),
    [entries]
  );
  const counts = useMemo(() => {
    const m = new Map<CompanionBeastKind, number>();
    for (const e of entries) {
      const k = companionBeastKind(e);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((e) => {
      if (sel.length && !sel.includes(companionBeastKind(e) ?? ("" as CompanionBeastKind))) return false;
      if (q && !(deep ? matchDeep(e, q) : matchByName(e, q))) return false;
      return true;
    });
  }, [sorted, sel, query, deep]);
  const { visible, sentinelRef, done } = useIncremental(filtered, 60);

  function toggle(kind: CompanionBeastKind) {
    setSel((prev) => (prev.includes(kind) ? prev.filter((x) => x !== kind) : [...prev, kind]));
  }

  return createPortal(
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">选择{slotName}（本体）</span>
          <div className="picker-head-btns">
            {currentId && onClear && <button type="button" className="crop-btn" onClick={() => { onClear(); onClose(); }}>清空槽位</button>}
            <button type="button" className="crop-btn" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="slot-filter-row">
          <span className="sf-label">类型</span>
          {COMPANION_BEAST_KINDS.map((k) => (
            <button key={k} type="button" className={sel.includes(k) ? "sf-chip active" : "sf-chip"} onClick={() => toggle(k)}>
              {k}{counts.get(k) ? " " + counts.get(k) : ""}
            </button>
          ))}
        </div>
        <DeepSearchField value={query} deep={deep} onChange={setQuery} onToggleDeep={() => setDeep((d) => !d)} />
        <div className="meta">显示 {filtered.length} 条</div>
        <div className="picker-cards cols-3">
          {visible.map((e) => (
            <button key={e.id} type="button" className={e.id === currentId ? "picker-card selected" : "picker-card"} onClick={() => { onSelect(e.id); onClose(); }}>
              <EntryCard entry={e} />
            </button>
          ))}
          {filtered.length === 0 && <p className="hint">无匹配生物。</p>}
          {!done && <div ref={sentinelRef} className="incremental-sentinel">滚动加载更多…</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
