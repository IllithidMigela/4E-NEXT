import type { Character } from "../sheet/character";

export interface SavedCard {
  id: string;
  name: string;
  char: Character;
  updatedAt: number;
}

const CARDS_KEY = "kcc.cards.v1";
const ACTIVE_KEY = "kcc.activeCard.v1";

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function loadCards(): SavedCard[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c && typeof c.id === "string" && c.char && typeof c.name === "string");
  } catch {
    return [];
  }
}

export function saveCards(cards: SavedCard[]): void {
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {
    // 存储不可用时静默忽略
  }
}

export function loadActiveId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveActiveId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // 忽略
  }
}

// localStorage 容量估算：按 UTF-16 码元统计（含 key + value），近似各浏览器配额口径。
const LS_MAX = 5 * 1024 * 1024; // 通用上限约 5MB

export interface StorageUsage {
  used: number;   // 已用字节（UTF-16 码元数）
  total: number;  // 上限
  percent: number; // 0–100
  keys: number;
}

export function localStorageUsage(): StorageUsage {
  let used = 0;
  let keys = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k) ?? "";
      used += k.length + v.length;
      keys++;
    }
  } catch {
    /* ignore */
  }
  return { used, total: LS_MAX, percent: Math.min(100, (used / LS_MAX) * 100), keys };
}

export function fmtBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(2) + " MB";
}