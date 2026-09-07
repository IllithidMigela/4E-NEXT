import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { CSSProperties } from "react";
import type { Entry, PowerBlock } from "../data/types";
import { CATEGORY_LABELS } from "../data/labels";
import { FilledButton, FilledTextField, IconButton, OutlinedButton, TextButton } from "../components/md";
import EntryCard from "../sheet/EntryCard";
import { buildEntry, draftToForm, fieldsFor, CATEGORY_FIELDS, CATEGORY_LIST, CATEGORY_SECTIONS, WITHOUT_BODY, POWER_FREQUENCIES, POWER_TYPES, RANGE_TEMPLATES, composeRange, parseRange, parsePowerBlocks, POWER_BLOCK_LABELS, POWER_TEMPLATE_SECONDARY, POWER_PRESETS, PRESET_GROUPS, ITEM_FREQUENCIES, ITEM_POWER_KEYWORDS, ACTION_TYPES, parseItemPowerSections, parseFeatTable, parseSetBonuses, parseTerms, serializeTerms, FEAT_PRESETS, FEAT_PREREQ_CANDIDATES, type SheetField, type RangeTemplateItem, type PowerPreset, type HomebrewSection, type ItemPowerSection, type FeatRow, type SetBonusBlock } from "../lib/homebrewSchema";
import { wikiToMarkdown } from "../lib/markdown";
import { itemLevels, enhancementBonusForLevel, priceForLevel } from "../lib/levelprices";
import { loadCategory } from "../data/loaders";
import { loadPools, uniqueEntryId, upsertEntryInPool, type HomebrewPool } from "../lib/userdata";

// 三级页面：条目编辑器（整页编辑，不使用弹窗）。
// 左侧表单 / 右侧实时预览；正文为 Markdown，配一排插入按钮，避免记语法。

const DRAFT_KEY = "kcc.homebrewDraft.v1";

function loadDraft(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function saveDraft(form: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* 忽略 */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
}

const blank = (cat?: string): Record<string, string> => ({
  name: "",
  nameEn: "",
  category: cat && CATEGORY_LIST.includes(cat) ? cat : "",
  tags: "",
  source: "",
  sourceText: "",
  bodyFormat: "md",
});

/** 正文工具栏：[标签, 插入前缀, 插入后缀, 占位文字, 整行插入] */
const TOOLS: { label: string; icon: string; before: string; after: string; sample: string; block?: boolean }[] = [
  { label: "标题", icon: "title", before: "## ", after: "", sample: "小节标题", block: true },
  { label: "加粗", icon: "format_bold", before: "**", after: "**", sample: "重点" },
  { label: "斜体", icon: "format_italic", before: "*", after: "*", sample: "强调" },
  { label: "列表", icon: "format_list_bulleted", before: "- ", after: "", sample: "一条内容", block: true },
  { label: "编号", icon: "format_list_numbered", before: "1. ", after: "", sample: "第一步", block: true },
  { label: "引用", icon: "format_quote", before: "> ", after: "", sample: "风味描述", block: true },
  { label: "表格", icon: "table", before: "| 名称 | 数值 |\n| --- | --- |\n| 示例 | 1d6 |", after: "", sample: "", block: true },
  { label: "分割线", icon: "horizontal_rule", before: "---", after: "", sample: "", block: true },
  { label: "链接", icon: "link", before: "[", after: "](https://)", sample: "链接文字" },
];

// 统计字段格式提示
const STAT_HINTS: Record<string, string> = {
  cost: "格式：数字 gp（如 1020 gp）",
  weight: "格式：数字 磅（如 4 磅）",
  critical: "如 1d6+增强 / 命中致盲",
};

// 威能「标签块」编辑器：一块=标签+内容；顶部预设条一键套用官方高频行结构；
// 连续缩进（indent>0）的块自动聚合为独立的「次攻击组」面板（如官方次攻击：次目标/次攻击/命中/效果），
// 整组插入/删除、组内排序，不再提供逐行缩进开关——避免子行与相邻缩进行意外合并成一个大组。
// 每个块的渲染与右侧 PowerCard 一一行对应，保存时序列化为官方 <table class=details>。
function PowerBlockEditor({ value, onChange }: { value: PowerBlock[]; onChange: (blocks: PowerBlock[]) => void }) {
  // 非空列表套用预设需「再点一次确认替换」，防止误点清空已填内容
  const [armPreset, setArmPreset] = useState<string | null>(null);
  useEffect(() => {
    if (!armPreset) return;
    const t = window.setTimeout(() => setArmPreset(null), 2500);
    return () => window.clearTimeout(t);
  }, [armPreset]);
  const applyPreset = (p: PowerPreset) => {
    if (value.length === 0) {
      onChange(p.blocks.map((b) => ({ ...b })));
      return;
    }
    if (armPreset === p.name) {
      onChange(p.blocks.map((b) => ({ ...b })));
      setArmPreset(null);
    } else {
      setArmPreset(p.name);
    }
  };
  // 顶部预设条：按 攻击类/辅助类/特殊类 分组展示，点击填入（空）或确认替换（非空）
  const renderPresets = () => (
    <div className="hb-pblock-presets">
      <span className="hb-pblock-presets-label">
        {value.length === 0 ? "预设模板 · 点击填入对应标签块" : "预设模板 · 点击一次再点确认可替换当前内容"}
      </span>
      {PRESET_GROUPS.map((g) => (
        <div className="hb-pblock-preset-group" key={g}>
          <span className="hb-pblock-preset-group-label">{g}</span>
          {POWER_PRESETS.filter((p) => p.group === g).map((p) => (
            <button
              key={p.name}
              type="button"
              className={"chip mini" + (armPreset === p.name ? " armed" : "")}
              title={value.length === 0 ? p.desc : armPreset === p.name ? "再次点击确认替换为「" + p.name + "」" : p.desc + "（再点一次确认替换）"}
              onClick={() => applyPreset(p)}
            >
              {armPreset === p.name ? "确认替换？" : p.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
  const updateAt = (i: number, upd: Partial<PowerBlock>) =>
    onChange(value.map((b, j) => (j === i ? { ...b, ...upd } : b)));
  const hintOf = (label: string) => POWER_BLOCK_LABELS.find((l) => l.label === label)?.hint ?? "";
  // 官方行序：已识别标签按 POWER_BLOCK_LABELS 顺序，未知/纯文本段落保持原相对顺序排到末尾
  const canonicalIndex = (label: string) => {
    const i = POWER_BLOCK_LABELS.findIndex((l) => l.label === label);
    return i === -1 ? POWER_BLOCK_LABELS.length : i;
  };
  // 把平铺块切成「普通块」与「连续缩进子行组」交替的段（子行组=次攻击组）
  const segments: { group: boolean; blocks: PowerBlock[]; start: number }[] = [];
  for (let i = 0; i < value.length; ) {
    const sub = (value[i].indent ?? 0) > 0;
    let j = i;
    while (j < value.length && ((value[j].indent ?? 0) > 0) === sub) j++;
    segments.push({ group: sub, blocks: value.slice(i, j), start: i });
    i = j;
  }
  // 上移/下移：只在所属段内移动，子行不会移出「次攻击组」
  const move = (i: number, dir: -1 | 1) => {
    const a = [...value];
    [a[i + dir], a[i]] = [a[i], a[i + dir]];
    onChange(a);
  };
  const segmentOf = (i: number) => segments.find((s) => i >= s.start && i < s.start + s.blocks.length)!;
  // 按官方顺序排序：仅普通块段内排序，次攻击组保持原内部顺序不动
  const sortCanonical = () =>
    onChange(
      segments.flatMap((seg) =>
        seg.group
          ? seg.blocks
          : [...seg.blocks]
              .map((b, k) => ({ ...b, _k: k }))
              .sort((a, b) => canonicalIndex(a.label) - canonicalIndex(b.label) || (a as unknown as { _k: number })._k - (b as unknown as { _k: number })._k)
              .map(({ _k, ...b }) => b),
      ),
    );
  const labelSelect = (b: PowerBlock, i: number) => (
    <select className="hb-pblock-label" value={b.label} onChange={(e) => updateAt(i, { label: e.target.value })}>
      <option value="">（无标签 · 纯文本段落）</option>
      {POWER_BLOCK_LABELS.map((l) => (
        <option key={l.label} value={l.label}>{l.label}</option>
      ))}
    </select>
  );
  const ops = (i: number) => {
    const seg = segmentOf(i);
    const first = i === seg.start;
    const last = i === seg.start + seg.blocks.length - 1;
    return (
      <div className="hb-pblock-ops">
        <button type="button" className="chip mini" disabled={first} title="上移" onClick={() => move(i, -1)}>↑</button>
        <button type="button" className="chip mini" disabled={last} title="下移" onClick={() => move(i, 1)}>↓</button>
        <button type="button" className="chip mini" title="删除此块" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
      </div>
    );
  };
  const renderRow = (b: PowerBlock, i: number) => (
    <div key={i} className="hb-pblock">
      <div className="hb-pblock-head">
        {labelSelect(b, i)}
        {ops(i)}
      </div>
      <textarea
        className="hb-textarea hb-pblock-text"
        rows={2}
        value={b.text}
        placeholder={hintOf(b.label)}
        onChange={(e) => updateAt(i, { text: e.target.value })}
      />
    </div>
  );
  // 「次攻击组」独立面板：标题 + 子行（次目标/次攻击/命中/效果）+ 组内加行 + 整组删除
  const renderGroup = (seg: { group: boolean; blocks: PowerBlock[]; start: number }) => {
    const s = seg.start;
    const L = seg.blocks.length;
    return (
      <div key={s} className="hb-pblock-subgroup">
        <div className="hb-pblock-subgroup-head">
          <span className="hb-pblock-subgroup-title">
            <span className="material-symbols-outlined">bolt</span>
            次攻击组
          </span>
          <span className="hb-pblock-subgroup-sub">缩进子行 · 次目标 / 次攻击 / 命中 / 效果</span>
          <button type="button" className="chip mini hb-pblock-subgroup-del" title="删除整组" onClick={() => onChange(value.filter((_, j) => j < s || j >= s + L))}>× 删除整组</button>
        </div>
        {seg.blocks.map((b, k) => renderRow(b, s + k))}
        <button type="button" className="chip mini" title="在组末尾追加一行" onClick={() => onChange([...value.slice(0, s + L), { label: "效果", text: "", indent: 1 }, ...value.slice(s + L)])}>＋ 组内加行</button>
      </div>
    );
  };
  if (value.length === 0) {
    return (
      <div className="hb-pblock empty" data-ed-field="powerBlocks">
        {renderPresets()}
        <p className="hint" style={{ margin: "0 0 8px" }}>
          预设基于官方威能的高频行结构（已统计 8900+ 条威能的详情）；也可用「＋ 添加一个标签块」从空白开始逐行搭建。
        </p>
        <div className="hb-pblock-actions">
          <OutlinedButton onClick={() => onChange([{ label: "效果", text: "" }])}>＋ 添加一个标签块</OutlinedButton>
        </div>
      </div>
    );
  }
  return (
    <div className="hb-pblock-list" data-ed-field="powerBlocks">
      {renderPresets()}
      {segments.map((seg) =>
        seg.group ? renderGroup(seg) : seg.blocks.map((b, k) => renderRow(b, seg.start + k)),
      )}
      <div className="hb-pblock-actions">
        <OutlinedButton onClick={sortCanonical} disabled={value.length < 2}>按官方顺序排序</OutlinedButton>
        <OutlinedButton onClick={() => onChange([...value, ...POWER_TEMPLATE_SECONDARY])}>＋ 追加次攻击组</OutlinedButton>
        <OutlinedButton onClick={() => onChange([...value, { label: "效果", text: "" }])}>＋ 追加标签块</OutlinedButton>
      </div>
    </div>
  );
}

// —— 专长关联威能等级表编辑器（流派专长固定结构：等级 × 关联威能）——
function FeatTableEditor({ value, onChange }: { value: FeatRow[]; onChange: (rows: FeatRow[]) => void }) {
  const updateAt = (i: number, upd: Partial<FeatRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...upd } : r)));
  return (
    <div className="hb-feattable" data-ed-field="featRows">
      <p className="hint" style={{ margin: "0 0 8px" }}>流派专长在「增益」末尾附等级×关联威能表。逐行填写等级与威能名，保存时拼装为官方 <code>&lt;table&gt;</code>。</p>
      <div className="hb-feattable-rows">
        {value.map((r, i) => (
          <div key={i} className="hb-feattable-row">
            <FilledTextField type="number" label="等级" value={r.level} onInput={(e) => updateAt(i, { level: (e.target as HTMLInputElement).value })} />
            <FilledTextField label="关联威能" value={r.power} placeholder="威能名（如 骑士冲锋）" onInput={(e) => updateAt(i, { power: (e.target as HTMLInputElement).value })} />
            <IconButton title="删除此行" onClick={() => onChange(value.filter((_, j) => j !== i))}><span className="material-symbols-outlined">close</span></IconButton>
          </div>
        ))}
      </div>
      <div className="hb-pblock-actions">
        <OutlinedButton onClick={() => onChange([...value, { level: (value.length ? value.length + 1 + "" : "1"), power: "" }])}>＋ 添加等级行</OutlinedButton>
        <OutlinedButton onClick={() => onChange(value.filter((r) => r.level.trim() || r.power.trim()).slice())}>清理空行</OutlinedButton>
      </div>
    </div>
  );
}

// —— 套装件数增益块编辑器（2件套/3件套/… + 增益文本）——
function SetBonusEditor({ value, onChange }: { value: SetBonusBlock[]; onChange: (blocks: SetBonusBlock[]) => void }) {
  const piecesSuggest = ["2件套", "3件套", "4件套", "5件套"];
  return (
    <div className="hb-setbonus" data-ed-field="setBonuses">
      <p className="hint" style={{ margin: "0 0 8px" }}>每个增益块 = 件数（如「2件套」）+ 增益描述。保存时生成「!! 套装增益」小节。</p>
      {value.map((b, i) => (
        <div key={i} className="hb-setbonus-block">
          <div className="hb-pblock-head">
            <FilledTextField label="件数" value={b.pieces} placeholder="如：2件套" onInput={(e) => onChange(value.map((x, j) => j === i ? { ...x, pieces: (e.target as HTMLInputElement).value } : x))} />
            <div className="hb-ed-chips">
              {piecesSuggest.map((p) => (
                <button key={p} type="button" className={"chip mini" + (b.pieces === p ? " active" : "")} onClick={() => onChange(value.map((x, j) => j === i ? { ...x, pieces: x.pieces === p ? "" : p } : x))}>{p}</button>
              ))}
            </div>
            <IconButton title="删除此增益块" onClick={() => onChange(value.filter((_, j) => j !== i))}><span className="material-symbols-outlined">close</span></IconButton>
          </div>
          <textarea
            className="hb-textarea"
            rows={3}
            value={b.text}
            placeholder="增益描述（可含 [[威能]] 链接）"
            onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
          />
        </div>
      ))}
      <div className="hb-pblock-actions">
        <OutlinedButton onClick={() => onChange([...value, { pieces: (value.length + 2) + "件套", text: "" }])}>＋ 添加增益块</OutlinedButton>
      </div>
    </div>
  );
}

// —— 译名字典：词条对编辑（英 / 中 每行一对，支持批量粘贴）——
function TermsPairsEditor({ value, onChange }: { value: [string, string][]; onChange: (pairs: [string, string][]) => void }) {
  const [batch, setBatch] = useState("");
  const importBatch = () => {
    const pairs = parseTerms(batch);
    if (pairs.length) onChange(pairs.filter(([e, z]) => e.trim() || z.trim()));
    setBatch("");
  };
  const updateAt = (i: number, upd: [string, string]) =>
    onChange(value.map((p, j) => (j === i ? upd : p)));
  return (
    <div className="hb-terms" data-ed-field="termsPairs">
      <p className="hint" style={{ margin: "0 0 8px" }}>每个词条对 = 英文 + 中文。可在下方批量粘贴「英: 中」多行后自动拆分。</p>
      {value.map(([en, zh], i) => (
        <div key={i} className="hb-terms-row">
          <FilledTextField label="英文" value={en} onInput={(e) => updateAt(i, [(e.target as HTMLInputElement).value, zh])} />
          <FilledTextField label="中文" value={zh} onInput={(e) => updateAt(i, [en, (e.target as HTMLInputElement).value])} />
          <IconButton title="删除此词条" onClick={() => onChange(value.filter((_, j) => j !== i))}><span className="material-symbols-outlined">close</span></IconButton>
        </div>
      ))}
      <div className="hb-pblock-actions">
        <OutlinedButton onClick={() => onChange([...value, ["", ""]])}>＋ 添加词条对</OutlinedButton>
      </div>
      <details className="hb-terms-batch">
        <summary>批量粘贴（每行一对「英文: 中文」）</summary>
        <textarea className="hb-textarea" rows={5} value={batch} placeholder={"Achra: 阿克拉\nBane: 班恩"} onChange={(e) => setBatch(e.target.value)} />
        <OutlinedButton onClick={importBatch}>拆分并填入</OutlinedButton>
      </details>
    </div>
  );
}

// —— 装备·物品威能段编辑器 ——
// 官方装备威能 = 若干「段头（关键词✦频率（动作））+ 正文标签块」；每段正文复用 PowerBlockEditor。
const ITEM_POWER_PRESETS: { name: string; desc: string; freq: string; action: string; keywords: string }[] = [
  { name: "每日 · 自由动作 · 触发", desc: "每日（自由动作），正文 触发/效果", freq: "每日", action: "自由动作", keywords: "" },
  { name: "每日 · 次要动作 · 效果", desc: "每日（次要动作），正文 效果", freq: "每日", action: "次要动作", keywords: "" },
  { name: "遭遇 · 标准动作 · 攻击", desc: "遭遇（标准动作），正文 目标/攻击/命中", freq: "遭遇", action: "标准动作", keywords: "" },
  { name: "随意 · 标准动作 · 攻击", desc: "随意（标准动作），正文 攻击块", freq: "随意", action: "标准动作", keywords: "" },
  { name: "消耗 · 自由动作", desc: "消耗（自由动作），消耗品专属", freq: "消耗", action: "自由动作", keywords: "" },
  { name: "医疗 · 每日", desc: "关键词预填「医疗」", freq: "每日", action: "标准动作", keywords: "医疗" },
  { name: "传送 · 每日", desc: "关键词预填「传送」", freq: "每日", action: "标准动作", keywords: "传送" },
];
function ItemPowerSectionsEditor({ value, onChange }: { value: ItemPowerSection[]; onChange: (sections: ItemPowerSection[]) => void }) {
  const [armPreset, setArmPreset] = useState<string | null>(null);
  useEffect(() => {
    if (!armPreset) return;
    const t = window.setTimeout(() => setArmPreset(null), 2500);
    return () => window.clearTimeout(t);
  }, [armPreset]);
  const applyPreset = (p: (typeof ITEM_POWER_PRESETS)[number]) => {
    if (value.length === 0) {
      onChange([{ freq: p.freq as ItemPowerSection["freq"], action: p.action, keywords: p.keywords, blocks: [] }]);
      return;
    }
    if (armPreset === p.name) {
      onChange([...value, { freq: p.freq as ItemPowerSection["freq"], action: p.action, keywords: p.keywords, blocks: [] }]);
      setArmPreset(null);
    } else {
      setArmPreset(p.name);
    }
  };
  const updSection = (i: number, upd: Partial<ItemPowerSection>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...upd } : s)));
  const chooseFreq = (i: number, f: string) => updSection(i, { freq: value[i].freq === f ? "" : (f as ItemPowerSection["freq"]) });
  const chooseAction = (i: number, a: string) => updSection(i, { action: value[i].action === a ? "" : a });
  const toggleKw = (i: number, kw: string) => {
    const cur = value[i].keywords ?? "";
    const tags = cur.split(/[，,、]/).map((s) => s.trim()).filter(Boolean);
    const next = tags.includes(kw) ? tags.filter((t) => t !== kw) : [...tags, kw];
    updSection(i, { keywords: next.join("，") });
  };
  return (
    <div className="hb-itempower" data-ed-field="powerSections">
      <div className="hb-pblock-presets">
        <span className="hb-pblock-presets-label">
          {value.length === 0 ? "物品威能段预设 · 点击填入段头" : "物品威能段预设 · 点击一次再点确认可追加一段"}
        </span>
        {ITEM_POWER_PRESETS.map((p) => (
          <button key={p.name} type="button" className={"chip mini" + (armPreset === p.name ? " armed" : "")} title={p.desc} onClick={() => applyPreset(p)}>
            {armPreset === p.name ? "确认追加？" : p.name}
          </button>
        ))}
      </div>
      <p className="hint" style={{ margin: "0 0 8px" }}>
        官方格式：<code>威能（关键词）✦每日（自由动作）</code> 段头 + <code>div.text</code> 正文标签块。段正文可复用下方标签块编辑器的全部标签与次攻击组。
      </p>
      {value.length === 0 && (
        <div className="hb-pblock-actions">
          <OutlinedButton onClick={() => onChange([{ freq: "每日", action: "标准动作", keywords: "", blocks: [] }])}>＋ 添加一个威能段</OutlinedButton>
        </div>
      )}
      {value.map((s, i) => (
        <div key={i} className="hb-itempower-sec">
          <div className="hb-itempower-head">
            <span className="hb-itempower-headlabel">威能段 {i + 1}</span>
            <span className="hb-itempower-preview">预览：{s.freq ? <>✦ {s.freq}{s.action ? `（${s.action}）` : ""}</> : "（未设频率）"}</span>
            <IconButton title="删除此段" onClick={() => onChange(value.filter((_, j) => j !== i))}><span className="material-symbols-outlined">delete</span></IconButton>
          </div>
          <div className="hb-itempower-kwrow">
            <span className="hb-label-sm">关键词</span>
            <FilledTextField value={s.keywords ?? ""} placeholder="威能（关键词），可空" onInput={(e) => updSection(i, { keywords: (e.target as HTMLInputElement).value })} />
            <div className="hb-ed-chips">
              {[...new Set([...(s.keywords ?? "").split(/[，,、]/).map((t) => t.trim()).filter(Boolean), ...ITEM_POWER_KEYWORDS])].slice(0, 14).map((kw) => (
                <button key={kw} type="button" className={"chip mini" + ((s.keywords ?? "").split(/[，,、]/).includes(kw) ? " active" : "")} onClick={() => toggleKw(i, kw)}>{kw}</button>
              ))}
            </div>
          </div>
          <div className="hb-itempower-freqrow">
            <span className="hb-label-sm">频率</span>
            <div className="hb-ed-chips">
              {[...ITEM_FREQUENCIES].map((fr) => (
                <button key={fr} type="button" className={"chip mini" + (s.freq === fr ? " active" : "")} onClick={() => chooseFreq(i, fr)}>{fr}</button>
              ))}
            </div>
            <span className="hb-label-sm">动作</span>
            <div className="hb-ed-chips">
              {ACTION_TYPES.map((a) => (
                <button key={a} type="button" className={"chip mini" + (s.action === a ? " active" : "")} onClick={() => chooseAction(i, a)}>{a}</button>
              ))}
            </div>
          </div>
          <PowerBlockEditor value={s.blocks} onChange={(blocks) => updSection(i, { blocks })} />
        </div>
      ))}
      {value.length > 0 && (
        <div className="hb-pblock-actions">
          <OutlinedButton onClick={() => onChange([...value, { freq: "每日", action: "标准动作", keywords: "", blocks: [] }])}>＋ 再添加一个威能段</OutlinedButton>
        </div>
      )}
    </div>
  );
}

// 预览「威能引用」懒加载缓存：首次需要时加载一次官方威能表，供 [[威能]] 悬浮解析
let powerIndexPromise: Promise<Entry[]> | undefined;

export default function EntryEditor({
  poolId,
  entry,
  defaultCategory,
  layout,
  onBack,
  onSaved,
}: {
  poolId: string;
  /** null = 新建 */
  entry: Entry | null;
  defaultCategory?: string;
  layout: "single" | "double";
  onBack: () => void;
  /** done=true 表示保存后应返回列表 */
  onSaved: (saved: Entry, opts: { done: boolean }) => void;
}) {
  const isNew = entry === null;
  const [pools] = useState<HomebrewPool[]>(() => loadPools());
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (entry) return { ...draftToForm(entry), __pool: poolId };
    const draft = loadDraft();
    const base = blank(defaultCategory);
    return {
      ...base,
      ...draft,
      category: defaultCategory && CATEGORY_LIST.includes(defaultCategory) ? defaultCategory : draft.category ?? base.category,
      bodyFormat: "md",
      __pool: poolId,
    };
  });
  const [err, setErr] = useState("");
  const [tip, setTip] = useState("");
  const [fieldErrs, setFieldErrs] = useState<{ key: string; label: string }[]>([]);
  /** 「附加设置」折叠区：未标 core 的面板统一收进这里，默认收起（主次分明） */
  const [extraOpen, setExtraOpen] = useState(false);
  /** 威能射程：当前选中的模板项（动态数字型），数字输入框由此驱动 */
  const [rangePick, setRangePick] = useState<RangeTemplateItem | null>(null);
  const [rangeN1, setRangeN1] = useState("");
  const [rangeN2, setRangeN2] = useState("");
  // 外部带入/导入 range 时，反向解析回填模板与数字位
  useEffect(() => {
    const r = parseRange(form.range ?? "");
    if (r && !r.tpl.fixed) {
      setRangePick(r.tpl);
      setRangeN1(r.n1);
      setRangeN2(r.n2);
    }
  }, [form.range]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // 模板复制：新建时选择既有同类别条目作为起点
  const [tmplOpen, setTmplOpen] = useState(false);
  const [tmplQuery, setTmplQuery] = useState("");
  const [tmplEntries, setTmplEntries] = useState<Entry[] | null>(null);
  // 预览威能引用：装备的 威能/正文 含 [[链接]] 时，懒加载官方威能表用于悬浮解析
  const [pwrMap, setPwrMap] = useState<Map<string, Entry> | null>(null);
  const pwrStartedRef = useRef(false);

  useEffect(() => {
    if (!isNew) clearDraft();
  }, [isNew]);

  // 打开模板面板（或切分类）时重新加载当前类别的模板候选：本包+其它包+官方
  useEffect(() => {
    if (!tmplOpen || !form.category) return;
    let alive = true;
    setTmplEntries(null);
    setTmplQuery("");
    (async () => {
      const user = pools.flatMap((p) => p.entries).filter((e) => e.category === form.category);
      let official: Entry[] = [];
      try {
        official = await loadCategory(form.category);
      } catch {
        official = [];
      }
      if (!alive) return;
      const byId = new Map(official.map((e) => [e.id, e]));
      for (const e of user) byId.set(e.id, e);
      setTmplEntries([...byId.values()]);
    })();
    return () => { alive = false; };
  }, [tmplOpen, form.category, pools]);

  // 装备预览的威能引用解析：仅当正文/威能出现 [[…]] 时懒加载官方威能索引（只加载一次）
  useEffect(() => {
    if (form.category !== "equipment" || pwrStartedRef.current) return;
    const src = (form.sourceText ?? "") + "\n" + (form.power ?? "");
    if (!src.includes("[[")) return;
    pwrStartedRef.current = true;
    let alive = true;
    (powerIndexPromise ??= loadCategory("power")).then((entries) => {
      if (!alive) return;
      const m = new Map<string, Entry>();
      for (const e of entries) {
        m.set(e.id, e);
        m.set(e.id.toLowerCase(), e);
        if (e.name) m.set(e.name, e);
        if (e.nameEn) m.set(e.nameEn, e);
      }
      setPwrMap(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, [form.category, form.sourceText, form.power]);

  const lookup = pwrMap ? (t: string) => pwrMap.get(t) ?? pwrMap.get(t.toLowerCase()) : undefined;
  const applyTemplate = (e: Entry) => {
    setForm((prev) => ({ ...draftToForm(e), bodyFormat: "md", __pool: prev.__pool ?? poolId }));
    setTip(`已从「${e.name}」带入字段作为起点，可在此基础上修改。`);
    setTmplOpen(false);
  };
  const tmplFiltered = useMemo(() => {
    const q = tmplQuery.trim().toLowerCase();
    const list = tmplEntries ?? [];
    if (!q) return list.slice(0, 120);
    return list.filter((e) => (e.name + " " + (e.nameEn ?? "")).toLowerCase().includes(q)).slice(0, 120);
  }, [tmplEntries, tmplQuery]);

  const fields = useMemo(() => fieldsFor(form.category ?? ""), [form.category]);
  const isLegacyWiki = form.bodyFormat === "wiki";

  function patch(next: Record<string, string>) {
    setForm((prev) => {
      const merged = { ...prev, ...next };
      if (isNew) saveDraft(merged);
      return merged;
    });
    setTip("");
    setFieldErrs([]);
    setErr("");
  }

  function set(k: string, v: string) {
    patch({ [k]: v });
  }

  /** 从预览虚线框点击跳转：把左侧对应字段滚动到视野内并聚焦、短暂高亮 */
  function goField(k: string) {
    const el = formRef.current?.querySelector(`[data-ed-field="${k}"]`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("hb-focus-flash");
    window.setTimeout(() => el.classList.remove("hb-focus-flash"), 1600);
    const input = el.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    input?.focus();
  }

  /** 选择私设类型：切换时清空旧类型的专属字段，保留通用字段与归属包 */
  function pickCategory(cat: string) {
    if (cat === form.category) return;
    const was = form.category;
    setForm((prev) => {
      const oldKeys = new Set((CATEGORY_FIELDS[prev.category ?? ""] ?? []).map((f) => f.key));
      const next: Record<string, string> = { category: cat };
      for (const k of Object.keys(prev)) {
        // category 已由 { category: cat } 设置，避免循环用旧值覆盖
        if (k !== "category" && !oldKeys.has(k)) next[k] = prev[k];
      }
      return next;
    });
    setTip(was ? `已切换为「${CATEGORY_LABELS[cat] ?? cat}」，原「${CATEGORY_LABELS[was] ?? was}」的专属字段已清空。` : `已选择「${CATEGORY_LABELS[cat] ?? cat}」。`);
  }

  /** 在正文光标处插入 Markdown 片段 */
  function insert(tool: (typeof TOOLS)[number]) {
    const ta = bodyRef.current;
    const val = form.sourceText ?? "";
    if (!ta) {
      set("sourceText", val + (val && !val.endsWith("\n") ? "\n" : "") + tool.before + tool.sample + tool.after);
      return;
    }
    const start = ta.selectionStart ?? val.length;
    const end = ta.selectionEnd ?? start;
    const selected = val.slice(start, end) || tool.sample;
    let head = val.slice(0, start);
    if (tool.block && head && !head.endsWith("\n")) head += "\n";
    const insertText = tool.before + selected + tool.after;
    const next = head + insertText + val.slice(end);
    set("sourceText", next);
    const caret = head.length + tool.before.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret + selected.length);
    });
  }

  function toMarkdown() {
    patch({ sourceText: wikiToMarkdown(form.sourceText ?? ""), bodyFormat: "md" });
    setTip("已转换为 Markdown，请检查排版后保存。");
  }

  const previewEntry = useMemo(() => {
    if (!form.category) return null;
    const fused = { ...blank(form.category), ...form, category: form.category };
    const r = buildEntry(fused, entry?.id ?? "preview", { allowEmpty: true });
    return r.ok ? r.entry : null;
  }, [form, entry]);

  function save(keepCreating: boolean) {
    // 字段校验：清空旧错误，收集缺失的必填字段（去重），顶部红条列出并可点击定位
    const miss: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    const pushMiss = (mm: { key: string; label: string }) => {
      if (!seen.has(mm.key)) {
        seen.add(mm.key);
        miss.push(mm);
      }
    };
    if (!(form.name ?? "").trim()) pushMiss({ key: "name", label: "名称" });
    if (!form.category) pushMiss({ key: "category", label: "私设类型" });
    for (const f of fields) {
      if (f.required && !(form[f.key] ?? "").trim()) pushMiss({ key: f.key, label: f.label });
    }
    if (miss.length) {
      setFieldErrs(miss);
      setErr("");
      return;
    }

    const targetId = isNew ? uniqueEntryId((form.name ?? "").trim()) : entry.id;
    const r = buildEntry(form, targetId);
    if (!r.ok) {
      setErr(r.error);
      setFieldErrs([]);
      return;
    }
    setErr("");
    setFieldErrs([]);
    const target = form.__pool && pools.some((p) => p.id === form.__pool) ? form.__pool : poolId;
    const saved = upsertEntryInPool(r.entry.id, r.entry, target);
    if (isNew) clearDraft();
    if (keepCreating && isNew) {
      onSaved(saved, { done: false });
      setForm({ ...blank(form.category), __pool: form.__pool ?? poolId });
      setTip("已保存「" + saved.name + "」，可继续创建下一条。");
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      return;
    }
    onSaved(saved, { done: true });
  }

  /** 导出当前条目为 JSON 单文件（便于分享/备份） */
  function exportJson(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (!previewEntry) {
      setErr("请先选择类型并填写名称，再导出。");
      return;
    }
    const blob = new Blob([JSON.stringify(previewEntry, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${previewEntry.name || "条目"}.json`;
    document.body.appendChild(a);
    a.click();
    // 延迟释放，避免个别浏览器在下载前就撤销导致中断
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.body.removeChild(a);
  }

  /** 从 JSON 单文件导入并填充当前表单 */
  function importJson(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as Partial<Entry> & Record<string, unknown>;
        if (!data.category) throw new Error("缺 category");
        const f = draftToForm(data as Entry);
        setForm({ ...f, category: f.category || String(data.category), bodyFormat: "md", __pool: poolId });
        setTip("已导入，请核对字段后保存。");
      } catch {
        setErr("导入失败：不是有效的 JSON 条目文件。");
      }
    };
    reader.readAsText(file);
  }

  function renderField(f: SheetField) {
    const val = form[f.key] ?? "";
    // 「威能类型」单选：攻击 / 辅助 / 特殊，写入 powerType（buildEntry 派生 powerKind，卡头显示「战士攻击 1」）
    if (f.key === "powerType") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <div className="hb-ed-chips">
            {POWER_TYPES.map((t) => (
              <button
                key={t.label}
                type="button"
                className={"chip mini" + (val === t.label ? " active" : "")}
                onClick={() => set("powerType", val === t.label ? "" : t.label)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="hint">威能类型会显示在卡头，如「战士攻击 1」「战士辅助 2」「战士特殊」。</span>
        </div>
      );
    }
    // 「再生频率」单选：随意 / 遭遇 / 每日，决定 usage 代码与卡面色（buildEntry 派生 usage）
    if (f.key === "usageZh") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <div className="hb-ed-chips">
            {POWER_FREQUENCIES.map((fr) => (
              <button
                key={fr.label}
                type="button"
                className={"chip mini" + (val === fr.label ? " active" : "")}
                onClick={() => set("usageZh", val === fr.label ? "" : fr.label)}
              >
                {fr.label}
              </button>
            ))}
          </div>
          <span className="hint">决定使用次数与卡面色：随意·绿 / 遭遇·红 / 每日·灰。</span>
        </div>
      );
    }
    // 「动作」：按钮单选（选项不多，点选直观；全宽排列避免换行过多）
    if (f.key === "actionType") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <div className="hb-ed-chips">
            {(f.options ?? []).map((o) => (
              <button key={o} type="button" className={"chip mini" + (val === o ? " active" : "")} onClick={() => set(f.key, val === o ? "" : o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    }
    // —— 各类型结构化编辑器 ——
    // 装备「物品威能段」
    if (f.key === "powerSections") {
      const secs = parseItemPowerSections(form.powerSections);
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <ItemPowerSectionsEditor value={secs} onChange={(s) => set("powerSections", JSON.stringify(s))} />
        </div>
      );
    }
    // 专长「关联威能等级表」
    if (f.key === "featRows") {
      const rows = parseFeatTable(form.featRows) ?? [];
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <FeatTableEditor value={rows} onChange={(r) => set("featRows", JSON.stringify(r))} />
        </div>
      );
    }
    // 套装「件数增益块」
    if (f.key === "setBonuses") {
      const blocks = parseSetBonuses(form.setBonuses).setBonus;
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <SetBonusEditor value={blocks} onChange={(b) => set("setBonuses", JSON.stringify(b))} />
        </div>
      );
    }
    // 词典「词条对」
    if (f.key === "termsPairs") {
      const pairs = parseTerms(form.termsPairs);
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <TermsPairsEditor value={pairs} onChange={(p) => set("termsPairs", serializeTerms(p))} />
        </div>
      );
    }
    // 专长「前提」：text + 前提句式候选
    if (f.key === "prerequisite" && form.category === "feat") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <div className="hb-ed-chips">
            {FEAT_PREREQ_CANDIDATES.map((c) => (
              <button key={c} type="button" className={"chip mini" + (val === c ? " active" : "")} onClick={() => set(f.key, val === c ? "" : c)}>{c}</button>
            ))}
          </div>
          <textarea className="hb-textarea" value={val} rows={3} placeholder={f.placeholder ?? "如：职业：战士"} onChange={(e) => set(f.key, e.target.value)} />
          <span className="hint">官方前提以 职业式 / 等级式 / 受训式 为主；点选候选或自由输入。</span>
        </div>
      );
    }
    // 专长「增益」：预设条 + 自由文本
    if (f.key === "benefit" && form.category === "feat") {
      const insertPreset = (t: string) => {
        const cur = (form.benefit ?? "").trim();
        set("benefit", cur + (cur ? "\n" : "") + t);
      };
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <div className="hb-pblock-presets">
            <span className="hb-pblock-presets-label">专长预设 · 点击在增益末尾追加模板</span>
            {FEAT_PRESETS.map((p) => (
              <button key={p.name} type="button" className="chip mini" title={p.desc} onClick={() => insertPreset(p.blocks.map((b) => b.text).join(""))}>{p.name}</button>
            ))}
          </div>
          <textarea className="hb-textarea" value={val} rows={5} placeholder={f.placeholder ?? "该专长带来的效果"} onChange={(e) => set(f.key, e.target.value)} />
        </div>
      );
    }
    // 「风味文本」：斜体风味描述，独立成段用全宽多行输入，便于书写
    if (f.key === "flavorText") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <textarea
            className="hb-textarea"
            value={val}
            rows={2}
            placeholder={f.placeholder ?? "可选的斜体风味描述"}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)}
          />
        </div>
      );
    }
    if (f.key === "powerBlocks") {
      const blocks = parsePowerBlocks(form.powerBlocks) ?? [];
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <PowerBlockEditor value={blocks} onChange={(b) => set("powerBlocks", JSON.stringify(b))} />
        </div>
      );
    }
    if (f.type === "select") {
      return (
        <div key={f.key} className="hb-field" data-ed-field={f.key}>
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <div className="hb-ed-chips">
            {f.key === "cardColor" ? (
              <>
                {(f.options ?? []).map((o) => (
                  <button
                    key={o}
                    type="button"
                    title={o}
                    className={"chip mini hb-color-chip" + (val === o ? " active" : "")}
                    style={{ "--sw": o } as CSSProperties}
                    onClick={() => set(f.key, val === o ? "" : o)}
                  >
                    <span className="hb-color-swatch" />
                  </button>
                ))}
              </>
            ) : f.key === "cardIcon" ? (
              (f.options ?? []).map((o) => (
                <button key={o} type="button" title={o} className={"chip mini hb-icon-chip" + (val === o ? " active" : "")} onClick={() => set(f.key, val === o ? "" : o)}>
                  <span className="material-symbols-outlined">{o}</span>
                </button>
              ))
            ) : (
              (f.options ?? []).map((o) => (
                <button key={o} type="button" className={"chip mini" + (val === o ? " active" : "")} onClick={() => set(f.key, val === o ? "" : o)}>
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      );
    }
    if (f.key === "sourceText") {
      return (
        <div key={f.key} className="hb-field hb-body-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">正文</span>
          <div className="hb-md-tools">
            {TOOLS.map((t) => (
              <button key={t.label} type="button" className="hb-md-tool" title={t.label} onClick={() => insert(t)}>
                <span className="material-symbols-outlined">{t.icon}</span>
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            className="hb-textarea hb-body-textarea"
            value={val}
            rows={16}
            placeholder="在这里写条目正文。支持 Markdown 语法使用。"
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)}
          />
          <span className="hint">支持 Markdown 语法使用。上面一排按钮可直接插入标题、列表、表格等格式。</span>
        </div>
      );
    }
    if (f.type === "longtext") {
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}</span>
          <textarea
            className="hb-textarea"
            value={val}
            rows={4}
            placeholder={f.placeholder}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)}
          />
        </div>
      );
    }
    if (f.type === "multichips") {
      const sep = f.delimiter ?? "/";
      const parts = val.split(sep).map((t) => t.trim()).filter(Boolean);
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <FilledTextField value={val} placeholder={f.placeholder ?? `可点选下面候选，或自由输入；可多选，用 ${sep} 分隔`} onInput={(e) => set(f.key, (e.target as HTMLInputElement).value ?? "")} />
          {f.groups && f.groups.length > 0 ? (
            <div className="hb-kw-groups">
              {f.groups.map((g) => (
                <div key={g.label} className="hb-kw-group">
                  <div className="hb-kw-group-head">
                    <span className="hb-kw-group-name">{g.label}</span>
                    {g.hint && <span className="hint">{g.hint}</span>}
                  </div>
                  <div className="hb-ed-chips">
                    {g.items.map((it) => {
                      const active = parts.includes(it.kw);
                      return (
                        <button
                          key={it.kw}
                          type="button"
                          title={it.desc}
                          className={"chip mini" + (active ? " active" : "")}
                          onClick={() => {
                            const next = active ? parts.filter((p) => p !== it.kw) : [...parts, it.kw];
                            set(f.key, next.join(sep));
                          }}
                        >
                          {it.kw}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (f.options ?? []).length > 0 ? (
            <div className="hb-ed-chips">
              {(f.options ?? []).map((o) => {
                const active = parts.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    className={"chip mini" + (active ? " active" : "")}
                    onClick={() => {
                      const next = active ? parts.filter((p) => p !== o) : [...parts, o];
                      set(f.key, next.join(sep));
                    }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : null}
          <span className="hint">可多选：单击切换勾选，多个值以「{sep}」分隔。悬停候选词可查看其解释（参考万律术语表）。</span>
        </div>
      );
    }
    // 「射程/范围」：模板分组点选 + 数字位独立输入 + 自由输入。
    // 动态型模板（如「远程 + N」「区域N爆发M」）选中后出现专用数字输入框，
    // 输入即组成完整 range；range 文本框仍可自由编辑/改写组合。
    if (f.key === "range") {
      const parsed = parseRange(val);
      const activePick = parsed ? parsed.tpl : rangePick;
      const setN = (i: 1 | 2, v: string) => {
        if (i === 1) setRangeN1(v);
        else setRangeN2(v);
        const t = rangePick ?? activePick;
        if (t) set(f.key, composeRange(t, i === 1 ? v : rangeN1, i === 2 ? v : rangeN2));
      };
      return (
        <div key={f.key} className="hb-field hb-field-full" data-ed-field={f.key}>
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          {rangePick && !rangePick.fixed ? (
            <span className="hb-range-badge">
              当前模板：{rangePick.label.replace("N", rangeN1 || "<N>").replace("M", rangeN2 || "<M>")}
              <button type="button" className="hb-range-clear" onClick={() => { setRangePick(null); setRangeN1(""); setRangeN2(""); set(f.key, ""); }}>清除模板</button>
            </span>
          ) : activePick && !activePick.fixed ? (
            <span className="hb-range-badge">
              当前值匹配：{activePick.label.replace("N", rangeN1 || "<N>").replace("M", rangeN2 || "<M>")}
            </span>
          ) : null}
          <FilledTextField value={val} placeholder={f.placeholder ?? "如：近战武器 / 远程10 / 近程爆发3 / 区域10爆发2"} onInput={(e) => set(f.key, (e.target as HTMLInputElement).value ?? "")} />
          {(rangePick && !rangePick.fixed) && (
            <div className="hb-range-nums">
              <label>
                <span>{rangePick.n1Label ?? "数字"}</span>
                <FilledTextField type="number" value={rangeN1} onInput={(e) => setN(1, (e.target as HTMLInputElement).value ?? "")} />
              </label>
              {rangePick.n2 && (
                <label>
                  <span>{rangePick.n2Label ?? "数字"}</span>
                  <FilledTextField type="number" value={rangeN2} onInput={(e) => setN(2, (e.target as HTMLInputElement).value ?? "")} />
                </label>
              )}
            </div>
          )}
          <div className="hb-kw-groups">
            {RANGE_TEMPLATES.map((g) => (
              <div key={g.group} className="hb-kw-group">
                <div className="hb-kw-group-head"><span className="hb-kw-group-name">{g.group}</span></div>
                <div className="hb-ed-chips">
                  {g.items.map((it) => {
                    const active = it.fixed ? val.trim() === it.prefix : activePick === it;
                    return (
                      <button
                        key={it.label}
                        type="button"
                        className={"chip mini" + (active ? " active" : "")}
                        onClick={() => {
                          setRangePick(it);
                          if (it.fixed) {
                            setRangeN1(""); setRangeN2("");
                            set(f.key, val.trim() === it.prefix ? "" : it.prefix);
                          } else {
                            set(f.key, composeRange(it, "", ""));
                          }
                        }}
                      >
                        {it.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <span className="hint">点选「+ N / 区域N爆发M」型模板后，在下方数字框填数值即生成射程；亦可直接手动输入任意组合，如「近战触及或远程5」。</span>
        </div>
      );
    }
    return (
      <div key={f.key} className="hb-field" data-ed-field={f.key}>
        <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
        <FilledTextField value={val} placeholder={f.placeholder} onInput={(e) => set(f.key, (e.target as HTMLInputElement).value ?? "")} />
        {f.key === "itemLevel" && enhExpectedAll && <span className="hint">按这些等级，增强应约为 {enhExpectedAll}</span>}
        {f.key === "enh" && firstEnh !== undefined && (
          <span className={"hint" + (val.trim() && !val.includes("+" + firstEnh) ? " hb-hint-warn" : "")}>
            {val.trim() && !val.includes("+" + firstEnh)
              ? `提示：该等级通常为 +${firstEnh}，当前「${val.trim()}」可能不符`
              : `该等级对应增强：+${firstEnh}`}
          </span>
        )}
        {STAT_HINTS[f.key] && <span className="hint">{STAT_HINTS[f.key]}</span>}
        {f.key === "cost" && firstPrice !== undefined && (
          <span className={"hint" + (val.trim() && val.includes("gp") && !val.includes(String(firstPrice)) ? " hb-hint-warn" : "")}>
            {val.trim() && val.includes("gp") && !val.includes(String(firstPrice))
              ? `提示：首个等级 L${firstLevel} 通常为 ${firstPrice} gp，当前「${val.trim()}」可能不符`
              : `首个等级 L${firstLevel} 的价格：约 ${firstPrice} gp`}
          </span>
        )}
      </div>
    );
  }

  const poolName = pools.find((p) => p.id === (form.__pool ?? poolId))?.name ?? "";
  // 增强 ↔ 物品等级联动：按物品等级推导应然增强加值（供 itemLevel/enh 字段提示与冲突告警）
  const levels = itemLevels(form.itemLevel ?? "");
  const enhExpectedAll = [...new Set(levels.map(enhancementBonusForLevel))].map((n) => "+" + n).join("/");
  const firstEnh = levels.length ? enhancementBonusForLevel(levels[0]) : undefined;
  const firstLevel = levels.length ? levels[0] : undefined;
  const firstPrice = firstLevel ? priceForLevel(firstLevel) : undefined;

  const common = fields.filter((f) => ["name", "nameEn", "source"].includes(f.key));
  const tagField = fields.find((f) => f.key === "tags");
  const extras = fields.filter((f) => !["name", "nameEn", "category", "tags", "source", "sourceText"].includes(f.key));
  const appearance = extras.filter((f) => f.key === "cardColor" || f.key === "cardIcon");
  const extrasPlain = extras.filter((f) => f.key !== "cardColor" && f.key !== "cardIcon");
  const body = fields.find((f) => f.key === "sourceText");
  // 已配置分区的分类（如装备）按右卡片组成部分分区；未配置的回落为默认单区布局
  const sections = CATEGORY_SECTIONS[form.category ?? ""];
  // 主次分明：标 core 的面板常驻展开；其余面板统一收进底部「附加设置」折叠区
  const { coreSections, extraSections } = useMemo(() => {
    if (!sections) return { coreSections: [], extraSections: [] };
    return sections.reduce(
      (acc, sec) => {
        if (sec.core) acc.coreSections.push(sec);
        else acc.extraSections.push(sec);
        return acc;
      },
      { coreSections: [] as HomebrewSection[], extraSections: [] as HomebrewSection[] },
    );
  }, [sections]);
  const fieldByKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const poolField = (
    <div className="hb-field hb-field-full">
      <span className="hb-label">归属包</span>
      <div className="hb-ed-chips">
        {pools.map((p) => (
          <button key={p.id} type="button" className={"chip mini" + ((form.__pool ?? poolId) === p.id ? " active" : "")} onClick={() => set("__pool", p.id)}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className={"hb-editor" + (layout === "double" ? " double" : "")}>
      <div className="hb-ed-head">
        <IconButton title="返回条目列表" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span></IconButton>
        <div className="hb-ed-title">
          <div className="hb-ed-crumb">{poolName}<span className="material-symbols-outlined">chevron_right</span>{isNew ? "新建条目" : "编辑条目"}</div>
          <div className="hb-ed-name">{(form.name ?? "").trim() || "（未命名）"}</div>
        </div>
        <div className="hb-ed-ops">
          {isNew && <OutlinedButton onClick={() => setTmplOpen(true)}>从模板新建</OutlinedButton>}
          <IconButton title="导出为 JSON 单文件" onClick={exportJson}><span className="material-symbols-outlined">download</span></IconButton>
          <IconButton title="从 JSON 单文件导入" onClick={() => importInputRef.current?.click()}><span className="material-symbols-outlined">upload</span></IconButton>
          <TextButton onClick={onBack}>取消</TextButton>
          {isNew && <OutlinedButton onClick={() => save(true)}>保存并继续新建</OutlinedButton>}
          <FilledButton onClick={() => save(false)}>
            <span slot="icon" className="material-symbols-outlined">save</span>
            保存
          </FilledButton>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = "";
          }}
        />
      </div>

      {tmplOpen && (
        <div className="hb-tmpl-modal">
          <div className="hb-tmpl-modal-inner">
            <div className="hb-tmpl-modal-head">
              <span>选择模板（{CATEGORY_LABELS[form.category ?? ""] ?? "条目"}）</span>
              <IconButton title="关闭" onClick={() => setTmplOpen(false)}><span className="material-symbols-outlined">close</span></IconButton>
            </div>
            <FilledTextField
              value={tmplQuery}
              label="搜索模板"
              onInput={(e) => setTmplQuery((e.target as HTMLInputElement).value ?? "")}
            />
            {tmplEntries === null ? (
              <p className="hint" style={{ padding: "12px 0" }}>加载中…</p>
            ) : tmplFiltered.length === 0 ? (
              <p className="hint" style={{ padding: "12px 0" }}>没有可用的模板。</p>
            ) : (
              <div className="hb-tmpl-list">
                {tmplFiltered.map((e) => (
                  <div key={e.id} className="hb-tmpl-item" onClick={() => applyTemplate(e)}>
                    <div className="hb-tmpl-name">{e.name}{e.nameEn ? ` ${e.nameEn}` : ""}</div>
                    <div className="hb-tmpl-meta">{(CATEGORY_LABELS[e.category] ?? e.category)}{e.source ? ` · ${e.source}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {err && <div className="hb-err">{err}</div>}
      {fieldErrs.length > 0 && (
        <div className="hb-field-err">
          <span className="hb-field-err-title">尚缺以下必填项：</span>
          {fieldErrs.map((m) => (
            <button
              key={m.key}
              type="button"
              className="hb-field-err-item"
              onClick={() => { goField(m.key); setFieldErrs((prev) => prev.filter((x) => x.key !== m.key)); }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      {tip && <div className="hb-tip">{tip}</div>}
      {isLegacyWiki && (
        <div className="hb-legacy">
          <span className="material-symbols-outlined">history</span>
          <span>这条内容是早期版本的 wikitext 正文，仍按原样渲染。</span>
          <TextButton onClick={toMarkdown}>转换为 Markdown</TextButton>
        </div>
      )}

      <div className="hb-ed-body">
        <div className="hb-ed-form" ref={formRef}>
          {isNew && (
            <section className="hb-ed-card hb-type-card" data-ed-field="category">
              <h4 className="hb-ed-card-title">{form.category ? "私设类型（可随时切换）" : "选择要建立的私设类型"}</h4>
              {!form.category && <p className="hint" style={{ margin: 0 }}>选择类型后进入表单；正文与专属字段将实时预览。</p>}
              <div className="cat-chips hb-ed-chips">
                {CATEGORY_LIST.map((c) => (
                  <button key={c} type="button" className={"chip mini" + (form.category === c ? " active" : "")} onClick={() => pickCategory(c)}>
                    {CATEGORY_LABELS[c] ?? c}
                  </button>
                ))}
              </div>
            </section>
          )}

          {form.category && (
            <>
              {sections ? (
                <>
                  {coreSections.map((sec, si) => (
                    <section key={si} className="hb-ed-card">
                      <h4 className="hb-ed-card-title">{sec.title}</h4>
                      {sec.hint && <p className="hb-ed-section-hint">{sec.hint}</p>}
                      {si === 0 && poolField}
                      {sec.keys.map((k) => fieldByKey.get(k)).filter((f): f is SheetField => !!f).map(renderField)}
                    </section>
                  ))}
                  {extraSections.length > 0 && (
                    <section className={"hb-extra-section" + (extraOpen ? " open" : "")}>
                      <button type="button" className="hb-extra-header" onClick={() => setExtraOpen((v) => !v)}>
                        <span className="hb-extra-title">
                          <span className="material-symbols-outlined">tune</span>
                          附加设置
                        </span>
                        <span className="hb-extra-sub">{extraSections.map((s) => s.title).join(" · ")}</span>
                        <span className={"material-symbols-outlined hb-extra-arrow" + (extraOpen ? " open" : "")}>expand_more</span>
                      </button>
                      <div className="hb-extra-body">
                        <div className="hb-extra-body-inner">
                          {extraSections.map((sec, ei) => (
                            <section key={ei} className="hb-ed-card">
                              <h4 className="hb-ed-card-title">{sec.title}</h4>
                              {sec.hint && <p className="hb-ed-section-hint">{sec.hint}</p>}
                              {sec.keys.map((k) => fieldByKey.get(k)).filter((f): f is SheetField => !!f).map(renderField)}
                            </section>
                          ))}
                        </div>
                      </div>
                    </section>
                  )}
                </>
              ) : (
              <>
                <section className="hb-ed-card">
                  <h4 className="hb-ed-card-title">基本信息 · {CATEGORY_LABELS[form.category] ?? form.category}</h4>
                  {poolField}
                  {common.map(renderField)}
                  {extrasPlain.length > 0 && (
                    <>
                      <div className="hb-ed-field-sep">该类型的专属字段</div>
                      {extrasPlain.map(renderField)}
                    </>
                  )}
                </section>
                {appearance.length > 0 && (
                  <section className="hb-ed-card">
                    <h4 className="hb-ed-card-title">外观</h4>
                    {appearance.map(renderField)}
                  </section>
                )}
                {tagField && (
                  <section className="hb-ed-card">
                    <h4 className="hb-ed-card-title">标签</h4>
                    <p className="hb-ed-section-hint">用于搜索与归类（逗号分隔），不会显示在卡片上，可留空。</p>
                    {renderField(tagField)}
                  </section>
                )}
              </>
              )}

              {body && !WITHOUT_BODY.has(form.category) && (
                <section className="hb-ed-card">{renderField(body)}</section>
              )}
            </>
          )}
        </div>

        <div className="hb-ed-preview">
          <div className="hb-ed-preview-head">
            <span className="material-symbols-outlined">visibility</span>
            实时预览
          </div>
          {previewEntry ? (
            <EntryCard entry={previewEntry} frame jump={goField} lookup={lookup} />
          ) : (
            <p className="hint">先在左侧选择私设类型，这里将实时呈现该词条在车卡界面中的最终样子，填入字段即时更新。</p>
          )}
        </div>
      </div>
    </div>
  );
}
