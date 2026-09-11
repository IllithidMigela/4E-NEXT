import { useMemo, useState } from "react";
import { useIncremental } from "../lib/incremental";
import { createPortal } from "react-dom";
import EntryCard from "./EntryCard";
import type { Entry } from "../data/types";
import { DeepSearchField, matchByName, matchDeep } from "./DeepSearch";

// 槽位 → 允许出现在该位置的物品种类（依据 4e 规则；空数组 = 不限即「其他」）。
//   主手/副手 = 武器 + 法器（法器持握于手，盾牌独立走「臂部」槽）；
//   佩戴 = 不占具体身体槽的奇物类（奇物/另类奖励/龙晶强化/机关附件）；其他 = 全部。
const SLOT_CATEGORY: Record<string, string[]> = {
  主手: ["武器", "法器"], 副手: ["武器", "法器"],
  佩戴: ["奇物", "另类奖励", "龙晶强化", "机关附件", "法器"],
  头部: ["头部"], 颈部: ["颈部"], 护甲: ["护甲"], 腰部: ["腰部"], 臂部: ["臂部"],
  手部: ["手部"], 戒指: ["戒指"], 足部: ["足部"], 奇物: ["奇物"],
  消耗品: ["消耗品", "炼金物品", "弹药", "刺客毒药"],
  其他: [], 冒险装备: ["冒险装备"],
};

// 武器「分类」依据全书兵种组（近战13组 / 远程4组）
const WEAPON_MELEE = ["斧", "硬头锤", "轻刃", "重刃", "徒手", "连枷", "锤", "矛", "镐", "长武器", "杖", "鞭", "绞索"];
const WEAPON_RANGED = ["弓", "弩", "投石索", "吹箭筒"];

// 全书规范的类别展示顺序（「其他/不限」槽根一级 chips 用此排序；未列类别沉底按码位排）。
const CATEGORY_ORDER = [
  "武器", "护甲", "法器", "臂部", "头部", "颈部", "手部", "戒指", "腰部", "足部",
  "奇物", "另类奖励", "龙晶强化", "机关附件", "套装",
  "消耗品", "炼金物品", "弹药", "刺客毒药",
  "冒险装备", "伙伴", "坐骑", "魔宠",
];

// —— 分级钻取树 ——
// 节点：中间节点有 children（可下钻）；叶子用 tokens（itemSuitable 命中）或 cats（纯类别命中）作为过滤值。
type DrillItem = { label: string; children?: DrillItem[]; tokens?: string[]; cats?: string[] };

// 次级分类按「类别」规范化：杂散 itemSuitable token → 全书规整分类。
//   武器：巨剑/长剑/弯刀→重刃、匕首→轻刃、矮人重锤→锤、
//        任意单手近战/任意单手武器/除触及武器以外→任意近战、任意/任意投掷→任意武器 等
//   护甲/臂部不做 token 缩放：实际材甲（布/革/皮/链/鳞/板）与盾牌/护腕原样保留。
const SUBTYPE_NORMALIZE: Record<string, Record<string, string>> = {
  武器: {
    斧: "斧", "斧（只能单手）": "斧",
    硬头锤: "硬头锤",
    轻刃: "轻刃", 匕首: "轻刃",
    重刃: "重刃", 巨剑: "重刃", 长剑: "重刃", 弯刀: "重刃",
    连枷: "连枷", 三头连枷: "连枷",
    锤: "锤", 矮人重锤: "锤",
    矛: "矛", 镐: "镐", 杖: "杖", 长武器: "长武器",
    带刺铁手套: "徒手", 多头鞭: "鞭", 长鞭: "鞭",
    弓: "弓", 长弓: "弓", 短弓: "弓", 弩: "弩", 投石索: "投石索",
    任意: "任意武器", 任意投掷: "任意武器",
    任意单手近战: "任意近战", 任意单手武器: "任意近战", "除触及武器以外": "任意近战",
  },
};

// 某件物品的 itemSuitable 能匹配到的（规整/原样）分类集合。
function groupsOfSuitable(category: string | undefined, suitable: unknown): string[] {
  const norm = SUBTYPE_NORMALIZE[category ?? ""] ?? {};
  const out = new Set<string>();
  for (const t of String(suitable ?? "").split(/[，,、]/)) {
    const s = t.trim();
    if (!s) continue;
    out.add(norm[s] ?? s);
  }
  return [...out];
}

const leaf = (label: string, tokens?: string[]): DrillItem => (tokens ? { label, tokens } : { label });

// 各类别的子树配置（叶子 label == 匹配 token，作为「其他」等跨类槽的一级下钻内容）。
const CAT_DRILL: Record<string, DrillItem[]> = {
  武器: [
    { label: "近战", children: WEAPON_MELEE.map((g) => leaf(g, [g])) },
    { label: "远程", children: WEAPON_RANGED.map((g) => leaf(g, [g])) },
    { label: "任意", children: ["任意近战", "任意远程", "任意武器"].map((t) => leaf(t, [t])) },
  ],
  护甲: ["布甲", "革甲", "皮甲", "链甲", "鳞甲", "板甲", "任意"].map((t) => leaf(t, [t])),
  臂部: [
    { label: "盾牌", children: ["任意盾牌", "轻盾", "重盾"].map((t) => leaf(t, [t])) },
    { label: "护腕", tokens: ["护腕"] },
  ],
  法器: ["圣徽", "法珠", "法杖", "权杖", "魔杖", "气印", "图腾", "魔典"].map((t) => leaf(t, [t])),
  奇物: ["基地物品", "军旗", "异能小雕像", "荒神碎片", "魔术袋", "纹身"].map((t) => leaf(t, [t])),
  另类奖励: ["元素赠礼", "妖精魔法赠礼", "失落符文", "神圣恩赐", "大师特训"].map((t) => leaf(t, [t])),
  消耗品: ["药剂及灵药", "试剂", "磨刀石", "毒药"].map((t) => leaf(t, [t])),
  炼金物品: ["其他", "爆弹", "油膏", "药物", "毒药"].map((t) => leaf(t, [t])),
};

// 槽位 → 根子树（一级 chips）。
function slotRoot(slotName: string, presentCats: string[]): DrillItem[] {
  switch (slotName) {
    case "主手":
    case "副手":
      return [
        { label: "近战", children: CAT_DRILL.武器[0].children },
        { label: "远程", children: CAT_DRILL.武器[1].children },
        { label: "任意", children: CAT_DRILL.武器[2].children },
        { label: "法器", children: CAT_DRILL.法器 },
      ];
    case "护甲":
      return CAT_DRILL.护甲;
    case "臂部":
      return CAT_DRILL.臂部;
    case "奇物":
      return CAT_DRILL.奇物;
    case "消耗品":
      return [...CAT_DRILL.消耗品, { label: "炼金物品", children: CAT_DRILL.炼金物品 }];
    case "佩戴":
      return [
        { label: "奇物", children: CAT_DRILL.奇物 },
        { label: "另类奖励", children: CAT_DRILL.另类奖励 },
        { label: "法器", children: [leaf("圣徽", ["圣徽"]), leaf("气印", ["气印"])] },
        { label: "龙晶强化", cats: ["龙晶强化"] },
        { label: "机关附件", cats: ["机关附件"] },
      ];
    case "其他":
      return presentCats.map((cat) => (CAT_DRILL[cat] ? { label: cat, children: CAT_DRILL[cat] } : { label: cat, cats: [cat] }));
    default:
      return []; // 头部/颈部/腰部/手部/戒指/足部/冒险装备：无细分 → 无筛选行
  }
}

function isDrillLeaf(node: DrillItem): boolean {
  return !node.children || node.children.length === 0;
}

// 叶子是否命中该物品。
function matchLeaf(e: Entry, node: DrillItem): boolean {
  if (node.tokens && node.tokens.length) {
    const gs = groupsOfSuitable(e.itemCategory, e.itemSuitable);
    return node.tokens.some((t) => gs.includes(t));
  }
  if (node.cats && node.cats.length) {
    return node.cats.includes(e.itemCategory ?? "");
  }
  return true;
}

// 收集某节点子树下所有叶子（中间节点递归下钻）。
function collectLeaves(node: DrillItem): DrillItem[] {
  if (isDrillLeaf(node)) return [node];
  const out: DrillItem[] = [];
  for (const it of node.children ?? []) out.push(...collectLeaves(it));
  return out;
}

interface Props {
  entries: Entry[];
  loading?: boolean;
  slotName: string;
  currentId?: string;
  onSelect: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
}

export default function ItemSlotPicker({ entries, loading, slotName, currentId, onSelect, onClear, onClose }: Props) {
  const allowed = useMemo(() => SLOT_CATEGORY[slotName] ?? [], [slotName]);
  const presentCats = useMemo(
    () => [...new Set(entries.map((e) => e.itemCategory).filter((v): v is string => !!v))].sort((a, b) => {
      const ra = CATEGORY_ORDER.indexOf(a);
      const rb = CATEGORY_ORDER.indexOf(b);
      const ia = ra === -1 ? CATEGORY_ORDER.length : ra;
      const ib = rb === -1 ? CATEGORY_ORDER.length : rb;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, "zh");
    }),
    [entries]
  );
  // 根子树（注意：依赖 presentCats 仅「其他」槽需要，其余槽用固定树）。
  const root = useMemo(() => slotRoot(slotName, presentCats), [slotName, presentCats]);

  const [path, setPath] = useState<string[]>([]); // 下钻路径（中间节点 label）
  const [sel, setSel] = useState<string[]>([]); // 当前层级多选叶子 label
  const [query, setQuery] = useState("");
  const [deep, setDeep] = useState(false); // 全文搜索开关

  // 根据 path 定位当前节点；path 为空即虚拟根。
  const currentNode = useMemo(() => {
    let node: DrillItem | null = null;
    let children: DrillItem[] = root;
    for (const label of path) {
      const found = children.find((it) => it.label === label);
      if (!found || isDrillLeaf(found)) return null;
      node = found;
      children = found.children ?? [];
    }
    return { node, children };
  }, [root, path]);
  const currentChildren = currentNode?.children ?? (path.length ? [] : root);
  const subtreeLeaves = useMemo(
    () => currentChildren.flatMap((it) => collectLeaves(it)),
    [currentChildren]
  );

  function pushNode(item: DrillItem) {
    if (!isDrillLeaf(item)) {
      setPath((p) => [...p, item.label]);
      setSel([]);
    }
  }
  function toggleLeaf(label: string) {
    setSel((prev) => (prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]));
  }
  function reset() {
    setPath([]);
    setSel([]);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selLeaves = currentChildren.filter(isDrillLeaf).filter((it) => sel.includes(it.label));
    return entries.filter((e) => {
      if (allowed.length && !allowed.includes(e.itemCategory ?? "")) return false;
      // 命中当前子树任一叶子（下钻即收窄视野）
      const inView = subtreeLeaves.length === 0 || subtreeLeaves.some((l) => matchLeaf(e, l));
      if (!inView) return false;
      // 多选叶子：命中任一选中叶子
      if (sel.length) {
        if (!selLeaves.some((l) => matchLeaf(e, l))) return false;
      }
      if (q && !(deep ? matchDeep(e, q) : matchByName(e, q))) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, allowed, subtreeLeaves, sel, currentChildren, query, deep]);
  const { visible, sentinelRef, done } = useIncremental(filtered, 90);

  const showFilter = root.length > 0;

  return createPortal(
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">选择{slotName}装备</span>
          <div className="picker-head-btns">
            {currentId && onClear && <button type="button" className="crop-btn" onClick={() => { onClear(); onClose(); }}>清空槽位</button>}
            <button type="button" className="crop-btn" onClick={onClose}>关闭</button>
          </div>
        </div>
        {showFilter && (
          <>
            {path.length > 0 && (
              <div className="slot-filter-row">
                <span className="sf-label">路径</span>
                <button type="button" className="sf-crumb" onClick={reset}>全部</button>
                {path.map((label, i) => (
                  <span key={label + i} className="sf-crumb-chain">
                    <span className="sf-crumb-sep">›</span>
                    {i === path.length - 1
                      ? <span className="sf-crumb-cur">{label}</span>
                      : <button type="button" className="sf-crumb" onClick={() => { setPath(path.slice(0, i + 1)); setSel([]); }}>{label}</button>}
                  </span>
                ))}
              </div>
            )}
            <div className="slot-filter-row">
              {currentChildren.map((it) => (
                isDrillLeaf(it)
                  ? <button key={it.label} type="button" className={sel.includes(it.label) ? "sf-chip active" : "sf-chip"} onClick={() => toggleLeaf(it.label)}>{it.label}</button>
                  : <button key={it.label} type="button" className="sf-chip sf-drill" onClick={() => pushNode(it)}>▸ {it.label}</button>
              ))}
            </div>
          </>
        )}
        <DeepSearchField value={query} deep={deep} onChange={setQuery} onToggleDeep={() => setDeep((d) => !d)} />
        <div className="meta">显示 {filtered.length} 条</div>
        <div className={slotName === "冒险装备" ? "picker-cards cols-3" : "picker-cards"}>
          {loading && entries.length === 0 && <p className="hint">正在加载装备数据…</p>}
          {!loading && visible.map((e) => (
            <button key={e.id} type="button" className={e.id === currentId ? "picker-card selected" : "picker-card"} onClick={() => { onSelect(e.id); onClose(); }}>
              <EntryCard entry={e} />
            </button>
          ))}
          {!loading && filtered.length === 0 && <p className="hint">无匹配装备。</p>}
          {!done && !loading && <div ref={sentinelRef} className="incremental-sentinel">滚动加载更多…</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}