import type { Manifest, SearchEntry, Entry } from "./types";

const BASE = import.meta.env.BASE_URL + "data/";
const cache = new Map<string, unknown>();

async function fetchJson<T>(path: string): Promise<T> {
  const hit = cache.get(path);
  if (hit) return hit as T;
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error("加载失败: " + path + " (" + res.status + ")");
  const data = await res.json();
  cache.set(path, data);
  return data as T;
}

export function loadManifest(): Promise<Manifest> {
  return fetchJson<Manifest>("manifest.json");
}

export function loadSearchIndex(): Promise<SearchEntry[]> {
  return fetchJson<SearchEntry[]>("search-index.json");
}

export function loadRelations(): Promise<{ powerByGrantedBy: Record<string, string[]> }> {
  return fetchJson("relations.json");
}

export function loadCategory(cat: string): Promise<Entry[]> {
  return fetchJson<Entry[]>("categories/" + cat + ".json");
}
