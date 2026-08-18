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