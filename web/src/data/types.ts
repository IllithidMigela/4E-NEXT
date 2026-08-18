export interface Manifest {
  schemaVersion: number;
  generatedAt: string;
  total: number;
  categories: Record<string, { count: number; file: string }>;
}

export interface SearchEntry {
  id: string;
  name: string;
  nameEn?: string;
  category: string;
  tags: string[];
  source?: string;
  text: string;
}

export interface LinkRef {
  target: string;
  alias?: string;
}

export interface WikiInfo {
  transclusions: string[];
  links: LinkRef[];
  macros: string[];
  headings: string[];
}

export interface Entry {
  id: string;
  name: string;
  nameEn?: string;
  category: string;
  tags: string[];
  source?: string;
  magazine?: string;
  sourceText: string;
  fields: Record<string, string>;
  wiki: WikiInfo;
  // 分类特定字段（英文规范键）
  usage?: string;
  usageZh?: string;
  powerKind?: string;
  grantedBy?: string;
  powerType?: string;
  actionType?: string;
  keywords?: string;
  range?: string;
  level?: string;
  flavorText?: string;
  details?: string;
  skill?: string;
  tier?: string;
  tierZh?: string;
  prerequisite?: string;
  benefit?: string;
  itemLevel?: string;
  itemCategory?: string;
  itemSuitable?: string;
  rarity?: string;
  rarityEn?: string;
  ritualLevel?: string;
  keySkill?: string;
  ritualCategory?: string;
  size?: string;
  speed?: string;
  vision?: string;
  abilityOne?: string;
  abilityTwo?: string;
  role?: string;
  roleEn?: string;
  powerSource?: string;
  powerSourceEn?: string;
  hybrid?: string;
  terms?: Record<string, string>;
  [key: string]: unknown;
}
