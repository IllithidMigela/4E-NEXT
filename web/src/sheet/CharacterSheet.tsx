import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FilledTextField, FilledSelect, SelectOption, TextButton, IconButton, Switch } from "../components/md";
import { loadCategory, loadRelations } from "../data/loaders";
import type { Entry } from "../data/types";
import { type AbilityKey, type Character, ABILITY_LABELS, deriveStats, parseClassStats, parseRaceAbilities, racialBonus, applyAbilityBonus, parseTrainedSkillCount, parseClassSkills, parseBuiltinTrainedSkills, cleanDisplayName, setPowerSlot, clearPowerSlot, setFeatSlot, clearFeatSlot, setEquipmentSlot, clearEquipmentSlot, EQUIPMENT_SLOTS, buyPointsUsed, BUY_POINTS, DEFENSE_BONUS_SOURCES, parseRaceDefenses, baseClassName, SKILL_TABLE, ARMOR_PENALTY_SKILLS, zhName, type DefenseKey, type DefenseBonusSource, type SpeedMods, type InitMods, type SkillMods, type PowerSlots, grantedPowerCategory } from "./character";
import { LEVELS, levelFromXp, xpForLevel } from "./leveling";
import PowerSlotPicker from "./PowerSlotPicker";
import FeatSlotPicker from "./FeatSlotPicker";
import FeatChoiceDialog from "./FeatChoiceDialog";
import WeaponPalette, { type WeapInfo, implGroup } from "./WeaponPalette";
import ItemSlotPicker from "./ItemSlotPicker";
import EntryCard from "./EntryCard";
import PortraitFrame from "./PortraitFrame";
import CombatPanels from "./CombatPanel";
import { collectProficiencyTokens, collectProficiencySources, isProficient, featChoiceInfo, collectArmorTokens, collectShieldTokens, collectImplementGroups, armorProficient, type FeatOption, type ProfGroup } from "./proficiency";
import { SmartHover } from "./SmartHover";
import { collectClassSources, collectFeatSources } from "./combat-source";
import { stripWiki } from "../lib/text";
import { wikiToHtml, classTraitHtml, classFeaturesHtml, classSummary, raceTraitHtml, raceBodyHtml, splitRaceLore, splitAuxPowers, parseSubraceInfo, parseFeatureSections, parseClassFeatureOptions, parseReplacementPairs, tokenizeWikiBody, parseRaceTraitLines, type FeatureSection } from "../lib/wikirender";
import { BASE_WEAPONS, BASE_ARMORS, BASE_IMPLEMENTS, findBaseItem, baseItemId, traitsText, type BaseWeapon, type BaseImplement } from "../lib/baseitems";
import { priceForLevel, itemLevels } from "../lib/levelprices";
import { POWER_CATEGORIES, POWER_COLORS, ITEM_COLOR, FEAT_COLOR } from "../lib/colors";
import PickerModal from "./PickerModal";
import ClassPickerModal from "./ClassPickerModal";
import SheetDialog from "../components/SheetDialog";

const ABILITIES: AbilityKey[] = ["str", "con", "dex", "int", "wis", "cha"];

// 种族出处 → 系列分组排序：系列属主键，同一系列内按规则书优先级排序（仅用于种族选择弹窗展示顺序）。
// [系列序, 书内序]；核心系列优先，其次精华、扩展、世设、补充，纯参考书垫底。未知出处归入末尾。
const RACE_SERIES: Record<string, [number, number]> = {
  // 核心系列
  PH: [0, 0], PH2: [0, 1], PH3: [0, 2], PP: [0, 2],
  DMG: [0, 3], DMG2: [0, 4],
  MM: [0, 5], MM2: [0, 6], MM3: [0, 7],
  // 精华系列（Essentials）
  HoFL: [1, 0], HoFK: [1, 1], HoS: [1, 2], HoF: [1, 3], HoEC: [1, 4],
  DMK: [1, 5], MV: [1, 6],
  // 扩展
  AV: [2, 0], AV2: [2, 1], MME: [2, 2], MP: [2, 3], MP2: [2, 4],
  AP: [2, 5], DP: [2, 6], PriP: [2, 7], PsiP: [2, 8],
  PHRD: [2, 9], PHRT: [2, 10],
  Dragon: [2, 11], Dra: [2, 11],
  // 世设
  FRCS: [3, 0], FRPG: [3, 1], ECS: [3, 2], EPG: [3, 3],
  DSCS: [3, 4], DSCC: [3, 5], NCS: [3, 6],
  // 补充
  BoVD: [4, 0], DSH: [4, 1], DEM: [4, 2], DMD: [4, 3], DCD: [4, 4],
  MotP: [4, 5], OG: [4, 6], TPA: [4, 7], TPB: [4, 8],
  // 参考书
  PSG: [5, 0], RC: [5, 1],
};
function sortRaces(list: Entry[]): Entry[] {
  const aIsHuman = (e: Entry) => e.nameEn === "Human" || e.name === "人类";
  return [...list].sort((a, b) => {
    if (aIsHuman(a) !== aIsHuman(b)) return aIsHuman(a) ? -1 : 1;
    const ka = RACE_SERIES[a.source ?? ""] ?? [9, 0];
    const kb = RACE_SERIES[b.source ?? ""] ?? [9, 0];
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return 0;
  });
}

// 技能别名：种族文本用「贼活」，技能面板用「盗术」等
const SKILL_ALIAS: Record<string, string> = { "贼活": "盗术" };
const SKILL_NAME_SET = new Set(SKILL_TABLE.map((s) => s.name));
// 解析种族文本自动填入内容：技能种族加值 + 语言槽
// 语言：排除「通用语」（固定芯片单独展示）；「任选 X 种」或「A 或 B」→ 留一个空槽给用户填写；其余为固定语言。
function parseRaceAutofill(sourceText: string): { skills: Record<string, number>; languages: string[] } {
  const mt = sourceText.match(/@@\.classTrait\s+"""([\s\S]*?)"""/);
  const ct = mt ? mt[1] : "";
  // 技能奖励：从行内拆出「+2技能」片段，识别为面板技能名的部分作为种族加值；「任意/由…决定」等跳过（留空手填）
  const skills: Record<string, number> = {};
  const skillLine = (ct.match(/技能奖励[\s\S]{0,1}([^\n]*)/) || [])[1] ?? "";
  for (const raw of skillLine.split(/[,，、；;]/)) {
    const m = raw.match(/\+?\s*(\d+)\s*([\u4e00-\u9fff]{2,})/);
    if (!m) continue;
    const name = SKILL_ALIAS[m[2].trim()] ?? m[2].trim();
    if (SKILL_NAME_SET.has(name)) skills[name] = (skills[name] ?? 0) + Number(m[1]);
  }
  // 语言
  const langLine = (ct.match(/\u8bed\u8a00[\s\S]{0,1}([^\n]*)/) || [])[1] ?? "";
  const fixed: string[] = [];
  let anyCount = 0;
  for (const raw of langLine.split(/[,，、；;。]/)) {
    const part = raw.trim();
    if (!part) continue;
    if (part.includes("任选")) {
      const n = part.match(/任选\s*(两|二|三|四|五|六|七|八|九|十|一)?\s*种?/);
      anyCount += n ? anyCountOfCn(n[1]) : 1;
      continue;
    }
    if (part.includes("或")) { anyCount += 1; continue; } // 「A 或 B」择一，留空槽
    // 去掉排版引号（''语言：'' 的粗体标记会残留 '），再去除括注；跳过含数字的种族特殊能力（如「心灵感应5」）
    const name = part.replace(/（[\s\S]*）|\([\s\S]*\)/g, "").replace(/'/g, "").trim();
    if (!name || /\d/.test(name)) continue;
    fixed.push(name); // 通用语与其它固定语言一样，作为可填可删的普通槽位
  }
  const languages: string[] = [...fixed];
  for (let i = 0; i < anyCount; i++) languages.push("");
  if (languages.length === 0) languages.push("");
  return { skills, languages };
}
function anyCountOfCn(token: string | undefined): number {
  if (!token) return 1;
  if (token === "两" || token === "二") return 2;
  if (token === "三") return 3;
  if (token === "四") return 4;
  return 1;
}

// 灵能职业（每日灵能点来源）：炽念使/战魂/心灵术士共用同一阶梯表；武僧不消耗灵能点，故排除。
const PSIONIC_PP_CLASSES = new Set(["炽念使 Ardent", "战魂 Battlemind", "心灵术士 Psion"]);
// 按当前等级返回该灵能职业的每日灵能点，非灵能职业返回 undefined
function psionicPowerPoints(classId: string | undefined, level: number): number | undefined {
  if (!classId || !PSIONIC_PP_CLASSES.has(classId)) return undefined;
  if (level <= 2) return 2;
  if (level <= 6) return 4;
  if (level <= 12) return 6;
  if (level <= 16) return 7;
  if (level <= 20) return 9;
  if (level <= 22) return 11;
  if (level <= 26) return 13;
  return 15;
}

// 22 购点常用预设（数值数组按 ABILITIES 顺序，均恰好 22 点；应用时按玩家拖动的属性顺序分配）
const BUY_PRESETS: { label: string; values: number[] }[] = [
  { label: "16 16 12 11 11 8", values: [16, 16, 12, 11, 11, 8] },
  { label: "16 16 12 10 10 10", values: [16, 16, 12, 10, 10, 10] },
  { label: "18 14 11 10 10 8", values: [18, 14, 11, 10, 10, 8] },
  { label: "18 12 12 10 10 10", values: [18, 12, 12, 10, 10, 10] },
];

const SLOT_CATS: { key: keyof PowerSlots; label: string; color: string }[] = [
  { key: "atWill", label: "随意威能", color: POWER_CATEGORIES[0].color },
  { key: "encounter", label: "遭遇威能", color: POWER_CATEGORIES[1].color },
  { key: "daily", label: "每日威能", color: POWER_CATEGORIES[2].color },
  { key: "utility", label: "辅助威能", color: POWER_CATEGORIES[3].color },
  { key: "special", label: "种族/职业威能", color: POWER_CATEGORIES[4].color },
];

function resizeSlots(arr: (string | undefined)[], n: number): (string | undefined)[] {
  const out = [...arr];
  const capped = Math.max(0, Math.min(20, n));
  if (out.length > capped) out.length = capped;
  while (out.length < capped) out.push(undefined);
  return out;
}

// —— 职业特性授予威能的提取 / 加入威能面板 ——

// 从 wiki 文本提取全部 [[链接]] 目标（去重，保留顺序）
function wikiLinkTargets(text?: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1].trim();
    if (!seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

// 选项值归一化为字符串数组（choiceKey 存 string 或 string[]）
function choiceVals(v: string | string[] | undefined): string[] {
  return Array.isArray(v) ? v : v ? [v] : [];
}

// 选项描述中授予的威能：若含「选择用[[A]]来代替[[B]]」子二选一（如炼狱契约炼狱叱喝/阿弗纳斯赠礼），
// 则只取当前选中的（未选时默认保留原威能 B）；否则描述里所有 [[威能]] 链接都视为授予。
function optionGrantedPowers(desc: string, innerChosen: string | string[] | undefined, lookup: (t: string) => Entry | undefined): Entry[] {
  const out: Entry[] = [];
  const add = (t: string) => {
    const e = lookup(t);
    if (e && e.category === "power" && !out.some((x) => x.id === e.id)) out.push(e);
  };
  const sub = desc.match(/(?:你可以)?选择(?:用)?\[\[([^\]]+)\]\]来代替\[\[([^\]]+)\]\](?:威能)?/);
  if (sub) {
    const alt = sub[1].trim();
    const keep = sub[2].trim();
    const vals = choiceVals(innerChosen);
    add(vals.includes(alt) ? alt : keep);
    return out;
  }
  for (const t of wikiLinkTargets(desc)) add(t);
  return out;
}

// 正文中「N级时，你获得[[威能]]」的等级门槛：返回 威能链接 → 需达到的等级（如野蛮人「狂暴打击」5级）。
// 用于特性授予威能时，未达等级的威能先不加入威能面板。
function levelGatedWikiLinks(body?: string): Map<string, number> {
  const gates = new Map<string, number>();
  if (!body) return gates;
  const re = /(\d+)级(?:时|后)?，?\s*(?:你(?:会|将)?)?获得\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const lv = parseInt(m[1], 10);
    const t = m[2].trim();
    if (!gates.has(t) || gates.get(t)! > lv) gates.set(t, lv);
  }
  return gates;
}

// 装备栏位分组（下标对应 EQUIPMENT_SLOTS），按部位各自单独成组
const EQUIP_GROUPS: { label: string; kind?: "weapon" | "armor"; slots: { index: number; name: string }[] }[] = [
  { label: "武器", kind: "weapon", slots: [{ index: 0, name: "主手" }, { index: 1, name: "副手" }] },
  { label: "护甲", kind: "armor", slots: [{ index: 5, name: "护甲" }] },
  { label: "佩戴", slots: [{ index: 2, name: "佩戴" }] },
  { label: "头部", slots: [{ index: 3, name: "头部" }] },
  { label: "颈部", slots: [{ index: 4, name: "颈部" }] },
  { label: "腰部", slots: [{ index: 6, name: "腰部" }] },
  { label: "臂部", slots: [{ index: 7, name: "臂部" }] },
  { label: "手部", slots: [{ index: 8, name: "手部" }] },
  { label: "戒指", slots: [{ index: 9, name: "戒指 1" }, { index: 10, name: "戒指 2" }] },
  { label: "足部", slots: [{ index: 11, name: "足部" }] },
  { label: "奇物", slots: [{ index: 12, name: "奇物" }] },
];

// 基础物品块：名称 + 大字伤害骰/AC + 简名特性；特性完整定义悬浮显示（同威能简洁模式）
function BaseItemBlock(props: { id?: string; kind: "weapon" | "armor"; label?: string; onClick: () => void }) {
  const item = props.id ? findBaseItem(props.id) : undefined;
  const weapon = item?.kind === "weapon" ? item.weapon : undefined;
  const armor = item?.kind === "armor" ? item.armor : undefined;
  const shield = item?.kind === "shield" ? item.shield : undefined;
  const implement = item?.kind === "implement" ? item.implement : undefined;
  const traitNames = weapon && weapon.traits && weapon.traits !== "—" ? weapon.traits : "";
  const traitFull = weapon ? traitsText(weapon.traits) : "";
  return (
    <button type="button" className="base-item" onClick={props.onClick} title="点击更换基础物品">
      {shield ? (
        <>
          <span className="bi-name">{shield.name}</span>
          <span className="bi-dice">+{shield.ac} AC</span>
          <span className="bi-traits">{shield.traits}</span>
        </>
      ) : implement ? (
        <>
          <span className="bi-name">{implement.name}</span>
          <span className="bi-dice">—</span>
          <span className="bi-traits">{implement.category}法器</span>
        </>
      ) : props.kind === "weapon" ? (
        <>
          <span className="bi-name">{weapon ? weapon.name : (props.label ?? "基础武器")}</span>
          <span className="bi-dice">{weapon ? weapon.dice : "—"}</span>
          <span className="bi-traits">{traitNames || "点击选择"}</span>
          {traitFull && (
            <span className="base-pop">
              {traitFull.split("\n").map((l, i) => <span key={i} className="base-pop-line">{l}</span>)}
            </span>
          )}
        </>
      ) : (
        <>
          <span className={"bi-name" + (armor?.masterwork ? " masterwork" : "")}>{armor ? armor.name : "基础护甲"}</span>
          <span className="bi-dice">{armor ? "+" + armor.ac : "—"}</span>
          <span className="bi-traits">{armor ? (armor.masterwork ? "最小增强 +" + armor.minEnhance : armor.category) : "点击选择"}</span>
        </>
      )}
    </button>
  );
}
// 基础物品选择弹窗：左侧导航 + 分组卡片
const ARMOR_BASES: { name: string; cat: string }[] = [
  { name: "布甲", cat: "轻甲" },
  { name: "皮甲", cat: "轻甲" },
  { name: "革甲", cat: "轻甲" },
  { name: "镶嵌皮甲", cat: "轻甲" },
  { name: "环甲", cat: "轻甲" },
  { name: "链甲", cat: "重甲" },
  { name: "鳞甲", cat: "重甲" },
  { name: "板甲", cat: "重甲" },
  { name: "镶钢链甲", cat: "重甲" },
  { name: "板条甲", cat: "重甲" },
  { name: "钉板甲", cat: "重甲" },
  { name: "全身板甲", cat: "重甲" },
];

function BasePickerDialog(props: { kind: "weapon" | "armor"; index: number; baseId?: string; proficientInfos?: WeapInfo[]; proficientImplGroups?: string[]; armorTokens?: Set<string>; shieldTokens?: Set<string>; onSelect: (id: string) => void; onClear: () => void; onClose: () => void }) {
  const [masterwork, setMasterwork] = useState(false);
  const active = (id: string) => props.baseId === id;
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const armorTok = props.armorTokens ?? new Set<string>();
  const shieldTok = props.shieldTokens ?? new Set<string>();
  // 护甲擅长：命中具体护甲名 或 命中所属大类（轻甲/重甲）
  const armorProf = (a: { name: string; category: string }) =>
    armorProficient(armorTok, shieldTok, a.name) ||
    (a.category === "轻甲" ? armorTok.has("轻甲") : a.category === "重甲" ? armorTok.has("重甲") : false);
  const card = (name: string, id: string, main: string, sub: string, proficient = false, mw?: boolean) => (
    <button
      key={id}
      type="button"
      className={active(id) ? "picker-card base-picker-card selected" : "picker-card base-picker-card" + (mw ? " masterwork" : "")}
      onClick={() => props.onSelect(id)}
    >
      <span className="bi-name">{name}</span>
      <span className="bi-dice">{main}</span>
      <span className="bi-traits">{sub}</span>
      {proficient && <span className="prof-badge">擅长</span>}
    </button>
  );

  const armorGroups = masterwork
    ? ARMOR_BASES.map((b) => ({ label: b.cat + "-" + b.name, items: BASE_ARMORS.filter((a) => a.name.includes(b.name)) }))
    : [{ label: "轻甲", items: BASE_ARMORS.filter((a) => a.category === "轻甲" && !a.masterwork) }, { label: "重甲", items: BASE_ARMORS.filter((a) => a.category === "重甲" && !a.masterwork) }];
  const currentBase = props.baseId ? findBaseItem(props.baseId) : undefined;
  const currentBaseName = currentBase
    ? (currentBase.kind === "weapon" ? currentBase.weapon!.name
      : currentBase.kind === "armor" ? currentBase.armor!.name
      : currentBase.kind === "shield" ? currentBase.shield!.name
      : currentBase.implement!.name)
    : undefined;

  return createPortal(
    <div className="picker-overlay" onClick={props.onClose}>
      <div className="picker-dialog class-dialog base-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="picker-title">选择基础{props.kind === "weapon" ? "武器" : "护甲"}{currentBaseName ? "（当前：" + currentBaseName + "）" : ""}</span>
          <div className="base-dialog-actions">
            <TextButton onClick={props.onClear}>清除基础物品</TextButton>
            <button type="button" className="crop-btn" onClick={props.onClose}>关闭</button>
          </div>
        </div>
        {props.kind === "armor" && (
          <label className="base-mw-toggle">
            <Switch selected={masterwork} onChange={(e) => setMasterwork((e.target as any).selected)} />
            <span>精制品</span>
          </label>
        )}
      {props.kind === "weapon" ? (
        <WeaponPalette
          weapons={BASE_WEAPONS}
          allowImplShield
          proficientInfos={props.proficientInfos ?? []}
          proficientImplGroups={props.proficientImplGroups}
          armorTokens={props.armorTokens}
          shieldTokens={props.shieldTokens}
          currentName={currentBaseName}
          onSelect={(id) => props.onSelect(id)}
        />
      ) : (
        <div className="equip-layout base-dialog-layout">
          <nav className="equip-nav">
            {armorGroups.map((g) => (
              <button key={g.label} type="button" className="equip-nav-btn" title={g.label} onClick={() => jump("base-g-" + g.label)}>{g.label}</button>
            ))}
          </nav>
          <div className="equip-groups">
            {armorGroups.map((g) => (
              <div key={g.label} id={"base-g-" + g.label} className="base-cat">
                <div className="base-cat-title">{g.label}</div>
                <div className="picker-cards">
                  {g.items.filter((a) => !a.masterwork).map((a) => card(a.name, baseItemId("armor", a.name), "+" + a.ac, a.category, armorProf(a)))}
                  {masterwork && g.items.filter((a) => a.masterwork).map((a) => card(a.name, baseItemId("armor", a.name), "+" + a.ac, "最小增强 +" + a.minEnhance + (a.special ? " · " + a.special : ""), armorProf(a), true))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>,
    document.body
  );
}
function EquipGroupSlots(props: {
  slots: (string | undefined)[];
  detail: boolean;
  names: (i: number) => string;
  items: (i: number) => Entry | undefined;
  picker: (i: number) => void;
  clear: (i: number) => void;
  usedOf?: (i: number) => boolean;
  baseKind?: "weapon" | "armor";
  baseOf?: (i: number) => string | undefined;
  onBaseClick?: (i: number) => void;
  levelsOf?: (i: number) => number[];
  enhanceOf?: (i: number) => number;
  onEnhance?: (i: number, tier: number) => void;
}) {
  if (!props.detail) {
    return (
      <div className="compact-list">
        {props.slots.map((_, i) => {
          const item = props.items(i);
          const baseName = props.baseKind && props.baseOf ? (() => {
            const b = props.baseOf(i);
            const f = b ? findBaseItem(b) : undefined;
            return f ? (f.kind === "weapon" ? f.weapon!.name : f.kind === "armor" ? f.armor!.name : f.kind === "shield" ? f.shield!.name : f.implement!.name) : undefined;
          })() : undefined;
          if (item) {
            const used = !!props.usedOf?.(i);
            return (
              <div key={i} className={"compact-row" + (used ? " slot-used" : "")} onClick={() => props.picker(i)} title={used ? "已标记使用（锁定）" : "点击更换"}>
                <span className="cr-dot" style={{ background: ITEM_COLOR }} />
                {baseName && <span className="compact-base" onClick={(e) => { e.stopPropagation(); props.onBaseClick?.(i); }}>{baseName}</span>}
                <span className="cr-name">{item.name}{item.nameEn ? " " + item.nameEn : ""}</span>
                <span className="cr-sub">{item.rarity}{item.itemLevel ? " · L" + item.itemLevel : ""}</span>
                <IconButton className="slot-x" title={used ? "已标记使用（锁定）" : "清空槽位"} aria-label="清空槽位" onClick={(e) => { e.stopPropagation(); if (used) return; props.clear(i); }}><span className="material-symbols-outlined">close</span></IconButton>
                <div className="compact-pop"><EntryCard entry={item} /></div>
              </div>
            );
          }
          return (
            <button key={i} type="button" className="compact-empty" onClick={() => props.picker(i)}>＋ 选择{props.names(i)}</button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="power-grid">
      {props.slots.map((_, i) => {
        const item = props.items(i);
        const base = props.baseKind && props.baseOf ? (
          <BaseItemBlock id={props.baseOf(i)} kind={props.baseKind} label={props.baseKind === "weapon" ? props.names(i) : undefined} onClick={() => props.onBaseClick?.(i)} />
        ) : null;
        if (item) {
          return (
            <div key={i} className="slot-col">
              {base}
              {props.levelsOf && (() => {
                const levels = props.levelsOf(i);
                if (levels.length) {
                  const tier = props.enhanceOf ? Math.max(1, Math.min(levels.length, props.enhanceOf(i))) : 1;
                  const lv = levels[tier - 1];
                  const hasMore = levels.length > 1;
                  return (
                    <div className="enhance-stepper" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="sg-step" disabled={!hasMore || tier <= 1} title="降低增强" onClick={() => props.onEnhance?.(i, Math.max(1, tier - 1))}>−</button>
                      <span className="enhance-info">
                        <span className="enhance-sub">附魔：L{lv}{hasMore ? " · " + priceForLevel(lv).toLocaleString("zh-CN") + " gp" : ""}</span>
                        <span className="enhance-main">增强+{tier}</span>
                      </span>
                      <button type="button" className="sg-step" disabled={!hasMore || tier >= levels.length} title="提高增强" onClick={() => props.onEnhance?.(i, Math.min(levels.length, tier + 1))}>+</button>
                    </div>
                  );
                }
                return null;
              })()}
              <div className={"slot-filled" + (props.usedOf?.(i) ? " slot-used" : "")} onClick={() => props.picker(i)} title={props.usedOf?.(i) ? "已标记使用（锁定）" : "点击更换"}>
                <EntryCard entry={item} />
              </div>
            </div>
          );
        }
        return (
          <div key={i} className="slot-col">
            {base}
            <button type="button" className="slot-empty" onClick={() => props.picker(i)}>
              <span className="material-symbols-outlined">add</span>
              <span>{props.baseKind ? "选择" + props.names(i) + "附魔" : "选择" + props.names(i)}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

const DEF_BONUS_LABELS: Record<DefenseBonusSource, string> = {
  feat: "专长",
  enhance: "增强",
  armor: "防具",
  shield: "盾牌",
  other: "其他",
};

// 职业特性正文渲染：保留换行/表格，并把 [[威能]]、[[专长]] 等超链接转为悬浮卡片预览
function WikiBody({ body, fields, lookup }: { body: string; fields: Record<string, string>; lookup: (target: string) => Entry | undefined }) {
  const tokens = useMemo(() => tokenizeWikiBody(body, fields), [body, fields]);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.kind === "link") {
          const entry = lookup(t.target);
          if (!entry) return <span key={i} className="wiki-ref-plain">{t.alias}</span>;
          return <SmartHover key={i} className="wiki-ref" popClass="wiki-ref-pop" pop={<EntryCard entry={entry} />}>{t.alias}</SmartHover>;
        }
        if (t.kind === "html") return <div key={i} className="wiki-html" dangerouslySetInnerHTML={{ __html: t.html }} />;
        return <span key={i} dangerouslySetInnerHTML={{ __html: t.html }} />;
      })}
    </>
  );
}

// 单个职业特性条目：普通特性渲染标题+正文；选择型特性渲染「选择一个」选项（阵营面板样式）
// 单选型（count=1）：点击切换选中；多选型（count>1，如法师戏法「获得4个」）：点击增删并显示进度
// 从特性正文中拆出 <div class="sidebar">…</div> 内的「!!! 小节」规则文本
// （如守望者「守望者形态威能」、萨满「定制精魂伙伴」），作为可折叠子规则随特性渲染（样式与兽王折叠一致）
function splitSidebarSubs(body: string | undefined): { main?: string; subs: { title: string; body: string }[] } {
  if (!body) return { subs: [] };
  const subs: { title: string; body: string }[] = [];
  let main = body;
  const re = /<div class="sidebar">([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    main = main.replace(m[0], "");
    const parts = m[1].split(/^(?=!!! )/m);
    for (const p of parts) {
      const sm = p.match(/^!!!\s+(.+?)\s*\n([\s\S]*)$/);
      if (!sm) continue;
      const title = sm[1].trim();
      const subBody = sm[2]
        .replace(/^@@\.\w+\s*/gm, "")
        .replace(/^@@\s*$/gm, "")
        .replace(/^\s*$/gm, "")
        .trim();
      if (title && subBody) subs.push({ title, body: subBody });
    }
  }
  main = main.replace(/^\s*$/gm, "").trim();
  return { main: main.length > 0 ? main : undefined, subs };
}

function ClassFeatureItem({ section, fields, choiceKey, chosen, innerChosen, onChoose, lookup }: {
  section: FeatureSection;
  fields: Record<string, string>;
  choiceKey: string;
  chosen?: string | string[];
  innerChosen?: string | string[];
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
}) {
  const parsed = useMemo(() => parseClassFeatureOptions(section.body), [section.body]);
  const { main: secMain, subs: secSubs } = useMemo(() => splitSidebarSubs(section.body), [section.body]);
  const chosenVals = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
  const count = parsed.count ?? 1;
  const multiple = count > 1;
  const isChosen = (label: string) => chosenVals.includes(label);
  const toggle = (label: string) => {
    if (multiple) onChoose(choiceKey, isChosen(label) ? chosenVals.filter((x) => x !== label) : [...chosenVals, label]);
    else onChoose(choiceKey, isChosen(label) ? "" : label);
  };
  const selOpts = parsed.options.filter((o) => isChosen(o.label));
  // 选项为纯 [[链接]]（C 形态：戏法/庇护威能）→ 无描述，仅展示所选威能
  const linkOnly = parsed.options.length > 0 && parsed.options.every((o) => !o.desc);
  if (parsed.selectable) {
    return (
      <div className="pf-item">
        <div className="pf-title">{featTitle(section.title)}</div>
        {parsed.intro && <FeatureBody body={parsed.intro} fields={fields} lookup={lookup} />}
        <div className="cls-options">
          {parsed.options.map((o, i) => {
            const entry = lookup(o.label);
            return (
              <SmartHover key={i} className={isChosen(o.label) ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={entry ? <EntryCard entry={entry} /> : undefined} onClick={() => toggle(o.label)}>
                {o.label}
              </SmartHover>
            );
          })}
        </div>
        {multiple && (
          <div className={chosenVals.length >= count ? "cls-options-hint ok" : "cls-options-hint"}>
            已选 {chosenVals.length}/{count}{chosenVals.length >= count ? " 个" : ` 个（还需 ${count - chosenVals.length} 个）`}
          </div>
        )}
        {!multiple && parsed.options.length > 0 && <div className="cls-options-hint">点击选择一个选项（{chosenVals.length}/{count}）</div>}
        {multiple && linkOnly && selOpts.length > 0 && (
          <div className="cls-choice-desc">
            <div className="cls-choice-powers">
              {selOpts.map((o, i) => {
                const entry = lookup(o.label);
                if (!entry) return <span key={i} className="cls-choice-power-name">{o.label}</span>;
                return (
                  <SmartHover key={i} className="cls-choice-power" popClass="cls-choice-power-pop" pop={<EntryCard entry={entry} />}>
                    {entry.name}{entry.nameEn ? " " + entry.nameEn : ""}
                  </SmartHover>
                );
              })}
            </div>
          </div>
        )}
        {selOpts.length > 0 && !linkOnly && selOpts.some((o) => o.desc) && (
          <div className="cls-choice-desc">
            {selOpts.map((o, i) => <OptionOrSubChoice key={i} label={o.label} desc={o.desc} innerKey={choiceKey + "::inner"} innerChosen={innerChosen} onChoose={onChoose} fields={fields} lookup={lookup} />)}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="pf-item">
      <div className="pf-title">{featTitle(section.title)}</div>
      {secMain && <FeatureBody body={secMain} fields={fields} lookup={lookup} />}
      {secSubs.map((sub) => (
        <details className="beast-sub" key={sub.title}>
          <summary>{featTitle(sub.title).trim()}</summary>
          <div className="beast-sub-body"><div className="pf-body"><WikiBody body={prose(sub.body)} fields={fields} lookup={lookup} /></div></div>
        </details>
      ))}
    </div>
  );
}

// 选项描述的渲染：开头风味句用斜体楷书；若其余描述内嵌「你可以选择用[[A]]来代替[[B]]」的
// 子二选一（如邪术师炼狱契约的炼狱叱喝/阿弗纳斯赠礼），则拆出并渲染为可点选的子选项。
function OptionOrSubChoice({ label, desc, innerKey, innerChosen, onChoose, fields, lookup, compact }: {
  label: string;
  desc: string;
  innerKey: string;
  innerChosen?: string | string[];
  onChoose: (key: string, label: string | string[]) => void;
  fields: Record<string, string>;
  lookup: (target: string) => Entry | undefined;
  compact?: boolean;
}) {
  const { flavor, rest } = useMemo(() => splitFlavor(desc), [desc]);
  return (
    <>
      {label && <span>{label}：</span>}
      {flavor && <span className="pf-flavor"><WikiBody body={flavor} fields={fields} lookup={lookup} /></span>}
      {rest && <OptionRest desc={rest} innerKey={innerKey} innerChosen={innerChosen} onChoose={onChoose} fields={fields} lookup={lookup} compact={compact} />}
    </>
  );
}

// 渲染选项描述中风味之外的部分；若内含「选择用[[A]]来代替[[B]]」子二选一则拆为可点选子选项
function OptionRest({ desc, innerKey, innerChosen, onChoose, fields, lookup, compact }: {
  desc: string;
  innerKey: string;
  innerChosen?: string | string[];
  onChoose: (key: string, label: string | string[]) => void;
  fields: Record<string, string>;
  lookup: (target: string) => Entry | undefined;
  compact?: boolean;
}) {
  // 同一特性内规则段落之间不留空行（压缩 \n\n → 单换行），仅首段风味保留
  const flat = desc.replace(/\n{2,}/g, "\n");
  const m = flat.match(/(你可以选择用\[\[([^\]]+)\]\]来代替\[\[([^\]]+)\]\])/);
  if (!m || m.index === undefined) return <WikiBody body={flat} fields={fields} lookup={lookup} />;
  const keep = m[3].trim(); // 保留的原威能（炼狱叱喝）
  const alt = m[2].trim();  // 可选的替代威能（阿弗纳斯赠礼）
  const innerVals = Array.isArray(innerChosen) ? innerChosen : innerChosen ? [innerChosen] : [];
  const opts = [keep, alt];
  const at = m.index;
  // 简洁模式：只展示当前选中的子威能（带悬停预览），不显示两个可选按钮
  if (compact) {
    const cur = opts.find((o) => innerVals.includes(o)) ?? keep;
    const curE = lookup(cur);
    return (
      <>
        <div className="cls-feat-opt-wrap">
          <SmartHover className="cls-feat-opt" popClass="cls-option-pop" pop={curE ? <EntryCard entry={curE} /> : undefined}>
            {cur}
          </SmartHover>
        </div>
        {flat.slice(at + m[0].length) && <WikiBody body={flat.slice(at + m[0].length)} fields={fields} lookup={lookup} />}
      </>
    );
  }
  return (
    <>
      {at > 0 && <div className="cls-sub-title">炼狱契约随意威能</div>}
      <div className="cls-sub-hint">你可以从这两项随意威能中选择：</div>
      <div className="cls-options cls-sub">
        {opts.map((l) => {
          const e = lookup(l);
          return (
            <SmartHover key={l} className={innerVals.includes(l) ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={e ? <EntryCard entry={e} /> : undefined} onClick={() => onChoose(innerKey, innerVals.includes(l) ? "" : l)}>
              {l}
            </SmartHover>
          );
        })}
      </div>
      {flat.slice(at + m[0].length) && <WikiBody body={flat.slice(at + m[0].length)} fields={fields} lookup={lookup} />}
    </>
  );
}

interface AltGroup { base: FeatureSection; alts: FeatureSection[] }

// 取标题的纯中文前缀（去掉末尾的英文名，如「战士武器天赋 Fighter Weapon Talent」→「战士武器天赋」）
function cnTitle(title: string): string {
  const m = title.match(/^[^A-Za-z]+/);
  return m ? m[0].trim() : title;
}

// 某些特性标题需要改成更贴合其功能的名字（如邪术师的「魔能爆」改为「使用魔能」）
const FEAT_TITLE_RENAME: Record<string, string> = { "魔能爆 Eldritch Blast": "使用魔能", "神圣制裁": "神圣制裁（Divine Sanction）" };
function featTitle(title: string): string {
  return FEAT_TITLE_RENAME[title.trim()] ?? title;
}

// 精华职业（4E Essentials 系列）：职业特性按等级折叠，达到前提等级才自动展开
const ESSENTIALS_CLASS_IDS = new Set([
  "牧师（战争祭司） Cleric (Warpriest)",
  "法师（学派法师） Wizard (Mage)",
  "战士（杀手） Fighter (Slayer)",
  "战士（骑士） Fighter (Knight)",
  "游荡者（盗贼） Rogue (Thief)",
  "邪术师（魔剑士） Warlock (Hexblade)",
  "圣武士（圣骑兵） Paladin (Cavalier)",
  "游侠（斥候） Ranger (Scout)",
  "游侠（猎人） Ranger (Hunter)",
  "德鲁伊（哨兵） Druid (Sentinel)",
  "诗人（吟唱诗人） Bard (Skald)",
  "法师（巫师） Wizard (Witch)",
  "德鲁伊（保护者） Druid (Protector)",
  "野蛮人（狂战士） Barbarian (Berserker)",
  "邪术师（缚影师） Warlock (Binder)",
  "圣武士（黑暗卫士） Paladin (Blackguard)",
  "法师（元素法师） Wizard (Sha'ir)",
  "术士（元素使） Sorcerer (Elementalist)",
  "法师（剑咏士） Wizard (Bladesinger)",
]);

// 从特性标题提取前提等级：「N级：标题」→ N；无前缀的 1 级基础特性 → 1
function featureLevel(title: string): number {
  const m = title.trim().match(/^(\d+)级[：:]\s*/);
  return m ? parseInt(m[1], 10) : 1;
}

// 压缩连续空行段落，使特性正文段落之间不留空行
function prose(b: string): string {
  return b.replace(/\n{2,}/g, "\n");
}

// 规则/指引触发词：某句含这些词即视为「规则文字」而非风味叙述
const FLAVOR_STOP = /(你(?:获得|可以选择|选择|使用|必须|不能|会获得|造成|受到)|选择|使用|进行|着用|视为|攻击骰|攻击|命中|重击|检定|豁免|标记|借机|目标|骰|每回合|每个回合|一回合|若你|当你|如果你|如果|前提|需求|擅长|威能|要求)/;

// 已知「整段均为风味」的引言前缀：正文含「你获得」等规则触发词，但整段仍是叙述性风味，
// 不应被逐句扫描截断（如神罚使「神罚天谴」开头的三句叙述）。命中时整段首段视为风味。
const FLAVOR_FULL_PREFIXES = [
  "作为一个神罚使，你锤炼自己的思想、肉体和灵魂，只为一个目的：毁灭与你的信仰的敌对的人。",
];

// 把职业特性正文开头的叙述性(风味)句子与随后的规则/指引句子分开，供斜体楷书渲染风味文字。
// 规则：从首段起逐句扫描，遇到含规则触发词的句子即停止；停止前累积的句子视为风味。
function splitFlavor(body: string): { flavor: string; rest: string } {
  for (const pre of FLAVOR_FULL_PREFIXES) {
    if (body.startsWith(pre)) {
      const nl = body.indexOf("\n");
      if (nl >= 0) return { flavor: body.slice(0, nl), rest: body.slice(nl) };
      return { flavor: body, rest: "" };
    }
  }
  const first = body.split(/\n\s*\n/)[0] || "";
  // 句尾标点「。！？」可选：首段末尾常有无标点的叙述句，也视为风味的一部分
  const re = /\s*([^。！？!?]+(?:[。！？!?])?)/g;
  let end = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(first))) {
    if (FLAVOR_STOP.test(m[0])) break;
    end = re.lastIndex;
  }
  if (!end) return { flavor: "", rest: body };
  return { flavor: body.slice(0, end), rest: body.slice(end) };
}

// 渲染特性正文：开头风味句用斜体楷书，其余规则正文照常
function FeatureBody({ body, fields, lookup, className }: {
  body: string;
  fields: Record<string, string>;
  lookup: (target: string) => Entry | undefined;
  className?: string;
}) {
  const { flavor, rest } = useMemo(() => splitFlavor(prose(body)), [body]);
  return (
    <div className={className ?? "pf-body"}>
      {flavor && <span className="pf-flavor"><WikiBody body={flavor} fields={fields} lookup={lookup} /></span>}
      {rest && <WikiBody body={rest} fields={fields} lookup={lookup} />}
    </div>
  );
}

// 把「职位/威能来源」后紧跟的风味文字拆到下一行
function splitTraitLabels(t: string): string {
  return t.replace(/(\{\{!!role\}\})。/, "$1。\n").replace(/(\{\{!!power source\}\})。/, "$1。\n");
}

// 识别「此职业特性会替代「X」职业特性」替代组：把 X（base）与其各替代项合并为一个单选
function detectReplacementGroups(sections: FeatureSection[]): Map<string, AltGroup> {
  const refs = new Map<string, FeatureSection[]>();
  for (const s of sections) {
    const m = (s.body ?? "").match(/此职业特性会替代「([^」]+)」职业特性/);
    if (m) {
      const ref = m[1].trim();
      if (!refs.has(ref)) refs.set(ref, []);
      refs.get(ref)!.push(s);
    }
  }
  const groups = new Map<string, AltGroup>();
  for (const [ref, alts] of refs) {
    const base = sections.find((x) => cnTitle(x.title) === ref);
    if (base) groups.set(base.title, { base, alts });
  }
  return groups;
}

// 展示 base 与其替代项合并的选项组；base 自身带内部选择（如战士武器天赋选单手/双手）时，选中 base 再渲染内层子选项
function ReplacementGroupItem({ group, detail, fields, outerKey, outerChosen, innerKey, innerChosen, onChoose, lookup }: {
  group: AltGroup;
  detail: boolean;
  fields: Record<string, string>;
  outerKey: string;
  outerChosen?: string | string[];
  innerKey: string;
  innerChosen?: string | string[];
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
}) {
  const baseName = cleanDisplayName(group.base.title);
  const displayTitle = ({ "卓越战法": "战法", "战士武器天赋": "战斗风格", "准确射击": "游侠范式", "治疗者学识": "牧师学识" } as Record<string, string>)[cnTitle(group.base.title)] ?? baseName;
  const opts = [
    { label: baseName, desc: group.base.body },
    ...group.alts.map((a) => ({ label: cleanDisplayName(a.title), desc: a.body ? a.body.replace(/^此职业特性会替代「[^」]+」职业特性\s*。?\s*/, "") : "" })),
  ];
  const innerParse = useMemo(() => parseClassFeatureOptions(group.base.body), [group.base.body]);
  const outerSel = typeof outerChosen === "string" ? outerChosen : "";
  const isBase = outerSel === baseName;
  const altSel = opts.find((o) => o.label === outerSel);
  const innerVals = Array.isArray(innerChosen) ? innerChosen : innerChosen ? [innerChosen] : [];
  const innerSelected = innerParse.options.find((o) => innerVals.includes(o.label));
  let baseIntro = group.base.body ?? "";
  const lm = baseIntro.match(/^选择[^。]*。\s*/);
  if (lm) baseIntro = baseIntro.slice(lm[0].length);

  if (detail) {
    return (
      <div className="pf-item">
        <div className="pf-title">{displayTitle}<span className="cls-options-hint">点击选择一个选项（{outerSel ? 1 : 0}/1）</span></div>
        <div className="cls-options">
          {opts.map((o, i) => {
            const e = lookup(o.label);
            return (
              <SmartHover key={i} className={outerSel === o.label ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={e ? <EntryCard entry={e} /> : undefined} onClick={() => onChoose(outerKey, outerSel === o.label ? "" : o.label)}>
                {o.label}
              </SmartHover>
            );
          })}
        </div>
        {isBase && innerParse.selectable && innerParse.options.length > 0 && (
          <>
            <div className="cls-options cls-sub">
              {innerParse.options.map((o, i) => {
                const e = lookup(o.label);
                return (
                  <SmartHover key={i} className={innerVals.includes(o.label) ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={e ? <EntryCard entry={e} /> : undefined} onClick={() => onChoose(innerKey, innerVals.includes(o.label) ? "" : o.label)}>
                    {o.label}
                  </SmartHover>
                );
              })}
            </div>
            <div className="cls-options-hint">点击选择一个选项（{innerVals.length ? 1 : 0}/1）</div>
          </>
        )}
        {outerSel && (isBase ? (baseIntro && <FeatureBody body={baseIntro} fields={fields} lookup={lookup} />) : (altSel?.desc && <FeatureBody body={altSel.desc} fields={fields} lookup={lookup} />))}
      </div>
    );
  }
  // 简洁模式
  return (
    <div className={"cls-feat" + (outerSel ? " set" : " unset")}>
      <div className="cls-feat-name">{displayTitle}</div>
      {!outerSel ? (
        <div className="cls-feat-sub">未选择</div>
      ) : (
        <div className="cls-feat-opt">{isBase && innerSelected ? `${baseName}（${innerSelected.label}）` : outerSel}</div>
      )}
      {!isBase && altSel?.desc && <FeatureBody body={altSel.desc} fields={fields} lookup={lookup} className="cls-feat-note" />}
      {isBase && baseIntro && <FeatureBody body={baseIntro} fields={fields} lookup={lookup} className="cls-feat-note" />}
    </div>
  );
}

// 解析兽王特性正文中的野兽数据块（熊/野猪/猫/…每种伙伴的类型数据）。
// 注意：parseFeatureSections 会把行首的「@@.classTrait」标记清掉，故数据块在正文里以「""" <span>名</span> … 内容 … """」形式出现；
// 相邻数据块连续排列为「"""…""" """…"""」。
function parseBeastCompanions(body: string): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  const re = /"""\s*\n?\s*<span>([\s\S]*?)<\/span>([\s\S]*?)"""/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const label = m[1].trim();
    const detail = m[2].replace(/^\s*\n*\s*/, "").replace(/\s*\n*\s*$/, "").trim();
    if (label) out.push({ label, detail });
  }
  return out;
}

// 野兽伙伴数据悬浮卡片
function BeastCard({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="beast-card">
      <div className="beast-card-title">{label}</div>
      <div className="beast-card-body" dangerouslySetInnerHTML={{ __html: wikiToHtml(detail, {}).replace(/\n/g, "<br/>") }} />
    </div>
  );
}

// 兽王：详图显示「成为兽王」按钮；激活后展开兽王规则并选择野兽伙伴（悬停展示数据）。
// 简洁模式不显示按钮，仅在有选择时展示所选伙伴。激活兽王会互斥隐藏「战斗流派」和「游侠范式」。
function BeastMasterBlock({ section, detail, fields, on, chosen, toggleKey, beastKey, onChoose, lookup }: {
  section: FeatureSection;
  detail: boolean;
  fields: Record<string, string>;
  on: boolean;
  chosen: string;
  toggleKey: string;
  beastKey: string;
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
}) {
  const beasts = useMemo(() => parseBeastCompanions(section.body ?? ""), [section.body]);
  const ruleText = (section.body ?? "").replace(/"""[\s\S]*?"""/g, "").replace(/^\s*$/gm, "").trim();
  // 拆分兽王规则正文：主引言 + 「!!! 小节」列表（野兽伙伴数据/野兽类型/复活/指挥/自主行动/治疗/获得新的伙伴）
  // 主引言按空行拆成段落：「猎手标的」段单独折叠为【兽王猎手标的】，「复活野兽伙伴」段并入【复活野兽伙伴】折叠，其余作为【成为兽王】折叠
  const { general, quarry, raise, beastType, collapsed } = useMemo(() => {
    const subs: { title: string; body: string }[] = [];
    const parts = ruleText.split(/^(?=!!! )/m);
    const intro = parts.length > 1 ? parts[0].trim() : ruleText.trim();
    for (const p of parts.slice(1)) {
      const m2 = /^!!!\s+(.+?)\s*\n([\s\S]*)$/.exec(p);
      if (!m2) continue;
      subs.push({ title: m2[1].trim(), body: m2[2].replace(/^\s*$/gm, "").trim() });
    }
    const typeIdx = subs.findIndex((s) => s.title.startsWith("野兽类型"));
    const paras = (intro || ruleText).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const quarryPara = paras.find((p) => p.includes("猎手标的"));
    const raisePara = paras.find((p) => p.includes("复活野兽伙伴"));
    return {
      general: paras.filter((p) => p !== quarryPara && p !== raisePara).join("\n"),
      quarry: quarryPara ?? "",
      raise: raisePara ?? "",
      beastType: typeIdx >= 0 ? subs[typeIdx] : undefined,
      collapsed: subs.filter((_, i) => i !== typeIdx),
    };
  }, [ruleText]);
  if (!detail) {
    const b = beasts.find((x) => x.label === chosen);
    return (
      <div className={"cls-feat" + (on && chosen ? " set" : " unset")}>
        <div className="cls-feat-name">兽王</div>
        {on && chosen ? (
          <>
            <div className="cls-feat-opt-wrap">
              <SmartHover className="cls-feat-opt" popClass="cls-option-pop" pop={b ? <BeastCard label={b.label} detail={b.detail} /> : undefined}>{chosen}</SmartHover>
            </div>
            {b && <div className="beast-card-body compact-beast-card" dangerouslySetInnerHTML={{ __html: wikiToHtml(b.detail, {}).replace(/\n/g, "<br/>") }} />}
          </>
        ) : (
          <div className="cls-feat-sub">未选择</div>
        )}
      </div>
    );
  }
  return (
    <div className="pf-item beast-master">
      <div className="pf-title">兽王<span className="cls-options-hint">点击选择一个选项（{on ? 1 : 0}/1）</span></div>
      <div className="cls-options">
        <SmartHover className={on ? "cls-option active" : "cls-option"} popClass="cls-option-pop" onClick={() => onChoose(toggleKey, on ? "" : "on")}>
          成为兽王
        </SmartHover>
      </div>
      {!on ? (
        <div className="cls-feat-sub">选择成为兽王后，将无法选择战斗流派或游侠范式。</div>
      ) : (
        <>
          {general && (
            <details className="beast-sub">
              <summary>成为兽王</summary>
              <div className="beast-sub-body"><div className="pf-body"><WikiBody body={prose(general)} fields={fields} lookup={lookup} /></div></div>
            </details>
          )}
          {quarry && (
            <details className="beast-sub">
              <summary>兽王猎手标的</summary>
              <div className="beast-sub-body"><div className="pf-body"><WikiBody body={prose(quarry)} fields={fields} lookup={lookup} /></div></div>
            </details>
          )}
          {beastType && (
            <div className="beast-type">
              <div className="pf-sub-title">{beastType.title}</div>
              {beastType.body && <FeatureBody body={prose(beastType.body)} fields={fields} lookup={lookup} />}
            </div>
          )}
          <div className="cls-sub-title">选择野兽伙伴</div>
          <div className="cls-options cls-beasts">
            {beasts.map((b) => (
              <SmartHover key={b.label} className={chosen === b.label ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={<BeastCard label={b.label} detail={b.detail} />} onClick={() => onChoose(beastKey, chosen === b.label ? "" : b.label)}>
                {b.label}
              </SmartHover>
            ))}
          </div>
          {collapsed.map((s) => (
            <details className="beast-sub" key={s.title}>
              <summary>{s.title.replace(/\s+[A-Za-z].*$/m, "").trim()}</summary>
              <div className="beast-sub-body"><div className="pf-body"><WikiBody body={prose(raise && s.title.startsWith("复活野兽伙伴") ? raise + "\n" + s.body : s.body)} fields={fields} lookup={lookup} /></div></div>
            </details>
          ))}
        </>
      )}
    </div>
  );
}

// 开关型职业特性（正文以「当你选择该职业特性时」开头者，如督军「射手督军」）：详图用开关按钮，
// 选中后展示规则；简洁模式仅展示选中状态与正文。toggleKey 存 "on"/""。
function ToggleFeatureBlock({ section, detail, fields, on, toggleKey, onChoose, lookup }: {
  section: FeatureSection;
  detail: boolean;
  fields: Record<string, string>;
  on: boolean;
  toggleKey: string;
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
}) {
  const body = (section.body ?? "").trim();
  // 去掉开头的「当你选择该职业特性时，」引导语，仅展示规则正文
  const rule = body.replace(/^当你选择(?:该|此)职业特性时[，,]\s*/, "").trim();
  if (!detail) {
    return (
      <div className={"cls-feat" + (on ? " set" : " unset")}>
        <div className="cls-feat-name">{featTitle(section.title)}</div>
        {!on ? (
          <div className="cls-feat-sub">未选择</div>
        ) : (
          rule && <FeatureBody body={rule} fields={fields} lookup={lookup} className="cls-feat-note" />
        )}
      </div>
    );
  }
  return (
    <div className="pf-item">
      <div className="pf-title">{featTitle(section.title)}<span className="cls-options-hint">点击选择一个选项（{on ? 1 : 0}/1）</span></div>
      <div className="cls-options">
        <SmartHover className={on ? "cls-option active" : "cls-option"} popClass="cls-option-pop" onClick={() => onChoose(toggleKey, on ? "" : "on")}>
          选择该职业特性
        </SmartHover>
      </div>
      {on && rule && <FeatureBody body={rule} fields={fields} lookup={lookup} />}
    </div>
  );
}

// 多替换组职业特性（正文含多个独立替换对，如牧师「引导神力」）：每个替换对一组单选，组间互不影响。
// 每组显示「被替代项 + 可选项」按钮，选择某个可选项即用其替换被替代项，被替代项为默认组员。
function MultiReplacementBlock({ section, detail, baseKey, chosen, onChoose, fields, lookup }: {
  section: FeatureSection;
  detail: boolean;
  fields: Record<string, string>;
  baseKey: string;                                                       // 形如 entry.id::标题，本组件在各组后追加 ::g{index}
  chosen: (string | undefined)[];                                        // 各组当前选中值（按组下标对齐）
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
}) {
  const parsed = useMemo(() => parseReplacementPairs(section.body ?? ""), [section.body]);
  if (!parsed) return null;
  if (!detail) {
    return (
      <div className="cls-feat">
        <div className="cls-feat-name">{featTitle(section.title)}</div>
        {parsed.intro && <FeatureBody body={prose(parsed.intro)} fields={fields} lookup={lookup} className="cls-feat-note" />}
        {parsed.groups.map((g, gi) => {
          const cur = chosen[gi] ?? "";
          return (
            <div className="cls-feat-opt-wrap" key={gi}>
              <SmartHover className="cls-feat-opt" popClass="cls-option-pop" pop={lookup(cur) ? <EntryCard entry={lookup(cur)!} /> : undefined}>{cur || g.base}</SmartHover>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="pf-item">
      <div className="pf-title">{featTitle(section.title)}</div>
      {parsed.intro && <FeatureBody body={prose(parsed.intro)} fields={fields} lookup={lookup} />}
      {parsed.groups.map((g, gi) => {
        const key = baseKey + "::g" + gi;
        const cur = chosen[gi] ?? "";
        const isCur = (label: string) => cur === label;
        return (
          <div key={gi}>
            <div className="cls-options">
              {[g.base, ...g.alts].filter((v, i, a) => a.indexOf(v) === i).map((label, i) => {
                const e = lookup(label);
                return (
                  <SmartHover key={i} className={isCur(label) ? "cls-option active" : "cls-option"} popClass="cls-option-pop" pop={e ? <EntryCard entry={e} /> : undefined} onClick={() => onChoose(key, cur === label ? "" : label)}>
                    {label}
                  </SmartHover>
                );
              })}
            </div>
            {cur && <div className="cls-options-hint">点击选择一个选项（1/1）</div>}
          </div>
        );
      })}
    </div>
  );
}

// 折叠特性悬停预览（只读）：普通特性渲染正文；选择型特性列出选项名与描述
function FeaturePreview({ section, fields, lookup }: {
  section: FeatureSection;
  fields: Record<string, string>;
  lookup: (target: string) => Entry | undefined;
}) {
  const parsed = useMemo(() => parseClassFeatureOptions(section.body), [section.body]);
  return (
    <div className="pf-fold-pop-body">
      <div className="pf-fold-pop-title">{featTitle(section.title).replace(/^\d+级[：:]\s*/, "")}</div>
      {parsed.selectable ? (
        <>
          {parsed.intro && <FeatureBody body={prose(parsed.intro)} fields={fields} lookup={lookup} />}
          <div className="pf-fold-pop-opts">
            {parsed.options.map((o, i) => (
              <div key={i} className="pf-fold-pop-opt">
                <div className="pf-fold-pop-opt-name">{o.label}</div>
                {o.desc && <FeatureBody body={o.desc} fields={fields} lookup={lookup} />}
              </div>
            ))}
          </div>
        </>
      ) : (
        section.body && <FeatureBody body={section.body} fields={fields} lookup={lookup} />
      )}
    </div>
  );
}

// 精华职业特性折叠：未达前提等级时折叠为「标题 + 等级徽标」行，悬停预览内容；
// 达到前提等级（expanded）后直接渲染完整交互内容。
function FeatureFold({ section, level, expanded, fields, lookup, children }: {
  section: FeatureSection;
  level: number;
  expanded: boolean;
  fields: Record<string, string>;
  lookup: (target: string) => Entry | undefined;
  children: ReactNode;
}) {
  if (expanded) return <>{children}</>;
  return (
    <div className="pf-item">
      <SmartHover className="pf-fold" popClass="pf-fold-pop" pop={<FeaturePreview section={section} fields={fields} lookup={lookup} />}>
        <span className="pf-fold-name">{featTitle(section.title).replace(/^\d+级[：:]\s*/, "")}</span>
        <span className="pf-fold-level">Lv{level}</span>
      </SmartHover>
    </div>
  );
}

// 提取职业特性区域之外 <div class="sidebar">…</div> 内的「!!! 小节」规则正文（如圣武士「神圣制裁」），
// 作为独立规则折叠小节返回（样式与兽王折叠一致）。作用域限定在特性区域之后、并剔除特性区域本身，
// 避免重复提取已在特性正文中渲染的 sidebar（如守望者形态威能）
function sidebarRuleSections(sourceText: string): FeatureSection[] {
  const feats = classFeaturesHtml(sourceText);
  const featM = sourceText.match(/^! [^\n]*职业特性[^\n]*\n/m);
  const after = featM && featM.index !== undefined ? sourceText.slice(featM.index + featM[0].length) : sourceText;
  const scope = feats ? after.replace(feats, "") : after;
  const out: FeatureSection[] = [];
  const re = /<div class="sidebar">([\s\S]*?)<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    const parts = m[1].split(/^(?=!!! )/m);
    for (const p of parts) {
      const sm = p.match(/^!!!\s+(.+?)\s*\n([\s\S]*)$/);
      if (!sm) continue;
      const title = sm[1].trim();
      const body = sm[2]
        .replace(/^@@\.\w+\s*/gm, "")
        .replace(/^@@\s*$/gm, "")
        .replace(/^\s*$/gm, "")
        .trim();
      if (title && body) out.push({ title, body });
    }
  }
  return out;
}

// 单个职业的能力块（classTrait + 职业特性以条目展示 / 简略擅长行）
function ClassFeatureBlock({ entry, detail, level, choices, onChoose, lookup, panelIds, onAddPowers, onTrackClassPowers, onRemovePowers }: {
  entry: Entry;
  detail: boolean;
  level: number;
  choices: Record<string, string | string[]>;
  onChoose: (key: string, label: string | string[]) => void;
  lookup: (target: string) => Entry | undefined;
  panelIds: Set<string>;
  onAddPowers: (powers: Entry[]) => void;
  onTrackClassPowers?: (powers: Entry[]) => void; // 记录职业授予威能 id（不加入面板），供更换职业时移除
  onRemovePowers?: (ids: string[]) => void; // 特性选择变化时移除「不再授予」的威能（如野性力量切换选项）
}) {
  const trait = classTraitHtml(entry.sourceText);
  const features = classFeaturesHtml(entry.sourceText);
  const summary = classSummary(entry.sourceText);
  const parsed = useMemo(() => (features ? parseFeatureSections(features) : undefined), [features]);
  const groups = useMemo(() => (parsed ? detectReplacementGroups(parsed.sections) : new Map<string, AltGroup>()), [parsed]);
  const altSet = useMemo(() => new Set([...groups.values()].flatMap((g: AltGroup) => g.alts.map((a: FeatureSection) => a.title))), [groups]);
  const normalSections = useMemo(() => (parsed ? parsed.sections.filter((s) => !groups.has(s.title) && !altSet.has(s.title)) : []), [parsed, groups, altSet]);
  // 兽王：把「兽王」特性抽出来单独渲染（排到特性列表末尾），并据此启用「成为兽王」互斥逻辑
  const beastSection = useMemo(() => (parsed ? parsed.sections.find((s) => cnTitle(s.title) === "兽王") : undefined), [parsed]);
  // 特性区域之外的 sidebar 规则小节（如圣武士「神圣制裁」），按兽王折叠样式渲染
  const sidebarRules = useMemo(() => sidebarRuleSections(entry.sourceText), [entry.sourceText]);
  const beastMasterKey = beastSection ? entry.id + "::beast-master" : undefined;
  const beastPartnerKey = beastSection ? entry.id + "::beast-partner" : undefined;
  const beastOn = !!beastMasterKey && choices[beastMasterKey] === "on";
  const chosenBeast = beastPartnerKey ? (typeof choices[beastPartnerKey] === "string" ? choices[beastPartnerKey] : "") : "";
  // 开关型特性：正文以「当你选择该职业特性时」开头、且非可选列表（如督军「射手督军」），做成开/关选择
  const toggleSections = useMemo(() => {
    if (!parsed) return [];
    return parsed.sections.filter((s) => {
      if (s === beastSection) return false;
      const b = (s.body ?? "").trim();
      if (!/^当你选择(?:该|此)职业特性时/.test(b)) return false;
      // 排除本身已含「从下列选项中选择」「选择一个」等选项列表的特性
      return !parseClassFeatureOptions(b).selectable;
    });
  }, [parsed, beastSection]);
  const toggleSet = useMemo(() => new Set(toggleSections.map((s) => s.title)), [toggleSections]);
  // 多替换组特性：正文含 ≥2 个独立替换对（如牧师「引导神力」），用 MultiReplacementBlock 渲染
  const multiSections = useMemo(() => {
    if (!parsed) return [];
    return parsed.sections.filter((s) => s !== beastSection && !toggleSet.has(s.title) && !!parseReplacementPairs(s.body ?? ""));
  }, [parsed, beastSection, toggleSet]);
  const multiSet = useMemo(() => new Set(multiSections.map((s) => s.title)), [multiSections]);
  // 精华职业：职业特性按等级折叠，达到前提等级才展开
  const essential = ESSENTIALS_CLASS_IDS.has(entry.id);
  const featOpen = (s: FeatureSection) => !essential || level >= featureLevel(s.title);

  // 计算某职业特性在当前 choices 状态下授予的威能（供自动加入 + 手动按钮）
  const grantedOf = (s: FeatureSection): Entry[] => {
    const out: Entry[] = [];
    const add = (e?: Entry) => { if (e && e.category === "power" && !out.some((x) => x.id === e.id)) out.push(e); };
    const key = entry.id + "::" + s.title;
    // 替代组：外层选择 base 或其替代项
    if (groups.has(s.title)) {
      const g = groups.get(s.title)!;
      const outerSel = typeof choices[key] === "string" ? choices[key] : "";
      if (outerSel === cleanDisplayName(g.base.title)) {
        // 选中 base：base 自身的选择型（如战士武器天赋选单手/双手）与正文内引用
        const ip = parseClassFeatureOptions(g.base.body);
        const innerVals = choiceVals(choices[key + "::inner"]);
        if (ip.selectable) {
          for (const o of ip.options) {
            if (!innerVals.includes(o.label)) continue;
            if (!o.desc) add(lookup(o.label));
            else for (const e of optionGrantedPowers(o.desc, choices[key + "::inner"], lookup)) add(e);
          }
        }
        for (const e of optionGrantedPowers(g.base.body ?? "", choices[key + "::inner"], lookup)) add(e);
      } else {
        const alt = g.alts.find((a) => cleanDisplayName(a.title) === outerSel);
        if (alt) for (const e of optionGrantedPowers(alt.body ?? "", undefined, lookup)) add(e);
      }
      return out;
    }
    if (altSet.has(s.title)) {
      const outerSel = typeof choices[key] === "string" ? choices[key] : "";
      if (outerSel === cleanDisplayName(s.title)) for (const e of optionGrantedPowers(s.body ?? "", undefined, lookup)) add(e);
      return out;
    }
    // 开关型特性：开启后正文内的威能
    if (toggleSet.has(s.title)) {
      if (choices[key] === "on") for (const e of optionGrantedPowers(s.body ?? "", undefined, lookup)) add(e);
      return out;
    }
    // 多替换组：每组当前生效项 = 已选 ?? 默认被替代项
    if (multiSet.has(s.title)) {
      const p = parseReplacementPairs(s.body ?? "");
      if (p) for (const [gi, g] of p.groups.entries()) {
        const raw = choices[key + "::g" + gi];
        const cur = typeof raw === "string" ? raw : "";
        add(lookup(cur || g.base));
      }
      return out;
    }
    if (s === beastSection) return out; // 野兽伙伴不是威能条目
    // 普通 / 选择型特性
    const parsedOpt = parseClassFeatureOptions(s.body);
    if (parsedOpt.selectable) {
      const chosenVals = choiceVals(choices[key]);
      for (const o of parsedOpt.options) {
        if (!chosenVals.includes(o.label)) continue;
        if (!o.desc) add(lookup(o.label));
        else for (const e of optionGrantedPowers(o.desc, choices[key + "::inner"], lookup)) add(e);
      }
    } else {
      // 普通特性：正文内所有 [[威能]] 链接均授予；但「N级时，你获得[[X]]」的威能需达到对应等级才加入（如野蛮人「狂暴打击」5级）
      const gates = levelGatedWikiLinks(s.body);
      for (const t of wikiLinkTargets(s.body)) {
        const g = gates.get(t);
        if (g !== undefined && level < g) continue;
        add(lookup(t));
      }
    }
    return out;
  };

  // 全部特性（含替代组 base/alt、开关、多替换）当前授予的威能集合
  const allGranted = useMemo(() => {
    const out: Entry[] = [];
    const seen = new Set<string>();
    const secs: FeatureSection[] = [
      ...normalSections,
      ...[...groups.values()].flatMap((g) => [g.base, ...g.alts]),
      ...toggleSections,
      ...multiSections,
      ...(beastSection ? [beastSection] : []),
    ];
    for (const s of secs) {
      for (const e of grantedOf(s)) {
        if (!seen.has(e.id)) { seen.add(e.id); out.push(e); }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalSections, groups, altSet, toggleSections, multiSections, beastSection, choices, lookup, level]);
  const grantedKey = useMemo(() => allGranted.map((p) => p.id).sort().join("|"), [allGranted]);
  // 自动加入/移除：挂载时记录并补入缺失威能；choice/level 变化带来「新授予」威能时自动加入，
  // 并把「不再授予」的威能（如野性力量切换选项后的旧威能）从面板移除，保证面板只保留当前选择。
  const prevGrantedKey = useRef<string | null>(null);
  useEffect(() => {
    if (prevGrantedKey.current === null) {
      prevGrantedKey.current = grantedKey;
      if (allGranted.length > 0) {
        // 首次挂载：记录为「职业授予」供更换职业移除，并把尚未进面板的已授予威能自动加入
        if (onTrackClassPowers) onTrackClassPowers(allGranted);
        const missing = allGranted.filter((p) => !panelIds.has(p.id));
        if (missing.length) onAddPowers(missing);
      }
      return;
    }
    if (prevGrantedKey.current === grantedKey) return;
    const prevSet = new Set(prevGrantedKey.current.split("|").filter(Boolean));
    prevGrantedKey.current = grantedKey;
    const curSet = new Set(allGranted.map((p) => p.id));
    const removed = [...prevSet].filter((id) => !curSet.has(id));
    if (removed.length && onRemovePowers) onRemovePowers(removed);
    const newly = allGranted.filter((p) => !prevSet.has(p.id));
    if (newly.length) onAddPowers(newly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grantedKey]);

  if (detail) {
    return (
      <div className="class-detail">
        <div className="cls-sum-class">{cleanDisplayName(entry.name)}</div>
        {trait && <div className="class-trait" dangerouslySetInnerHTML={{ __html: wikiToHtml(splitTraitLabels(trait), entry.fields).replace(/\n{2,}/g, "\n").replace(/\n/g, "<br/>") }} />}
        {parsed?.intro && <div className="pf-intro"><WikiBody body={parsed.intro} fields={entry.fields} lookup={lookup} /></div>}
        {parsed && parsed.sections.length > 0 ? (
          <div className="pf-list">
            {normalSections.filter((s) => s !== beastSection && !toggleSet.has(s.title) && !multiSet.has(s.title) && !(beastOn && beastMasterKey && cnTitle(s.title) === "战斗流派")).map((s, i) => (
              <FeatureFold key={i} section={s} level={featureLevel(s.title)} expanded={featOpen(s)} fields={entry.fields} lookup={lookup}>
                <>
                  <ClassFeatureItem section={s} fields={entry.fields} choiceKey={entry.id + "::" + s.title} chosen={choices[entry.id + "::" + s.title]} innerChosen={choices[entry.id + "::" + s.title + "::inner"]} onChoose={onChoose} lookup={lookup} />
                </>
              </FeatureFold>
            ))}
            {multiSet.size > 0 && multiSections.map((s) => (
              <FeatureFold key={s.title} section={s} level={featureLevel(s.title)} expanded={featOpen(s)} fields={entry.fields} lookup={lookup}>
                <>
                  <MultiReplacementBlock section={s} detail fields={entry.fields} baseKey={entry.id + "::" + s.title}
                    chosen={parseReplacementPairs(s.body ?? "")!.groups.map((_, gi) => choices[entry.id + "::" + s.title + "::g" + gi] as string | undefined)}
                    onChoose={onChoose} lookup={lookup} />
                </>
              </FeatureFold>
            ))}
            {[...groups.values()].filter((g) => !(beastOn && beastMasterKey && cnTitle(g.base.title) === "准确射击")).map((g) => (
              <FeatureFold key={g.base.title} section={g.base} level={featureLevel(g.base.title)} expanded={featOpen(g.base)} fields={entry.fields} lookup={lookup}>
                <>
                  <ReplacementGroupItem group={g} detail fields={entry.fields}
                    outerKey={entry.id + "::" + g.base.title}
                    outerChosen={choices[entry.id + "::" + g.base.title]}
                    innerKey={entry.id + "::" + g.base.title + "::inner"}
                    innerChosen={choices[entry.id + "::" + g.base.title + "::inner"]}
                    onChoose={onChoose} lookup={lookup} />
                </>
              </FeatureFold>
            ))}
            {beastSection && beastMasterKey && (
              <FeatureFold section={beastSection} level={featureLevel(beastSection.title)} expanded={featOpen(beastSection)} fields={entry.fields} lookup={lookup}>
                <BeastMasterBlock section={beastSection} detail fields={entry.fields} on={beastOn} chosen={chosenBeast} toggleKey={beastMasterKey} beastKey={beastPartnerKey!} onChoose={onChoose} lookup={lookup} />
              </FeatureFold>
            )}
            {toggleSections.map((s) => (
              <FeatureFold key={s.title} section={s} level={featureLevel(s.title)} expanded={featOpen(s)} fields={entry.fields} lookup={lookup}>
                <>
                  <ToggleFeatureBlock section={s} detail fields={entry.fields} on={choices[entry.id + "::" + s.title] === "on"} toggleKey={entry.id + "::" + s.title} onChoose={onChoose} lookup={lookup} />
                </>
              </FeatureFold>
            ))}
            {sidebarRules.map((s) => (
              <details className="beast-sub" key={s.title}>
                <summary>{featTitle(s.title).trim()}</summary>
                {s.body && <div className="beast-sub-body"><div className="pf-body"><WikiBody body={prose(s.body)} fields={entry.fields} lookup={lookup} /></div></div>}
              </details>
            ))}
          </div>
        ) : features ? (
          <div className="class-features"><WikiBody body={features} fields={entry.fields} lookup={lookup} /></div>
        ) : !trait ? (
          <div className="class-features"><WikiBody body={entry.sourceText} fields={entry.fields} lookup={lookup} /></div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="class-summary">
      <div className="cls-sum-class">{cleanDisplayName(entry.name)}</div>
      {entry.fields["role"] && <div className="cls-sum-row"><span className="cls-sum-label">职位</span><span className="cls-sum-value">{entry.fields["role"]}</span></div>}
      {entry.fields["power source"] && <div className="cls-sum-row"><span className="cls-sum-label">威能来源</span><span className="cls-sum-value">{entry.fields["power source"]}</span></div>}
      {summary.map((s) => (
        <div key={s.label} className="cls-sum-row"><span className="cls-sum-label">{s.label}</span><span className="cls-sum-value">{s.value}</span></div>
      ))}
      {parsed && parsed.sections.length > 0 ? (
        // 简洁模式：直接展示已选择/已生效的特性与选项（隐藏风味文字），不再用悬停弹出
        <div className="pf-list compact cls-compact">
          {normalSections.filter((s) => s !== beastSection && !toggleSet.has(s.title) && !multiSet.has(s.title) && !(beastOn && beastMasterKey && cnTitle(s.title) === "战斗流派") && featOpen(s)).map((s, i) => {
            const opt = parseClassFeatureOptions(s.body);
            const choiceKey = entry.id + "::" + s.title;
            const chosen = choices[choiceKey];
            const chosenVals = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
            if (!opt.selectable) {
              // 普通特性：直接展示机械效果正文（风味段已随章节切分被排除）
              return (
                <Fragment key={i}>
                  <div className="cls-feat">
                    <div className="cls-feat-name">{cleanDisplayName(featTitle(s.title))}</div>
                    {s.body && <FeatureBody body={s.body} fields={entry.fields} lookup={lookup} className="cls-feat-note" />}
                  </div>
                </Fragment>
              );
            }
            const count = opt.count ?? 1;
            const multiple = count > 1;
            const selected = opt.options.filter((o) => chosenVals.includes(o.label));
            return (
              <Fragment key={i}>
                <div className={"cls-feat" + (selected.length ? " set" : " unset")}>
                  <div className="cls-feat-name">{cleanDisplayName(featTitle(s.title))}</div>
                  {selected.length === 0 ? (
                    <div className="cls-feat-sub">{multiple ? `未选 0/${count}` : "未选择"}</div>
                  ) : (
                    multiple && <div className="cls-feat-count">已选 {chosenVals.length}/{count}</div>
                  )}
                  {selected.map((o, j) =>
                    o.desc ? (
                      <div key={j} className="cls-feat-compact-optname">
                        <OptionOrSubChoice label={o.label} desc={o.desc} innerKey={choiceKey + "::inner"} innerChosen={choices[choiceKey + "::inner"]} onChoose={onChoose} fields={entry.fields} lookup={lookup} compact />
                      </div>
                    ) : (
                      <SmartHover key={j} className="cls-feat-opt" popClass="cls-option-pop" pop={lookup(o.label) ? <EntryCard entry={lookup(o.label)!} /> : undefined}>
                        {cleanDisplayName(o.label)}
                      </SmartHover>
                    )
                  )}
                </div>
              </Fragment>
            );
          })}
          {[...groups.values()].filter((g) => !(beastOn && beastMasterKey && cnTitle(g.base.title) === "准确射击") && featOpen(g.base)).map((g) => (
            <Fragment key={g.base.title}>
              <ReplacementGroupItem group={g} detail={false} fields={entry.fields}
                outerKey={entry.id + "::" + g.base.title}
                outerChosen={choices[entry.id + "::" + g.base.title]}
                innerKey={entry.id + "::" + g.base.title + "::inner"}
                innerChosen={choices[entry.id + "::" + g.base.title + "::inner"]}
                onChoose={onChoose} lookup={lookup} />
              
            </Fragment>
          ))}
          {beastSection && beastMasterKey && featOpen(beastSection) && (
            <BeastMasterBlock section={beastSection} detail={false} fields={entry.fields} on={beastOn} chosen={chosenBeast} toggleKey={beastMasterKey} beastKey={beastPartnerKey!} onChoose={onChoose} lookup={lookup} />
          )}
          {toggleSections.filter((s) => featOpen(s)).map((s) => (
            <Fragment key={s.title}>
              <ToggleFeatureBlock section={s} detail={false} fields={entry.fields} on={choices[entry.id + "::" + s.title] === "on"} toggleKey={entry.id + "::" + s.title} onChoose={onChoose} lookup={lookup} />
            </Fragment>
          ))}
          {multiSet.size > 0 && multiSections.filter((s) => featOpen(s)).map((s) => (
            <Fragment key={s.title}>
              <MultiReplacementBlock section={s} detail={false} fields={entry.fields} baseKey={entry.id + "::" + s.title}
                chosen={parseReplacementPairs(s.body ?? "")!.groups.map((_, gi) => choices[entry.id + "::" + s.title + "::g" + gi] as string | undefined)}
                onChoose={onChoose} lookup={lookup} />
            </Fragment>
          ))}
        </div>
      ) : summary.length === 0 ? (
        <div className="class-features"><WikiBody body={entry.sourceText} fields={entry.fields} lookup={lookup} /></div>
      ) : null}
    </div>
  );
}

// 典范/天命特性段列表：详细=特性块+完整威能卡；简洁=特性标题+威能compact行（威能仅供查看，不做管理）
function FeatureSectionList({ sections, detail, fields, powerOf, panelIds, onAddPowers }: { sections: FeatureSection[]; detail: boolean; fields: Record<string, string>; powerOf: (id: string) => Entry | undefined; panelIds: Set<string>; onAddPowers: (powers: Entry[]) => void }) {
  // 自动加入：选定典范/天命后其授予威能自动进面板（无需手动按钮）；待 powerMap 加载完成后亦会触发补入
  const missing = sections.filter((s) => s.powerRef).map((s) => powerOf(s.powerRef!)).filter((p): p is Entry => !!p && !panelIds.has(p.id));
  const missingKey = missing.map((p) => p.id).sort().join("|");
  const prevMissing = useRef(missingKey);
  useEffect(() => {
    if (prevMissing.current === missingKey) return;
    prevMissing.current = missingKey;
    if (missing.length) onAddPowers(missing);
  });
  if (sections.length === 0) return null;
  return (
    <div className={"pf-list" + (detail ? "" : " compact")}>
      {sections.map((s, i) => {
        const p = s.powerRef ? powerOf(s.powerRef) : undefined;
        if (detail) {
          if (p) return (
            <div key={i} className="pf-power">
              <div className="pf-title">{s.title}</div>
              <EntryCard entry={p} />
            </div>
          );
          return (
            <div key={i} className="pf-item">
              <div className="pf-title">{s.title}</div>
              {s.body && <div className="pf-body" dangerouslySetInnerHTML={{ __html: wikiToHtml(s.body, fields) }} />}
            </div>
          );
        }
        if (p) {
          return (
            <SmartHover key={i} className="compact-row" popClass="compact-pop" title={p.name} pop={<EntryCard entry={p} />}>
              <span className="cr-dot" style={{ background: p.usage === "at-will" ? POWER_COLORS.atWill : p.usage === "encounter" ? POWER_COLORS.encounter : p.usage === "daily" ? POWER_COLORS.daily : POWER_COLORS.utility }} />
              <span className="cr-name">{p.name}{p.nameEn ? " " + p.nameEn : ""}</span>
              <span className="cr-sub">L{p.level}{p.usageZh ? " · " + p.usageZh : ""}</span>
            </SmartHover>
          );
        }
        return <div key={i} className="pf-title-only">{s.title}</div>;
      })}
    </div>
  );
}

function ModInputs(props: {
  sources: { key: string; label: string }[];
  mods: Record<string, number>;
  onChange: (k: string, v: string) => void;
  neg?: Set<string>;
}) {
  return (
    <div className="def-bonus">
      {props.sources.map((s) => {
        const isNeg = !!props.neg?.has(s.key);
        return (
          <label key={s.key} className="def-bonus-item">
            <span>{s.label}</span>
            {isNeg ? (
              <span className="def-bonus-neg">
                <span className="def-bonus-minus">−</span>
                <input type="number" min={0} max={50} value={props.mods[s.key] ?? 0} onChange={(e) => props.onChange(s.key, e.target.value.replace(/[^0-9]/g, ""))} />
              </span>
            ) : (
              <input type="number" min={-20} max={50} value={props.mods[s.key] ?? 0} onChange={(e) => props.onChange(s.key, e.target.value)} />
            )}
          </label>
        );
      })}
    </div>
  );
}

// 装备自动防御加值：穿着防具/盾牌时，其 AC 加值（及防具对强韧/反射/意志的特殊加值）
// 自动填入对应防御来源单元格，无需手动录入。
function autoDefenseBonuses(c: Character): Record<DefenseKey, Partial<Record<DefenseBonusSource, number>>> {
  const out: Record<DefenseKey, Partial<Record<DefenseBonusSource, number>>> = { ac: {}, fort: {}, ref: {}, will: {} };
  const armor = c.baseItems?.[5] ? findBaseItem(c.baseItems[5]) : undefined;
  const shield = c.baseItems?.[1] ? findBaseItem(c.baseItems[1]) : undefined;
  if (armor?.kind === "armor" && armor.armor) {
    out.ac.armor = armor.armor.ac ?? 0;
    const m = /([+-]\d+)\s*(强韧|反射|意志)/.exec(armor.armor.special || "");
    if (m) {
      const key = m[2] === "强韧" ? "fort" : m[2] === "反射" ? "ref" : "will";
      out[key].armor = parseInt(m[1], 10);
    }
  }
  if (shield?.kind === "shield" && shield.shield) {
    out.ac.shield = shield.shield.ac ?? 0;
  }
  return out;
}

// 合并手动加值与装备自动加值：防具/盾牌来源以装备为准（装备决定），其余保留手动录入值
function mergeDefenseMods(_k: DefenseKey, manual: Record<DefenseBonusSource, number>, auto: Partial<Record<DefenseBonusSource, number>>): Record<DefenseBonusSource, number> {
  return {
    feat: manual.feat ?? 0,
    enhance: manual.enhance ?? 0,
    armor: auto.armor ?? manual.armor ?? 0,
    shield: auto.shield ?? manual.shield ?? 0,
    other: manual.other ?? 0,
  };
}

function DefenseCell(props: {
  label: string;
  value: number;
  mods: Record<DefenseBonusSource, number>;
  mode: "edit" | "render";
  onChange: (src: DefenseBonusSource, v: string) => void;
}) {
  const total = DEFENSE_BONUS_SOURCES.reduce((s, k) => s + (props.mods[k] ?? 0), 0);
  return (
    <div className="defense-item">
      <span>{props.label}</span>
      <span className="defense-value">{props.value}</span>
      {props.mode === "edit" ? (
        <div className="def-bonus">
          {DEFENSE_BONUS_SOURCES.map((s) => (
            <label key={s} className="def-bonus-item">
              <span>{DEF_BONUS_LABELS[s]}</span>
              <input type="number" min={-20} max={50} value={props.mods[s] ?? 0} onChange={(e) => props.onChange(s, e.target.value)} />
            </label>
          ))}
        </div>
      ) : (
        total !== 0 && <div className="def-bonus-total">{total > 0 ? "+" + total : String(total)}</div>
      )}
    </div>
  );
}

function fmtMod(n: number): string {
  return n >= 0 ? "+" + n : String(n);
}

// 亚种增益正文中，英文风味段在前的，重排为「中文增益在前、英文在后」，并去掉两者间的空行
function reorderBenefitBody(body: string): string {
  const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paras.length <= 1) return body;
  const isChinese = (p: string) => {
    const cjk = (p.match(/[\u4e00-\u9fff]/g) || []).length;
    const lat = (p.match(/[A-Za-z]/g) || []).length;
    return cjk > 0 && cjk >= lat;
  };
  const cn = paras.filter(isChinese);
  const en = paras.filter((p) => !isChinese(p));
  if (cn.length === 0 || en.length === 0) return body;
  return [...cn, ...en].join("\n");
}

// 特性名只取中文部分（去掉后面的英文）
function chineseName(s: string): string {
  const i = s.search(/[A-Za-z]/);
  return i < 0 ? s.trim() : s.slice(0, i).trim();
}

// 种族威能授予所需上下文：基础内部替代(raceSwaps) + 亚种增益(subraceBenefits)
interface RacePowerCtx {
  swaps?: Record<string, boolean>;
  subBenefits?: Record<string, boolean>;
  subByBase: Map<string, { title: string; body: string }>; // 被替代的基础特性名 → 亚种增益
}

// 计算种族应授予威能：基础种族内部的可替代特性（如「龙惧」替代「龙息」）互斥，
// 且亚种增益（如「腐蚀传统」替代「龙息」并授予威能）优先于基础/替代，按对应选择取舍。
function raceGrantedPowerEntries(
  ct: string,
  ctx: RacePowerCtx,
  lookup: (t: string) => Entry | undefined
): Entry[] {
  const traits = parseRaceTraitLines(ct);
  const altForBase = new Map<string, (typeof traits)[number]>();
  for (const t of traits) if (t.replaces && t.replaces !== t.name) altForBase.set(t.replaces, t);
  const out: Entry[] = [];
  const seen = new Set<string>();
  const addPowers = (body: string) => {
    for (const n of wikiLinkTargets(body)) {
      const e = lookup(n);
      if (e && e.category === "power" && !seen.has(e.id)) { seen.add(e.id); out.push(e); }
    }
  };
  for (const t of traits) {
    if (t.replaces) continue; // 可替代特性不独立授予，由其基础特性按选择授予
    const sub = ctx.subByBase.get(t.name);
    if (sub && ctx.subBenefits?.[sub.title]) { addPowers(sub.body); continue; } // 亚种增益已应用
    const alt = altForBase.get(t.name);
    if (alt && ctx.swaps?.[alt.name]) addPowers(alt.body);
    else addPowers(t.body);
  }
  return out;
}

const VISION_OPTIONS = ["普通视觉", "昏暗视觉", "黑暗视觉"];
const FIVE_ALIGNMENTS = ["守序善良", "善良", "无阵营", "邪恶", "混乱邪恶"];
const NINE_ALIGNMENTS = [
  "守序善良", "守序中立", "守序邪恶",
  "中立善良", "绝对中立", "中立邪恶",
  "混乱善良", "混乱中立", "混乱邪恶",
];

function AlignmentField(props: { value?: string; mode: "edit" | "render"; onClick: () => void }) {
  if (props.mode === "render") {
    return (
      <button type="button" className="render-field render-click" onClick={props.onClick} title="阵营（点击选择）">
        <span className="render-name">阵营</span>
        {props.value ? <span className="render-value">{props.value}</span> : <span className="render-empty">−</span>}
      </button>
    );
  }
  return (
    <div className="alignment-field" onClick={props.onClick} title="点击选择阵营">
      <FilledTextField label="阵营" value={props.value ?? ""} readOnly onClick={props.onClick}>
        <span slot="trailing-icon" className="material-symbols-outlined">arrow_drop_down</span>
      </FilledTextField>
    </div>
  );
}

function VisionField(props: { value?: string; mode: "edit" | "render"; onChange: (v: string) => void }) {
  if (props.mode === "render") {
    return (
      <div className="render-field">
        <span className="render-name">视觉</span>
        {props.value ? <span className="render-value">{props.value}</span> : <span className="render-empty">−</span>}
      </div>
    );
  }
  const cur = props.value ?? "";
  return (
    <FilledSelect label="视觉" value={cur} onChange={(e) => props.onChange((e.target as any).value ?? "")}>
      <SelectOption value="">未设置</SelectOption>
      {cur && !VISION_OPTIONS.includes(cur) && <SelectOption value={cur}>{cur}</SelectOption>}
      {VISION_OPTIONS.map((o) => <SelectOption key={o} value={o}>{o}</SelectOption>)}
    </FilledSelect>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; wide?: boolean; type?: string; mode?: "edit" | "render"; big?: boolean }) {
  if (props.mode === "render") {
    const cls = "render-field" + (props.wide ? " render-wide" : "") + (props.big ? " render-big" : "");
    return (
      <div className={cls}>
        <span className="render-name">{props.label}</span>
        {props.value ? <span className="render-value">{props.value}</span> : <span className="render-empty">−</span>}
      </div>
    );
  }
  const cls2 = (props.wide ? "field-wide" : "") + (props.big ? " field-big" : "");
  return (
    <div className={cls2}>
      <FilledTextField label={props.label} value={props.value} type={props.type as any} onInput={(e) => props.onChange((e.target as any).value)} />
    </div>
  );
}

function PickField(props: { label: string; displayName?: string; disabled?: boolean; mode: "edit" | "render"; onClick: () => void }) {
  if (props.mode === "render") {
    return (
      <button type="button" className="render-field render-click" onClick={props.onClick} disabled={props.disabled} title={props.label}>
        <span className="render-name">{props.label}</span>
        {props.displayName ? <span className="render-value">{props.displayName}</span> : <span className="render-empty">−</span>}
      </button>
    );
  }
  return (
    <button type="button" className="pick-field" onClick={props.onClick} disabled={props.disabled} title={props.label}>
      <span className="pf-label">{props.label}</span>
      <span className={props.displayName ? "pf-value" : "pf-placeholder"}>{props.displayName ?? "请选择"}</span>
      <span className="material-symbols-outlined pf-icon">expand_more</span>
    </button>
  );
}

export default function CharacterSheet({
  layout = "single",
  mode,
  char,
  setChar,
}: {
  layout: "single" | "double";
  mode: "edit" | "render";
  char: Character;
  setChar: React.Dispatch<React.SetStateAction<Character>>;
}) {
  const [races, setRaces] = useState<Entry[]>([]);
  // 种族选择弹窗展示顺序：按出处系列分组排序（不影响数据存储与逻辑查找）
  const sortedRaces = useMemo(() => sortRaces(races), [races]);
  const [classes, setClasses] = useState<Entry[]>([]);
  const [paragonPaths, setParagonPaths] = useState<Entry[]>([]);
  const [epicDestinies, setEpicDestinies] = useState<Entry[]>([]);
  const [feats, setFeats] = useState<Entry[]>([]);
  const [items, setItems] = useState<Entry[]>([]);
  const [powers, setPowers] = useState<Entry[]>([]);
  const [relations, setRelations] = useState<{ powerByGrantedBy: Record<string, string[]> }>({ powerByGrantedBy: {} });
  const [picker, setPicker] = useState<null | "class" | "race" | "paragon" | "epic">(null);
  const [slotPicker, setSlotPicker] = useState<null | { kind: "power"; cat: keyof PowerSlots; index: number } | { kind: "feat"; index: number }>(null);
  const [featChoicePicker, setFeatChoicePicker] = useState<null | { index: number; featName: string; label: string; options: FeatOption[]; weaponPool?: BaseWeapon[]; categories?: string[]; implementPool?: BaseImplement[]; implTier?: "basic" | "superior" }>(null);
  const [equipPicker, setEquipPicker] = useState<null | { kind: "fixed" | "other" | "consumable"; index: number }>(null);
  const [blockDetail, setBlockDetail] = useState<{ powers: boolean; feats: boolean; equipment: boolean }>({ powers: true, feats: true, equipment: true });

  const [abilityMode, setAbilityMode] = useState<"free" | "buy">("free");
  const [boostUsed, setBoostUsed] = useState(0);
  const [buyPresetOpen, setBuyPresetOpen] = useState(false);
  const [classFeatDetail, setClassFeatDetail] = useState(true);
  const [alignmentOpen, setAlignmentOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [earnInput, setEarnInput] = useState("");
  const [spendInput, setSpendInput] = useState("");
  const [autoCostOpen, setAutoCostOpen] = useState(false);
  const [slotMode, setSlotMode] = useState<null | "mark" | "swap">(null);
  const [swapPicker, setSwapPicker] = useState<null | { kind: "power"; cat: keyof PowerSlots; index: number } | { kind: "equip"; ekind: "fixed" | "other" | "consumable"; index: number }>(null);
  const [basePicker, setBasePicker] = useState<null | { kind: "weapon" | "armor"; index: number }>(null);
  const [skillDetail, setSkillDetail] = useState(true);
  const [raceDetail, setRaceDetail] = useState(false);
  const [subraceOpen, setSubraceOpen] = useState(false);
  const [pathDetail, setPathDetail] = useState(true);
  const [destinyDetail, setDestinyDetail] = useState(true);
  const [presetOrder, setPresetOrder] = useState<AbilityKey[]>([...ABILITIES]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    // 数据全量读取（loaders 缓存保证只请求一次）；渲染层用增量加载避免卡顿
    void loadCategory("race").then(setRaces).catch(console.error);
    void loadCategory("class").then(setClasses).catch(console.error);
    void loadCategory("paragon-path").then(setParagonPaths).catch(console.error);
    void loadCategory("epic-destiny").then(setEpicDestinies).catch(console.error);
    void loadCategory("feat").then(setFeats).catch(console.error);
    void loadCategory("equipment").then(setItems).catch(console.error);
    void loadCategory("power").then(setPowers).catch(console.error);
    void loadRelations().then(setRelations).catch(console.error);
  }, []);

  function openPowerPicker(cat: keyof PowerSlots, index: number) {
    setSlotPicker({ kind: "power", cat, index });
  }
  function openFeatPicker(index: number) {
    setSlotPicker({ kind: "feat", index });
  }
  function openEquipPicker(kind: "fixed" | "other" | "consumable", index: number) {
    setEquipPicker({ kind, index });
  }
  // —— 使用标记（斜线遮罩）与储备交换 ——
  const powerUsedKey = (cat: keyof PowerSlots, index: number) => cat + "-" + index;
  const equipUsedKey = (kind: "fixed" | "other" | "consumable", index: number) => (kind === "fixed" ? "e" : kind === "other" ? "o" : "c") + "-" + index;
  const isPowerUsed = (cat: keyof PowerSlots, index: number) => !!char.powerUsed?.[powerUsedKey(cat, index)];
  const isEquipUsed = (kind: "fixed" | "other" | "consumable", index: number) => !!char.equipmentUsed?.[equipUsedKey(kind, index)];
  function togglePowerUsed(cat: keyof PowerSlots, index: number) {
    const key = powerUsedKey(cat, index);
    setChar((p) => {
      const used = { ...(p.powerUsed ?? {}) };
      if (used[key]) delete used[key]; else used[key] = true;
      return { ...p, powerUsed: used };
    });
  }
  function toggleEquipUsed(kind: "fixed" | "other" | "consumable", index: number) {
    const key = equipUsedKey(kind, index);
    setChar((p) => {
      const used = { ...(p.equipmentUsed ?? {}) };
      if (used[key]) delete used[key]; else used[key] = true;
      return { ...p, equipmentUsed: used };
    });
  }
  // 交换弹窗：点击储备项 → 与槽位内容对调（空槽则仅移入并清空储备位）；不自动新建槽位，避免反复点击产生混乱
  function swapReserveItem(pick: NonNullable<typeof swapPicker>, reserveIndex: number) {
    setChar((p) => {
      const reserve = pick.kind === "power" ? p.spellbook : p.backpack;
      const old = reserve[reserveIndex];
      if (!old) return p;
      let slotOld: string | undefined;
      let powerSlots = p.powerSlots;
      let equipmentSlots = p.equipmentSlots;
      let otherSlots = p.otherSlots;
      let consumableSlots = p.consumableSlots;
      if (pick.kind === "power") {
        slotOld = p.powerSlots[pick.cat][pick.index];
        powerSlots = setPowerSlot(powerSlots, pick.cat, pick.index, old);
      } else {
        const arr = pick.ekind === "fixed" ? p.equipmentSlots : pick.ekind === "other" ? p.otherSlots : p.consumableSlots;
        slotOld = arr[pick.index];
        const nextArr = setEquipmentSlot(arr, pick.index, old);
        if (pick.ekind === "fixed") equipmentSlots = nextArr;
        else if (pick.ekind === "other") otherSlots = nextArr;
        else consumableSlots = nextArr;
      }
      const nextReserve = reserve.map((s, i) => (i === reserveIndex ? (slotOld ?? "") : s));
      return { ...p, spellbook: pick.kind === "power" ? nextReserve : p.spellbook, backpack: pick.kind === "equip" ? nextReserve : p.backpack, powerSlots, equipmentSlots, otherSlots, consumableSlots };
    });
    setSwapPicker(null);
  }
  // 仅收入储备：槽位内容存入储备（无空槽自动新建），槽位清空
  function collectToReserve(pick: NonNullable<typeof swapPicker>) {
    setChar((p) => {
      let slotOld: string | undefined;
      let powerSlots = p.powerSlots;
      let equipmentSlots = p.equipmentSlots;
      let otherSlots = p.otherSlots;
      let consumableSlots = p.consumableSlots;
      if (pick.kind === "power") {
        slotOld = p.powerSlots[pick.cat][pick.index];
        powerSlots = clearPowerSlot(powerSlots, pick.cat, pick.index);
      } else {
        const arr = pick.ekind === "fixed" ? p.equipmentSlots : pick.ekind === "other" ? p.otherSlots : p.consumableSlots;
        slotOld = arr[pick.index];
        const nextArr = clearEquipmentSlot(arr, pick.index);
        if (pick.ekind === "fixed") equipmentSlots = nextArr;
        else if (pick.ekind === "other") otherSlots = nextArr;
        else consumableSlots = nextArr;
      }
      if (!slotOld) return p;
      const reserve = pick.kind === "power" ? p.spellbook : p.backpack;
      const emptyIdx = reserve.findIndex((s) => !s);
      const nextReserve = emptyIdx >= 0 ? reserve.map((s, i) => (i === emptyIdx ? slotOld : s)) : [...reserve, slotOld];
      return { ...p, spellbook: pick.kind === "power" ? nextReserve : p.spellbook, backpack: pick.kind === "equip" ? nextReserve : p.backpack, powerSlots, equipmentSlots, otherSlots, consumableSlots };
    });
    setSwapPicker(null);
  }
  // 槽位点击总入口：优先响应标记/交换模式；遮罩槽位锁定（不可更换/交换）
  function onPowerSlotClick(cat: keyof PowerSlots, index: number) {
    const id = char.powerSlots[cat][index] ?? "";
    if (slotMode === "mark") { if (id) togglePowerUsed(cat, index); return; }
    if (slotMode === "swap") {
      if (char.powerUsed?.[powerUsedKey(cat, index)]) return;
      setSwapPicker({ kind: "power", cat, index });
      return;
    }
    if (char.powerUsed?.[powerUsedKey(cat, index)]) return;
    openPowerPicker(cat, index);
  }
  function onEquipSlotClick(kind: "fixed" | "other" | "consumable", index: number) {
    const arr = kind === "fixed" ? char.equipmentSlots : kind === "other" ? char.otherSlots : char.consumableSlots;
    const id = arr[index];
    if (slotMode === "mark") { if (id) toggleEquipUsed(kind, index); return; }
    if (slotMode === "swap") {
      if (char.equipmentUsed?.[equipUsedKey(kind, index)]) return;
      setSwapPicker({ kind: "equip", ekind: kind, index });
      return;
    }
    if (char.equipmentUsed?.[equipUsedKey(kind, index)]) return;
    openEquipPicker(kind, index);
  }

  const raceEntry = useMemo(() => races.find((r) => r.id === char.raceId), [races, char.raceId]);
  const classEntry = useMemo(() => classes.find((c) => c.id === char.classId), [classes, char.classId]);
  const paragonPathEntry = useMemo(() => paragonPaths.find((p) => p.id === char.paragonPathId), [paragonPaths, char.paragonPathId]);
  const epicDestinyEntry = useMemo(() => epicDestinies.find((d) => d.id === char.epicDestinyId), [epicDestinies, char.epicDestinyId]);
  const pathParse = useMemo(() => (paragonPathEntry ? parseFeatureSections(paragonPathEntry.sourceText) : { hasTitle: false, sections: [] as FeatureSection[] }), [paragonPathEntry]);
  const destinyParse = useMemo(() => (epicDestinyEntry ? parseFeatureSections(epicDestinyEntry.sourceText) : { hasTitle: false, sections: [] as FeatureSection[] }), [epicDestinyEntry]);
  const classDisplay = useMemo(() => {
    const n1 = classEntry ? cleanDisplayName(classEntry.name) : undefined;
    if (!char.hybrid) return n1;
    const c2 = classes.find((c) => c.id === char.classId2);
    const n2 = c2 ? cleanDisplayName(c2.name) : undefined;
    if (n1 && n2) return "混职：" + n1 + " / " + n2;
    if (n1) return "混职：" + n1 + "（请选第二个）";
    return undefined;
  }, [char.hybrid, char.classId2, classEntry, classes]);
  const classEntry2 = useMemo(() => (char.hybrid ? classes.find((c) => c.id === char.classId2) : undefined), [classes, char.hybrid, char.classId2]);
  // 典范/天命选择限制：当前角色种族/职业名集合 + 全量名称（含纯中文名，匹配前置里的中文名）
  const restrictNames = useMemo(() => {
    const addName = (s: Set<string>, n: string) => {
      if (!n) return;
      s.add(n);
      s.add(cleanDisplayName(n));
      s.add(zhName(n));
      s.add(baseClassName(n));
    };
    const my = new Set<string>();
    if (raceEntry) addName(my, raceEntry.name);
    if (classEntry) addName(my, classEntry.name);
    if (classEntry2) addName(my, classEntry2.name);
    return {
      myNames: [...my],
      raceNames: races.flatMap((r) => [cleanDisplayName(r.name), zhName(r.name)]),
      classNames: classes.flatMap((c) => [cleanDisplayName(c.name), zhName(c.name)]),
    };
  }, [raceEntry, classEntry, classEntry2, races, classes]);
  // 混职：两个混职职业条目的数值相加（血量/回复力向下取整，防御加值累加）
  const cls = useMemo(() => {
    if (!classEntry) return undefined;
    const a = parseClassStats(classEntry.sourceText);
    if (!classEntry2) return a;
    const b = parseClassStats(classEntry2.sourceText);
    return {
      baseHp: Math.floor(a.baseHp + b.baseHp),
      hpPerLevel: Math.floor(a.hpPerLevel + b.hpPerLevel),
      surges: Math.floor(a.surges + b.surges),
      fort: a.fort + b.fort,
      ref: a.ref + b.ref,
      will: a.will + b.will,
    };
  }, [classEntry, classEntry2]);
  const raceInfo = useMemo(() => parseRaceAbilities(raceEntry), [raceEntry]);
  const bonus = useMemo(() => racialBonus(raceEntry, char.raceAbility2Choice), [raceEntry, char.raceAbility2Choice]);
  const effectiveAbilities = useMemo(() => applyAbilityBonus(char.abilities, bonus), [char.abilities, bonus]);
  const raceDefs = useMemo(() => parseRaceDefenses(raceEntry?.sourceText ?? ""), [raceEntry]);
  // 守望者「守护者之力」：选中后 AC 属性改用体质（大地之力/风暴之心）或感知（野性之血/生命之灵），未穿重甲时生效
  const guardianChoice = classEntry
    ? (typeof char.classFeatureChoices[classEntry.id + "::守护者之力 Guardian Might"] === "string"
      ? char.classFeatureChoices[classEntry.id + "::守护者之力 Guardian Might"] as string
      : "")
    : "";
  const guardianAcKey = (() => {
    if (!guardianChoice) return undefined;
    const armorBase = char.baseItems?.[5] ? findBaseItem(char.baseItems[5]) : undefined;
    if (armorBase?.kind === "armor" && armorBase.armor?.category === "重甲") return undefined;
    if (guardianChoice.startsWith("大地之力") || guardianChoice.startsWith("风暴之心")) return "con" as const;
    if (guardianChoice.startsWith("野性之血") || guardianChoice.startsWith("生命之灵")) return "wis" as const;
    return undefined;
  })();
  // 术士「法术本源」：选中巨龙魔法（龙裔活力）或宇宙魔法（宇宙长存）时，
  // 未穿重甲可用力量调整值取代敏捷/智力计算 AC。
  const sorcererSource = classEntry
    ? (typeof char.classFeatureChoices[classEntry.id + "::法术本源 Spell Source"] === "string"
      ? char.classFeatureChoices[classEntry.id + "::法术本源 Spell Source"] as string
      : "")
    : "";
  const sorcererAcKey = (() => {
    if (!sorcererSource) return undefined;
    const armorBase = char.baseItems?.[5] ? findBaseItem(char.baseItems[5]) : undefined;
    if (armorBase?.kind === "armor" && armorBase.armor?.category === "重甲") return undefined;
    if (sorcererSource.startsWith("巨龙魔法") || sorcererSource.startsWith("宇宙魔法")) return "str" as const;
    return undefined;
  })();
  // 神罚使「信仰甲胄 Armor of Faith」：穿着布甲或不穿甲且未使用盾牌时，AC 自动 +3。
  // 判定：职业（含混职）正文含该特性标题；护甲槽(5)为空或为布甲类；副手槽(1)非盾牌。
  const armorOfFaithActive = useMemo(() => {
    const has = [classEntry, classEntry2].some((e) => !!e && /^!!\s*信仰甲[胄冑]/m.test(e.sourceText));
    if (!has) return false;
    const armor = char.baseItems?.[5] ? findBaseItem(char.baseItems[5]) : undefined;
    const clothOrNone = !armor || (armor.kind === "armor" && (armor.armor?.name ?? "").includes("布甲"));
    const offHand = char.baseItems?.[1] ? findBaseItem(char.baseItems[1]) : undefined;
    return clothOrNone && (!offHand || offHand.kind !== "shield");
  }, [classEntry, classEntry2, char.baseItems]);
  const armorOfFaithBonus = armorOfFaithActive ? 3 : 0;
  // 野蛮人「蛮族机敏 Barbarian Agility」：未穿重甲时 AC 与反射自动 +1（11级+2，21级+3）
  const barbarianAgility = useMemo(() => {
    const has = [classEntry, classEntry2].some((e) => !!e && /^!!\s*蛮族机敏/m.test(e.sourceText));
    if (!has) return 0;
    const armor = char.baseItems?.[5] ? findBaseItem(char.baseItems[5]) : undefined;
    if (armor?.kind === "armor" && armor.armor?.category === "重甲") return 0;
    return char.level >= 21 ? 3 : char.level >= 11 ? 2 : 1;
  }, [classEntry, classEntry2, char.baseItems, char.level]);
  // 装备自动防御加值（防具/盾牌）合并进各防御来源单元格；信仰甲胄 +3、蛮族机敏加值计入「其他」
  const autoDef = autoDefenseBonuses(char);
  const acMods = { ...mergeDefenseMods("ac", char.defenseMods.ac, autoDef.ac), other: (char.defenseMods.ac.other ?? 0) + armorOfFaithBonus + barbarianAgility };
  const fortMods = mergeDefenseMods("fort", char.defenseMods.fort, autoDef.fort);
  const refMods = { ...mergeDefenseMods("ref", char.defenseMods.ref, autoDef.ref), other: (char.defenseMods.ref.other ?? 0) + barbarianAgility };
  const willMods = mergeDefenseMods("will", char.defenseMods.will, autoDef.will);
  const stats = deriveStats({
    ...char,
    abilities: effectiveAbilities,
    defenseMods: { ac: acMods, fort: fortMods, ref: refMods, will: willMods },
  }, cls, raceDefs, guardianAcKey ?? sorcererAcKey);
  // —— 生命板块：额外加值合计 + 当前值编辑 ——
  const hpBonus = char.hpBonus ?? 0;
  const surgeBonus = char.surgeBonus ?? 0;
  const surgeValueBonus = char.surgeValueBonus ?? 0;
  const maxHpTotal = stats.maxHp + hpBonus;
  const bloodiedTotal = Math.floor(maxHpTotal / 2);
  const surgeValueTotal = Math.floor(maxHpTotal / 4) + surgeValueBonus;
  const surgesTotal = stats.surges + surgeBonus;
  const setHpNow = (k: "max" | "bloodied" | "surgeValue" | "surges", raw: string) => {
    const n = raw.trim() === "" ? undefined : Math.max(0, Math.floor(Number(raw) || 0));
    setChar((p) => ({ ...p, hpNow: { ...(p.hpNow ?? {}), [k]: n } }));
  };
  const speedTotal = char.speedMods.power + char.speedMods.feat - char.speedMods.armor + char.speedMods.item + char.speedMods.other;
  const speedNum = parseInt(raceEntry?.speed ?? "", 10);
  const speedDisplay = Number.isNaN(speedNum) ? (raceEntry?.speed ?? "—") : speedNum + speedTotal + " 格";

  const powerMap = useMemo(() => new Map(powers.map((p) => [p.id, p])), [powers]);
  const featMap = useMemo(() => new Map(feats.map((f) => [f.id, f])), [feats]);
  // 选择型专长的已选对象（键 = 槽位下标 → { cat, item }）
  const featChoicesList = useMemo(
    () =>
      Object.entries(char.featChoices)
        .map(([idx, item]) => {
          const f = featMap.get(char.featSlots[Number(idx)]);
          const info = f ? featChoiceInfo(f) : null;
          return { cat: (info?.cat ?? "weapon") as "weapon" | "implement", item };
        })
        .filter((c) => c.item),
    [char.featChoices, char.featSlots, featMap]
  );
  // 武器擅长 token 集：职业（含混职）/种族 的「武器擅长」行 + 已选专长白名单 + 选择型专长选定对象
  const archerWarlordOn = !!classEntry && Object.entries(char.classFeatureChoices ?? {}).some(([k, v]) => k.startsWith(classEntry!.id + "::射手督军") && v === "on");
  // 前线领袖（Battlefront Leader）：替代组「战斗领袖」的替代项，选中时获得重盾擅长（以键前缀+选中值前缀判断）
  const frontLineLeaderOn = !!classEntry && Object.entries(char.classFeatureChoices ?? {}).some(([k, v]) => k.startsWith(classEntry!.id + "::战斗领袖") && String(v).startsWith("前线领袖"));
  const proficiencyTokens = useMemo(
    () => {
      const tokens = collectProficiencyTokens({
        classText: classEntry?.sourceText,
        classText2: classEntry2?.sourceText,
        raceText: raceEntry?.sourceText,
        featNames: char.featSlots.map((id) => featMap.get(id)?.name ?? ""),
        featChoiceTokens: featChoicesList.map((c) => c.item.split(/\s/)[0]),
      });
      // 射手督军：获得军用远程武器擅长（失去的链甲/轻盾在防具/盾牌处处理）
      if (archerWarlordOn) tokens.add("军用远程");
      return tokens;
    },
    [classEntry, classEntry2, raceEntry, char.featSlots, featMap, featChoicesList, archerWarlordOn]
  );
  // 已擅长武器条目（供「选择基础武器」/擅长武器专长弹窗左下角「已擅长武器」展示）
  const proficientWeaponInfos = useMemo<WeapInfo[]>(
    () =>
      BASE_WEAPONS.filter((w) => isProficient(w, proficiencyTokens))
        .map((w) => ({ id: baseItemId("weapon", w.name), name: w.name, main: w.dice, sub: w.traits && w.traits !== "—" ? w.traits : w.group })),
    [proficiencyTokens]
  );
  // 已擅长的法器组：职业（含混职）/种族「法器：」行 + 选择型法器专长选定的法器；用于法器面板「已擅长/未擅长」
  const proficientImplGroups = useMemo(() => {
    const implChoices: { cat: "implement"; item: string }[] = [];
    for (const idxStr of Object.keys(char.featChoices ?? {})) {
      const idx = Number(idxStr);
      const featEntry = featMap.get(char.featSlots[idx]);
      const info = featEntry ? featChoiceInfo(featEntry) : null;
      if (info?.cat === "implement") implChoices.push({ cat: "implement", item: char.featChoices?.[idx] ?? "" });
    }
    return collectImplementGroups({ classText: classEntry?.sourceText, classText2: classEntry2?.sourceText, raceText: raceEntry?.sourceText, featChoices: implChoices });
  }, [char.featSlots, char.featChoices, featMap, classEntry, classEntry2, raceEntry]);
  // 防具/盾牌擅长 token 集：职业（含混职）/种族 + 已选「盔甲擅长/盾牌擅长」专长；用于专长前置「擅长鳞甲」类判定
  const featNameList = useMemo(() => char.featSlots.map((id) => featMap.get(id)?.name ?? ""), [char.featSlots, featMap]);
  const armorTokens = useMemo(
    () => {
      const tokens = collectArmorTokens(classEntry?.sourceText, classEntry2?.sourceText, raceEntry?.sourceText, featNameList);
      // 射手督军：失去链甲擅长（token 可能以「链甲；轻盾」合并形式存在，按包含匹配删除）
      if (archerWarlordOn) for (const t of [...tokens]) if (t.includes("链甲") || t.includes("轻盾")) tokens.delete(t);
      // 前线领袖：获得重盾擅长
      if (frontLineLeaderOn) tokens.add("重盾");
      return tokens;
    },
    [classEntry, classEntry2, raceEntry, featNameList, archerWarlordOn, frontLineLeaderOn]
  );
  const shieldTokens = useMemo(
    () => {
      const tokens = collectShieldTokens(classEntry?.sourceText, classEntry2?.sourceText, raceEntry?.sourceText, featNameList);
      // 射手督军：失去轻盾擅长
      if (archerWarlordOn) for (const t of [...tokens]) if (t.includes("轻盾") || t.includes("链甲")) tokens.delete(t);
      // 前线领袖：获得重盾擅长（盾牌归类到盾牌 token）
      if (frontLineLeaderOn) tokens.add("重盾");
      return tokens;
    },
    [classEntry, classEntry2, raceEntry, featNameList, archerWarlordOn, frontLineLeaderOn]
  );
  // 擅长总览（装备面板「擅长」弹窗）：职业/种族/专长提供的武器、法器、防具擅长
  const profSources = useMemo(
    () => {
      const sources = collectProficiencySources({
        className: classEntry ? cleanDisplayName(classEntry.name) : "职业",
        className2: classEntry2 ? cleanDisplayName(classEntry2.name) : undefined,
        classText: classEntry?.sourceText,
        classText2: classEntry2?.sourceText,
        raceName: raceEntry ? cleanDisplayName(raceEntry.name) : "种族",
        raceText: raceEntry?.sourceText,
        featNames: char.featSlots.map((id) => featMap.get(id)?.name ?? ""),
        featChoices: featChoicesList,
      });
      // 射手督军：失去链甲/轻盾擅长，获得军用远程武器擅长 → 调整擅长总览
      if (archerWarlordOn) {
        for (const src of sources) {
          for (const g of src.groups) {
            if (g.cat === "防具") g.items = g.items.filter((it) => !it.includes("链甲") && !it.includes("轻盾"));
          }
        }
        const cls = sources.find((s) => classEntry && s.source === cleanDisplayName(classEntry.name));
        if (cls) {
          const wp = cls.groups.find((g) => g.cat === "武器");
          if (wp) { if (!wp.items.includes("军用远程")) wp.items.push("军用远程"); }
          else cls.groups.push({ cat: "武器", items: ["军用远程"] });
        } else {
          sources.push({ source: classEntry ? cleanDisplayName(classEntry.name) : "职业", groups: [{ cat: "武器", items: ["军用远程"] }] });
        }
      }
      // 前线领袖：获得重盾擅长 → 在职业来源的防具组加入重盾
      if (frontLineLeaderOn) {
        const cls2 = sources.find((s) => classEntry && s.source === cleanDisplayName(classEntry.name))
          ?? (classEntry ? (() => { const n = { source: cleanDisplayName(classEntry.name), groups: [] as ProfGroup[] }; sources.push(n); return n; })() : undefined);
        if (cls2) {
          const ar = cls2.groups.find((g) => g.cat === "防具");
          if (ar) { if (!ar.items.includes("重盾")) ar.items.push("重盾"); }
          else cls2.groups.push({ cat: "防具", items: ["重盾"] });
        }
      }
      return sources;
    },
    [classEntry, classEntry2, raceEntry, char.featSlots, featMap, featChoicesList, archerWarlordOn, frontLineLeaderOn]
  );
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const swapList = swapPicker
    ? (() => {
        const reserve = swapPicker.kind === "power" ? char.spellbook : char.backpack;
        const out: { ri: number; id: string; name: string; sub: string; color: string }[] = [];
        reserve.forEach((id, ri) => {
          if (!id) return;
          if (swapPicker.kind === "power") {
            const e = powerMap.get(id);
            out.push({ ri, id, name: e?.name ?? id, sub: (e?.usage ?? "") + (e?.level ? " · L" + e.level : ""), color: e ? (e.usage === "at-will" ? POWER_COLORS.atWill : e.usage === "encounter" ? POWER_COLORS.encounter : e.usage === "daily" ? POWER_COLORS.daily : POWER_COLORS.utility) : "#8a8a8a" });
          } else {
            const e = itemMap.get(id);
            out.push({ ri, id, name: e?.name ?? id, sub: (e?.itemCategory ?? "") + (e?.itemLevel ? " · L" + e.itemLevel : ""), color: ITEM_COLOR });
          }
        });
        return out;
      })()
    : [];
  const swapCurId = swapPicker
    ? (swapPicker.kind === "power" ? char.powerSlots[swapPicker.cat][swapPicker.index] ?? "" : ((swapPicker.ekind === "fixed" ? char.equipmentSlots : swapPicker.ekind === "other" ? char.otherSlots : char.consumableSlots)[swapPicker.index] ?? ""))
    : "";
  const swapCurName = swapCurId ? ((swapPicker?.kind === "power" ? powerMap.get(swapCurId)?.name : itemMap.get(swapCurId)?.name) ?? swapCurId) : "";
  // 自动花销：基础物品 + 魔法装备（增强档位对应等级价格）+ 冒险装备手动价格
  const autoCosts = useMemo(() => {
    const list: { label: string; cost: number }[] = [];
    for (const idxStr of Object.keys(char.baseItems)) {
      const idx = parseInt(idxStr, 10);
      // 已附魔（该槽位装备了有等级表的魔法物品）：基础武器/护甲价格不再计入（附魔价含基础物）
      const mag = char.equipmentSlots[idx];
      if (mag) {
        const me = itemMap.get(mag);
        if (me && itemLevels(me.itemLevel).length) continue;
      }
      const f = findBaseItem(char.baseItems[idx]);
      if (!f) continue;
      const name = f.weapon?.name ?? f.armor?.name ?? f.shield?.name ?? f.implement?.name ?? "";
      const price = f.weapon?.price ?? f.armor?.price ?? f.shield?.price ?? f.implement?.price ?? 0;
      if (name) list.push({ label: "基础·" + name, cost: price });
    }
    char.equipmentSlots.forEach((id, idx) => {
      if (!id) return;
      const e = itemMap.get(id);
      if (!e) return;
      const levels = itemLevels(e.itemLevel);
      if (!levels.length) return;
      const tier = Math.min(char.equipmentEnhance[idx] ?? 1, levels.length);
      const lv = levels[tier - 1];
      list.push({ label: e.name + " +" + tier, cost: priceForLevel(lv) });
    });
    for (const a of char.adventureItems) {
      if (a.name && a.cost > 0) list.push({ label: a.name, cost: a.cost });
    }
    return list;
  }, [char, itemMap]);
  const autoTotal = autoCosts.reduce((s, x) => s + x.cost, 0);
  const moneyBalance = char.money.earned - char.money.spent - autoTotal;
  const trainedCount = useMemo(() => {
    if (!classEntry) return 0;
    const a = parseTrainedSkillCount(classEntry.sourceText);
    if (!classEntry2) return a;
    return 3 + a + parseTrainedSkillCount(classEntry2.sourceText);
  }, [classEntry, classEntry2]);
  // 职业内置自动受训技能（如刺客的隐秘）——由职业来源派生，更换职业时随之重建
  const classAutoTrained = useMemo(() => {
    const names: string[] = [];
    if (classEntry) names.push(...parseBuiltinTrainedSkills(classEntry.sourceText));
    if (classEntry2) names.push(...parseBuiltinTrainedSkills(classEntry2.sourceText));
    return [...new Set(names)];
  }, [classEntry, classEntry2]);
  // 职业技能池（供点选受训）：主职与混职去重合并
  const classSkillPool = useMemo(() => {
    const pool = new Map<string, { name: string; ability: AbilityKey }>();
    for (const e of [classEntry, classEntry2]) {
      if (!e) continue;
      for (const s of parseClassSkills(e.sourceText)) if (!pool.has(s.name)) pool.set(s.name, s);
    }
    return [...pool.values()];
  }, [classEntry, classEntry2]);
  // 有效受训技能 = 杂项受训 + 职业内置自动受训 + 职业点选受训
  const effectiveTrained = useMemo(
    () => [...new Set([...char.trainedSkills, ...classAutoTrained, ...char.classTrainedSkills])],
    [char.trainedSkills, classAutoTrained, char.classTrainedSkills]
  );
  const trainedSet = useMemo(() => new Set(effectiveTrained), [effectiveTrained]);
  const classTrainedSet = useMemo(() => new Set(char.classTrainedSkills), [char.classTrainedSkills]);
  const levelInfo = useMemo(() => (char.level >= 1 ? LEVELS[char.level - 1] : undefined), [char.level]);
  const isBoostLevel = levelInfo?.abilityBoost === "两个 +1";
  const raceTrait = useMemo(() => (raceEntry ? raceTraitHtml(raceEntry.sourceText) : undefined), [raceEntry]);
  const raceBody = useMemo(() => (raceEntry ? raceBodyHtml(raceEntry.sourceText) : undefined), [raceEntry]);
  const raceLoreSections = useMemo(() => (raceBody ? splitRaceLore(raceBody) : []), [raceBody]);
  // 亚种：解析所有含「属于[[原种族]]的亚种」的条目，按键为原种族显示名（如「矮人 Dwarf」）
  const subracesByBase = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const r of races) {
      const info = parseSubraceInfo(r.sourceText);
      if (info) {
        const list = map.get(info.baseRaceName) ?? [];
        list.push(r);
        map.set(info.baseRaceName, list);
      }
    }
    return map;
  }, [races]);
  const raceBaseName = raceEntry ? `${raceEntry.name} ${raceEntry.nameEn ?? ""}`.trim() : "";
  const subraces = raceEntry ? (subracesByBase.get(raceBaseName) ?? []) : [];
  const subraceEntry = useMemo(() => (char.subraceId ? subraces.find((s) => s.id === char.subraceId) : undefined), [char.subraceId, subraces]);
  const subraceInfo = useMemo(() => (subraceEntry ? parseSubraceInfo(subraceEntry.sourceText) : undefined), [subraceEntry]);
  const subraceName = subraceEntry?.name ?? "";
  // 亚种 lore 直接「替换」对应的基础 lore 小节（无需切换按钮）：按标题中文段匹配（同类别或共享≥3字前缀），
  // 匹配到的位置用亚种小节顶替，名称用【亚种名】标识；未匹配的基础小节保留，未匹配的亚种小节追加末尾。
  const mergedLore = useMemo(() => {
    if (!subraceInfo || subraceInfo.loreSections.length === 0) return raceLoreSections.map((s) => ({ section: s, sub: false }));
    const catKey = (t?: string) => (t ?? "").trim().split(/\s/)[0] || "";
    const covers = (subKey: string, baseKey: string): boolean => {
      if (!subKey || !baseKey) return false;
      if (subKey === baseKey || subKey.startsWith(baseKey) || baseKey.startsWith(subKey)) return true;
      let n = 0;
      while (n < subKey.length && n < baseKey.length && subKey[n] === baseKey[n]) n++;
      return n >= 3;
    };
    const used = new Set<number>();
    const list = raceLoreSections.map((sec) => {
      const k = catKey(sec.title);
      const m = subraceInfo.loreSections.findIndex((sub, j) => k && !used.has(j) && covers(catKey(sub.title), k));
      if (m < 0) return { section: sec, sub: false };
      used.add(m);
      return { section: subraceInfo.loreSections[m], sub: true };
    });
    subraceInfo.loreSections.forEach((sub, j) => { if (!used.has(j)) list.push({ section: sub, sub: true }); });
    return list;
  }, [raceLoreSections, subraceInfo]);
  // 选择/清除亚种：选中时默认应用全部增益（替代对应基础特性），清除时清空
  const setSubrace = (id?: string) => {
    if (!id) {
      setChar({ ...char, subraceId: undefined, subraceBenefits: {} });
      return;
    }
    const entry = subraces.find((s) => s.id === id);
    const info = entry ? parseSubraceInfo(entry.sourceText) : undefined;
    const applied: Record<string, boolean> = {};
    if (info) for (const b of info.benefits) applied[b.title] = true;
    // 选中亚种时清空基础内部替代（如「龙惧」），避免与亚种增益（如「腐蚀传统」代替「龙息」）在同一条特性上互相冲突
    setChar({ ...char, subraceId: id, subraceBenefits: applied, raceSwaps: {} });
  };
  // 切换某个亚种增益：true=使用替代版（默认），false=回到原版基础特性
  const toggleSubraceBenefit = (title: string) => {
    const next = { ...(char.subraceBenefits ?? {}) };
    next[title] = !next[title];
    setChar({ ...char, subraceBenefits: next });
  };
  // 被替代的基础特性名 → 亚种增益（含正文，用于授予增益自带的威能）
  const subraceBenefitByBase = useMemo(() => {
    const map = new Map<string, { title: string; body: string }>();
    if (subraceInfo) for (const b of subraceInfo.benefits) if (b.replaces) map.set(b.replaces, { title: b.title, body: b.body });
    return map;
  }, [subraceInfo]);
  // 基础种族 classTrait 的结构化特性行（raceTraitHtml 已剔除体型/速度/视觉）
  const raceTraits = useMemo(() => {
    if (!raceEntry) return [];
    const body = raceTraitHtml(raceEntry.sourceText);
    return body ? parseRaceTraitLines(body) : [];
  }, [raceEntry]);
  // 基础种族内部的可替代特性：被替代特性名（如「龙息」）→ 替代特性行（如「龙惧」）
  const raceAltForBase = useMemo(() => {
    const map = new Map<string, (typeof raceTraits)[number]>();
    for (const t of raceTraits) if (t.replaces && t.replaces !== t.name) map.set(t.replaces, t);
    return map;
  }, [raceTraits]);
  // 基础种族内部可替代特性切换（如「龙惧」代替「龙息」），翻转后由种族 effect 依据 raceSwaps 重算威能授予
  const toggleRaceSwap = (altName: string) => {
    setChar((p) => ({ ...p, raceSwaps: { ...(p.raceSwaps ?? {}), [altName]: !(p.raceSwaps?.[altName]) } }));
  };
  const slotCounts = levelInfo ? levelInfo.powers : { atWill: 0, encounter: 0, daily: 0, utility: 0 };
  const featSlotCount = levelInfo ? levelInfo.feats : 0;
  const effFeatCount = char.featSlotOverride ?? featSlotCount;
  const effPowerCount = (cat: keyof PowerSlots): number => {
    if (cat === "special") return char.powerSlots.special.length;
    const o = char.powerSlotOverrides?.[cat];
    return o !== undefined ? o : slotCounts[cat];
  };

  // 威能面板当前含有的全部威能 id（供职业特性「已加入」判定）
  const panelIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of SLOT_CATS) for (const id of char.powerSlots[c.key]) if (id) set.add(id);
    return set;
  }, [char.powerSlots]);
  // 把特性授予的威能加入威能面板：按 grantedPowerCategory 归类落入对应空位（无空位则顺延追加一格，避免威能丢失）
  function onAddPowers(powers: Entry[]) {
    setChar((p) => {
      const slots = { ...p.powerSlots };
      const used = new Set<string>();
      for (const c of SLOT_CATS) for (const id of slots[c.key]) if (id) used.add(id);
      for (const pw of powers) {
        if (!pw || used.has(pw.id)) continue;
        const cat = grantedPowerCategory(pw.usage, pw.powerKind);
        if (!cat) continue;
        const arr = [...slots[cat]];
        const idx = arr.findIndex((x) => !x);
        if (idx >= 0) arr[idx] = pw.id;
        else arr.push(pw.id);
        slots[cat] = arr;
        used.add(pw.id);
      }
      return { ...p, powerSlots: slots };
    });
  }

  // 记录「职业授予威能」id（不加入面板）：更换职业时据此从威能面板移除
  const trackClassPowers = (powers: Entry[]) => {
    if (!powers || powers.length === 0) return;
    setChar((p) => ({
      ...p,
      classGrantedPowerIds: Array.from(new Set([...p.classGrantedPowerIds, ...powers.map((x) => x.id)])),
    }));
  };
  // 职业特性授予威能：加入面板 + 记录 id（供更换职业移除）
  const onAddClassPowers = (powers: Entry[]) => {
    onAddPowers(powers);
    trackClassPowers(powers);
  };
  // 特性选择变化时，把「不再授予」的职业威能从面板移除并取消记录（如野性力量切换选项、降级不满足门槛）
  const onRemoveClassPowers = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setChar((p) => {
      const idSet = new Set(ids);
      const slots = { ...p.powerSlots };
      for (const c of SLOT_CATS) {
        slots[c.key] = slots[c.key].map((id) => (id && idSet.has(id) ? "" : id));
      }
      return { ...p, powerSlots: slots, classGrantedPowerIds: p.classGrantedPowerIds.filter((id) => !idSet.has(id)) };
    });
  };
  // 种族授予的辅助威能：选择加入面板（种族/辅助槽），取消选择时移除
  const toggleRacePower = (power: Entry) => {
    if (!power) return;
    if (panelIds.has(power.id)) {
      onRemoveClassPowers([power.id]);
      setChar((p) => ({ ...p, raceGrantedPowerIds: (p.raceGrantedPowerIds ?? []).filter((id) => id !== power.id) }));
    } else {
      onAddPowers([power]);
      setChar((p) => ({ ...p, raceGrantedPowerIds: Array.from(new Set([...(p.raceGrantedPowerIds ?? []), power.id])) }));
    }
  };
  // 选择/更换种族时：自动填充技能种族加值、语言槽，自动加入种族授予威能（特性内 [[...]] 威能，
  // 如半身人「死里逃生」），并清理旧种族已选的威能（防止遗留）。辅助威能需用户手动选择。
  useEffect(() => {
    setChar((p) => {
      const oldRace = new Set(p.raceGrantedPowerIds ?? []);
      if (oldRace.size === 0 && !raceEntry) return p;
      let newRace: Entry[] = [];
      const newIds = new Set<string>();
      if (raceEntry) {
        const ct = (raceEntry.sourceText.match(/@@\.classTrait\s+"""([\s\S]*?)"""/) || [])[1] ?? "";
        // 综合基础内部替代(龙惧↔龙息)与亚种增益(腐蚀传统↔龙息等)后，计算应授予的威能集合
        newRace = raceGrantedPowerEntries(ct, { swaps: p.raceSwaps, subBenefits: p.subraceBenefits, subByBase: subraceBenefitByBase }, (t) => wikiLookup(t));
        for (const pw of newRace) newIds.add(pw.id);
      }
      const slots = { ...p.powerSlots };
      if (oldRace.size) {
        for (const c of SLOT_CATS) slots[c.key] = slots[c.key].map((id) => (id && oldRace.has(id) ? "" : id));
      }
      const used = new Set<string>();
      for (const c of SLOT_CATS) for (const id of slots[c.key]) if (id) used.add(id);
      for (const pw of newRace) {
        if (used.has(pw.id)) continue;
        const cat = grantedPowerCategory(pw.usage, pw.powerKind);
        if (!cat) continue;
        const arr = [...slots[cat]];
        const idx = arr.findIndex((x) => !x);
        if (idx >= 0) arr[idx] = pw.id;
        else arr.push(pw.id);
        slots[cat] = arr;
        used.add(pw.id);
      }
      const { skills, languages } = raceEntry ? parseRaceAutofill(raceEntry.sourceText) : { skills: {}, languages: [""] };
      const sm = { ...p.skillMods };
      for (const s of SKILL_TABLE) {
        const cur = sm[s.name] ?? { race: 0, other: 0, armor: 0 };
        cur.race = skills[s.name] ?? 0;
        sm[s.name] = cur;
      }
      return { ...p, powerSlots: slots, skillMods: sm, languages, raceGrantedPowerIds: [...newIds] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceEntry, powerMap, char.raceSwaps, char.subraceBenefits, subraceBenefitByBase]);

  function addEarn() {
    const n = parseInt(earnInput, 10);
    if (!Number.isNaN(n) && n > 0) setChar((p) => ({ ...p, money: { ...p.money, earned: p.money.earned + n } }));
    setEarnInput("");
  }

  function addSpend() {
    const n = parseInt(spendInput, 10);
    if (!Number.isNaN(n) && n > 0) setChar((p) => ({ ...p, money: { ...p.money, spent: p.money.spent + n } }));
    setSpendInput("");
  }

  function setLevel(v: number) {
    const lv = Math.max(0, Math.min(30, v));
    if (lv >= 1 && LEVELS[lv - 1].abilityBoost === "两个 +1") setBoostUsed(0);
    setChar((p) => ({
      ...p,
      level: lv,
      xp: lv === 0 ? "0" : String(xpForLevel(lv)),
      paragonPathId: lv < 11 ? undefined : p.paragonPathId,
      epicDestinyId: lv < 21 ? undefined : p.epicDestinyId,
      powerPoints: psionicPowerPoints(p.classId, lv) ?? p.powerPoints,
    }));
  }

  function onXpChange(v: string) {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n >= 0) {
      const info = levelFromXp(n);
      setChar((p) => ({ ...p, xp: v, level: info.level }));
    } else {
      setChar((p) => ({ ...p, xp: v }));
    }
  }

  function applyPreset(values: number[]) {
    setChar((prev) => {
      const next = { ...prev.abilities };
      presetOrder.forEach((k, idx) => { next[k] = values[idx]; });
      return { ...prev, abilities: next };
    });
    setBuyPresetOpen(false);
  }

  function onSorterDrop(i: number) {
    if (dragIndex === null || dragIndex === i) {
      setDragIndex(null);
      setDragOver(null);
      return;
    }
    setPresetOrder((o) => {
      const arr = [...o];
      const [moved] = arr.splice(dragIndex, 1);
      arr.splice(i, 0, moved);
      return arr;
    });
    setDragIndex(null);
    setDragOver(null);
  }

  function setDefenseMod(k: DefenseKey, src: DefenseBonusSource, v: string) {
    const n = parseInt(v, 10);
    const val = Number.isNaN(n) ? 0 : Math.max(-20, Math.min(50, n));
    setChar((p) => ({ ...p, defenseMods: { ...p.defenseMods, [k]: { ...p.defenseMods[k], [src]: val } } }));
  }

  function setSpeedMod(k: keyof SpeedMods, v: string) {
    // 盔甲减值为负向加值：只填数字，计入时取负
    const raw = k === "armor" ? v.replace(/[^0-9]/g, "") : v;
    const n = parseInt(raw, 10);
    const val = Number.isNaN(n) ? 0 : k === "armor" ? Math.max(0, Math.min(50, n)) : Math.max(-20, Math.min(50, n));
    setChar((p) => ({ ...p, speedMods: { ...p.speedMods, [k]: val } }));
  }

  function setInitMod(k: keyof InitMods, v: string) {
    const n = parseInt(v, 10);
    const val = Number.isNaN(n) ? 0 : Math.max(-20, Math.min(50, n));
    setChar((p) => ({ ...p, initMods: { ...p.initMods, [k]: val } }));
  }

  function setSkillMod(name: string, key: keyof SkillMods[string], v: string) {
    const n = parseInt(v, 10);
    const val = Number.isNaN(n) ? 0 : Math.max(-20, Math.min(50, n));
    setChar((p) => {
      const cur = p.skillMods[name] ?? { race: 0, other: 0, armor: 0 };
      return { ...p, skillMods: { ...p.skillMods, [name]: { ...cur, [key]: val } } };
    });
  }

  function setAbility(k: AbilityKey, v: number) {
    const clamped = Math.min(30, Math.max(8, v));
    const old = char.abilities[k];
    setChar((prev) => ({ ...prev, abilities: { ...prev.abilities, [k]: clamped } }));
    if (abilityMode === "buy") {
      // 18 以上只能由升级 +1 提供：计为已用的升级提升次数
      if (clamped > old && old >= 18) setBoostUsed((u) => Math.min(2, u + 1));
      if (clamped < old && clamped >= 18) setBoostUsed((u) => Math.max(0, u - 1));
    }
  }

  function toggleTrained(name: string) {
    setChar((p) => {
      const has = p.trainedSkills.includes(name);
      if (has) return { ...p, trainedSkills: p.trainedSkills.filter((s) => s !== name) };
      if (trainedCount > 0 && p.trainedSkills.length >= trainedCount) return p;
      return { ...p, trainedSkills: [...p.trainedSkills, name] };
    });
  }

  // 职业受训点选：从职业技能池中选择（上限 = 职业额外受训数），更换职业时清除
  function toggleClassTrained(name: string) {
    setChar((p) => {
      const has = p.classTrainedSkills.includes(name);
      if (has) return { ...p, classTrainedSkills: p.classTrainedSkills.filter((s) => s !== name) };
      if (trainedCount > 0 && p.classTrainedSkills.length >= trainedCount) return p;
      return { ...p, classTrainedSkills: [...p.classTrainedSkills, name] };
    });
  }

  function setAdvItem(i: number, patch: Partial<{ name: string; cost: number }>) {
    setChar((p) => {
      const arr = [...p.adventureItems];
      while (arr.length <= i) arr.push({ name: "", cost: 0 });
      arr[i] = { ...arr[i], ...patch };
      return { ...p, adventureItems: arr };
    });
  }

  function setLang(i: number, v: string) {
    setChar((p) => {
      const arr = [...p.languages];
      arr[i] = v.trim();
      return { ...p, languages: arr };
    });
  }

  function setPowerOverride(cat: keyof PowerSlots, n: number) {
    setChar((p) => ({ ...p, powerSlotOverrides: { ...(p.powerSlotOverrides ?? {}), [cat]: n } }));
  }
  function restorePowerOverride(cat: keyof PowerSlots) {
    setChar((p) => {
      const o = { ...(p.powerSlotOverrides ?? {}) };
      delete o[cat];
      return { ...p, powerSlotOverrides: o };
    });
  }
  function setFeatOverride(n: number) {
    setChar((p) => ({ ...p, featSlotOverride: n }));
  }
  function restoreFeatOverride() {
    setChar((p) => ({ ...p, featSlotOverride: undefined }));
  }

  // 行动资源面板：行动点 / 里程碑 / 灵能点（位于经验下方，尺寸与原先一致）
  const resourcePanel = (
    <div className="resource-panel">
      <div className="resource-item">
        <span className="field-label">行动点</span>
        {mode === "render" ? (
          <span className="level-value">{char.actionPoints}</span>
        ) : (
          <div className="stepper">
            <button type="button" className="step" onClick={() => setChar({ ...char, actionPoints: Math.max(0, char.actionPoints - 1) })}>−</button>
            <span className="level-value">{char.actionPoints}</span>
            <button type="button" className="step" onClick={() => setChar({ ...char, actionPoints: Math.min(5, char.actionPoints + 1) })}>+</button>
            <button type="button" className="step reset" title="重置行动点" onClick={() => setChar({ ...char, actionPoints: 1 })}>↺</button>
          </div>
        )}
      </div>
      <div className="resource-item">
        <span className="field-label">里程碑</span>
        {mode === "render" ? (
          <span className="level-value">{char.milestones ?? 0}</span>
        ) : (
          <div className="stepper">
            <button type="button" className="step" onClick={() => setChar({ ...char, milestones: Math.max(0, (char.milestones ?? 0) - 1), actionPoints: Math.max(0, char.actionPoints - 1) })}>−</button>
            <span className="level-value">{char.milestones ?? 0}</span>
            <button type="button" className="step" onClick={() => setChar({ ...char, milestones: Math.min(99, (char.milestones ?? 0) + 1), actionPoints: Math.min(5, char.actionPoints + 1) })}>+</button>
            <button type="button" className="step reset" title="重置里程碑" onClick={() => setChar({ ...char, milestones: 0 })}>↺</button>
          </div>
        )}
      </div>
      <div className="resource-item">
        <span className="field-label">灵能点</span>
        {mode === "render" ? (
          <span className="level-value">{char.powerPoints ?? 0}</span>
        ) : (
          <div className="stepper">
            <button type="button" className="step" onClick={() => setChar({ ...char, powerPoints: Math.max(0, (char.powerPoints ?? 0) - 1) })}>−</button>
            <span className="level-value">{char.powerPoints ?? 0}</span>
            <button type="button" className="step" onClick={() => setChar({ ...char, powerPoints: Math.min(99, (char.powerPoints ?? 0) + 1) })}>+</button>
            <button type="button" className="step reset" title="重置灵能点" onClick={() => setChar({ ...char, powerPoints: psionicPowerPoints(char.classId, char.level) ?? 0 })}>↺</button>
          </div>
        )}
      </div>
    </div>
  );

  const topCol = (
    <section className="block topbar">
        <div className="topbar-head">
          <span className="block-title">角色信息</span>
        </div>
        <div className="topbar-flex">
          <div className="portrait-col">
            <PortraitFrame />
            {mode === "render" ? (
              <div className="render-field"><span className="render-name">等级</span><span className="render-value">{char.level}</span></div>
            ) : (
              <div className="field">
                <span className="field-label">等级</span>
                <div className="stepper">
                  <button type="button" className="step" onClick={() => setLevel(char.level - 1)}>−</button>
                  <span className="level-value">{char.level}</span>
                  <button type="button" className="step" onClick={() => setLevel(char.level + 1)}>+</button>
                </div>
              </div>
            )}
            <TextField label="经验" value={char.xp ?? ""} onChange={(v) => onXpChange(v)} type="number" mode={mode} />
            {layout === "double" && resourcePanel}
          </div>
          <div className="info-rows">
            <div className="info-row row-1">
              <TextField label="姓名" value={char.name} onChange={(v) => setChar({ ...char, name: v })} mode={mode} big />
            </div>
            <div className="info-row row-2">
              <PickField label="种族" displayName={subraceEntry ? subraceEntry.name : raceEntry?.name} mode={mode} onClick={() => setPicker("race")} />
              <PickField label="英雄职阶" displayName={classDisplay} mode={mode} onClick={() => setPicker("class")} />
              <PickField label={char.level >= 11 ? "典范之道" : "典范之道（11级解锁）"} displayName={paragonPathEntry?.name} disabled={char.level < 11} mode={mode} onClick={() => setPicker("paragon")} />
              <PickField label={char.level >= 21 ? "传奇天命" : "传奇天命（21级解锁）"} displayName={epicDestinyEntry?.name} disabled={char.level < 21} mode={mode} onClick={() => setPicker("epic")} />
            </div>
            <div className="info-row row-3">
              <TextField label="性别" value={char.gender ?? ""} onChange={(v) => setChar({ ...char, gender: v })} mode={mode} />
              <TextField label="年龄" value={char.age ?? ""} onChange={(v) => setChar({ ...char, age: v })} mode={mode} />
              <TextField label="体型" value={char.size ?? ""} onChange={(v) => setChar({ ...char, size: v })} mode={mode} />
              <TextField label="身高" value={char.height ?? ""} onChange={(v) => setChar({ ...char, height: v })} mode={mode} />
              <TextField label="体重" value={char.weight ?? ""} onChange={(v) => setChar({ ...char, weight: v })} mode={mode} />
              {layout === "double" && <VisionField value={char.vision} mode={mode} onChange={(v) => setChar({ ...char, vision: v })} />}
            </div>
            <div className="info-row row-4">
              <AlignmentField value={char.alignment} mode={mode} onClick={() => setAlignmentOpen(true)} />
              <TextField label="信仰" value={char.faith ?? ""} onChange={(v) => setChar({ ...char, faith: v })} mode={mode} />
              {layout === "single" && <VisionField value={char.vision} mode={mode} onChange={(v) => setChar({ ...char, vision: v })} />}
              <TextField label="冒险团队与组织" value={char.organization ?? ""} onChange={(v) => setChar({ ...char, organization: v })} wide mode={mode} />
            </div>
            <div className="info-row row-lang">
              {layout === "single" && resourcePanel}
              <span className="field-label">语言</span>
              {char.languages.map((v, i) => (
                mode === "render" ? (v ? <span key={i} className="lang-chip">{v}</span> : null)
                : <input key={i} className="lang-input" value={v} placeholder={"语言 " + (i + 1)} onChange={(e) => setLang(i, e.target.value)} />
              ))}
              {mode === "edit" && (
                <span className="lang-steps">
                  <button type="button" className="sg-step" title="减少语言槽" onClick={() => setChar((p) => ({ ...p, languages: p.languages.slice(0, -1) }))}>−</button>
                  <button type="button" className="sg-step" title="增加语言槽" onClick={() => setChar((p) => ({ ...p, languages: [...p.languages, ""] }))}>+</button>
                </span>
              )}
            </div>
          </div>
        </div>
    </section>
  );
  const leftTop = (
    <>
      <div className="stat-layout">
        <div className="stat-col">
          <div className="mini-block">
            <span className="mb-label">先攻</span>
            <span className="mb-value">{fmtMod(stats.initiative + char.initMods.other)}</span>
            {mode === "edit" ? (
              <ModInputs sources={[{ key: "other", label: "其他" }]} mods={char.initMods} onChange={(k, v) => setInitMod(k as keyof InitMods, v)} />
            ) : (
              char.initMods.other !== 0 && <div className="def-bonus-total">{char.initMods.other > 0 ? "+" + char.initMods.other : String(char.initMods.other)}</div>
            )}
          </div>
          <div className="mini-block">
            <div className="mb-head">
              <span className="mb-label">属性</span>
              {abilityMode === "buy" && (isBoostLevel || boostUsed > 0 ? (
                <span className="buy-badge">提升 {boostUsed}/2</span>
              ) : (
                <button type="button" className={buyPointsUsed(char.abilities) > BUY_POINTS ? "buy-badge clickable over" : "buy-badge clickable"} onClick={() => setBuyPresetOpen(true)} title="点击选择常用购点组合">
                  购点 {BUY_POINTS - buyPointsUsed(char.abilities)}/{BUY_POINTS}
                </button>
              ))}
              <label className="buy-switch" title="22 购点法：起始 8、10、10、10、10、10">
                <span>购点</span>
                <Switch selected={abilityMode === "buy"} onChange={(e) => setAbilityMode((e.target as any).selected ? "buy" : "free")} />
              </label>
            </div>
            {raceInfo && (raceInfo.one || raceInfo.two.length > 0) && (
              <div className="race-bonus-inline">
                <span className="race-bonus">种族加成：</span>
                {raceInfo.one && <span className="rb-item">+2 {ABILITY_LABELS[raceInfo.one].zh}</span>}
                {raceInfo.two.length === 1 && <span className="rb-item">+2 {ABILITY_LABELS[raceInfo.two[0]].zh}</span>}
                {raceInfo.two.length > 1 && mode === "render" && <span className="rb-item">+2 {ABILITY_LABELS[char.raceAbility2Choice ?? raceInfo.two[0]].zh}</span>}
                {raceInfo.two.length > 1 && mode === "edit" && (
                  <span className="rb-choice">
                    <span className="rb-item">+2</span>
                    <select className="rb-select" value={char.raceAbility2Choice ?? raceInfo.two[0]} onChange={(e) => setChar({ ...char, raceAbility2Choice: e.target.value as AbilityKey })}>
                      {raceInfo.two.map((k) => <option key={k} value={k}>{ABILITY_LABELS[k].zh}</option>)}
                    </select>
                  </span>
                )}
              </div>
            )}
            <div className="ability-table">
              {ABILITIES.map((k) => (
                <div className="ability-col" key={k}>
                  <div className="ac-head">{ABILITY_LABELS[k].zh} <span className="ac-en">{ABILITY_LABELS[k].en}</span></div>
                  <div className="ac-body"><span className="ac-score">{effectiveAbilities[k]}</span><span className="ac-mod">{fmtMod(stats.mods[k])}</span></div>
                  <div className="ac-step">
                    <button type="button" className="step" onClick={() => setAbility(k, char.abilities[k] - 1)}>−</button>
                    <button type="button" className="step" onClick={() => setAbility(k, char.abilities[k] + 1)}>+</button>
                  </div>
                  {bonus[k] ? <div className="ac-note">基础 {char.abilities[k]} +2</div> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stat-col">
          <div className="mini-block">
            <span className="mb-label">感知</span>
            <div className="mb-pair">
              <div className="mb-pair-item"><span>被动侦查</span><span className="mb-pair-value">{stats.passivePerception}</span></div>
              <div className="mb-pair-item"><span>被动洞察</span><span className="mb-pair-value">{stats.passiveInsight}</span></div>
            </div>
          </div>
          <div className="mini-block">
            <span className="mb-label">抵御</span>
            <div className="defense-grid">
              <DefenseCell label="AC" value={stats.ac} mods={acMods} mode={mode} onChange={(src, v) => setDefenseMod("ac", src, v)} />
              <DefenseCell label="强韧" value={stats.fort} mods={fortMods} mode={mode} onChange={(src, v) => setDefenseMod("fort", src, v)} />
              <DefenseCell label="反射" value={stats.ref} mods={refMods} mode={mode} onChange={(src, v) => setDefenseMod("ref", src, v)} />
              <DefenseCell label="意志" value={stats.will} mods={willMods} mode={mode} onChange={(src, v) => setDefenseMod("will", src, v)} />
            </div>
          </div>
        </div>
        <div className="stat-col">
          <div className="mini-block">
            <span className="mb-label">移动力</span>
            <span className="mb-value">{speedDisplay}<span className="mb-unit">速度(格)</span></span>
            {mode === "edit" ? (
              <ModInputs
                sources={[
                  { key: "power", label: "威能" },
                  { key: "feat", label: "专长" },
                  { key: "armor", label: "防具" },
                  { key: "item", label: "物品" },
                  { key: "other", label: "其他" },
                ]}
                mods={char.speedMods}
                neg={new Set(["armor"])}
                onChange={(k, v) => setSpeedMod(k as keyof SpeedMods, v)}
              />
            ) : (
              speedTotal !== 0 && <div className="def-bonus-total">{speedTotal > 0 ? "+" + speedTotal : String(speedTotal)}</div>
            )}
          </div>
          <div className="mini-block tall">
            <span className="mb-label">生命</span>
            <div className="health-list">
              <div className="health-main">
                <div className="health-main-row">
                  <span className="hl-label">生命值</span>
                  <span className="hl-now">
                    <input className="hp-now-input" type="number" placeholder={String(maxHpTotal)} value={(char.hpNow?.max === undefined ? "" : String(char.hpNow.max))} onChange={(e) => setHpNow("max", e.target.value)} />
                    <span className="hl-slash">/</span>
                    <span className="hl-value">{maxHpTotal}</span>
                  </span>
                </div>
                <div className="health-main-row temp">
                  <span className="hl-label">临时生命值</span>
                  <input className="hp-now-input temp-input" type="number" min={0} value={char.tempHp ?? 0} onChange={(e) => setChar((p) => ({ ...p, tempHp: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                </div>
              </div>
              <div className="health-row"><span>重伤值</span>
                <span className="hl-now small">
                  <input className="hp-now-input" type="number" placeholder={String(bloodiedTotal)} value={(char.hpNow?.bloodied === undefined ? "" : String(char.hpNow.bloodied))} onChange={(e) => setHpNow("bloodied", e.target.value)} />
                  <span className="hl-slash">/</span><span>{bloodiedTotal}</span>
                </span>
              </div>
              <div className="health-row"><span>回复值</span>
                <span className="hl-now small">
                  <input className="hp-now-input" type="number" placeholder={String(surgeValueTotal)} value={(char.hpNow?.surgeValue === undefined ? "" : String(char.hpNow.surgeValue))} onChange={(e) => setHpNow("surgeValue", e.target.value)} />
                  <span className="hl-slash">/</span><span>{surgeValueTotal}</span>
                </span>
              </div>
              <div className="health-row"><span>回复力</span>
                <span className="hl-now small">
                  <input className="hp-now-input" type="number" placeholder={String(surgesTotal)} value={(char.hpNow?.surges === undefined ? "" : String(char.hpNow.surges))} onChange={(e) => setHpNow("surges", e.target.value)} />
                  <span className="hl-slash">/</span><span>{surgesTotal}</span>
                </span>
              </div>
            </div>
            <div className="hp-extra">
              <div className="hp-extra-row"><span>额外生命值</span><input type="number" value={hpBonus} onChange={(e) => setChar((p) => ({ ...p, hpBonus: Math.floor(Number(e.target.value) || 0) }))} /></div>
              <div className="hp-extra-row"><span>额外回复力</span><input type="number" value={surgeBonus} onChange={(e) => setChar((p) => ({ ...p, surgeBonus: Math.floor(Number(e.target.value) || 0) }))} /></div>
              <div className="hp-extra-row"><span>额外回复值</span><input type="number" value={surgeValueBonus} onChange={(e) => setChar((p) => ({ ...p, surgeValueBonus: Math.floor(Number(e.target.value) || 0) }))} /></div>

            </div>
          </div>
        </div>
      </div>
          </>
  );
  // 装备槽位增强加值：槽位无魔法物品或无可增强档位时返回 0（档位默认 1，即 4E 增强加值）
  const enhanceOf = (slot: number): number => {
    const id = char.equipmentSlots[slot];
    if (!id) return 0;
    const e = itemMap.get(id);
    if (!e) return 0;
    const levels = itemLevels(e.itemLevel);
    if (!levels.length) return 0;
    return Math.min(char.equipmentEnhance[slot] ?? 1, levels.length);
  };
  // 伤害骰：取自所选槽位（主手/副手）基础武器的伤害骰；无基础武器/非武器则空
  const diceOf = (slot: number): string => {
    const baseId = char.baseItems[slot];
    const base = baseId ? findBaseItem(baseId) : undefined;
    return base?.kind === "weapon" ? (base.weapon?.dice ?? "") : "";
  };
  // 擅长加值：所选槽位基础武器的擅长加值；未装备武器/非武器为 0。
  // override=true 时视为擅长（忽略自动判定，用于选择型专长等无法自动判定的情况）
  const profOf = (slot: number, override: boolean): number => {
    const baseId = char.baseItems[slot];
    const base = baseId ? findBaseItem(baseId) : undefined;
    if (base?.kind !== "weapon" || !base.weapon) return 0;
    return override || isProficient(base.weapon, proficiencyTokens) ? base.weapon.prof : 0;
  };
  // 攻击/伤害数值来源（供「职业加值」「专长加值」单元格点击后选择）：
  // 职业特性（含混职）中提及「攻击骰」的条目 → 职业加值来源
  const classAttackSources = useMemo(
    () => collectClassSources([classEntry?.sourceText, classEntry2?.sourceText], "攻击骰", char.level),
    [classEntry, classEntry2, char.level]
  );
  // 已选专长中提及「攻击骰」的 → 攻击面板专长加值来源
  const featAttackSources = useMemo(
    () => collectFeatSources(char.featSlots.map((id) => featMap.get(id)), "攻击骰", char.level),
    [char.featSlots, featMap, char.level]
  );
  // 已选专长中提及「伤害骰」的 → 伤害面板专长加值来源
  const featDamageSources = useMemo(
    () => collectFeatSources(char.featSlots.map((id) => featMap.get(id)), "伤害骰", char.level),
    [char.featSlots, featMap, char.level]
  );
  // 攻击/伤害：数据面板下方并排（攻击在左、伤害在右），单栏与双栏均通栏展示
  const combatRow = (
    <div className="combat-row">
      <CombatPanels char={char} setChar={setChar} mods={stats.mods} halfLevel={stats.halfLevel} enhanceOf={enhanceOf} diceOf={diceOf} profOf={profOf} mode={mode} classAttackSources={classAttackSources} featAttackSources={featAttackSources} featDamageSources={featDamageSources} />
    </div>
  );
  // 职业特性「选择一个」选项：记录所选值（键 = "职业ID::特性标题"；多选型如戏法存字符串数组）
  const setClassFeatureChoice = (key: string, label: string | string[]) => {
    const next = { ...char.classFeatureChoices };
    if (Array.isArray(label)) {
      if (label.length === 0) delete next[key];
      else next[key] = label;
    } else if (label) {
      next[key] = label;
    } else {
      delete next[key];
    }
    setChar({ ...char, classFeatureChoices: next });
  };
  // 职业特性正文中的 [[威能/专长]] 超链接 → 悬浮卡片查找
  const wikiLookup = useMemo(
    () => (target: string) => powerMap.get(target) ?? featMap.get(target) ?? itemMap.get(target),
    [powerMap, featMap, itemMap]
  );
  const raceClassCol = (
    <><section className="block">
        <div className="block-head">
          <h3 className="block-title">种族特性</h3>
          <div className="race-head-actions">
            {raceEntry && subraces.length > 0 && (
              <button
                type="button"
                className={`mode-chip subrace-chip${subraceOpen || char.subraceId ? " active" : ""}${subraceOpen ? " open" : ""}`}
                onClick={() => setSubraceOpen((p) => !p)}
                title="选择亚种：亚种增益可替换基础种族的对应特性"
              >
                <span className="material-symbols-outlined mode-chip-ic">category</span>
                {char.subraceId ? `亚种：${subraceName}` : "亚种"}
              </button>
            )}
            <button type="button" className="mode-chip" onClick={() => setRaceDetail((p) => !p)}>
              <span className="material-symbols-outlined mode-chip-ic">{raceDetail ? "density_small" : "density_large"}</span>
              {raceDetail ? "简洁" : "详细"}
            </button>
          </div>
        </div>
        {raceEntry ? (
          <>
            <div className="race-panel-title">{subraceEntry ? subraceEntry.name : raceEntry.name}</div>
            {subraces.length > 0 && subraceOpen && (
              <div className="subrace-chooser">
                <span className="subrace-chooser-label">亚种：</span>
                {subraces.map((s) => {
                  const sinfo = parseSubraceInfo(s.sourceText);
                  const tip = sinfo?.benefits.map((b) => `${b.title}（替代「${b.replaces ?? "原特性"}」）`).join("；") ?? "选择该亚种以替换对应的种族特性";
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`subrace-opt${char.subraceId === s.id ? " active" : ""}`}
                      onClick={() => setSubrace(char.subraceId === s.id ? undefined : s.id)}
                      title={tip}
                    >
                      {s.name}
                    </button>
                  );
                })}
                {char.subraceId && (
                  <button type="button" className="subrace-opt clear" onClick={() => setSubrace(undefined)}>基础种族</button>
                )}
              </div>
            )}
            <div className="race-detail">
              {raceTraits.length > 0 && (
                <div className="race-trait">
                  {raceTraits.map((t, i) => {
                    // 三选一：同一基础特性同时被「基础内部替代」（龙惧替代龙息）与「亚种增益」（腐蚀传统/复仇震击替代龙息）替换时，
                    // 展示三个互斥选项（基础 / 替代 / 亚种），选中其一即自动停用其余，并同步到威能面板。
                    const multiSub = subraceBenefitByBase.get(t.name);
                    const multiSwap = raceAltForBase.get(t.name);
                    if (multiSub && multiSwap) {
                      const subActive = char.subraceBenefits?.[multiSub.title] !== false;
                      const swapActive = !!char.raceSwaps?.[multiSwap.name];
                      const baseActive = !subActive && !swapActive;
                      const pick = (kind: "base" | "swap" | "sub") => {
                        const rs = { ...(char.raceSwaps ?? {}) };
                        const sb = { ...(char.subraceBenefits ?? {}) };
                        rs[multiSwap.name] = kind === "swap";
                        sb[multiSub.title] = kind === "sub";
                        setChar({ ...char, raceSwaps: rs, subraceBenefits: sb });
                      };
                      const activeBody = subActive
                        ? `''${chineseName(multiSub.title)}：''${reorderBenefitBody(multiSub.body)}`
                        : swapActive
                          ? `''${chineseName(multiSwap.name)}：''${reorderBenefitBody(multiSwap.body)}`
                          : `''${chineseName(t.name)}：''${t.body}`;
                      return (
                        <div key={i} className={`race-trait-line sr-replaceable${subActive || swapActive ? " replaced" : ""}`}>
                          <div className="race-trait-row">
                            <div className="race-trait-opts">
                              <button
                                type="button"
                                className={`sr-tag${baseActive ? " active" : ""}`}
                                onClick={() => pick("base")}
                                title={baseActive ? "当前为原始特性" : `切回原始特性「${chineseName(t.name)}」`}
                              >
                                <span className="material-symbols-outlined sr-ic">swap_horiz</span>
                                {chineseName(t.name)}
                              </button>
                              <button
                                type="button"
                                className={`sr-tag${swapActive ? " active" : ""}`}
                                onClick={() => pick("swap")}
                                title={swapActive ? `当前已用「${chineseName(multiSwap.name)}」替代` : `改用「${chineseName(multiSwap.name)}」替代`}
                              >
                                <span className="material-symbols-outlined sr-ic">swap_horiz</span>
                                {chineseName(multiSwap.name)}
                              </button>
                              <button
                                type="button"
                                className={`sr-tag${subActive ? " active" : ""}`}
                                onClick={() => pick("sub")}
                                title={subActive ? `当前已用亚种增益「${chineseName(multiSub.title)}」替代` : `改用亚种增益「${chineseName(multiSub.title)}」替代`}
                              >
                                <span className="material-symbols-outlined sr-ic">swap_horiz</span>
                                {chineseName(multiSub.title)}
                              </button>
                            </div>
                            <div className="race-trait-content">
                              <WikiBody body={activeBody} fields={raceEntry.fields} lookup={wikiLookup} />
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const repl = subraceBenefitByBase.get(t.name);
                    if (!repl) {
                      // 基础种族内部可替代特性（如 「龙惧」 替代 「龙息」）不可独立展示，并入其基础特性的切换
                      const raceAlt = raceAltForBase.get(t.name);
                      if (t.replaces && raceAltForBase.has(t.replaces)) return null;
                      if (raceAlt) {
                        const altName = raceAlt.name;
                        const swapApplied = !!char.raceSwaps?.[altName];
                        return (
                          <div key={i} className={`race-trait-line sr-replaceable${swapApplied ? " replaced" : ""}`}>
                            <div className="race-trait-row">
                              <button
                                type="button"
                                className={`sr-tag${swapApplied ? " active" : ""}`}
                                onClick={() => toggleRaceSwap(altName)}
                                title={swapApplied ? `已使用「${altName}」替代「${t.name}」，点击还原` : `点击以「${altName}」替代「${t.name}」`}
                              >
                                <span className="material-symbols-outlined sr-ic">swap_horiz</span>
                                {swapApplied ? chineseName(t.name) : altName}
                              </button>
                              <div className="race-trait-content">
                                <WikiBody
                                  body={swapApplied ? `''${altName}：''${reorderBenefitBody(raceAlt.body)}` : `''${t.name}：''${t.body}`}
                                  fields={raceEntry.fields}
                                  lookup={wikiLookup}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="race-trait-line">
                          <WikiBody body={`''${t.name}：''${t.body}`} fields={raceEntry.fields} lookup={wikiLookup} />
                        </div>
                      );
                    }
                    // 可用亚种特性替换的基础特性：前置标签即切换按钮，点一下直接替换，再点一下还原
                    const applied = char.subraceBenefits?.[repl.title] !== false;
                    return (
                      <div key={i} className={`race-trait-line sr-replaceable${applied ? " replaced" : ""}`}>
                        <div className="race-trait-row">
                          <button
                            type="button"
                            className={`sr-tag${applied ? " active" : ""}`}
                            onClick={() => toggleSubraceBenefit(repl.title)}
                            title={applied ? `已替换为「${repl.title}」，点击还原为「${t.name}」` : `点击替换为「${repl.title}」`}
                          >
                            <span className="material-symbols-outlined sr-ic">swap_horiz</span>
                            {applied ? chineseName(t.name) : repl.title}
                          </button>
                          <div className="race-trait-content">
                            <WikiBody
                              body={applied ? `''${repl.title}：''${reorderBenefitBody(repl.body)}` : `''${t.name}：''${t.body}`}
                              fields={raceEntry.fields}
                              lookup={wikiLookup}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {mergedLore.length > 0 && (
                <div className="race-lore">
                  {mergedLore.map((item, i) => {
                    const sec = item.section;
                    const isSub = item.sub;
                    // 辅助威能：小节标题不折叠，仅各威能的描述文本折叠
                    if (!isSub && sec.title?.includes("辅助威能")) {
                      const aux = splitAuxPowers(sec.body);
                      return (
                        <div key={`${raceDetail}-aux-${i}`} className="lore-powers">
                          <div className="lore-powers-title">{sec.title}</div>
                          {aux.intro && (
                            <details key={`${raceDetail}-aux-intro-${i}`} className="lore-fold" {...(raceDetail ? { open: true } : {})}>
                              <summary>
                                <span className="lore-fold-title">简介</span>
                                <span className="material-symbols-outlined lore-fold-ic">expand_more</span>
                              </summary>
                              <div className="class-features"><WikiBody body={aux.intro} fields={raceEntry.fields} lookup={wikiLookup} /></div>
                            </details>
                          )}
                          {aux.powers.map((p, j) => {
                            const power = p.title ? powerMap.get(p.title) : undefined;
                            const selected = !!power && panelIds.has(power.id);
                            return (
                              <details key={`${raceDetail}-aux-${i}-${j}`} className="lore-fold" {...(raceDetail ? { open: true } : {})}>
                                <summary>
                                  {power && (
                                    <button
                                      type="button"
                                      className={`lore-powers-toggle${selected ? " on" : ""}`}
                                      onClick={(e) => { e.stopPropagation(); toggleRacePower(power); }}
                                      title={selected ? "取消选择，从威能面板移除" : "选择此威能，填入对应的威能框"}
                                    >
                                      {selected ? "取消选择" : "选择此威能"}
                                    </button>
                                  )}
                                  {power ? (
                                    <SmartHover className="lore-fold-title lore-powers-hover" popClass="wiki-ref-pop" pop={<EntryCard entry={power} />}>{p.title}</SmartHover>
                                  ) : (
                                    <span className="lore-fold-title">{p.title}</span>
                                  )}
                                  <span className="material-symbols-outlined lore-fold-ic">expand_more</span>
                                </summary>
                                {p.body && <div className="class-features"><WikiBody body={p.body} fields={raceEntry.fields} lookup={wikiLookup} /></div>}
                              </details>
                            );
                          })}
                        </div>
                      );
                    }
                    return (
                      <details key={`${raceDetail}-lore-${i}`} className="lore-fold" {...(raceDetail ? { open: true } : {})}>
                        <summary>
                          {isSub && <span className="lore-fold-badge">{subraceName}</span>}
                          <span className="lore-fold-title">{sec.title ?? "种族背景"}</span>
                          <span className="material-symbols-outlined lore-fold-ic">expand_more</span>
                        </summary>
                        <div className="class-features"><WikiBody body={sec.body} fields={raceEntry.fields} lookup={wikiLookup} /></div>
                      </details>
                    );
                  })}
                </div>
              )}
              {!raceTrait && !raceBody && <pre className="feature-text">{stripWiki(raceEntry.sourceText)}</pre>}
            </div>
          </>
        ) : <p className="hint">请先选择种族。</p>}
      </section>

      <section className="block">
        <div className="block-head">
          <h3 className="block-title">职业能力</h3>
          <button type="button" className="mode-chip" onClick={() => setClassFeatDetail((p) => !p)}>
            <span className="material-symbols-outlined mode-chip-ic">{classFeatDetail ? "density_small" : "density_large"}</span>
            {classFeatDetail ? "简洁" : "详细"}
          </button>
        </div>
        {classEntry ? (
          <>
            {classEntry2 && <div className="class-entry-title">{cleanDisplayName(classEntry.name)}</div>}
            <ClassFeatureBlock entry={classEntry} detail={classFeatDetail} level={char.level} choices={char.classFeatureChoices} onChoose={setClassFeatureChoice} lookup={wikiLookup} panelIds={panelIds} onAddPowers={onAddClassPowers} onTrackClassPowers={trackClassPowers} onRemovePowers={onRemoveClassPowers} />
            {classEntry2 && (
              <>
                <hr className="class-entry-sep" />
                <div className="class-entry-title">{cleanDisplayName(classEntry2.name)}</div>
                <ClassFeatureBlock entry={classEntry2} detail={classFeatDetail} level={char.level} choices={char.classFeatureChoices} onChoose={setClassFeatureChoice} lookup={wikiLookup} panelIds={panelIds} onAddPowers={onAddClassPowers} onTrackClassPowers={trackClassPowers} onRemovePowers={onRemoveClassPowers} />
              </>
            )}
          </>
        ) : <p className="hint">请先选择职业。</p>}
      </section>

      
      {char.level >= 11 && (
        <section className="block">
          <div className="block-head">
            <h3 className="block-title">典范特性</h3>
            <button type="button" className="mode-chip" onClick={() => setPathDetail((p) => !p)}>
            <span className="material-symbols-outlined mode-chip-ic">{pathDetail ? "density_small" : "density_large"}</span>
            {pathDetail ? "简洁" : "详细"}
          </button>
          </div>
          {paragonPathEntry ? (
            <div className="race-detail">
              {pathParse.sections.length > 0 ? (
                <>
                  {pathParse.hasTitle && <div className="pf-entry-title">{cleanDisplayName(paragonPathEntry.name)}</div>}
                  {pathDetail && pathParse.intro && <div className="pf-intro" dangerouslySetInnerHTML={{ __html: wikiToHtml(pathParse.intro, paragonPathEntry.fields) }} />}
                  <FeatureSectionList sections={pathParse.sections} detail={pathDetail} fields={paragonPathEntry.fields} powerOf={(id) => powerMap.get(id)} panelIds={panelIds} onAddPowers={onAddPowers} />
                </>
              ) : (
                <pre className="feature-text">{stripWiki(paragonPathEntry.sourceText)}</pre>
              )}
            </div>
          ) : <p className="hint">请先选择典范之道。</p>}
        </section>
      )}
      {char.level >= 21 && (
        <section className="block">
          <div className="block-head">
            <h3 className="block-title">天命特性</h3>
            <button type="button" className="mode-chip" onClick={() => setDestinyDetail((p) => !p)}>
            <span className="material-symbols-outlined mode-chip-ic">{destinyDetail ? "density_small" : "density_large"}</span>
            {destinyDetail ? "简洁" : "详细"}
          </button>
          </div>
          {epicDestinyEntry ? (
            <div className="race-detail">
              {destinyParse.sections.length > 0 ? (
                <>
                  {destinyParse.hasTitle && <div className="pf-entry-title">{cleanDisplayName(epicDestinyEntry.name)}</div>}
                  {destinyDetail && destinyParse.intro && <div className="pf-intro" dangerouslySetInnerHTML={{ __html: wikiToHtml(destinyParse.intro, epicDestinyEntry.fields) }} />}
                  <FeatureSectionList sections={destinyParse.sections} detail={destinyDetail} fields={epicDestinyEntry.fields} powerOf={(id) => powerMap.get(id)} panelIds={panelIds} onAddPowers={onAddPowers} />
                </>
              ) : (
                <pre className="feature-text">{stripWiki(epicDestinyEntry.sourceText)}</pre>
              )}
            </div>
          ) : <p className="hint">请先选择传奇天命。</p>}
        </section>
      )}

    </>
  );
  const skillsCol = (
    <>
<section className="block">
        <div className="block-head">
          <h3 className="block-title">技能（{effectiveTrained.length}）</h3>
          <button type="button" className="mode-chip" onClick={() => setSkillDetail((p) => !p)}>
            <span className="material-symbols-outlined mode-chip-ic">{skillDetail ? "density_small" : "density_large"}</span>
            {skillDetail ? "简洁" : "详细"}
          </button>
        </div>
        {skillDetail ? (
          <>
          <div className="skill-table">
            {SKILL_TABLE.map((s) => {
              const trained = trainedSet.has(s.name);
              const sm = char.skillMods[s.name] ?? { race: 0, other: 0, armor: 0 };
              const hasArmor = ARMOR_PENALTY_SKILLS.has(s.name);
              const total = stats.mods[s.ability] + stats.halfLevel + (trained ? 5 : 0) + sm.race + sm.other - (hasArmor ? sm.armor : 0);
              return (
                <div key={s.name} className={trained ? "skill-item trained" : "skill-item"} onClick={() => toggleTrained(s.name)} title="点击切换受训">
                  <span className="skill-check">{trained ? "✓" : ""}</span>
                  <span className="skill-name">{s.name}</span>
                  <span className="skill-total">{fmtMod(total)}</span>
                  <span className="skill-ability">{ABILITY_LABELS[s.ability].zh}</span>
                  <span className="skill-mods" onClick={(e) => e.stopPropagation()}>
                    <label className="skill-mod" title="种族加值"><span>种族</span><input type="number" min={-20} max={50} value={sm.race} onChange={(e) => setSkillMod(s.name, "race", e.target.value)} /></label>
                    <label className="skill-mod" title="其他加值"><span>其他</span><input type="number" min={-20} max={50} value={sm.other} onChange={(e) => setSkillMod(s.name, "other", e.target.value)} /></label>
                    {hasArmor ? (
                      <label className="skill-mod" title="盔甲减值（自动计为负值，只填数字）"><span>盔甲</span><span className="skill-mod-minus">−</span><input type="number" min={0} max={50} value={sm.armor} onChange={(e) => setSkillMod(s.name, "armor", e.target.value.replace(/[^0-9]/g, ""))} /></label>
                    ) : (
                      <label className="skill-mod armor-placeholder" aria-hidden="true"><span>盔甲</span><span className="skill-mod-minus">−</span><input type="number" disabled value={0} /></label>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          {classSkillPool.length > 0 && (
            <div className="cls-skill-pick">
              <div className="csp-title">
                <span>职业技能受训（{char.classTrainedSkills.length}/{trainedCount}）</span>
                <span className="csp-sub">点选受训 · 更换职业时清除</span>
              </div>
              <div className="csp-list">
                {classSkillPool.map((s) => {
                  const auto = classAutoTrained.includes(s.name);
                  const sel = classTrainedSet.has(s.name);
                  const cls = auto ? "csp-item auto" : sel ? "csp-item active" : "csp-item";
                  return (
                    <button key={s.name} type="button" className={cls} onClick={() => !auto && toggleClassTrained(s.name)}
                      title={auto ? "职业自动受训" : sel ? "已受训（点击取消）" : "点击受训"}>
                      <span className="csp-name">{s.name}</span>
                      <span className="csp-ability">{ABILITY_LABELS[s.ability].zh}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          </>
        ) : (
          <div className="skill-compact">
            {SKILL_TABLE.map((s) => {
              const trained = trainedSet.has(s.name);
              const sm = char.skillMods[s.name] ?? { race: 0, other: 0, armor: 0 };
              const hasArmor = ARMOR_PENALTY_SKILLS.has(s.name);
              const total = stats.mods[s.ability] + stats.halfLevel + (trained ? 5 : 0) + sm.race + sm.other - (hasArmor ? sm.armor : 0);
              return (
                <div key={s.name} className={trained ? "skill-compact-row trained" : "skill-compact-row"} title="简略模式为静态展示，受训请在详细模式中切换">
                  <span className="sc-name">{s.name}</span>
                  <span className="sc-total">{fmtMod(total)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </>
  );
  const leftCol = (
    <>
      {leftTop}
      {combatRow}
      {raceClassCol}
      {skillsCol}
    </>
  );
  const powersCol = (
    <>
      <section className="block">
        <div className="block-head">
          <h3 className="block-title">威能</h3>
                    <span className="head-actions">
            <button type="button" className={"mode-chip" + (slotMode === "mark" ? " active" : "")} title="开启后点击有内容的槽位切换「已使用」遮罩（再次点击解除）" onClick={() => setSlotMode((m) => (m === "mark" ? null : "mark"))}>
              <span className="mode-chip-ic">−</span>
              标记使用
            </button>
            <button type="button" className={"mode-chip" + (slotMode === "swap" ? " active" : "")} title="开启后点击槽位打开储备弹窗，挑选要交换进来的对象" onClick={() => setSlotMode((m) => (m === "swap" ? null : "swap"))}>
              <span className="mode-chip-ic">⇄</span>
              与储备交换
            </button>
          </span>
          <button type="button" className="mode-chip" onClick={() => setBlockDetail((p) => ({ ...p, powers: !p.powers }))}>
            <span className="material-symbols-outlined mode-chip-ic">{blockDetail.powers ? "density_small" : "density_large"}</span>
            {blockDetail.powers ? "简洁" : "详细"}
          </button>
        </div>
        {SLOT_CATS.map((cat) => {
          const isSpecial = cat.key === "special";
          const effCount = isSpecial ? char.powerSlots.special.length : effPowerCount(cat.key);
          const filled = char.powerSlots[cat.key].filter(Boolean).length;
          const count = Math.max(effCount, char.powerSlots[cat.key].length);
          const customized = !isSpecial && char.powerSlotOverrides?.[cat.key] !== undefined;
          return (
            <div key={cat.key} className="selected-group">
              <div className="sg-title">
                {cat.key !== "utility" && cat.key !== "special" && <span className="sg-dot" style={{ background: cat.color }} />}
                {cat.label}
                <span className="sg-count">（{filled}/{effCount}）</span>
                {isSpecial ? (
                  <>
                    <button type="button" className="sg-step" disabled={!!slotMode} title="减少槽位" onClick={() => setChar((p) => ({ ...p, powerSlots: { ...p.powerSlots, special: resizeSlots(p.powerSlots.special, p.powerSlots.special.length - 1).map((x) => x ?? "") } }))}>−</button>
                    <button type="button" className="sg-step" disabled={!!slotMode} title="增加槽位" onClick={() => setChar((p) => ({ ...p, powerSlots: { ...p.powerSlots, special: resizeSlots(p.powerSlots.special, p.powerSlots.special.length + 1).map((x) => x ?? "") } }))}>+</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="sg-step" disabled={!!slotMode} title="减少槽位" onClick={() => setPowerOverride(cat.key, Math.max(0, effCount - 1))}>−</button>
                    <button type="button" className="sg-step" disabled={!!slotMode} title="增加槽位" onClick={() => setPowerOverride(cat.key, Math.min(20, effCount + 1))}>+</button>
                  </>
                )}
                {customized && <span className="sg-custom">自定义</span>}
                {customized && <button type="button" className="sg-restore" title="恢复跟随等级" onClick={() => restorePowerOverride(cat.key)}>恢复</button>}
              </div>
              {blockDetail.powers ? (
                <div className="power-grid">
                  {Array.from({ length: count }, (_, i) => {
                    const id = char.powerSlots[cat.key][i] ?? "";
                    const p = id ? powerMap.get(id) : undefined;
                    if (p) {
                      return (
                        <div key={i} className={"slot-filled" + (isPowerUsed(cat.key, i) ? " slot-used" : "")} onClick={() => onPowerSlotClick(cat.key, i)} title={isPowerUsed(cat.key, i) ? "已标记使用（锁定）" : "点击更换"}>
                          <EntryCard entry={p} />
                        </div>
                      );
                    }
                    return (
                      <button key={i} type="button" className="slot-empty" onClick={() => onPowerSlotClick(cat.key, i)}>
                        <span className="material-symbols-outlined">add</span>
                        <span>选择{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="compact-list">
                  {Array.from({ length: count }, (_, i) => {
                    const id = char.powerSlots[cat.key][i] ?? "";
                    const p = id ? powerMap.get(id) : undefined;
                    if (p) {
                      return (
                        <div key={i} className={"compact-row" + (isPowerUsed(cat.key, i) ? " slot-used" : "")} onClick={() => onPowerSlotClick(cat.key, i)} title={isPowerUsed(cat.key, i) ? "已标记使用（锁定）" : "点击更换"}>
                          <span className="cr-dot" style={{ background: cat.key === "utility" || cat.key === "special" ? (p.usage === "at-will" ? POWER_COLORS.atWill : p.usage === "encounter" ? POWER_COLORS.encounter : p.usage === "daily" ? POWER_COLORS.daily : POWER_COLORS.utility) : cat.color }} />
                          <span className="cr-name">{p.name}{p.nameEn ? " " + p.nameEn : ""}</span>
                          <span className="cr-sub">L{p.level}{p.usageZh ? " · " + p.usageZh : ""}</span>
                          <IconButton className="slot-x" title={isPowerUsed(cat.key, i) || slotMode ? "锁定" : "清空槽位"} aria-label="清空槽位" onClick={(e) => { e.stopPropagation(); if (slotMode || isPowerUsed(cat.key, i)) return; setChar((c) => ({ ...c, powerSlots: clearPowerSlot(c.powerSlots, cat.key, i) })); }}><span className="material-symbols-outlined">close</span></IconButton>
                          <div className="compact-pop"><EntryCard entry={p} /></div>
                        </div>
                      );
                    }
                    return (
                      <button key={i} type="button" className="compact-empty" onClick={() => onPowerSlotClick(cat.key, i)}>＋ 选择{cat.label}</button>
                    );
                  })}
                </div>
              )}
              {count === 0 && filled === 0 && (
                <div className="sg-none">暂无{cat.label}槽位，可点击 ＋ 手动添加</div>
              )}
            </div>
          );
        })}
      </section>

          </>
  );
  const rightRest = (
    <>
<section className="block">
        <div className="block-head">
          <h3 className="block-title">装备</h3>
                    <span className="head-actions">
            <button type="button" className={"mode-chip" + (slotMode === "mark" ? " active" : "")} title="开启后点击有内容的槽位切换「已使用」遮罩（再次点击解除）" onClick={() => setSlotMode((m) => (m === "mark" ? null : "mark"))}>
              <span className="mode-chip-ic">−</span>
              标记使用
            </button>
            <button type="button" className={"mode-chip" + (slotMode === "swap" ? " active" : "")} title="开启后点击槽位打开储备弹窗，挑选要交换进来的对象" onClick={() => setSlotMode((m) => (m === "swap" ? null : "swap"))}>
              <span className="mode-chip-ic">⇄</span>
              与储备交换
            </button>
          </span>
          <button type="button" className="mode-chip" title="查看职业、种族、专长提供的武器、法器、防具擅长" onClick={() => setProfOpen(true)}>
            <span className="material-symbols-outlined mode-chip-ic">workspace_premium</span>
            擅长
          </button>
          <button type="button" className="mode-chip" onClick={() => setBlockDetail((p) => ({ ...p, equipment: !p.equipment }))}>
            <span className="material-symbols-outlined mode-chip-ic">{blockDetail.equipment ? "density_small" : "density_large"}</span>
            {blockDetail.equipment ? "简洁" : "详细"}
          </button>
        </div>
        <div className="equip-layout">
          <nav className="equip-nav">
            {EQUIP_GROUPS.map((g) => (
              <button key={g.label} type="button" className="equip-nav-btn" title={g.label} onClick={() => document.getElementById("equip-g-" + g.label)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{g.label.slice(0, 1)}</button>
            ))}
            <button type="button" className="equip-nav-btn" onClick={() => document.getElementById("equip-g-其他")?.scrollIntoView({ behavior: "smooth", block: "start" })}>他</button>
            <button type="button" className="equip-nav-btn" title="消耗品" onClick={() => document.getElementById("equip-g-消耗品")?.scrollIntoView({ behavior: "smooth", block: "start" })}>耗</button>
            <button type="button" className="equip-nav-btn" title="冒险装备" onClick={() => document.getElementById("equip-g-冒险装备")?.scrollIntoView({ behavior: "smooth", block: "start" })}>冒</button>
          </nav>
          <div className="equip-groups">
        {EQUIP_GROUPS.map((g) => {
          const filled = g.slots.filter((s) => char.equipmentSlots[s.index]).length;
          return (
            <div key={g.label} id={"equip-g-" + g.label} className="selected-group">
              <div className="sg-title">
                {g.label}
                <span className="sg-count">（{filled}/{g.slots.length}）</span>
              </div>
              <EquipGroupSlots
                slots={g.slots.map((s) => char.equipmentSlots[s.index])}
                detail={blockDetail.equipment}
                names={(i) => g.slots[i].name}
                items={(i) => { const id = char.equipmentSlots[g.slots[i].index]; return id ? itemMap.get(id) : undefined; }}
                picker={(i) => onEquipSlotClick("fixed", g.slots[i].index)}
                clear={(i) => { if (slotMode) return; setChar((c) => ({ ...c, equipmentSlots: clearEquipmentSlot(c.equipmentSlots, g.slots[i].index) })); }}
                usedOf={(i) => isEquipUsed("fixed", g.slots[i].index)}
                baseKind={g.kind}
                baseOf={(i) => char.baseItems[g.slots[i].index]}
                onBaseClick={(i) => { if (slotMode || isEquipUsed("fixed", g.slots[i].index)) return; g.kind && setBasePicker({ kind: g.kind, index: g.slots[i].index }); }}
                levelsOf={(i) => { const id = char.equipmentSlots[g.slots[i].index]; const e = id ? itemMap.get(id) : undefined; return e ? itemLevels(e.itemLevel) : []; }}
                enhanceOf={(i) => char.equipmentEnhance[g.slots[i].index] ?? 1}
                onEnhance={(i, tier) => setChar((c) => ({ ...c, equipmentEnhance: { ...c.equipmentEnhance, [g.slots[i].index]: tier } }))}
              />
            </div>
          );
        })}
          <div id="equip-g-其他" className="equip-sub">
            <div className="sg-title">
              其他
              <span className="sg-count">（{char.otherSlots.filter(Boolean).length}/{char.otherSlots.length}）</span>
              <button type="button" className="sg-step" disabled={!!slotMode} title="减少槽位" onClick={() => setChar((p) => ({ ...p, otherSlots: resizeSlots(p.otherSlots, p.otherSlots.length - 1) }))}>−</button>
              <button type="button" className="sg-step" disabled={!!slotMode} title="增加槽位" onClick={() => setChar((p) => ({ ...p, otherSlots: resizeSlots(p.otherSlots, p.otherSlots.length + 1) }))}>+</button>
            </div>
            <EquipGroupSlots
              slots={char.otherSlots}
              detail={blockDetail.equipment}
              names={(i) => "其他 " + (i + 1)}
              items={(i) => { const id = char.otherSlots[i]; return id ? itemMap.get(id) : undefined; }}
              picker={(i) => onEquipSlotClick("other", i)}
              clear={(i) => { if (slotMode) return; setChar((c) => ({ ...c, otherSlots: clearEquipmentSlot(c.otherSlots, i) })); }}
              usedOf={(i) => isEquipUsed("other", i)}
            />
          </div>
          <div id="equip-g-消耗品" className="equip-sub">
            <div className="sg-title">
              消耗品
              <span className="sg-count">（{char.consumableSlots.filter(Boolean).length}/{char.consumableSlots.length}）</span>
              <button type="button" className="sg-step" disabled={!!slotMode} title="减少槽位" onClick={() => setChar((p) => ({ ...p, consumableSlots: resizeSlots(p.consumableSlots, p.consumableSlots.length - 1) }))}>−</button>
              <button type="button" className="sg-step" disabled={!!slotMode} title="增加槽位" onClick={() => setChar((p) => ({ ...p, consumableSlots: resizeSlots(p.consumableSlots, p.consumableSlots.length + 1) }))}>+</button>
            </div>
            <EquipGroupSlots
              slots={char.consumableSlots}
              detail={blockDetail.equipment}
              names={(i) => "消耗品 " + (i + 1)}
              items={(i) => { const id = char.consumableSlots[i]; return id ? itemMap.get(id) : undefined; }}
              picker={(i) => onEquipSlotClick("consumable", i)}
              clear={(i) => { if (slotMode) return; setChar((c) => ({ ...c, consumableSlots: clearEquipmentSlot(c.consumableSlots, i) })); }}
              usedOf={(i) => isEquipUsed("consumable", i)}
            />
          <div id="equip-g-冒险装备" className="equip-sub">
            <div className="sg-title">
              冒险装备
              <span className="sg-count">（{char.adventureItems.filter(Boolean).length}/{char.adventureItems.length}）</span>
              <button type="button" className="sg-step" title="减少槽位" onClick={() => setChar((p) => ({ ...p, adventureItems: p.adventureItems.slice(0, -1) }))}>−</button>
              <button type="button" className="sg-step" title="增加槽位" onClick={() => setChar((p) => ({ ...p, adventureItems: [...p.adventureItems, { name: "", cost: 0 }] }))}>+</button>
            </div>
            <div className="adv-list">
              {char.adventureItems.map((a, i) => (
                <div key={i} className="adv-line">
                  {mode === "render" ? (
                    <>
                      {a.name && <span className="lang-chip">{a.name}</span>}
                      {a.cost > 0 && <span className="adv-cost">{a.cost} gp</span>}
                    </>
                  ) : (
                    <>
                      <input className="lang-input adv-name-input" value={a.name} placeholder={"冒险装备 " + (i + 1)} onChange={(e) => setAdvItem(i, { name: e.target.value })} />
                      <input className="lang-input adv-cost-input" type="number" min={0} value={a.cost || ""} placeholder="gp" onChange={(e) => setAdvItem(i, { cost: parseInt(e.target.value, 10) || 0 })} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          </div>
        </div>
        </div>
      </section>





      <section className="block">
        <div className="block-head">
          <h3 className="block-title">金钱</h3>
        </div>
        <div className="money-grid">
          <div className="money-block">
            <div className="money-title">收入（累计）</div>
            <div className="money-value">{char.money.earned.toLocaleString("zh-CN")} gp</div>
            <div className="money-add">
              <input type="number" className="money-input" value={earnInput} placeholder="新增收入" onChange={(e) => setEarnInput(e.target.value)} />
              <button type="button" className="sf-chip" onClick={addEarn}>＋ 确定</button>
            </div>
          </div>
          <div className="money-block">
            <div className="money-title">手动花销（累计）</div>
            <div className="money-value">{char.money.spent.toLocaleString("zh-CN")} gp</div>
            <div className="money-add">
              <input type="number" className="money-input" value={spendInput} placeholder="新增花销" onChange={(e) => setSpendInput(e.target.value)} />
              <button type="button" className="sf-chip" onClick={addSpend}>＋ 确定</button>
            </div>
          </div>
          <div className="money-block">
            <div className="money-title">自动花销</div>
            <button type="button" className="money-value money-click" title="点击查看各项累计明细" onClick={() => setAutoCostOpen(true)}>{autoTotal.toLocaleString("zh-CN")} gp</button>
          </div>
          <div className="money-block">
            <div className="money-title">余额</div>
            <div className={"money-value" + (moneyBalance < 0 ? " negative" : "")}>{moneyBalance.toLocaleString("zh-CN")} gp</div>
          </div>
        </div>
      </section>
    </>
  );
  const featsCol = (
    <>
      <section className="block">
        <div className="block-head">
          <h3 className="block-title">专长</h3>
          <button type="button" className="mode-chip" onClick={() => setBlockDetail((p) => ({ ...p, feats: !p.feats }))}>
            <span className="material-symbols-outlined mode-chip-ic">{blockDetail.feats ? "density_small" : "density_large"}</span>
            {blockDetail.feats ? "简洁" : "详细"}
          </button>
        </div>
        <div className="selected-group">
          <div className="sg-title">
            专长
            <span className="sg-count">（{char.featSlots.filter(Boolean).length}/{effFeatCount}）</span>
            <button type="button" className="sg-step" title="减少槽位" onClick={() => setFeatOverride(Math.max(0, effFeatCount - 1))}>−</button>
            <button type="button" className="sg-step" title="增加槽位" onClick={() => setFeatOverride(Math.min(20, effFeatCount + 1))}>+</button>
            {char.featSlotOverride !== undefined && (
              <>
                <span className="sg-custom">自定义</span>
                <button type="button" className="sg-restore" title="恢复跟随等级" onClick={restoreFeatOverride}>恢复</button>
              </>
            )}
          </div>
          {blockDetail.feats ? (
            <div className="power-grid">
              {Array.from({ length: Math.max(effFeatCount, char.featSlots.length) }, (_, i) => {
                const id = char.featSlots[i] ?? "";
                const f = id ? featMap.get(id) : undefined;
                if (f) {
                  return (
                    <div key={i} className="slot-filled" onClick={() => openFeatPicker(i)} title="点击更换">
                      <EntryCard entry={f} />
                    </div>
                  );
                }
                return (
                  <button key={i} type="button" className="slot-empty" onClick={() => openFeatPicker(i)}>
                    <span className="material-symbols-outlined">add</span>
                    <span>选择专长</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="compact-list">
              {Array.from({ length: Math.max(effFeatCount, char.featSlots.length) }, (_, i) => {
                const id = char.featSlots[i] ?? "";
                const f = id ? featMap.get(id) : undefined;
                if (f) {
                  return (
                    <div key={i} className="compact-row" onClick={() => openFeatPicker(i)} title="点击更换">
                      <span className="cr-dot" style={{ background: FEAT_COLOR }} />
                      <span className="cr-name">{f.name}{f.nameEn ? " " + f.nameEn : ""}</span>
                      <span className="cr-sub">{f.tierZh ?? ""}</span>
                      <IconButton className="slot-x" title="清空槽位" aria-label="清空槽位" onClick={(e) => { e.stopPropagation(); setChar((c) => ({ ...c, featSlots: clearFeatSlot(c.featSlots, i) })); }}><span className="material-symbols-outlined">close</span></IconButton>
                      <div className="compact-pop"><EntryCard entry={f} /></div>
                    </div>
                  );
                }
                return (
                  <button key={i} type="button" className="compact-empty" onClick={() => openFeatPicker(i)}>＋ 选择专长</button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
const rightCol = (
    <>
      {powersCol}
      {rightRest}
    </>
  );

return (
    <div className="sheet">
      {layout === "double" ? (
        <div className="layout-double">
          <div className="layout-top-row">
            <div className="lt-cell">{topCol}</div>
            <div className="lt-cell">{leftTop}</div>
          </div>
          {combatRow}
          <div className="col-left">
            {powersCol}
            {featsCol}
            {skillsCol}
            {raceClassCol}
          </div>
          <div className="col-right">{rightRest}</div>
        </div>
      ) : (
        <>
          {topCol}
          {leftCol}
          {rightCol}
        </>
      )}

      {picker === "class" && (
        <ClassPickerModal
          entries={classes}
          hybrid={!!char.hybrid}
          selectedIds={[char.classId, char.classId2].filter((x): x is string => !!x)}
          onSelect={(ids, isHybrid) => setChar((p) => {
            // 更换职业：移除旧职业授予的威能（随职业走），并清空记录
            const gone = new Set(p.classGrantedPowerIds ?? []);
            const slots = { ...p.powerSlots };
            for (const c of SLOT_CATS) {
              slots[c.key] = slots[c.key].map((id) => (id && gone.has(id) ? "" : id));
            }
            return {
              ...p,
              hybrid: isHybrid,
              classId: ids[0],
              classId2: ids[1],
              classTrainedSkills: [],
              classGrantedPowerIds: [],
              powerSlots: slots,
              powerPoints: psionicPowerPoints(ids[0], p.level) ?? p.powerPoints,
            };
          })}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === "race" && (
        <PickerModal
          title="选择种族"
          entries={sortedRaces}
          selectedId={char.raceId}
          onSelect={(id) => {
            const race = races.find((x) => x.id === id);
            // 若所选条目本身是亚种（如「金矮人」），自动转为父种族的种族身份并应用对应亚种状态（显示父种族面板）
            const subInfo = race ? parseSubraceInfo(race.sourceText) : undefined;
            const baseRace = subInfo ? races.find((x) => (x.name + " " + (x.nameEn ?? "")).trim() === subInfo.baseRaceName) : undefined;
            if (race && baseRace) {
              const applied: Record<string, boolean> = {};
              for (const b of subInfo!.benefits) applied[b.title] = true;
              setChar({ ...char, raceId: baseRace.id, subraceId: race.id, subraceBenefits: applied, raceSwaps: {}, vision: baseRace?.vision, size: baseRace?.size ?? char.size });
            } else {
              setChar({ ...char, raceId: id, subraceId: undefined, subraceBenefits: {}, raceSwaps: {}, vision: race?.vision, size: race?.size ?? char.size });
            }
            setSubraceOpen(false);
          }}
          onClose={() => setPicker(null)}
          renderSub={(e) => [e.abilityOne, e.abilityTwo, e.size ? "体型 " + e.size : "", e.speed ? "速度 " + e.speed : ""].filter(Boolean).join(" · ")}
          abilityFilter
        />
      )}
      {picker === "paragon" && (
        <PickerModal
          title="选择典范之道"
          entries={paragonPaths}
          selectedId={char.paragonPathId}
          onSelect={(id) => setChar({ ...char, paragonPathId: id })}
          onClose={() => setPicker(null)}
          renderSub={(e) => e.prerequisite}
          restrict={{ level: char.level, raceNames: restrictNames.raceNames, classNames: restrictNames.classNames, myNames: restrictNames.myNames }}
        />
      )}
      {picker === "epic" && (
        <PickerModal
          title="选择传奇天命"
          entries={epicDestinies}
          selectedId={char.epicDestinyId}
          onSelect={(id) => setChar({ ...char, epicDestinyId: id })}
          onClose={() => setPicker(null)}
          renderSub={(e) => e.prerequisite}
          restrict={{ level: char.level, raceNames: restrictNames.raceNames, classNames: restrictNames.classNames, myNames: restrictNames.myNames }}
        />
      )}

      {slotPicker?.kind === "power" && (
        <PowerSlotPicker
          entries={powers}
          relations={relations}
          classEntry={classEntry}
          classEntry2={classEntry2}
          raceEntry={raceEntry}
          category={slotPicker.cat === "atWill" ? "at-will" : slotPicker.cat}
          currentLevel={char.level}
          currentId={char.powerSlots[slotPicker.cat][slotPicker.index] || undefined}
          onSelect={(id) => setChar((p) => ({ ...p, powerSlots: setPowerSlot(p.powerSlots, slotPicker.cat, slotPicker.index, id) }))}
          onClear={() => setChar((p) => ({ ...p, powerSlots: clearPowerSlot(p.powerSlots, slotPicker.cat, slotPicker.index) }))}
          onClose={() => setSlotPicker(null)}
        />
      )}
      {slotPicker?.kind === "feat" && (
        <FeatSlotPicker
          entries={feats}
          allRaces={races}
          allClasses={classes}
          raceEntry={raceEntry}
          classEntry={classEntry}
          classEntry2={classEntry2}
          currentLevel={char.level}
          abilities={char.abilities}
          trainedSkills={effectiveTrained}
          weaponTokens={proficiencyTokens}
          armorTokens={armorTokens}
          shieldTokens={shieldTokens}
          currentId={char.featSlots[slotPicker.index] || undefined}
          onSelect={(id) => {
            const f = featMap.get(id);
            const choice = f ? featChoiceInfo(f) : null;
            const idx = slotPicker.index;
            setChar((p) => {
              const featChoices = { ...p.featChoices };
              delete featChoices[idx]; // 重新选择时清除旧选择
              return { ...p, featSlots: setFeatSlot(p.featSlots, idx, id), featChoices };
            });
            if (choice) {
              if (choice.cat === "weapon") {
                const weaponPool = BASE_WEAPONS.filter((w) => choice.options.some((o) => o.name === w.name));
                const categories = ["全部", ...(["简易", "军用", "优异", "双头"] as const).filter((c) => weaponPool.some((w) => (c === "双头" ? w.category.includes("双头") : w.category.startsWith(c))))];
                setFeatChoicePicker({ index: idx, featName: f?.name ?? "", label: choice.label, options: choice.options, weaponPool, categories });
              } else if (choice.cat === "implement") {
                const implementPool = BASE_IMPLEMENTS.filter((im) => choice.options.some((o) => implGroup(im.name) === o.name));
                setFeatChoicePicker({ index: idx, featName: f?.name ?? "", label: choice.label, options: choice.options, implementPool, implTier: choice.implTier });
              } else {
                setFeatChoicePicker({ index: idx, featName: f?.name ?? "", label: choice.label, options: choice.options });
              }
            }
          }}
          onClear={() => setChar((p) => {
            const featChoices = { ...p.featChoices };
            delete featChoices[slotPicker.index];
            return { ...p, featSlots: clearFeatSlot(p.featSlots, slotPicker.index), featChoices };
          })}
          onClose={() => setSlotPicker(null)}
        />
      )}
      {equipPicker && (
        <ItemSlotPicker
          entries={items}
          slotName={equipPicker.kind === "fixed" ? EQUIPMENT_SLOTS[equipPicker.index] ?? "" : equipPicker.kind === "other" ? "其他" : "消耗品"}
          currentId={equipPicker.kind === "fixed" ? char.equipmentSlots[equipPicker.index] : equipPicker.kind === "other" ? char.otherSlots[equipPicker.index] : char.consumableSlots[equipPicker.index]}
          onSelect={(id) => setChar((p) => ({
            ...p,
            equipmentSlots: equipPicker.kind === "fixed" ? setEquipmentSlot(p.equipmentSlots, equipPicker.index, id) : p.equipmentSlots,
            otherSlots: equipPicker.kind === "other" ? setEquipmentSlot(p.otherSlots, equipPicker.index, id) : p.otherSlots,
            consumableSlots: equipPicker.kind === "consumable" ? setEquipmentSlot(p.consumableSlots, equipPicker.index, id) : p.consumableSlots,
          }))}
          onClear={() => setChar((p) => ({
            ...p,
            equipmentSlots: equipPicker.kind === "fixed" ? clearEquipmentSlot(p.equipmentSlots, equipPicker.index) : p.equipmentSlots,
            otherSlots: equipPicker.kind === "other" ? clearEquipmentSlot(p.otherSlots, equipPicker.index) : p.otherSlots,
            consumableSlots: equipPicker.kind === "consumable" ? clearEquipmentSlot(p.consumableSlots, equipPicker.index) : p.consumableSlots,
          }))}
          onClose={() => setEquipPicker(null)}
        />
      )}
      {swapPicker &&
        createPortal(
          <div className="picker-overlay" onClick={() => setSwapPicker(null)}>
            <div className="picker-dialog swap-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="picker-head">
                <span className="picker-title">从{swapPicker.kind === "power" ? "法术书" : "背包"}交换{swapCurId ? "（当前：" + swapCurName + "）" : "（空槽位）"}</span>
                <div className="picker-head-btns">
                  {swapCurId && <button type="button" className="crop-btn" onClick={() => collectToReserve(swapPicker)}>仅收入储备</button>}
                  <button type="button" className="crop-btn" onClick={() => setSwapPicker(null)}>关闭</button>
                </div>
              </div>
              <div className="swap-list">
                {swapList.length === 0 && <p className="hint">储备为空，暂无内容可交换。</p>}
                {swapList.map((it) => {
                  const e = swapPicker.kind === "power" ? powerMap.get(it.id) : itemMap.get(it.id);
                  return (
                    <button key={it.ri} type="button" className="swap-card" title="点击交换进槽位" onClick={() => swapReserveItem(swapPicker, it.ri)}>
                      {e ? <EntryCard entry={e} /> : <span className="swap-card-fallback"><span className="cr-dot" style={{ background: it.color }} />{it.name}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>,
          document.body
        )}
      {alignmentOpen && (
        <SheetDialog
          open
          headline="选择阵营"
          sub={char.alignment ? "当前：" + char.alignment : "未设置"}
          onClose={() => setAlignmentOpen(false)}
          actions={<TextButton onClick={() => { setChar({ ...char, alignment: "" }); setAlignmentOpen(false); }}>清除阵营</TextButton>}
        >
          <div className="align-section">
            <div className="align-section-title">4e 五阵营</div>
            <div className="align-line">
              {FIVE_ALIGNMENTS.map((a) => (
                <button key={a} type="button" className={char.alignment === a ? "preset-item align-item active" : "preset-item align-item"} onClick={() => { setChar({ ...char, alignment: a }); setAlignmentOpen(false); }}>{a}</button>
              ))}
            </div>
          </div>
          <div className="align-section">
            <div className="align-section-title">九阵营</div>
            <div className="align-grid">
              {NINE_ALIGNMENTS.map((a) => (
                <button key={a} type="button" className={char.alignment === a ? "preset-item align-item active" : "preset-item align-item"} onClick={() => { setChar({ ...char, alignment: a }); setAlignmentOpen(false); }}>{a}</button>
              ))}
            </div>
          </div>
        </SheetDialog>
      )}
      {profOpen && (
        <SheetDialog
          open
          headline="擅长"
          sub="职业、种族、专长提供的武器、法器、防具擅长"
          onClose={() => setProfOpen(false)}
        >
          {profSources.length === 0 ? (
            <p className="hint">暂无可展示的擅长信息。</p>
          ) : (
            <div className="prof-sources">
              {profSources.map((s) => (
                <div key={s.source} className="prof-source">
                  <div className="prof-source-name">{s.source}</div>
                  {s.groups.map((g) => (
                    <div key={g.cat} className="prof-group">
                      <span className="prof-cat">{g.cat}</span>
                      <span className="prof-items">{g.items.length ? g.items.join("、") : "—"}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SheetDialog>
      )}
      {featChoicePicker && (
        <FeatChoiceDialog
          featName={featChoicePicker.featName}
          label={featChoicePicker.label}
          options={featChoicePicker.options}
          weaponPool={featChoicePicker.weaponPool}
          categories={featChoicePicker.categories}
          implementPool={featChoicePicker.implementPool}
          implTier={featChoicePicker.implTier}
          proficientImplGroups={proficientImplGroups}
          proficientInfos={proficientWeaponInfos}
          current={char.featChoices[featChoicePicker.index]}
          onChoose={(item) => setChar((p) => ({ ...p, featChoices: { ...p.featChoices, [featChoicePicker.index]: item } }))}
          onClose={() => setFeatChoicePicker(null)}
        />
      )}
      {basePicker && (
        <BasePickerDialog
          kind={basePicker.kind}
          index={basePicker.index}
          baseId={char.baseItems[basePicker.index]}
          proficientInfos={proficientWeaponInfos}
          proficientImplGroups={proficientImplGroups}
          armorTokens={armorTokens}
          shieldTokens={shieldTokens}
          onSelect={(id) => { setChar((p) => ({ ...p, baseItems: { ...p.baseItems, [basePicker.index]: id } })); setBasePicker(null); }}
          onClear={() => { setChar((p) => { const b = { ...p.baseItems }; delete b[basePicker.index]; return { ...p, baseItems: b }; }); setBasePicker(null); }}
          onClose={() => setBasePicker(null)}
        />
      )}
      {autoCostOpen && (
        <SheetDialog open headline="自动花销明细" sub={"合计 " + autoTotal.toLocaleString("zh-CN") + " gp"} onClose={() => setAutoCostOpen(false)}>
          <div className="money-detail-list">
            {autoCosts.map((x) => (
              <div key={x.label} className="money-row"><span>{x.label}</span><span>{x.cost.toLocaleString("zh-CN")} gp</span></div>
            ))}
            {autoCosts.length === 0 && <p className="hint">暂无自动花销</p>}
          </div>
          <div className="money-detail-total">合计：{autoTotal.toLocaleString("zh-CN")} gp</div>
        </SheetDialog>
      )}
      {buyPresetOpen && (
        <SheetDialog open headline="快速购点（22 点预设）" onClose={() => setBuyPresetOpen(false)}>
          <div className="preset-sorter" title="拖动按钮调整属性取值顺序">
            {presetOrder.map((k, i) => (
              <button
                key={k}
                type="button"
                draggable
                className={"sorter-chip" + (dragOver === i ? " drag-over" : "")}
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => onSorterDrop(i)}
                onDragEnd={() => { setDragIndex(null); setDragOver(null); }}
              >
                <span className="material-symbols-outlined sorter-grip">drag_indicator</span>
                {ABILITY_LABELS[k].zh}
              </button>
            ))}
          </div>
          <div className="preset-list">
            {BUY_PRESETS.map((p) => (
              <button key={p.label} type="button" className="preset-item" onClick={() => applyPreset(p.values)}>
                <span className="preset-name">{presetOrder.map((k, idx) => ABILITY_LABELS[k].zh + " " + p.values[idx]).join(" · ")}</span>
                <span className="preset-label">{p.label}</span>
                <span className="preset-total">22/22</span>
              </button>
            ))}
          </div>
          <p className="preset-hint">上方按钮允许拖动排序，排序后，点击预设按当前顺序应用至属性，不含种族加值。</p>
        </SheetDialog>
      )}
    </div>
  );
}
