// 详情弹窗右栏「自定义」列：{label, value} 条目列表，支持增/删/编辑条目名与数值（可负）。
// 列表合计即该面板「其他」加值（面板上只读显示合计，点击可重新展开详情弹窗编辑）。
import type { CustomEntry } from "../sheet/character";
import { customSum } from "../sheet/character";

function fmtMod(n: number): string {
  return n >= 0 ? "+" + n : String(n);
}

function parseNum(v: string, min = -20, max = 50): number {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : Math.max(min, Math.min(max, n));
}

/** 面板上的「其他」只读合计：显示自定义列合计，点击展开对应详情弹窗（编辑/渲染模式通用）。 */
export function OtherLink(props: {
  value: number;
  onClick: () => void;
  mode?: "edit" | "render";
  className?: string;
}) {
  const { value, onClick, mode = "render", className } = props;
  // 渲染模式与旧行为一致：合计为 0 时不显示；编辑模式始终保留入口
  if (mode === "render" && value === 0) return null;
  return (
    <button type="button" className={className ?? "def-bonus-link"} onClick={onClick} title="点击展开详情，在右栏编辑自定义加值">
      其他 {fmtMod(value)}
    </button>
  );
}

export function CustomBonusEditor(props: {
  title?: string;        // 分组标题（如「AC」「攻击 1」）；不传则不显示标题行
  entries: CustomEntry[];
  onChange: (entries: CustomEntry[]) => void;
  placeholderLabel?: string; // 新增条目的默认名，默认「其他」
}) {
  const { title, entries, onChange, placeholderLabel } = props;
  const sum = customSum(entries);
  const setEntry = (i: number, patch: Partial<CustomEntry>) =>
    onChange(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const add = () => onChange([...(entries ?? []), { label: placeholderLabel ?? "其他", value: 0 }]);
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));
  return (
    <div className="ce-editor">
      {title && (
        <div className="ce-title">
          <span>{title}</span>
          <span className="ce-sum" title="该列表合计（即面板「其他」数值）">合计 {fmtMod(sum)}</span>
        </div>
      )}
      <div className="ce-list">
        {entries.length === 0 && <div className="ce-empty">暂无自定义加值</div>}
        {entries.map((e, i) => (
          <div key={i} className="ce-row">
            <input
              className="ce-label"
              value={e.label}
              placeholder={placeholderLabel ?? "其他"}
              maxLength={12}
              title="条目名"
              onChange={(ev) => setEntry(i, { label: ev.target.value })}
            />
            <input
              className="ce-value"
              type="number"
              min={-20}
              max={50}
              value={e.value}
              title="数值（可为负）"
              onChange={(ev) => setEntry(i, { value: parseNum(ev.target.value) })}
            />
            <button type="button" className="ce-del" title="删除该条目" onClick={() => remove(i)}>×</button>
          </div>
        ))}
      </div>
      <button type="button" className="ce-add" onClick={add}>＋ 添加条目</button>
    </div>
  );
}
