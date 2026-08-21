import { join } from "node:path";

export const DATA_DIR = join(process.cwd(), "data");
export const OUT_DIR = join(process.cwd(), "out");
export const RAW_DIR = join(OUT_DIR, "raw");
export const CANONICAL_DIR = join(OUT_DIR, "canonical");
export const CATEGORIES_DIR = join(OUT_DIR, "categories");
export const INDEX_DIR = join(OUT_DIR, "index");
export const RAW_FILE = join(RAW_DIR, "tiddlers-raw.jsonl");
