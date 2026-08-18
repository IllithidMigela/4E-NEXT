// 基础物品：武器/护甲本质是附魔，需依赖基础物品模板（数据由 scripts/extract-baseitems.mjs 从 wiki 生成）
import { BASE_WEAPONS, BASE_ARMORS, PROPERTY_DEFS } from "./baseitems-data";

export interface BaseWeapon {
  name: string;
  dice: string;
  traits: string;
  category: string;
  group: string;
  price: number;
}

export interface BaseArmor {
  name: string;
  ac: number;
  category: string;
  masterwork: boolean;
  minEnhance: number;
  special: string;
  price: number;
}

// 副手护盾（4e 官方数据）
export interface BaseShield {
  name: string;
  ac: number;
  traits: string;
  price: number;
}

export const BASE_SHIELDS: BaseShield[] = [
  { name: "轻盾", ac: 1, traits: "副手", price: 5 },
  { name: "重盾", ac: 2, traits: "副手", price: 10 },
];

// 法器（施法用具，无伤害骰）
export interface BaseImplement {
  name: string;
  category: string;
  price: number;
}

export const BASE_IMPLEMENTS: BaseImplement[] = [
  { name: "圣徽", category: "神术", price: 10 },
  { name: "法珠", category: "奥术", price: 15 },
  { name: "权杖", category: "奥术", price: 12 },
  { name: "法杖", category: "奥术", price: 5 },
  { name: "魔杖", category: "奥术", price: 7 },
];

export { BASE_WEAPONS, BASE_ARMORS, PROPERTY_DEFS };

// 基础物品 id 前缀：w: 武器 / a: 护甲 / s: 盾牌 / i: 法器
export function baseItemId(kind: "weapon" | "armor" | "shield" | "implement", name: string): string {
  const p = kind === "weapon" ? "w:" : kind === "armor" ? "a:" : kind === "shield" ? "s:" : "i:";
  return p + name;
}

export type BaseItemKind = "weapon" | "armor" | "shield" | "implement";

export function findBaseItem(id: string): { kind: BaseItemKind; weapon?: BaseWeapon; armor?: BaseArmor; shield?: BaseShield; implement?: BaseImplement } | undefined {
  if (id.startsWith("w:")) {
    const w = BASE_WEAPONS.find((x) => baseItemId("weapon", x.name) === id);
    return w ? { kind: "weapon", weapon: w } : undefined;
  }
  if (id.startsWith("a:")) {
    const a = BASE_ARMORS.find((x) => baseItemId("armor", x.name) === id);
    return a ? { kind: "armor", armor: a } : undefined;
  }
  if (id.startsWith("s:")) {
    const s = BASE_SHIELDS.find((x) => baseItemId("shield", x.name) === id);
    return s ? { kind: "shield", shield: s } : undefined;
  }
  if (id.startsWith("i:")) {
    const im = BASE_IMPLEMENTS.find((x) => baseItemId("implement", x.name) === id);
    return im ? { kind: "implement", implement: im } : undefined;
  }
  return undefined;
}

// 武器特性完整文本（名称 + 官方定义）
export function traitsText(traits: string): string {
  if (!traits || traits === "—" || traits === "-") return "";
  return traits.split(/[，,]/).map((t) => {
    const name = t.trim();
    if (!name) return "";
    const def = PROPERTY_DEFS[name];
    return def ? name + "：" + def : name;
  }).filter(Boolean).join("\n");
}