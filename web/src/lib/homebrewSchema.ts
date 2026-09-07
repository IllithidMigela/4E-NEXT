import type { Entry, PowerBlock } from "../data/types";
import { wikiToHtml } from "./wikirender";
import { mdToHtml } from "./markdown";

// 私设编辑器：schema 驱动的表单定义。每种分类对应一批可表单化的标量字段。
// 正文统一走 sourceText，默认 Markdown（bodyFormat="md"）；旧条目的 wikitext 正文（bodyFormat="wiki"）继续按原语法渲染。
// 保存时派生 details，使 EntryCard 与预览都能完整渲染。

/** 按正文格式渲染 HTML。 */
export function renderBody(src: string, format: "md" | "wiki", fields: Record<string, string> = {}): string {
  return format === "wiki" ? wikiToHtml(src, fields) : mdToHtml(src);
}

const WIKI_MARKS = [/^!{1,4}\s/m, /''[^']+''/, /\/\/[^/\n]+\/\//, /\[\[[^\]]+\]\]/, /\{\{!!/];

/** 判断条目正文格式：优先看标记，其次按旧 wikitext 特征推断。 */
export function detectBodyFormat(entry: Entry): "md" | "wiki" {
  if (entry.bodyFormat === "md" || entry.bodyFormat === "wiki") return entry.bodyFormat;
  const src = entry.sourceText ?? "";
  return WIKI_MARKS.some((re) => re.test(src)) ? "wiki" : "md";
}

export type FieldType = "text" | "longtext" | "select" | "tags" | "multichips";

export interface SheetField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  placeholder?: string;
  required?: boolean;
  /** multichips 链接分隔符（默认 "/"） */
  delimiter?: string;
  /** multichips 分组候选（带解释，悬停可见）；设置后优先于 options 渲染 */
  groups?: KeywordGroup[];
}

// —— 各类型专属编辑控件的枚举取值（依据原版数据 / 4e 规则表）——
// 4E 标准技能表（复用 character.ts 的 SKILL_TABLE 名称）
export const SKILLS: string[] = [
  "运动", "坚韧", "杂技", "隐秘", "盗术", "神秘", "历史", "宗教",
  "地城", "医疗", "洞察", "自然", "侦查", "唬骗", "交涉", "威吓", "市井",
];
// 6 项属性能调值 + 官方出现的「无」
export const SIX_ABILITIES = ["力量", "敏捷", "体质", "智力", "感知", "魅力", "无"];
// 威能动作类型（原版取值）
export const ACTION_TYPES = [
  "标准动作", "移动动作", "次要动作", "自由动作", "借机动作", "即时中断", "即时反应", "无动作",
];
// 威能射程/范围模板（分组镜像官方高频格式）。
// 每个模板项含 类型前缀 + 可选数字位（n1/n2），由 EntryEditor 组合成完整 range 字符串：
//   fixed       → 无数字位，prefix 即完整值（如「自身」「远程武器」）
//   仅 n1       → prefix + n1 + n1.suffix（如 近战{n1}、近战武器 + {n1}触及）
//   n1 + n2     → prefix + n1 + n2.prefix + n2 + n2.suffix（如 区域{n1}爆发{n2}）
export interface RangeTemplateItem {
  /** 按钮显示文本 */
  label: string;
  /** 类型前缀；fixed 时即完整值 */
  prefix: string;
  /** 固定值模板（无数字位） */
  fixed?: boolean;
  /** 第一个数字位（数字后缀文本，如「触及」） */
  n1?: { suffix?: string };
  /** 第二个数字位（数字前分隔文本，如「爆发」；数字后缀文本） */
  n2?: { prefix?: string; suffix?: string };
  /** 第一个数字输入框的提示（如「距离」「爆发半径」） */
  n1Label?: string;
  /** 第二个数字输入框的提示（如「区域半径」） */
  n2Label?: string;
}
export const RANGE_TEMPLATES: { group: string; items: RangeTemplateItem[] }[] = [
  {
    group: "自身类",
    items: [
      { label: "自身", prefix: "自身", fixed: true },
      { label: "个人", prefix: "个人", fixed: true },
    ],
  },
  {
    group: "近战类",
    items: [
      { label: "近战武器", prefix: "近战武器", fixed: true },
      { label: "近战触及", prefix: "近战触及", fixed: true },
      { label: "近战 + N", prefix: "近战", n1: {}, n1Label: "距离" },
      { label: "近战武器 + N触及", prefix: "近战武器 + ", n1: { suffix: "触及" }, n1Label: "触及距离" },
    ],
  },
  {
    group: "远程类",
    items: [
      { label: "远程 + N", prefix: "远程", n1: {}, n1Label: "距离" },
      { label: "远程武器", prefix: "远程武器", fixed: true },
      { label: "远程可见", prefix: "远程可见", fixed: true },
    ],
  },
  {
    group: "爆发/冲击类",
    items: [
      { label: "近程爆发 + N", prefix: "近程爆发", n1: {}, n1Label: "爆发半径" },
      { label: "近程冲击 + N", prefix: "近程冲击", n1: {}, n1Label: "冲击半径" },
      { label: "近程墙 + N", prefix: "近程墙", n1: {}, n1Label: "墙长" },
    ],
  },
  {
    group: "区域类",
    items: [
      { label: "区域N爆发M", prefix: "区域", n1: {}, n2: { prefix: "爆发" }, n1Label: "区域半径", n2Label: "爆发半径" },
      { label: "区域N墙M", prefix: "区域", n1: {}, n2: { prefix: "墙" }, n1Label: "区域半径", n2Label: "墙长" },
    ],
  },
  { group: "其他", items: [{ label: "特殊", prefix: "特殊", fixed: true }] },
];
/** 全部射程模板项（平铺，供解析当前值回填） */
export const RANGE_TEMPLATE_ITEMS: RangeTemplateItem[] = RANGE_TEMPLATES.flatMap((g) => g.items);
/** 由模板项 + 数字位组合成完整 range 字符串（如 远程 + 10 → 「远程10」） */
export function composeRange(t: RangeTemplateItem, n1: string, n2: string): string {
  if (t.fixed) return t.prefix;
  if (!t.n1) return t.prefix;
  if (!t.n2) return `${t.prefix}${n1}${t.n1.suffix ?? ""}`;
  return `${t.prefix}${n1}${t.n2.prefix ?? ""}${n2}${t.n2.suffix ?? ""}`;
}
/** 把 range 字符串反向解析为「模板项 + 数字位」，无法识别（自由组合）时返回 null */
export function parseRange(val: string): { tpl: RangeTemplateItem; n1: string; n2: string } | null {
  const v = val.trim();
  for (const t of RANGE_TEMPLATE_ITEMS) {
    if (t.fixed && v === t.prefix) return { tpl: t, n1: "", n2: "" };
  }
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const dyn = RANGE_TEMPLATE_ITEMS.filter((t) => !t.fixed).sort((a, b) => b.prefix.length - a.prefix.length);
  for (const t of dyn) {
    if (!t.n2) {
      const re = new RegExp(`^${esc(t.prefix)}(\\d+)${esc(t.n1?.suffix ?? "")}$`);
      const m = v.match(re);
      if (m) return { tpl: t, n1: m[1], n2: "" };
    } else {
      const re = new RegExp(`^${esc(t.prefix)}(\\d+)${esc(t.n2.prefix ?? "")}(\\d+)${esc(t.n2.suffix ?? "")}$`);
      const m = v.match(re);
      if (m) return { tpl: t, n1: m[1], n2: m[2] };
    }
  }
  return null;
}
// —— 威能关键词（分组管理，解释参考万律「术语表」）——
// 分组镜像官方关键词语义：伤害类型 / 效果类型 / 附件类型 / 力量来源 / 其他。
// desc 摘录自 reference 分类「术语表」；悬停候选词可查看解释。
export interface KeywordItem {
  kw: string;
  /** 关键词解释（万律术语表），悬停显示 */
  desc: string;
}
export interface KeywordGroup {
  label: string;
  hint?: string;
  items: KeywordItem[];
}
export const POWER_KEYWORD_GROUPS: KeywordGroup[] = [
  {
    label: "伤害类型",
    hint: "威能造成该类型伤害（术语表·伤害类型）",
    items: [
      { kw: "强酸", desc: "一种伤害类型。" },
      { kw: "寒冰", desc: "一种伤害类型。具有该关键字的生物与寒冰有强烈的关联。" },
      { kw: "火焰", desc: "一种伤害类型。具有该关键字的生物与火焰有强烈的关联。" },
      { kw: "力场", desc: "一种伤害类型。" },
      { kw: "闪电", desc: "一种伤害类型。" },
      { kw: "暗蚀", desc: "一种伤害类型。" },
      { kw: "毒素", desc: "一种伤害和效果类型。毒素威能会造成非伤害的中毒效果、毒素伤害，或两者皆有。" },
      { kw: "心灵", desc: "一种伤害类型。" },
      { kw: "光耀", desc: "一种伤害类型。" },
      { kw: "雷鸣", desc: "一种伤害类型。" },
    ],
  },
  {
    label: "效果类型",
    hint: "定义威能效果机制的关键字（术语表·效果类型）",
    items: [
      { kw: "可强化", desc: "具有可强化关键字的威能带有可选的强化，角色可以通过花费灵能点来强化。" },
      { kw: "灵气", desc: "灵气是从一个生物上散发的持续效果。" },
      { kw: "野兽", desc: "野兽威能只能连同野兽伙伴一起使用。" },
      { kw: "野兽形态", desc: "角色只能在野兽形态下才可以使用野兽形态威能。" },
      { kw: "引导神力", desc: "引导神力威能允许生物利用神的魔法。每场遭遇只能使用不超过一个。" },
      { kw: "魅惑", desc: "魅惑威能以某种方式控制一个生物的动作。" },
      { kw: "咒法", desc: "咒法威能会产生咒法物，它是魔法能量的创造物，类似生物、物体或其他现象。" },
      { kw: "恐惧", desc: "恐惧威能会激发惊恐。" },
      { kw: "医疗", desc: "医疗威能会恢复生命值，通常是立即恢复生命值，或给予再生。" },
      { kw: "幻术", desc: "幻术威能会欺骗精神或感官。如果幻术威能会造成伤害，则那伤害本身并不是幻觉。" },
      { kw: "鼓舞", desc: "鼓舞威能会给予它们的使用者临时生命值。" },
      { kw: "变形", desc: "变形威能会以某种方式改变生物的物理形态。" },
      { kw: "狂暴", desc: "狂暴威能允许使用者进入威能中指明的狂暴状态。" },
      { kw: "厉喝", desc: "厉喝威能通常会给目标的攻击骰造成减值。" },
      { kw: "可靠", desc: "如果可靠威能对所有目标都失手，该威能不消耗。" },
      { kw: "符文", desc: "符文威能会引导威能中指明的符文魔法。" },
      { kw: "睡眠", desc: "睡眠威能会使生物失去意识。" },
      { kw: "精魂", desc: "精魂威能只能连同精魂伙伴一起使用。" },
      { kw: "架势", desc: "当一个角色使用架势威能时，该角色会进入某种架势。" },
      { kw: "召唤", desc: "具有召唤关键字的威能会从其他地方神奇地召来生物来为召唤者服务。" },
      { kw: "传送", desc: "传送威能会将生物或物体从一个地方立刻转移到另一个地方。" },
      { kw: "区域", desc: "具有区域关键字的威能会创造持续一轮或更久的魔法区域。" },
      { kw: "套路", desc: "一个套路威能包含了一个攻击招数和一个移动招数，实际上就是两个子威能。" },
    ],
  },
  {
    label: "附件类型",
    hint: "标明威能可通过何种法器/武器使用（术语表·附件类型）",
    items: [
      { kw: "法器", desc: "标明威能可以通过法器使用，例如魔杖。冒险者必须擅长法器才能在威能中使用它。" },
      { kw: "武器", desc: "标明威能可通过武器使用，这武器也可以是徒手攻击。" },
    ],
  },
  {
    label: "力量来源",
    hint: "威能所属的魔法/力量体系（无独立词条，按职业力量来源）",
    items: [
      { kw: "奥术", desc: "奥术力量来源。通过研习与智识引导的魔法。" },
      { kw: "武术", desc: "武术力量来源。经由武器与战技引导的力量。" },
      { kw: "神术", desc: "神术力量来源。通过信仰与神祇授予的力量。" },
      { kw: "灵能", desc: "灵能力量来源。经由心灵与意志引导的力量。" },
      { kw: "原力", desc: "原力力量来源。经由自然与精魂引导的力量。" },
      { kw: "影能", desc: "影能力量来源。经由阴影位面引导的力量。" },
    ],
  },
  {
    label: "其他",
    hint: "官方威能中出现的高频词（无独立术语条目）",
    items: [
      { kw: "领域", desc: "领域关键词威能（常与「领域；可变」搭配），与神导士/圣武士领域来源相关。" },
      { kw: "元素", desc: "与元素力量相关的威能（德鲁伊元素、塑水者等）。" },
      { kw: "死灵", desc: "奥术死灵派系威能，多与暗蚀/影能搭配。" },
      { kw: "塑能", desc: "奥术塑能派系威能，直接塑造能量造成效果。" },
      { kw: "惑控", desc: "奥术惑控派系威能，影响生物的心智。" },
      { kw: "幽影", desc: "与阴影、影界相关的威能，多与暗蚀搭配。" },
      { kw: "剑法术", desc: "法师剑法术威能，结合剑术与法术。" },
    ],
  },
];
/** 威能关键词候选（平铺自分组，供搜索/旧逻辑使用） */
export const POWER_KEYWORDS: string[] = POWER_KEYWORD_GROUPS.flatMap((g) => g.items.map((i) => i.kw));
// 职业职责
export const ROLES = ["防御者", "领导者", "控制者", "打击者"];
// 威能来源（可复合）
export const POWER_SOURCES = ["奥术", "武术", "神术", "原力", "灵能", "影能"];
// 种族体型
export const RACIAL_SIZES = ["超小型", "小型", "中型", "大型", "超大型"];
// 种族速度
export const SPEEDS = ["4格", "5格", "6格", "7格"];
// 种族视觉
export const VISIONS = ["普通视觉", "标准视觉", "黑暗视觉", "昏暗视觉"];
// 装备稀有度（对齐原版）
export const RARITIES = ["普通", "非普通", "稀有", "神之碎片"];
// 仪式类别
export const RITUAL_CATEGORIES = ["探险", "创造", "防护", "复原", "旅行", "欺骗", "束缚", "探知", "预言"];
// 层级（物品套装用，含「团体」）
export const TIERS = ["英雄", "典范", "传奇", "团体"];
// 专长类型（开集，仅建议）
export const FEAT_TYPES = ["职业专长", "典范专长", "史诗专长", "英雄专长"];
// 装备「分类组」常见建议（可自由输入，点选一键填入）
export const GROUPS = [
  "重剑", "轻刃", "长柄", "矛", "链枷", "锤", "镐", "斧", "弓", "弩", "投掷",
  "权杖", "法杖", "法球", "圣徽", "魔杖", "灵念器", "图腾", "基手标",
  "布甲", "皮甲", "链甲", "鳞甲", "板甲", "盾牌",
];
// —— 威能再生频率 / 威能类型（两个正交维度，与官方一致）——
// 再生频率（usage）：官方只有 随意(at-will)/遭遇(encounter)/每日(daily) 三值，决定卡面色与使用次数。
// 威能类型（powerType/powerKind）：攻击/辅助/特殊，决定卡头文字（如「战士攻击 1」）与人物页归类。
export const POWER_FREQUENCIES: { label: string; usage: string }[] = [
  { label: "随意", usage: "at-will" },
  { label: "遭遇", usage: "encounter" },
  { label: "每日", usage: "daily" },
];
/** 由再生频率中文名派生 usage 代码；未知返回 undefined。 */
export function powerFreqOf(zh: string): (typeof POWER_FREQUENCIES)[number] | undefined {
  return POWER_FREQUENCIES.find((f) => f.label === zh);
}

export const POWER_TYPES: { label: string; powerKind: string }[] = [
  { label: "攻击", powerKind: "attack" },
  { label: "辅助", powerKind: "utility" },
  { label: "特殊", powerKind: "special" },
];
/** 由威能类型中文名派生 powerKind；未知返回 undefined。 */
export function powerKindOf(type: string): (typeof POWER_TYPES)[number] | undefined {
  return POWER_TYPES.find((t) => t.label === type);
}

// 威能详情「标签块」标签全集（顺序即下拉候选顺序）。这些标签与官方威能卡正文的
// <th>标签：</th> 行一一对应；「攻击」内容通常形如「力量 vs. AC」。
export const POWER_BLOCK_LABELS: { label: string; hint?: string }[] = [
  { label: "目标", hint: "如：一个生物" },
  { label: "攻击", hint: "如：力量 vs. AC（粗体展示）" },
  { label: "命中", hint: "命中后的伤害与效果（按等级伸级，如「1d6+力量，5级：2d6…」）" },
  { label: "强化1", hint: "强化1档位：命中的进阶效果（如伤害提升/额外增益）" },
  { label: "强化2", hint: "强化2档位：命中的进一步进阶效果" },
  { label: "失手", hint: "失手时的效果，如：一半伤害" },
  { label: "效果", hint: "必定发生（无论命中与否）；按等级伸级时可写「xx级：…」" },
  { label: "触发", hint: "使用条件" },
  { label: "要求", hint: "使用前提要求" },
  { label: "前提", hint: "若未满足不可使用" },
  { label: "代价", hint: "如：消耗一次遭遇威能使用次数" },
  { label: "主目标", hint: "多目标攻击的主目标（下接子行 次目标/攻击/命中）" },
  { label: "主攻击", hint: "主目标攻击骰" },
  { label: "次目标", hint: "子行：次要目标" },
  { label: "次攻击", hint: "子行：次要攻击骰" },
  { label: "后效", hint: "回合结束后的持续效果" },
  { label: "次要维持", hint: "以次要动作维持" },
  { label: "移动维持", hint: "以移动动作维持" },
  { label: "标准维持", hint: "以标准动作维持" },
  { label: "特殊", hint: "特殊说明/可多次选择" },
];

// 「次攻击组」：主攻击命中后对次目标再发起一轮攻击的官方固定结构（全部缩进子行，点击「＋次攻击组」一键插入）
export const POWER_TEMPLATE_SECONDARY: PowerBlock[] = [
  { label: "次目标", text: "", indent: 1 },
  { label: "次攻击", text: "", indent: 1 },
  { label: "命中", text: "", indent: 1 },
  { label: "效果", text: "", indent: 1 },
];

// —— 威能详情「预设模板」——
// 从官方威能 details 解析出的高频行结构（目标/攻击/命中/失手/效果、触发/效果、
// 主·次攻击、缩进子行次攻击组等），在「威能详情」编辑器顶部以预设条一键套用。
// 依据 powerKind 统计：攻击类最常见结构为 目标>攻击>命中（885）、目标>攻击>命中>失手>效果（550）、
// 目标>攻击>命中>效果（507）；辅助类最常见为 效果（929）、目标>效果（498）、触发>效果（479）。
export interface PowerPreset {
  name: string;
  group: string;
  desc: string;
  blocks: PowerBlock[];
}

export const PRESET_GROUPS = ["攻击类", "辅助类", "特殊类"];

export const POWER_PRESETS: PowerPreset[] = [
  // ============ 攻击类 ============
  {
    name: "标准攻击",
    group: "攻击类",
    desc: "最常用的完整攻击块：目标 / 攻击 / 命中 / 失手 / 效果",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害" },
      { label: "失手", text: "一半伤害" },
      { label: "效果", text: "" },
    ],
  },
  {
    name: "简易攻击",
    group: "攻击类",
    desc: "精简攻击：目标 / 攻击 / 命中",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害" },
    ],
  },
  {
    name: "命中效果",
    group: "攻击类",
    desc: "命中带控制效果：目标 / 攻击 / 命中 / 效果（官方第 3 高频结构）",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害，且目标定身直到你下一回合结束" },
      { label: "效果", text: "你滑动目标1格" },
    ],
  },
  {
    name: "攻击失手",
    group: "攻击类",
    desc: "含失手行：目标 / 攻击 / 命中 / 失手（官方第 4 高频结构）",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害" },
      { label: "失手", text: "一半伤害" },
    ],
  },
  {
    name: "要求攻击",
    group: "攻击类",
    desc: "带使用要求的攻击：要求 / 目标 / 攻击 / 命中 / 效果",
    blocks: [
      { label: "要求", text: "你必须持用一把矛" },
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害，且目标迟缓直到你下一回合结束" },
      { label: "效果", text: "" },
    ],
  },
  {
    name: "反应攻击",
    group: "攻击类",
    desc: "触发时对目标发起攻击：触发 / 目标 / 攻击 / 命中",
    blocks: [
      { label: "触发", text: "一个敌人对你进行一次近战攻击" },
      { label: "目标", text: "触发的敌人" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害" },
    ],
  },
  {
    name: "区域攻击",
    group: "攻击类",
    desc: "爆发/区域范围攻击：目标（区域）/ 攻击 / 命中 / 失手",
    blocks: [
      { label: "目标", text: "爆发1范围内的所有敌人" },
      { label: "攻击", text: "力量 vs. 防御" },
      { label: "命中", text: "1[W] + 力量调整值的伤害" },
      { label: "失手", text: "一半伤害" },
    ],
  },
  {
    name: "特殊攻击",
    group: "攻击类",
    desc: "命中带特殊使用说明：目标 / 攻击 / 命中 / 特殊",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "智力 vs. 反射" },
      { label: "命中", text: "1d8 + 智力调整值的伤害，且目标迟缓直到你下一回合结束" },
      { label: "特殊", text: "当冲锋时，你可使用此威能替代近战基本攻击" },
    ],
  },
  {
    name: "强化攻击",
    group: "攻击类",
    desc: "带强化档位的进阶攻击：目标 / 攻击 / 命中 / 强化1 / 强化2",
    blocks: [
      { label: "目标", text: "一个生物" },
      { label: "攻击", text: "魅力 vs. AC" },
      { label: "命中", text: "1[W] + 魅力调整值的伤害，且目标定身（豁免终止）" },
      { label: "强化1", text: "1[W] + 魅力调整值的伤害，且目标定身（豁免终止），你获得1个回复力" },
      { label: "强化2", text: "2[W] + 魅力调整值的伤害，且目标定身（豁免终止），你获得2个回复力" },
    ],
  },
  {
    name: "多段攻击",
    group: "攻击类",
    desc: "主攻击命中后对次目标再发起一轮攻击（主目标 / 主攻击 / 命中 / 效果 + 次攻击组）",
    blocks: [
      { label: "主目标", text: "一个生物" },
      { label: "主攻击", text: "感知 vs. AC" },
      { label: "命中", text: "2[W] + 感知调整值的伤害" },
      { label: "效果", text: "进行次攻击" },
      { label: "次目标", text: "离主目标5格内的一个或二个生物", indent: 1 },
      { label: "次攻击", text: "感知 vs. AC", indent: 1 },
      { label: "命中", text: "1[W]伤害，且你滑动次目标5格到邻近主目标的一格", indent: 1 },
    ],
  },
  {
    name: "次攻击组",
    group: "攻击类",
    desc: "缩进子行组成的次攻击组（次目标 / 次攻击 / 命中 / 效果），与「＋ 追加次攻击组」同构",
    blocks: POWER_TEMPLATE_SECONDARY,
  },
  {
    name: "每日后效",
    group: "攻击类",
    desc: "每日控制型：命中带后效、失手不消耗（目标 / 攻击 / 命中 / 后效 / 失手）",
    blocks: [
      { label: "目标", text: "一个敌人" },
      { label: "攻击", text: "魅力 + 2 vs. 意志" },
      { label: "命中", text: "目标被支配（豁免终止）" },
      { label: "后效", text: "目标受到10点持续心灵伤害且晕眩（豁免终止）" },
      { label: "失手", text: "此威能不被消耗" },
    ],
  },
  // ============ 辅助类 ============
  {
    name: "目标与效果",
    group: "辅助类",
    desc: "辅助威能最常用：目标 / 效果",
    blocks: [
      { label: "目标", text: "你或一个盟友" },
      { label: "效果", text: "" },
    ],
  },
  {
    name: "触发反应",
    group: "辅助类",
    desc: "触发条件 + 效果：触发 / 目标 / 效果",
    blocks: [
      { label: "触发", text: "一次攻击命中离你5格内的一个盟友" },
      { label: "目标", text: "被命中的盟友" },
      { label: "效果", text: "你将目标传送离你5格内的一个空间，目标在对抗触发攻击的所有防御上获得+4加值" },
    ],
  },
  {
    name: "触发效果",
    group: "辅助类",
    desc: "简化触发：触发 / 效果（辅助第 3 高频结构）",
    blocks: [
      { label: "触发", text: "你或一个邻近盟友受到伤害" },
      { label: "效果", text: "触发者获得5点临时生命值" },
    ],
  },
  {
    name: "纯效果",
    group: "辅助类",
    desc: "仅一行效果（辅助最高频结构）",
    blocks: [
      { label: "效果", text: "你获得飞行，直到你下一回合结束。持续期间你可在半空中滑翔" },
    ],
  },
  {
    name: "要求效果",
    group: "辅助类",
    desc: "带使用要求的辅助：要求 / 效果",
    blocks: [
      { label: "要求", text: "你必须有至少一个回复力" },
      { label: "效果", text: "你失去一个回复力，且获得等于你回复力值的临时生命值。直到遭遇结束，你获得下列增益" },
    ],
  },
  {
    name: "前提触发",
    group: "辅助类",
    desc: "先决前提 + 触发：前提 / 触发 / 效果",
    blocks: [
      { label: "前提", text: "你必须在隐秘上受训" },
      { label: "触发", text: "你在隐藏状态且失去了对一个敌人的掩护或隐匿" },
      { label: "效果", text: "你做一次隐秘检定。如果你的检定结果超过了触发敌人的被动侦查，则你保持对它的隐藏" },
    ],
  },
  {
    name: "效果特殊",
    group: "辅助类",
    desc: "效果带特殊说明：效果 / 特殊",
    blocks: [
      { label: "效果", text: "直到你下一回合结束，你和邻近的盟友在防御上获得+1加值" },
      { label: "特殊", text: "此威能可被用作借机动作" },
    ],
  },
  {
    name: "持续维持",
    group: "辅助类",
    desc: "区域/效果需动作维持：目标 / 效果 / 次要维持",
    blocks: [
      { label: "目标", text: "两个未被占据的格子" },
      { label: "效果", text: "你在射程内两个未被占据格子之间创造一个次元裂缝。此裂缝持续直到你下一回合结束" },
      { label: "次要维持", text: "此裂缝持续直到你下一回合结束" },
    ],
  },
  {
    name: "移动维持",
    group: "辅助类",
    desc: "以移动动作维持：效果 / 移动维持",
    blocks: [
      { label: "效果", text: "你获得隐形直到你下一回合结束，并传送20格" },
      { label: "移动维持", text: "隐形持续直到你下一回合结束或直到你攻击，且你传送最多5格" },
    ],
  },
  // ============ 特殊类 ============
  {
    name: "召唤傀儡",
    group: "特殊类",
    desc: "召唤物持续攻击：效果 / 次攻击组 / 次要维持",
    blocks: [
      { label: "效果", text: "你以咒法在射程内一个未被占据的格子召出一个生物/物件。它持续到你下回合结束。当它出现时，它立即进行下列攻击" },
      { label: "目标", text: "邻近召唤物的一个生物", indent: 1 },
      { label: "攻击", text: "智力 vs. 反射", indent: 1 },
      { label: "命中", text: "2d8 + 智力调整值的伤害", indent: 1 },
      { label: "次要维持", text: "召唤物持续直到你下回合结束" },
    ],
  },
  {
    name: "区域维持",
    group: "特殊类",
    desc: "每日区域攻击 + 维持：目标 / 攻击 / 命中 / 失手 / 效果 / 次要维持",
    blocks: [
      { label: "目标", text: "爆发范围内的每个生物" },
      { label: "攻击", text: "智力 vs. 反射" },
      { label: "命中", text: "2d10 + 智力调整值的伤害，并且目标定身（豁免终止）" },
      { label: "失手", text: "一半伤害" },
      { label: "效果", text: "此爆发创造一片困难地形区域，此区域持续到你下回合结束" },
      { label: "次要维持", text: "此区域持续到你下回合结束，且区域内的所有生物受到10点伤害" },
    ],
  },
];

// 「标签块」→ 官方威能卡正文的 <table class=details> HTML（含缩进子行的全角缩进）。
export function serializePowerBlocks(blocks: PowerBlock[]): string {
  if (!blocks?.length) return "";
  const rows = blocks
    .map((b) => {
      const label = b.label.trim();
      if (!label && !(b.text ?? "").trim()) return "";
      const pad = (b.indent ?? 0) > 0 ? "\u00A0\u00A0" : "";
      // 未选标签（仅正文文本）当作普通段落输出，避免丢失输入
      if (!label) return `<tr><td colspan="2">${escapeHtml(b.text ?? "")}</td></tr>`;
      return `<tr><th>${pad}${escapeHtml(label)}：</th><td>${escapeHtml(b.text ?? "")}</td></tr>`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  return `<table class="details"><tbody>${rows.join("")}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 从表单 JSON 字符串解析「标签块」数组；非法/空返回 null。
export function parsePowerBlocks(json?: string): PowerBlock[] | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    if (!Array.isArray(v)) return null;
    const blocks = v
      .map((b) => ({
        label: typeof b?.label === "string" ? b.label : "",
        text: typeof b?.text === "string" ? b.text : "",
        indent: typeof b?.indent === "number" ? b.indent : 0,
      }))
      .filter((b) => b.label.trim() || b.text.trim());
    return blocks.length ? blocks : null;
  } catch {
    return null;
  }
}

// —— 官方 details HTML → 可编辑「标签块」——
// 官方威能正文（details）形如 <table class=details><tr><th>目标：</th><td>…</td></tr>…</table>，
// 多个表之间可夹 <div class=keyword>（如「次威能」小节）；子行用 &nbsp; 缩进、<br> 换行。
// 这里把结构逆解析回 PowerBlock[]，使「从官方/模板新建威能」时能直接得到可填空修改的标签块面板。

/** 解码常见 HTML 实体 */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** 剥除标签但保留 <br> 换行，压缩空白 */
function htmlToPlain(s: string): string {
  return decodeHtmlEntities(
    s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** 解析官方 details HTML 为 PowerBlock[]；无法解析时返回 null。 */
export function parsePowerDetails(html: string): PowerBlock[] | null {
  if (!html) return null;
  const blocks: PowerBlock[] = [];
  // 依次抓取 <div class=keyword>小节 或 <table class=details> 表
  const tokenRe =
    /<div\b[^>]*\bclass=["']?keyword["']?[^>]*>([\s\S]*?)<\/div>|<table\b[^>]*class=["']?details["']?[^>]*>([\s\S]*?)<\/table>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html))) {
    if (m[1] !== undefined) {
      // 小节标题（如「次威能」+ 其用法行）→ 无标签纯文本段落块
      const t = htmlToPlain(m[1]);
      if (t) blocks.push({ label: "", text: t });
      continue;
    }
    const rows = m[2].match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
    for (const r of rows) {
      const th = r.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
      const tds = r.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) ?? [];
      const cellText = (td: string) => htmlToPlain(td.replace(/^<td[^>]*>/, "").replace(/<\/td>\s*$/, ""));
      if (th) {
        // 标签块：标签 + 内容；&nbsp; 前缀 → 缩进子行（如 次目标/次攻击）
        const labelHtml = th[1];
        const indent = /^\s*(?:&nbsp;|\u00A0)+/.test(labelHtml) ? 1 : 0;
        const label = htmlToPlain(labelHtml).replace(/[：:]\s*$/, "");
        const text = tds.map(cellText).filter(Boolean).join("\n");
        if (label || text) blocks.push({ label, text, ...(indent ? { indent } : {}) });
      } else if (tds.length) {
        const text = tds.map(cellText).filter(Boolean).join("\n");
        if (text) blocks.push({ label: "", text });
      }
    }
  }
  return blocks.length ? blocks : null;
}

const COMMON: SheetField[] = [
  { key: "name", label: "名称", type: "text", placeholder: "必填", required: true },
  { key: "nameEn", label: "英文名", type: "text", placeholder: "可选" },
  { key: "category", label: "分类", type: "select", required: true },
  { key: "tags", label: "标签", type: "tags", placeholder: "用逗号分隔" },
  { key: "source", label: "出处", type: "text", placeholder: "默认：私设" },
  { key: "sourceText", label: "正文", type: "longtext", placeholder: "支持 Markdown 语法使用。" },
];

export const CATEGORY_FIELDS: Record<string, SheetField[]> = {
  power: [
    { key: "grantedBy", label: "授予者 / 来源", type: "text", placeholder: "如：战士 / 邪术师 / 龙裔（可选，会显示在卡头）" },
    { key: "powerType", label: "威能类型", type: "select", options: POWER_TYPES.map((t) => t.label), placeholder: "如：攻击" },
    { key: "usageZh", label: "再生频率", type: "select", options: POWER_FREQUENCIES.map((f) => f.label), placeholder: "如：随意" },
    { key: "actionType", label: "动作", type: "select", options: ACTION_TYPES, placeholder: "如：标准动作" },
    { key: "level", label: "等级", type: "text" },
    { key: "keywords", label: "关键词", type: "multichips", groups: POWER_KEYWORD_GROUPS, delimiter: "，", placeholder: "如：奥术，法器（多选，以顿号分隔）" },
    { key: "range", label: "射程/范围", type: "text" },
    { key: "flavorText", label: "风味文本", type: "text", placeholder: "可选的斜体风味描述" },
    { key: "powerBlocks", label: "威能详情", type: "longtext" },
  ],
  equipment: [
    { key: "itemCategory", label: "类别", type: "select", options: ["武器", "护甲", "法器", "消耗品", "冒险装备", "坐骑", "奇物", "戒指", "颈部", "头部", "足部", "手部", "腰部", "臂部", "龙晶强化", "炼金物品", "另类奖励", "伙伴", "魔宠"], required: true },
    { key: "itemLevel", label: "物品等级", type: "text" },
    { key: "rarity", label: "稀有度", type: "select", options: RARITIES },
    { key: "group", label: "分类组", type: "multichips", options: GROUPS, placeholder: "如：重型刀剑" },
    { key: "enh", label: "增强加值", type: "text" },
    { key: "cost", label: "价格", type: "text" },
    { key: "weight", label: "重量", type: "text" },
    { key: "critical", label: "重击", type: "text" },
    { key: "power", label: "威能", type: "longtext" },
  ],
  feat: [
    { key: "tierZh", label: "层级", type: "select", options: ["英雄", "典范", "天命", "史诗"] },
    { key: "featType", label: "专长类型", type: "multichips", options: FEAT_TYPES, placeholder: "如：职业专长" },
    { key: "prerequisite", label: "前提", type: "longtext", placeholder: "如：职业：战士" },
    { key: "benefit", label: "增益", type: "longtext", placeholder: "该专长带来的效果" },
    { key: "special", label: "特殊", type: "longtext", placeholder: "可选，如特殊说明/可多次选择" },
  ],
  race: [
    { key: "size", label: "体型", type: "select", options: RACIAL_SIZES },
    { key: "speed", label: "速度", type: "multichips", options: SPEEDS },
    { key: "vision", label: "视觉", type: "multichips", options: VISIONS },
    { key: "abilityOne", label: "出生奖励属性1", type: "select", options: SIX_ABILITIES },
    { key: "abilityTwo", label: "出生奖励属性2", type: "select", options: SIX_ABILITIES },
    { key: "skill", label: "技能", type: "multichips", options: SKILLS },
  ],
  class: [
    { key: "role", label: "职责", type: "select", options: ROLES },
    { key: "powerSource", label: "威能来源", type: "multichips", options: POWER_SOURCES },
    { key: "keySkill", label: "关键技能", type: "multichips", options: SKILLS },
  ],
  "paragon-path": [
    { key: "level", label: "等级", type: "text" },
    { key: "prerequisite", label: "前提", type: "longtext" },
  ],
  "epic-destiny": [
    { key: "tierZh", label: "层级", type: "select", options: ["英雄", "典范", "天命", "史诗"] },
    { key: "prerequisite", label: "前提", type: "longtext" },
  ],
  "item-set": [
    { key: "tier", label: "层级", type: "select", options: TIERS },
  ],
  ritual: [
    { key: "ritualLevel", label: "仪式等级", type: "text" },
    { key: "ritualCategory", label: "仪式类别", type: "select", options: RITUAL_CATEGORIES },
    { key: "keySkill", label: "关键技能", type: "multichips", options: SKILLS },
  ],
};

// 全类型共用的外观自定义字段：每张卡头部可自定义配色与图标（默认保留各类型语义色）
export const APPEARANCE_FIELDS: SheetField[] = [
  {
    key: "cardColor",
    label: "卡片配色",
    type: "select",
    options: [
      "#9c27b0", "#3f51b5", "#009688", "#fb8c00", "#c62828", "#00897b", "#455a64",
      "#d81b60", "#7b1fa2", "#303f9f", "#0288d1", "#039be5", "#00796b", "#689f38",
      "#7cb342", "#f57c00", "#ef6c00", "#e64a19", "#5d4037", "#546e7a", "#616161",
      "#b71c1c", "#ad1457", "#4527a0", "#283593", "#01579b", "#b2ff59", "#ffca28",
    ],
  },
  {
    key: "cardIcon",
    label: "头部图标",
    type: "select",
    options: [
      "shield", "swords", "auto_awesome", "bolt", "star", "lock", "local_fire_department",
      "psychology", "spa", "colors", "palette", "skull", "raven",
      "local_florist", "globe_asia", "water_drop", "air", "terrain", "visibility",
      "health_and_safety", "favorite", "menu_book", "account_balance", "castle",
      "auto_awesome_mosaic", "public", "pets", "eco", "moon_stars", "forest",
      "device_hub", "hub", "rocket_launch", "contactless", "compost", "nightlight",
      "target", "lightbulb", "content_cut",
    ],
  },
];

// 分类下拉：官方主要分类（顺序与词条页一致）
export const CATEGORY_LIST: string[] = [
  "power", "equipment", "feat", "race", "class", "paragon-path", "epic-destiny",
  "item-set", "ritual", "theme", "domain", "magic-school", "pact", "vice",
  "virtue", "bloodline", "creature", "reference", "dictionary",
];

// 左侧表单按「右侧卡片组成部分」分区的顺序定义（value 为 SheetField.key 的子集）。
// 覆盖全部 19 类：每类按对应卡片消费的字段分区；未在 CATEGORY_FIELDS 登记专属标量的
// 纯通用类型（theme/domain 等）仅保留「归属 + 外观」，正文(sourceText)独立成区。
// 注意：tags（标签）是搜索/归类元数据，预览卡不渲染，统一放在末尾的「标签」面板（TAGS_SECTION）。
export interface HomebrewSection {
  title: string;
  keys: string[];
  /** 面板级提示文字（如标签面板说明其作用） */
  hint?: string;
  /** 核心面板：常驻展开；未标 core 的面板统一收进底部「附加设置」折叠区（主次分明） */
  core?: boolean;
}
/** 标签（tags）为元数据：仅用于搜索与归类，不会显示在卡片上。 */
export const TAGS_SECTION: HomebrewSection = {
  title: "标签",
  keys: ["tags"],
  hint: "用于搜索与归类（逗号分隔），不会显示在卡片上，可留空。",
};

export const CATEGORY_SECTIONS: Record<string, HomebrewSection[]> = {
  equipment: [
    { title: "基本信息 · 装备", keys: ["name", "nameEn", "source", "itemCategory", "rarity", "itemLevel"], core: true },
    { title: "统计数据", keys: ["group", "enh", "cost", "weight", "critical"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    { title: "物品威能", keys: ["power"] },
    TAGS_SECTION,
  ],
  power: [
    { title: "基本信息 · 威能", keys: ["name", "nameEn", "source", "grantedBy", "powerType", "level"], core: true },
    { title: "使用频率", keys: ["usageZh"], core: true },
    { title: "威能详情（标签块）", keys: ["powerBlocks"], core: true },
    { title: "风味文本", keys: ["flavorText"] },
    { title: "关键词", keys: ["keywords"] },
    { title: "动作与射程", keys: ["actionType", "range"] },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  feat: [
    { title: "基本信息 · 专长", keys: ["name", "nameEn", "source", "tierZh", "featType"], core: true },
    { title: "增益", keys: ["benefit"], core: true },
    { title: "前提", keys: ["prerequisite"] },
    { title: "特殊", keys: ["special"] },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  race: [
    { title: "基本信息 · 种族", keys: ["name", "nameEn", "source"], core: true },
    { title: "种族数据", keys: ["size", "speed", "vision", "abilityOne", "abilityTwo", "skill"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  class: [
    { title: "基本信息 · 职业", keys: ["name", "nameEn", "source"], core: true },
    { title: "职业数据", keys: ["role", "powerSource", "keySkill"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  "paragon-path": [
    { title: "基本信息 · 典范之道", keys: ["name", "nameEn", "source"], core: true },
    { title: "典范条件", keys: ["level", "prerequisite"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  "epic-destiny": [
    { title: "基本信息 · 传奇天命", keys: ["name", "nameEn", "source"], core: true },
    { title: "天命条件", keys: ["tierZh", "prerequisite"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  "item-set": [
    { title: "基本信息 · 物品套装", keys: ["name", "nameEn", "source"], core: true },
    { title: "套装信息", keys: ["tier"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  ritual: [
    { title: "基本信息 · 仪式", keys: ["name", "nameEn", "source"], core: true },
    { title: "仪式信息", keys: ["ritualLevel", "ritualCategory", "keySkill"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ],
  // —— 纯通用型：无专属标量，只保留必填归属字段 + 外观，正文独立成区 ——
  theme: genericSections("主题"),
  domain: genericSections("领域"),
  "magic-school": genericSections("魔法学派"),
  pact: genericSections("契约"),
  vice: genericSections("败德"),
  virtue: genericSections("美德"),
  bloodline: genericSections("血统"),
  creature: genericSections("生物"),
  reference: genericSections("术语"),
  dictionary: genericSections("译名字典"),
};

// 纯通用类型的分区：仅「基本信息 + 外观 + 标签」，正文独立成区（无专属标量字段）。
function genericSections(label: string): HomebrewSection[] {
  return [
    { title: `基本信息 · ${label}`, keys: ["name", "nameEn", "source"], core: true },
    { title: "外观", keys: ["cardColor", "cardIcon"] },
    TAGS_SECTION,
  ];
}

/** 在编辑表单中「不显示正文(sourceText)区」的分类：只在卡片真正渲染 details/sourceText 的类型出现正文区。
 *  feat：卡片不渲染 details；power：详情完全由「标签块」派生，不再提供自由 Markdown 正文。 */
export const WITHOUT_BODY: ReadonlySet<string> = new Set(["feat", "power"]);

export function fieldsFor(cat: string): SheetField[] {
  return [...COMMON, ...(CATEGORY_FIELDS[cat] ?? []), ...APPEARANCE_FIELDS];
}

function splitTags(s: string): string[] {
  return s
    .split(/[，,、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 草稿/表单值 → Entry。existingId 用于编辑时保留原 id。
// opts.allowEmpty 用于实时预览：跳过 name/category 必填校验、source 不做「私设」兜底，
// 以便在空类型/空名称时也能构造出供骨架占位预览的 entry。
export function buildEntry(
  form: Record<string, string>,
  existingId?: string,
  opts?: { allowEmpty?: boolean },
): { ok: true; entry: Entry } | { ok: false; error: string } {
  const name = (form.name ?? "").trim();
  const cat = (form.category ?? "").trim();
  if (!opts?.allowEmpty) {
    if (!name) return { ok: false, error: "请填写名称" };
    if (!cat) return { ok: false, error: "请选择分类" };
  }

  const extras: Record<string, string> = {};
  for (const f of fieldsFor(cat)) {
    const v = (form[f.key] ?? "").trim();
    if (f.type === "tags" || f.key === "name" || f.key === "nameEn" || f.key === "category" || f.key === "source" || f.key === "sourceText" || f.key === "powerBlocks" || !v) continue;
    extras[f.key] = v;
  }
  for (const f of CATEGORY_FIELDS[cat] ?? []) {
    const v = (form[f.key] ?? "").trim();
    if (v && f.key !== "powerBlocks") extras[f.key] = v;
  }

  // 威能：再生频率 → usage 代码；威能类型 → powerKind（两个正交维度）
  if (cat === "power") {
    const freq = powerFreqOf(form.usageZh || "");
    if (freq) extras.usage = freq.usage;
    const type = powerKindOf(form.powerType || "");
    if (type) extras.powerKind = type.powerKind;
  }

  const sourceText = form.sourceText ?? "";
  const bodyFormat: "md" | "wiki" = form.bodyFormat === "wiki" ? "wiki" : "md";
  // 威能结构化「标签块」：非空时渲染为官方一致的 <table class=details>，优先于 Markdown 正文。
  const powerBlocks = cat === "power" ? parsePowerBlocks(form.powerBlocks) : null;
  let details: string | undefined;
  // 威能：详情完全由「标签块」派生（正文面板已移除，仍与官方 details 格式一致）。
  // 其余无正文区的类型（如专长，卡片不渲染 details）不派生 details，避免保存冗余数据。
  if (cat === "power") {
    if (powerBlocks && powerBlocks.length) details = serializePowerBlocks(powerBlocks);
  } else if (!WITHOUT_BODY.has(cat)) {
    if (powerBlocks && powerBlocks.length) {
      details = serializePowerBlocks(powerBlocks);
    } else {
      details = sourceText ? renderBody(sourceText, bodyFormat, extras) : undefined;
    }
  }
  const entry: Entry = {
    id: existingId?.trim() || name,
    name,
    nameEn: (form.nameEn ?? "").trim() || undefined,
    category: cat,
    tags: splitTags(form.tags ?? ""),
    origin: "user",
    source: (form.source ?? "").trim() || (opts?.allowEmpty ? "" : "私设"),
    sourceText,
    bodyFormat,
    fields: extras,
    wiki: { transclusions: [], links: [], macros: [], headings: [] },
    ...(powerBlocks && powerBlocks.length ? { powerBlocks } : {}),
    details,
    ...extras,
  };
  return { ok: true, entry };
}

export function draftToForm(entry: Entry): Record<string, string> {
  const form: Record<string, string> = {
    name: entry.name ?? "",
    nameEn: entry.nameEn ?? "",
    category: entry.category ?? "",
    tags: (entry.tags ?? []).join(", "),
    source: entry.source ?? "",
    sourceText: entry.sourceText ?? "",
    bodyFormat: detectBodyFormat(entry),
  };
  for (const f of CATEGORY_FIELDS[entry.category] ?? []) {
    const v = (entry as Record<string, unknown>)[f.key];
    form[f.key] = typeof v === "string" ? v : "";
  }
  // 威能「标签块」回填：以数组形式存入表单（编辑器按 PowerBlock[] 使用）
  if (entry.category === "power" && Array.isArray(entry.powerBlocks) && entry.powerBlocks.length) {
    form.powerBlocks = JSON.stringify(entry.powerBlocks);
  } else if (entry.category === "power" && entry.details) {
    // 官方/旧条目的 details HTML → 可编辑标签块（拆成 目标/攻击/命中… 行，含缩进与换行）
    const blocks = parsePowerDetails(entry.details);
    if (blocks?.length) form.powerBlocks = JSON.stringify(blocks);
  }
  // 威能：再生频率缺省时按官方 usage/usageZh 反推（只有 随意/遭遇/每日 三值）
  if (entry.category === "power" && !form.usageZh) {
    if (entry.usage === "at-will" || entry.usageZh === "随意") form.usageZh = "随意";
    else if (entry.usage === "encounter" || entry.usageZh === "遭遇") form.usageZh = "遭遇";
    else if (entry.usage === "daily" || entry.usageZh === "每日") form.usageZh = "每日";
  }
  // 威能类型：官方 powerType（如「邪术师攻击」「影子杀手辅助」）剥离授予者前缀，
  // 归一为 攻击/辅助/特殊 三选；无从属时按 powerKind 兜底。
  if (entry.category === "power") {
    const t = entry.powerType ?? "";
    const m = /^(.*?)(攻击|辅助|特殊|威能)$/.exec(t);
    const type = m?.[2] === "威能" ? "特殊" : m?.[2];
    if (type && POWER_TYPES.some((p) => p.label === type)) {
      form.powerType = type;
      if (!form.grantedBy && m?.[1]) form.grantedBy = m[1];
    } else if (entry.powerKind === "utility") form.powerType = "辅助";
    else if (entry.powerKind === "special") form.powerType = "特殊";
    else if (entry.powerKind === "attack") form.powerType = "攻击";
  }
  // 威能：sourceText 若只是「<<power-format>>」等宏占位（剥掉宏后为空），清空以免正文区显示无意义代码
  if (entry.category === "power" && form.sourceText && !form.sourceText.replace(/<<[^>]+>>/g, "").trim()) {
    form.sourceText = "";
  }
  for (const f of APPEARANCE_FIELDS) {
    const v = (entry as Record<string, unknown>)[f.key];
    form[f.key] = typeof v === "string" ? v : "";
  }
  return form;
}