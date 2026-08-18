import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Switch } from "../components/md";
import { parseVariant } from "./character";
import type { Entry } from "../data/types";

const SOURCES = ["武术", "奥术", "神术", "原力", "灵能", "影能"];
const ROLES = ["防御者", "打击者", "控制者", "领导者"];

interface Props {
  entries: Entry[];
  hybrid: boolean;
  selectedIds: string[];
  onSelect: (ids: string[], isHybrid: boolean) => void;
  onClose: () => void;
}

export default function ClassPickerModal({ entries, hybrid, selectedIds, onSelect, onClose }: Props) {
  const [hybridMode, setHybridMode] = useState(hybrid);
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const [source, setSource] = useState("");
  const [role, setRole] = useState("");

  const visible = useMemo(() => {
    return entries.filter((e) => {
      const isHybrid = e.name.startsWith("混职");
      if (hybridMode !== isHybrid) return false;
      if (source && !String(e.powerSource ?? "").includes(source)) return false;
      if (role && !String(e.role ?? "").includes(role)) return false;
      return true;
    });
  }, [entries, hybridMode, source, role]);

  function switchHybrid(v: boolean) {
    setHybridMode(v);
    setSelected([]);
  }

  function toggle(id: string) {
    if (!hybridMode) {
      onSelect([id], false);
      onClose();
      return;
    }
    const has = selected.includes(id);
    let next: string[];
    if (has) {
      next = selected.filter((x) => x !== id);
    } else if (selected.length >= 2) {
      return;
    } else {
      next = [...selected, id];
    }
    setSelected(next);
    if (next.length === 2) {
      onSelect(next, true);
      onClose();
    }
  }

  return createPortal(
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-dialog class-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">{hybridMode ? "选择混职职业（选 2 个）" : "选择英雄职阶"}</span>
          <button type="button" className="crop-btn" onClick={onClose}>关闭</button>
        </div>
        <div className="class-layout">
          <div className="class-sources">
            <label className="hybrid-toggle">
              <span>混职</span>
              <Switch selected={hybridMode} onChange={(e) => switchHybrid((e.target as any).selected)} />
            </label>
            <button type="button" className={source === "" ? "cl-item active" : "cl-item"} onClick={() => setSource("")}>全部来源</button>
            {SOURCES.map((s) => (
              <button key={s} type="button" className={source === s ? "cl-item active" : "cl-item"} onClick={() => setSource(s)}>{s}</button>
            ))}
          </div>
          <div className="class-main">
            <div className="class-roles">
              <button type="button" className={role === "" ? "cr-item active" : "cr-item"} onClick={() => setRole("")}>全部职位</button>
              {ROLES.map((r) => (
                <button key={r} type="button" className={role === r ? "cr-item active" : "cr-item"} onClick={() => setRole(r)}>{r}</button>
              ))}
            </div>
            {hybridMode && (
              <div className="meta">已选 {selected.length}/2：{selected.map((id) => entries.find((e) => e.id === id)?.name).filter(Boolean).join(" + ") || "请选择两个混职职业"}</div>
            )}
            <div className="class-grid">
              {visible.map((e) => {
                const { parent, variant } = parseVariant(e.name);
                const isSel = selected.includes(e.id);
                return (
                  <button key={e.id} type="button" className={isSel ? "class-card selected" : "class-card"} onClick={() => toggle(e.id)}>
                    {variant && <span className="cc-parent">{parent}</span>}
                    <span className="cc-name">{variant ?? parent}</span>
                    <span className="cc-sub">{e.role}{e.powerSource ? " · " + e.powerSource : ""}</span>
                  </button>
                );
              })}
              {visible.length === 0 && <p className="hint">无匹配职业。</p>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
