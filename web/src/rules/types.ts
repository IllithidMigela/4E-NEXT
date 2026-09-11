// 万律书速查词条（由仓库根目录 pnpm rules 生成 → web/public/data/rules.json）
export type RuleKind = "rule" | "sidebar" | "power" | "item" | "feat" | "disease" | "glossary" | "faq";

export interface RuleLinkRef {
  target: string;
  alias?: string;
}

export interface RuleEntry {
  id: string;
  title: string;
  titleEn?: string;
  kind: RuleKind;
  chapter?: string;
  section?: string;
  order: number;
  tags: string[];
  /** 万律 wikitext 原文 */
  text: string;
  fields: Record<string, string>;
  headings: string[];
  links: RuleLinkRef[];
  transclusions: string[];
  source?: string;
  termCategory?: string;
}

export interface RuleChapter {
  title: string;
  order: number;
  intro: string;
  sections: { title: string; entries: string[] }[];
}

export interface RulesPayload {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  total: number;
  chapters: RuleChapter[];
  entries: RuleEntry[];
}
