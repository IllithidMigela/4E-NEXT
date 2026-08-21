import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { DATA_DIR, RAW_FILE, CANONICAL_DIR } from "./lib/paths.js";
import { runExtract } from "./etl/extract.js";
import { runClassify } from "./etl/classify.js";
import { runNormalize } from "./etl/normalize.js";
import { runIndex } from "./etl/index.js";
import { runAudit } from "./etl/audit.js";

function findSourceHtml(): string | undefined {
  if (!existsSync(DATA_DIR)) return undefined;
  const files = readdirSync(DATA_DIR).filter((f) => {
    const n = f.toLowerCase();
    return n.endsWith(".html") || n.endsWith(".htm");
  });
  return files[0] ? join(DATA_DIR, files[0]) : undefined;
}

async function cmdExtract(): Promise<void> {
  const src = findSourceHtml();
  if (!src) {
    console.error("[extract] 未找到源文件：请把单文件 HTML 维基放入 data/ 目录");
    process.exitCode = 1;
    return;
  }
  const sum = runExtract(src);
  console.log("[extract] 总 " + sum.total + " | 系统 " + sum.system + " | 内容 " + sum.content);
  console.log("[extract] 已写出: " + RAW_FILE);
}

async function cmdClassify(): Promise<void> {
  const counts = runClassify();
  console.log("[classify] 分类统计:");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log("  " + v + "  " + k);
  }
}

async function cmdNormalize(): Promise<void> {
  const counts = runNormalize();
  console.log("[normalize] 已生成分类 JSON:");
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log("  " + v + "  " + k + ".json");
  }
  const meta = JSON.parse(readFileSync(join(CANONICAL_DIR, "_meta.json"), "utf8")) as {
    schemaVersion: number;
    generatedAt: string;
    initial: boolean;
    changes: { added: number; changed: number; removed: number };
    totals: { count: number; valid: number; invalid: number };
  };
  const c = meta.changes;
  console.log("[canonical] schemaVersion=" + meta.schemaVersion + " 生成于 " + meta.generatedAt);
  console.log("[canonical] " + (meta.initial ? "首次同步" : "增量同步")
    + " 新增 " + c.added + " / 更新 " + c.changed + " / 移除 " + c.removed);
  console.log("[canonical] 校验通过 " + meta.totals.valid + " 条 / 失败 " + meta.totals.invalid + " 条（全量 " + meta.totals.count + "）");
  console.log("[canonical] 已写出 out/canonical/*.jsonl + _meta.json + _changes.json");
}

async function cmdCommit(): Promise<void> {
  if (!existsSync(join(CANONICAL_DIR, "_meta.json"))) {
    console.error("[commit] 缺少 canonical 状态，请先运行 normalize");
    process.exitCode = 1;
    return;
  }
  const meta = JSON.parse(readFileSync(join(CANONICAL_DIR, "_meta.json"), "utf8")) as {
    initial: boolean;
    changes: { added: number; changed: number; removed: number };
  };
  const c = meta.changes;
  // 以「out/ 是否已被 git 跟踪」判定是否需要初始入库（Phase A 产物可能尚未入库）
  let untracked = false;
  try {
    untracked = execSync("git ls-files out/", { encoding: "utf8" }).trim().length === 0;
  } catch {
    untracked = true;
  }
  if (!untracked && c.added === 0 && c.changed === 0 && c.removed === 0) {
    console.log("[commit] 无内容变更，跳过提交");
    return;
  }
  execSync("git add out/", { stdio: "inherit" });
  const label = untracked || meta.initial
    ? "初始导入全部条目"
    : "+" + c.added + " ~" + c.changed + " -" + c.removed;
  execSync('git commit -m "sync: 4e wiki 数据快照 ' + label + '"', { stdio: "inherit" });
  console.log("[commit] 已提交: " + label);
}

async function cmdSync(): Promise<void> {
  await cmdNormalize();
  await cmdCommit();
}

async function cmdProfile(): Promise<void> {
  const { distributions, flags } = runAudit();
  console.log("[profile] 字段值分布（全量见 out/categories/_audit.json）:");
  for (const f of Object.keys(distributions)) {
    const entries = Object.entries(distributions[f]).sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, 15).map(([k, v]) => k + "×" + v).join(", ");
    const more = entries.length > 15 ? " (+" + (entries.length - 15) + " 种)" : "";
    console.log("  [" + f + "] " + entries.length + " 种: " + top + more);
  }
  console.log("[profile] 未映射 usage 值: " + (flags.usage.join(", ") || "无"));
  console.log("[profile] 未映射 tier 值: " + (flags.tier.join(", ") || "无"));
}

async function cmdIndex(): Promise<void> {
  const r = runIndex();
  console.log("[index] manifest: " + r.manifest);
  console.log("[index] search-index: " + r.searchIndex);
  console.log("[index] relations: " + r.relations);
}

async function cmdAll(): Promise<void> {
  await cmdExtract();
  await cmdClassify();
  await cmdNormalize();
  await cmdIndex();
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "all";
  const handlers: Record<string, () => Promise<void>> = {
    extract: cmdExtract,
    profile: cmdProfile,
    classify: cmdClassify,
    normalize: cmdNormalize,
    index: cmdIndex,
    sync: cmdSync,
    commit: cmdCommit,
    all: cmdAll,
  };
  const h = handlers[cmd];
  if (!h) {
    console.error("未知命令: " + cmd + "。用法: pnpm <extract|profile|classify|normalize|index|sync|commit|all>");
    process.exitCode = 1;
    return;
  }
  await h();
}

void main();
