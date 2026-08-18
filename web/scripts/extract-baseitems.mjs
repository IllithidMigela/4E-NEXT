// 从 wiki 提取基础武器/护甲表与武器特性定义 → 生成 web/src/lib/baseitems-data.ts
import fs from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const rawPath = join(here, "..", "..", "out", "raw", "tiddlers-raw.jsonl");
const outPath = join(here, "..", "src", "lib", "baseitems-data.ts");

const raws = fs.readFileSync(rawPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const wep = raws.find((t) => t.title === "武器");
const arm = raws.find((t) => t.title === "护甲");
if (!wep || !arm) { console.error("缺少武器/护甲参考页"); process.exit(1); }

function strip(html) {
  return html.replace(/<br[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/\^\^[^\^]*\^\^/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseTables(html) {
  const out = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/g;
  let m;
  while ((m = tableRe.exec(html))) {
    const body = m[1];
    const capM = body.match(/<caption[^>]*>([\s\S]*?)<\/caption>/);
    const rows = [...body.matchAll(/<tr(?: [^>]*)?>([\s\S]*?)<\/tr>/g)];
    const data = [];
    let title = "";
    for (const rm of rows) {
      const rawTds = [...rm[1].matchAll(/<td(?: [^>]*)?>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
      if (rawTds.length < 7) continue;
      if (rm[1].includes("<br")) continue;
      const tds = rawTds.map(strip);
      if (/（(轻甲|重甲)）$/.test(tds[0])) { title = tds[0]; continue; } // 护甲表：表头行作标题
      if (!tds[0] || /^(武器|护甲加值)/.test(tds[0])) continue;
      data.push(tds);
    }
    if (data.length) out.push({ caption: capM ? strip(capM[1]) : "", title, rows: data });
  }
  return out;
}

const weapons = [];
const secRe = /!! (.+?)\n([\s\S]*?)(?=!! |\n! |$)/g;
let sm;
while ((sm = secRe.exec(wep.text))) {
  if (!sm[1].includes("武器")) continue;
  const tables = parseTables(sm[2]);
  for (const t of tables) {
    for (const r of t.rows) {
      const priceM = String(r[4] || "").match(/\d+/);
      weapons.push({
        name: r[0],
        dice: r[2] || "",
        traits: r[6] || "",
        category: sm[1] + "·" + t.caption,
        group: r[7] || "",
        price: priceM ? parseInt(priceM[0], 10) : 0,
      });
    }
  }
}

const armors = [];
for (const t of parseTables(arm.text)) {
  const label = t.title || t.caption;
  if (!/（(轻甲|重甲)）/.test(label)) continue;
  const cat = label.includes("重甲") ? "重甲" : "轻甲";
  for (const r of t.rows) {
    const acM = String(r[1]).match(/\+(\d+)/);
    // 最小增强加值列（r[2]）："—" 为基础护甲，"+N" 为精制品
    const enhM = String(r[2]).match(/\+(\d+)/);
    const special = String(r[7] || "").trim();
    const priceM = String(r[5] || "").match(/\d+/);
    armors.push({
      name: r[0].replace(/ Armor$/i, "").trim(),
      ac: acM ? parseInt(acM[1], 10) : 0,
      category: cat,
      masterwork: !!enhM,
      minEnhance: enhM ? parseInt(enhM[1], 10) : 0,
      special,
      price: priceM ? parseInt(priceM[0], 10) : 0,
    });
  }
}

const defs = {};
const defSec = wep.text.match(/! 武器特性 Weapon Properties[\s\S]*?"""([\s\S]*?)"""/);
if (defSec) {
  const re = /''([^'']+?)：''([\s\S]*?)(?=''[^'']+?：''|"""|$)/g;
  let dm;
  while ((dm = re.exec(defSec[1]))) {
    const name = dm[1].replace(/\s+[A-Za-z][A-Za-z \-]*$/, "").trim();
    defs[name] = dm[2].replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }
}
if (defs["装填"]) { defs["自由装填"] = defs["装填"]; defs["次要装填"] = defs["装填"]; }

console.log("weapons:", weapons.length, "| armors:", armors.length, "| property defs:", Object.keys(defs).length);

const lines = [
  "// 自动生成：基础物品数据（来源：wiki「武器」「护甲」参考页），请勿手改，重新运行 scripts/extract-baseitems.mjs 生成",
  "import type { BaseWeapon, BaseArmor } from \"./baseitems\";",
  "",
  "export const BASE_WEAPONS: BaseWeapon[] = [",
  ...weapons.map((w) => "  { name: " + JSON.stringify(w.name) + ", dice: " + JSON.stringify(w.dice) + ", traits: " + JSON.stringify(w.traits) + ", category: " + JSON.stringify(w.category) + ", group: " + JSON.stringify(w.group) + ", price: " + (w.price ?? 0) + " },"),
  "];",
  "",
  "export const BASE_ARMORS: BaseArmor[] = [",
  ...armors.map((a) => "  { name: " + JSON.stringify(a.name) + ", ac: " + a.ac + ", category: " + JSON.stringify(a.category) + ", masterwork: " + !!a.masterwork + ", minEnhance: " + (a.minEnhance ?? 0) + ", special: " + JSON.stringify(a.special ?? "") + ", price: " + (a.price ?? 0) + " },"),
  "];",
  "",
  "// 武器特性完整定义（来源：wiki「武器」页）",
  "export const PROPERTY_DEFS: Record<string, string> = {",
  ...Object.entries(defs).map(([k, v]) => "  " + JSON.stringify(k) + ": " + JSON.stringify(v) + ","),
  "};",
].join("\n");

fs.writeFileSync(outPath, lines + "\n");
console.log("written:", outPath);
