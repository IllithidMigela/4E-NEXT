// 专长前置条件判定：判断某专长是否被当前角色满足。
// 只在能可靠判定时拦截（返回原因）；无法可靠判定的复杂条件（需特定专长/威能/职业特性/信仰等）不拦截。
import type { Entry } from "../data/types";
import { ABILITY_KEYS, ABILITY_LABELS, cleanDisplayName, baseClassName, zhName, type AbilityKey } from "./character";
import { satisfiesWeaponProficiency, armorProficient } from "./proficiency";

export interface FeatPrereqContext {
  currentLevel: number;
  abilities: Record<AbilityKey, number>;
  trainedSkills: string[];
  raceEntry?: Entry;
  classEntry?: Entry;
  classEntry2?: Entry;
  allRaces: Entry[];
  allClasses: Entry[];
  weaponTokens: Set<string>;
  armorTokens: Set<string>;
  shieldTokens: Set<string>;
}

const ARMOR_NAMES = new Set(["布甲", "皮甲", "革甲", "链甲", "鳞甲", "板甲", "轻甲", "重甲"]);
const SHIELD_NAMES = new Set(["盾牌", "轻盾", "重盾", "刺盾"]);

// 词边界匹配：作为独立词出现，避免「半精灵」误匹配「精灵」
function containsWord(text: string, word: string): boolean {
  let idx = text.indexOf(word);
  while (idx >= 0) {
    const before = idx > 0 ? text[idx - 1] : "";
    const after = idx + word.length < text.length ? text[idx + word.length] : "";
    const isCn = (ch: string) => ch !== "" && /[\u4e00-\u9fff]/.test(ch);
    if (!isCn(before) && !isCn(after)) return true;
    idx = text.indexOf(word, idx + 1);
  }
  return false;
}

// 从「擅长…」片段提取对象列表；过滤误捕获的种族/职业/威能源/等级/属性等其它前置项
function extractProfItems(pre: string, knownRaces: Set<string>, knownClasses: Set<string>): string[] {
  const items: string[] = [];
  for (const seg of pre.split(/[；;]/)) {
    const idx = seg.indexOf("擅长");
    if (idx < 0) continue;
    const rest = seg.slice(idx + 2);
    for (const raw of rest.split(/[，、或及,]/)) {
      let it = raw.trim();
      if (!it) continue;
      const probe = it.replace(/^(任意|所有)/, "");
      if (knownRaces.has(probe) || knownClasses.has(probe)) continue;
      if (/^(武术|奥术|神术|原力|灵能|影能)职业$/.test(probe)) continue;
      if (/^\d+级$/.test(probe)) continue;
      if (/^(力量|体质|敏捷|智力|感知|魅力)\d+$/.test(probe)) continue;
      it = it.replace(/^(任意|所有)/, "");
      if (it) items.push(it);
    }
  }
  return items;
}

// 返回不满足原因（含「不符合前提」前缀）；满足或无法判定则返回 null
export function featPrereqFailReason(f: Entry, ctx: FeatPrereqContext): string | null {
  const pre = (f.prerequisite ?? "").trim();
  if (!pre) return null;
  const reasons: string[] = [];

  // 任意X职业（威能来源）
  const src = pre.match(/任意(武术|奥术|神术|原力|灵能|影能)职业/);
  if (src) {
    const want = src[1];
    const have = [ctx.classEntry, ctx.classEntry2].some((c) => c?.powerSource === want);
    if (!have) reasons.push("需要" + src[0]);
  }

  // 等级
  const lv = pre.match(/(\d+)级/);
  if (lv && ctx.currentLevel < Number(lv[1])) reasons.push("需要" + lv[0]);

  // 属性
  for (const key of ABILITY_KEYS) {
    const zh = ABILITY_LABELS[key].zh;
    const m = pre.match(new RegExp(zh + "(\\d+)"));
    if (m && ctx.abilities[key] < Number(m[1])) reasons.push(zh + "不足" + m[1] + "点");
  }

  // 受训技能
  const train = pre.match(/在([^。；，,;]+)上受训/);
  if (train) {
    const skills = train[1].split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
    const missing = skills.filter((s) => !ctx.trainedSkills.includes(s));
    if (missing.length) reasons.push("未在" + missing.join("、") + "上受训");
  }

  const addName = (s: Set<string>, n: string) => {
    if (!n) return;
    s.add(n);
    s.add(cleanDisplayName(n));
    s.add(zhName(n));
    s.add(baseClassName(n));
  };
  const knownRaces = new Set<string>();
  for (const e of ctx.allRaces) addName(knownRaces, e.name);
  const knownClasses = new Set<string>();
  for (const e of ctx.allClasses) addName(knownClasses, e.name);

  // 擅长前置（武器/护甲/盾牌）
  const profItems = extractProfItems(pre, knownRaces, knownClasses);
  if (profItems.length) {
    const satisfied = profItems.some((it) => (
      ARMOR_NAMES.has(it) || SHIELD_NAMES.has(it)
        ? armorProficient(ctx.armorTokens, ctx.shieldTokens, it)
        : satisfiesWeaponProficiency(ctx.weaponTokens, it)
    ));
    if (!satisfied) reasons.push("不擅长" + profItems.join("、"));
  }

  // 种族 / 职业名
  const myNames = new Set<string>();
  if (ctx.raceEntry) addName(myNames, ctx.raceEntry.name);
  for (const ce of [ctx.classEntry, ctx.classEntry2]) {
    if (ce) addName(myNames, ce.name);
  }
  const found: string[] = [];
  for (const n of knownRaces) if (n && containsWord(pre, n)) found.push(n);
  for (const n of knownClasses) if (n && containsWord(pre, n)) found.push(n);
  if (found.length && !found.some((n) => myNames.has(n))) reasons.push("需要" + found.join("/"));

  return reasons.length ? "不符合前提：" + reasons.join("；") : null;
}