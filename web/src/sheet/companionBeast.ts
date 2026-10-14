// 「魔宠与坐骑」本体段的生物分类。
//
// 数据来源是生物库（category=creature，全书 267 条）。其中：
//   魔宠 —— 数据卡标题里的档位标签就是「魔宠」（如蝙蝠/猫/渡鸦/蟾蜍，共 68 条），判定精确；
//   坐骑 —— 正文出现「坐骑 / 骑乘」关键词（如骑乘用马/翡翠马/独角兽战马/狮鹫，共 40 条）；
//   伙伴 —— 正文出现「伙伴」（如狼动物伙伴/受训精野豹/机关仔，共 21 条）；
// 其余（龙、恶魔、普通怪物）不属于本体段，但选择器不禁止选，只是排在后面。
import type { Entry } from "../data/types";

export const COMPANION_BEAST_KINDS = ["魔宠", "坐骑", "伙伴"] as const;
export type CompanionBeastKind = (typeof COMPANION_BEAST_KINDS)[number];

/** 取生物数据块标题行（<div class="bold font-size-h4 bg-title">…</div>）的纯文本。 */
function blockTitle(sourceText: string): string {
  const m = sourceText.match(/<div class="bold font-size-h4 bg-title">([\s\S]*?)<\/div>/);
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\{\{!![^}]*\}\}/g, "") : "";
}

/** 判定一条生物属于本体的哪一类；三类都不是时返回 undefined。 */
export function companionBeastKind(e: Entry): CompanionBeastKind | undefined {
  if (/魔宠/.test(blockTitle(e.sourceText ?? ""))) return "魔宠";
  const text = e.sourceText ?? "";
  if (/坐骑|骑乘/.test(text)) return "坐骑";
  if (/伙伴/.test(text)) return "伙伴";
  return undefined;
}

/** 列表排序权重：魔宠 → 坐骑 → 伙伴 → 其它（让本体段相关的生物先出现）。 */
export function companionBeastRank(e: Entry): number {
  const kind = companionBeastKind(e);
  return kind ? COMPANION_BEAST_KINDS.indexOf(kind) : COMPANION_BEAST_KINDS.length;
}
