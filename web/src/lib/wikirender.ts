// wikitext → HTML 轻量渲染（供角色卡职业能力板块使用，不影响词条查询页）
export function wikiToHtml(text: string, fields: Record<string, string>): string {
  return text
    .replace(/<<[^>]+>>/g, "")
    .replace(/<\$[^>]*\/?>/g, "")
    .replace(/@@\.\w+\s*/g, "")
    .replace(/^@@\s*$/gm, "")
    .replace(/\{\{!!([^}]+)\}\}/g, (_m, n: string) => String(fields[n] ?? ""))
    .replace(/\{\{[^}]+\}\}/g, "") // 剔除 {{标题}} 转clusion（内容在独立词条中）
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/''([^'']*)''/g, "<b>$1</b>")
    .replace(/\/\/([^\/]*)\/\//g, "<i>$1</i>")
    .replace(/^!{3} (.+)$/gm, "<h6>$1</h6>")
    .replace(/^!{2} (.+)$/gm, "<h5>$1</h5>")
    .replace(/^! (.+)$/gm, "<h4>$1</h4>")
    .replace(/^-{3,}\s*$/gm, "<hr/>");
}

// @@.classTrait """...""" 引言块
export function classTraitHtml(text: string): string | undefined {
  const m = text.match(/@@\.classTrait\s+"""([\s\S]*?)"""/);
  return m ? m[1].trim() : undefined;
}

// 职业特性章节：优先「! XX职业特性」标题，其次变体职业的「!! N级：」起始段
export function classFeaturesHtml(text: string): string | undefined {
  // 有后续一级标题：取到下一个「! 」前
  const m = text.match(/^! [^\n]*职业特性[^\n]*\n([\s\S]*?)(?=^! )/m);
  if (m && m[1].trim()) return m[1].trim();
  // 无后续一级标题：取到结尾
  const mEnd = text.match(/^! [^\n]*职业特性[^\n]*\n([\s\S]*)$/m);
  if (mEnd && mEnd[1].trim()) return mEnd[1].trim();
  const m2 = text.match(/^!! [^\n]*\n([\s\S]*?)(?=^! )/m);
  if (m2 && m2[1].trim()) return m2[1].trim();
  const m2End = text.match(/^!! [^\n]*\n([\s\S]*)$/m);
  return m2End && m2End[1].trim() ? m2End[1].trim() : undefined;
}

// 种族 classTrait：剔除「体型/速度/视觉」行（这三个已在角色信息自动填写）
export function raceTraitHtml(text: string): string | undefined {
  const m = text.match(/@@\.classTrait\s+"""([\s\S]*?)"""/);
  if (!m) return undefined;
  const lines = m[1].split("\n").filter((line) => {
    const t = line.trim();
    return !/^''?(体型|速度|视觉)['':：]/.test(t);
  });
  return lines.join("\n").trim();
}

// 种族正文（classTrait 块之后），仅详细模式渲染
export function raceBodyHtml(text: string): string | undefined {
  const m = text.match(/@@\.classTrait\s+"""[\s\S]*?"""/);
  if (!m || m.index === undefined) return undefined;
  const rest = text.slice(m.index + m[0].length).trim();
  return rest.length > 0 ? rest : undefined;
}

// 简略模式：防具擅长 / 武器擅长 / 法器（无法器则不显示）
export function classSummary(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const armor = text.match(/^''?防具擅长[：:]''?\s*([^\n]+)/m);
  if (armor) out.push({ label: "防具擅长", value: armor[1].trim() });
  const weapon = text.match(/^''?武器擅长[：:]''?\s*([^\n]+)/m);
  if (weapon) out.push({ label: "武器擅长", value: weapon[1].trim() });
  const impl = text.match(/^''?法器[：:]''?\s*([^\n]+)/m);
  if (impl) out.push({ label: "法器", value: impl[1].trim() });
  return out;
}

// 典范特性：典范之道的 11 级特性条目（连续多个「!! 11级：」段）
export function paragonFeaturesHtml(text: string): string | undefined {
  const m = text.match(/^!! 11级[^\n]*\n([\s\S]*?)(?=^!! (?!11级)\d+级|^! |$)/m);
  if (m && m[1].trim()) return m[1].trim();
  const m2 = text.match(/^!! [^\n]*\n([\s\S]*)$/m);
  return m2 && m2[1].trim() ? m2[1].trim() : undefined;
}

// 典范正文（详细模式）：剔除 11 级特性段后的其余内容
export function paragonBodyHtml(text: string): string | undefined {
  const m = text.match(/^!! 11级[^\n]*\n[\s\S]*?(?=^!! (?!11级)\d+级|^! |$)/m);
  if (!m || m.index === undefined) {
    const t = text.trim();
    return t.length > 0 ? t : undefined;
  }
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return rest.length > 0 ? rest : undefined;
}

// 天命特性：传奇天命的 21 级特性条目
export function epicFeaturesHtml(text: string): string | undefined {
  const m = text.match(/^!! 21级[^\n]*\n([\s\S]*?)(?=^!! (?!21级)\d+级|^! |$)/m);
  if (m && m[1].trim()) return m[1].trim();
  const m2 = text.match(/^!! [^\n]*\n([\s\S]*)$/m);
  return m2 && m2[1].trim() ? m2[1].trim() : undefined;
}

// 天命正文（详细模式）：剔除 21 级特性段后的其余内容
export function epicBodyHtml(text: string): string | undefined {
  const m = text.match(/^!! 21级[^\n]*\n[\s\S]*?(?=^!! (?!21级)\d+级|^! |$)/m);
  if (!m || m.index === undefined) {
    const t = text.trim();
    return t.length > 0 ? t : undefined;
  }
  const rest = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return rest.length > 0 ? rest : undefined;
}
