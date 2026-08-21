import type { Entry } from "../data/types";
import { uid } from "./storage";

// 个人资源池存储层：以「包」为存储单元（.d4e 资源包）。
// 每个包：{ id, name, author, enabled, createdAt, updatedAt, entries }。
// - enabled 的包参与 loaders 合并（可渲染/可搜索），禁用的包保留但离线。
// - 官方 canonical 层只读；用户层独立存储（此处暂用 localStorage，条目量大后可迁 IndexedDB）。

export interface HomebrewPool {
  id: string;
  name: string;
  author?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  entries: Entry[];
}

const POOLS_KEY = "kcc.homebrewPools.v1";
// 旧扁平存储（Phase C 早期版本），用于一次性迁移。
const LEGACY_KEY = "kcc.userEntries.v1";

function isEntryLike(e: unknown): e is Entry {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.category === "string" &&
    Array.isArray(o.tags)
  );
}

function isPool(p: unknown): p is HomebrewPool {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    typeof o.enabled === "boolean" &&
    Array.isArray(o.entries)
  );
}

export function newPool(name: string, entries: Entry[] = [], author?: string): HomebrewPool {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    author,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    entries: entries.map((e) => ({ ...e, origin: "user" })),
  };
}

function savePools(pools: HomebrewPool[]): void {
  try {
    localStorage.setItem(POOLS_KEY, JSON.stringify(pools));
  } catch {
    // 存储不可用时静默忽略
  }
}

function loadLegacy(): HomebrewPool[] {
  const pools: HomebrewPool[] = [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const ents = arr.filter(isEntryLike);
        if (ents.length) {
          pools.push(newPool("个人池", ents));
          savePools(pools);
          try {
            localStorage.removeItem(LEGACY_KEY);
          } catch {
            /* 忽略 */
          }
        }
      }
    }
  } catch {
    /* 忽略 */
  }
  return pools;
}

/** 读取全部包（含禁用）。不存在则返回 []（并尝试迁移旧扁平数据）。 */
export function loadPools(): HomebrewPool[] {
  try {
    const raw = localStorage.getItem(POOLS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter(isPool);
    }
  } catch {
    /* 走 legacy */
  }
  return loadLegacy();
}

function touch(id: string, pools: HomebrewPool[], entries?: Entry[]): void {
  const p = pools.find((x) => x.id === id);
  if (!p) return;
  if (entries) p.entries = entries.map((e) => ({ ...e, origin: "user" }));
  p.updatedAt = new Date().toISOString();
}

/**
 * 扁平化条目（供 loaders/校验用）。
 * @param includeDisabled 为 true 时含禁用包（冲突检测用）；默认仅 enabled（渲染/搜索用）。
 */
export function loadUserEntries(includeDisabled = false): Entry[] {
  return loadPools()
    .filter((p) => includeDisabled || p.enabled)
    .flatMap((p) => p.entries);
}

export function entryPoolId(id: string): string | undefined {
  for (const p of loadPools()) if (p.entries.some((e) => e.id === id)) return p.id;
  return undefined;
}

export function createPool(name: string, author?: string): HomebrewPool {
  const pools = loadPools();
  const p = newPool(name, [], author);
  pools.push(p);
  savePools(pools);
  return p;
}

/** 写/更新条目到指定包。poolId 为空时落到第一个包（无包则自动建「个人池」）。 */
export function upsertEntryInPool(id: string, entry: Entry, poolId?: string): Entry {
  const pools = loadPools();
  let target = pools.find((p) => p.id === (poolId ?? entryPoolId(id)));
  if (!target) {
    if (pools.length) target = pools[0];
    else {
      target = newPool("个人池");
      pools.push(target);
    }
  }
  const norm = { ...entry, origin: "user" as const };
  const idx = target.entries.findIndex((e) => e.id === id);
  if (idx >= 0) target.entries[idx] = norm;
  else target.entries.push(norm);
  touch(target.id, pools, target.entries);
  savePools(pools);
  return norm;
}

/** 从所有包移除该条目。 */
export function removeEntryFromAnyPool(id: string): HomebrewPool[] {
  const pools = loadPools();
  for (const p of pools) {
    const next = p.entries.filter((e) => e.id !== id);
    if (next.length !== p.entries.length) touch(p.id, pools, next);
  }
  savePools(pools);
  return pools;
}

export function togglePoolEnabled(id: string): HomebrewPool[] {
  const pools = loadPools();
  const p = pools.find((x) => x.id === id);
  if (p) {
    p.enabled = !p.enabled;
    p.updatedAt = new Date().toISOString();
    savePools(pools);
  }
  return pools;
}

export function deletePool(id: string): HomebrewPool[] {
  const pools = loadPools().filter((p) => p.id !== id);
  savePools(pools);
  return pools;
}

export function renamePool(id: string, name: string): HomebrewPool[] {
  const pools = loadPools();
  const p = pools.find((x) => x.id === id);
  if (p && name.trim()) {
    p.name = name.trim();
    p.updatedAt = new Date().toISOString();
    savePools(pools);
  }
  return pools;
}

/** 复制一份包（新 id，可改新名），默认启用。 */
export function copyPool(sourceId: string, newName?: string): HomebrewPool | undefined {
  const pools = loadPools();
  const src = pools.find((p) => p.id === sourceId);
  if (!src) return undefined;
  const name = (newName && newName.trim()) || src.name + " 副本";
  const dup = newPool(name, src.entries, src.author);
  pools.push(dup);
  savePools(pools);
  return dup;
}

/** 导入一份新包（enabled 默认开，立即可见）。 */
export function importAsPool(name: string, author: string | undefined, entries: Entry[]): HomebrewPool {
  const pools = loadPools();
  const p = newPool(name, entries, author);
  pools.push(p);
  savePools(pools);
  return p;
}

/** 供外部（迁移/测试）整体替换。 */
export function replaceAllPools(pools: HomebrewPool[]): void {
  savePools(pools.map((p) => ({ ...p, entries: p.entries.map((e) => ({ ...e, origin: "user" })) })));
}