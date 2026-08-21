import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FilledTextField } from "../components/md";
import WeaponPalette, { type WeapInfo } from "./WeaponPalette";
import type { BaseWeapon, BaseImplement } from "../lib/baseitems";
import type { FeatOption } from "./proficiency";

interface Props {
  featName: string;
  label: string;
  options: FeatOption[];
  // 选用武器型专长（cat="weapon"）时传入，渲染与「选择基础武器」一致的面板
  weaponPool?: BaseWeapon[];
  categories?: string[];
  // 选用法器型专长（如奥术法器擅长）时传入，渲染法器选择面板
  implementPool?: BaseImplement[];
  // 法器档位：basic=仅基础（奥术法器擅长）；superior=仅优异（优异法器训练）
  implTier?: "basic" | "superior";
  // 已擅长的法器组（法器面板「已擅长/未擅长」用）
  proficientImplGroups?: string[];
  proficientInfos?: WeapInfo[];
  current?: string;
  onChoose: (item: string) => void;
  onClose: () => void;
}

// 选择型专长弹窗：武器型/法器型专长套用「选择基础武器」面板；其余用简版卡片列表
export default function FeatChoiceDialog({ featName, label, options, weaponPool, categories, implementPool, implTier, proficientImplGroups, proficientInfos, current, onChoose, onClose }: Props) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.name.toLowerCase().includes(s));
  }, [q, options]);
  const paletteMode = (!!weaponPool && weaponPool.length > 0) || (!!implementPool && implementPool.length > 0);

  const shell = (inner: React.ReactNode) =>
    createPortal(
      <div className="picker-overlay" onClick={onClose}>
        <div className={"picker-dialog" + (paletteMode ? " class-dialog base-dialog" : "")} onClick={(e) => e.stopPropagation()}>
          <div className="picker-head">
            <span className="picker-title">选择 · {featName}</span>
            <div className="picker-head-btns">
              <button type="button" className="crop-btn" onClick={onClose}>关闭</button>
            </div>
          </div>
          <p className="hint">{label}</p>
          {inner}
        </div>
      </div>,
      document.body
    );

  if (weaponPool && weaponPool.length) {
    return shell(
      <WeaponPalette
        weapons={weaponPool}
        allowImplShield={false}
        categories={categories}
        proficientInfos={proficientInfos ?? []}
        currentName={current}
        onSelect={(_id, name) => { onChoose(name); onClose(); }}
      />
    );
  }

  if (implementPool && implementPool.length) {
    return shell(
      <WeaponPalette
        weapons={[]}
        allowImplShield={false}
        implements={implementPool}
        implTier={implTier}
        proficientImplGroups={proficientImplGroups}
        proficientInfos={[]}
        currentName={current}
        onSelect={(_id, name) => { onChoose(name); onClose(); }}
      />
    );
  }

  return shell(
    <>
      <FilledTextField value={q} label="搜索" onInput={(e) => setQ((e.target as any).value ?? "")} />
      <div className="picker-cards">
        {filtered.map((o) => (
          <button key={o.name} type="button" className={o.name === current ? "picker-card base-picker-card selected" : "picker-card base-picker-card"} onClick={() => { onChoose(o.name); onClose(); }}>
            <span className="bi-name">{o.name}</span>
            <span className="bi-dice">{o.main}</span>
            <span className="bi-traits">{o.sub}</span>
            {proficientImplGroups?.includes(o.name) && <span className="prof-badge">擅长</span>}
          </button>
        ))}
        {filtered.length === 0 && <p className="hint">无匹配项。</p>}
      </div>
    </>
  );
}