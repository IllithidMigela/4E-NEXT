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

// 典范/天命特性结构化渲染：把连续「!! N级：标题」段拆分为独立特性块（标题 + 正文）
export function featureBlocksHtml(text: string, fields: Record<string, string> = {}): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sections = text.split(/^(?=!! )/m);
  const out: string[] = [];
  for (const sec of sections) {
    const m = sec.match(/^!! (.+?)\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const body = m[2]
      .replace(/^@@\.\w+\s*/gm, "")
      .replace(/^@@\s*$/gm, "")
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/^\s*$/gm, "")
      .trim();
    if (!body) {
      out.push('<div class="pf-item"><div class="pf-title">' + esc(title) + "</div></div>");
      continue;
    }
    const html = wikiToHtml(body, fields).replace(/\n/g, "<br/>");
    out.push('<div class="pf-item"><div class="pf-title">' + esc(title) + '</div><div class="pf-body">' + html + "</div></div>");
  }
  return out.join("");
}

// 结构化解析典范/天命条目：按「!! N级：标题」分段，识别描述正文（@@ 块）与威能引用（{{名}}）
export interface FeatureSection {
  title: string;
  body?: string;
  powerRef?: string;
}
export interface FeatureParse {
  hasTitle: boolean; // 存在 ! 开头标题（{{!!title}} 宏）
  intro?: string; // !! 之前的 @@.indent 引言描述块（已清理标记）
  sections: FeatureSection[];
}
export function parseFeatureSections(text: string): FeatureParse {
  const hasTitle = /^!\{\{!!\w+\}\}\s*$/m.test(text) || /^! .+$/m.test(text);
  const first = text.search(/^!! /m);
  const head = first >= 0 ? text.slice(0, first) : text;
  const rest = first >= 0 ? text.slice(first) : "";
  const introM = head.match(/@@\.\w+\s*([\s\S]*?)^@@/m);
  const intro = introM
    ? introM[1]
        .replace(/^''前提条件[^\n]*\n+/m, "")
        .replace(/^\s*$/gm, "")
        .trim()
    : undefined;
  const out: FeatureSection[] = [];
  const sections = rest.split(/^(?=!! )/m);
  for (const sec of sections) {
    const m = sec.match(/^!! (.+?)\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    let body = m[2].trim();
    const powerM = body.match(/\{\{([^}]+)\}\}/);
    const powerRef = powerM ? powerM[1].trim() : undefined;
    body = body
      .replace(/\{\{[^}]+\}\}/g, "")
      .replace(/^@@\.\w+\s*/gm, "")
      .replace(/^@@\s*$/gm, "")
      .replace(/^\s*$/gm, "")
      .trim();
    out.push({ title, body: body.length > 0 ? body : undefined, powerRef });
  }
  return { hasTitle, intro, sections: out };
}

// —— 职业特性「选择一个」细则 ——
export interface ClassFeatureOption {
  label: string; // 选项名（如「明晰护罩 Mantle of Clarity」）
  desc: string;  // 选项描述（wiki 源文本，渲染前再经 wikiToHtml）
}
export interface ClassFeatureOptionsParse {
  selectable: boolean;   // 是否为「在/从……选择一个」的选择型特性（可交互）
  intro?: string;        // 选项之前的引言（含选择说明，需渲染）
  options: ClassFeatureOption[];
  count?: number;        // 需选择的个数（默认 1；多选型如戏法「获得 4 个」）
}

// 明确的「选择一个」指示语（仅命中明确的建立角色时的选择表述，避免把战斗中的临时抉择/描述性文字误判为可选项）。
// 覆盖：在以下选项中选择 / 从下列契约中选择一种 / 从下列选项中挑选一个 /
// 选择下列(一个)选项 / 选择以下……中(一个) / 获得 N 个(由)你选择的……（戏法/原力协调类）
const CLASS_CHOICE_INSTR =
  /(在(以下|下列)(选项)?中选择|从(所列|下列|以下)[^。！？\n]{0,12}?中(选择|挑选)(一个|一项|一种)?|选择(下列|以下)?(其中|其一|一个|1个|一项|一种)|选择下列(选项|契约)?中?(一个|一项|一种)|选择(下列|以下)[^。！？\n]{0,25}?(中)?(一个|一项|一种)|(选择|挑选)[^。！？\n]{0,10}?(下列|以下)[^。！？\n]{0,18}?[0-9一二三四五六七八九十两]+个|获得[0-9一二三四五六七八九十两]*个?[^。！？\n]{0,12}?(由|你|由你)?选择)/;

// C 形态（[[链接]] 列表选项）额外要求：引言必须引用「下列/以下/所列」的列表，
// 避免把正文中顺带提及的[[链接]]（如混职特性里的交叉引用）误判为选项列表
const C_LINK_INSTR = /(下列|以下|所列)/;

// 从引言中解析「需要选择几个」（如「获得4个」「中的3个威能」），无数字则默认 1。
// 在「选择一个」指示语附近（前16/后50字）查找 N 个，避免引言前段的描述性文字
// （如刺客公会训练的「两个公会会…」）干扰计数。
function parseChoiceCount(intro: string): number {
  const m = CLASS_CHOICE_INSTR.exec(intro);
  const idx = m ? m.index : 0;
  const win = intro.slice(Math.max(0, idx - 16), idx + 50);
  const mm = win.match(/(\d+|[一二三四五六七八九十两]+)\s*个/);
  if (!mm) return 1;
  const s = mm[1];
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const map: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  let sum = 0;
  for (const ch of s) sum += map[ch] ?? 0;
  return sum || 1;
}

// 选取型职业特性：从特性正文中抽出引言与选项列表。
// 选项有三种形态：
//  A. ''选项名：''描述条目（多数职业，如炽念护罩/精通奥术法器）
//  B. !!! 选项名 章节标题（萨满精魂伙伴等，选项是 !!! 标题，块内 ''精魂恩赐：'' 等为重复的子增益）
//  C. [[链接]] 列表（法师戏法/剑法庇护等，选项是一串威能链接，如「从下列…中获得4个由你选择的」）
// 规则：需含明确「选择一个」指示语；若 ''选项：'' 存在重复（子增益重复出现）则改用 !!! 标题作为选项；
// 否则用 ''选项：'' 条目。最终选项数须为 2~16，且指示语在选项之前的引言中。
export function parseClassFeatureOptions(body: string | undefined): ClassFeatureOptionsParse {
  if (!body) return { selectable: false, options: [] };
  // 数据块型特性（如游侠「兽王」的 @@.classTrait 野兽数据）不是简洁选项列表，整体排除，保持文本展示
  if (/@@\.classTrait/.test(body)) return { selectable: false, options: [] };
  // 1. 收集 ''选项名：'' 描述条目
  const labelOpts: { label: string; desc: string; index: number }[] = [];
  const re = /''\s*([^'\n]*?)\s*[：:]\s*''\s*([\s\S]*?)(?=''\s*[^\n]*\s*[：:]\s*''|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const label = m[1].trim();
    const bare = label.replace(/^(增益|随意攻击威能|灵能点|基礎?技能)/, "").trim();
    if (!label || label === "增益" || label.startsWith("增益：") || bare === "" || bare.length === 0) continue;
    labelOpts.push({ label, desc: m[2].trim(), index: m.index });
  }
  // 2. 收集 ''!!! 选项名'' 章节标题（需同时含中文与英文，才是选项而非普通小标题）
  const headOpts: { label: string; index: number }[] = [];
  const hr = /^!!! (.+?)\s*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = hr.exec(body)) !== null) {
    const label = hm[1].trim();
    if (!/[\u4e00-\u9fff]/.test(label) || !/[A-Za-z]/.test(label)) continue;
    headOpts.push({ label, index: hm.index });
  }
  // 2b. 收集行首「//选项名：//」斜体条目（混职督军「督军领导」等），排除通用说明标签（特殊/增益等）
  const slashOpts: { label: string; desc: string; index: number }[] = [];
  const slRe = /(?:^|\n)\/\/\s*([^\/\n]*?)\s*[：:]\s*\/\/\s*([\s\S]*?)(?=(?:^|\n)\/\/\s*[^\/\n]*?\s*[：:]\s*\/\/|$)/g;
  let slm: RegExpExecArray | null;
  while ((slm = slRe.exec(body)) !== null) {
    const label = slm[1].trim();
    if (!label || /^(特殊|增益|注意|规则|前提|说明|基础|额外)$/.test(label)) continue;
    slashOpts.push({ label, desc: slm[2].trim(), index: slm.index });
  }
  // 3. 判定真实选项形态
  let useHeaders = false;
  if (headOpts.length >= 2) {
    const seen = new Set<string>();
    let dup = false;
    for (const o of labelOpts) {
      if (seen.has(o.label)) { dup = true; break; }
      seen.add(o.label);
    }
    useHeaders = dup || labelOpts.length === 0;
  }
  let firstIdx = -1;
  let options: ClassFeatureOption[] = [];
  if (useHeaders) {
    firstIdx = headOpts[0].index;
    options = headOpts.map((h, i) => {
      const nextIdx = i + 1 < headOpts.length ? headOpts[i + 1].index : body.length;
      const nl = body.indexOf("\n", h.index);
      const start = nl >= 0 ? nl + 1 : body.length;
      const desc = body.slice(start, nextIdx).replace(/^\s*$/gm, "").trim();
      return { label: h.label, desc };
    });
  } else if (labelOpts.length >= 2) {
    firstIdx = labelOpts[0].index;
    options = labelOpts.map((o) => ({ label: o.label, desc: o.desc }));
  } else if (slashOpts.length >= 2) {
    // E 形态：行首「//选项名：//」斜体条目作为选项（混职督军「督军领导」）
    firstIdx = slashOpts[0].index;
    options = slashOpts.map((o) => ({ label: o.label, desc: o.desc }));
  }
  if (options.length < 2 || options.length > 16) {
    // 4. C 形态：A/B 不成立时，尝试把正文中的 [[链接]] 列表当作选项（法师戏法、剑法庇护等）
    const linkOpts: { label: string; index: number }[] = [];
    const seenLinks = new Set<string>();
    const lr = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let lm: RegExpExecArray | null;
    while ((lm = lr.exec(body)) !== null) {
      const target = lm[1].trim();
      if (seenLinks.has(target)) continue;
      seenLinks.add(target);
      linkOpts.push({ label: (lm[2] ?? lm[1]).trim(), index: lm.index });
    }
    if (linkOpts.length >= 2 && linkOpts.length <= 16) {
      const firstIdxC = linkOpts[0].index;
      const introC = (firstIdxC > 0 ? body.slice(0, firstIdxC) : "").replace(/^\s*$/gm, "").trim();
      // 需为明确的选择指示语，且引言引用「下列/以下」的链接列表（排除交叉引用的描述性文字）
      if (introC && C_LINK_INSTR.test(introC) && CLASS_CHOICE_INSTR.test(introC)) {
        return {
          selectable: true,
          intro: introC,
          options: linkOpts.map((o) => ({ label: o.label, desc: "" })),
          count: parseChoiceCount(introC),
        };
      }
    }
    // 5. D 形态：「选择 X 或 Y」的两项选择（战士武器天赋/狙击手天赋等，无标准列表结构）
    const orM = body.match(/(?:^|[；。\n])选择\s*([^或。！？\n]{1,12}?)\s*或\s*([^或。！？\n]{1,12}?)([^。！？\n]{0,4})/);
    if (orM) {
      const optA = orM[1].trim();
      const optB = orM[2].trim();
      if (optA && optB && optA !== optB) {
        const introD = (orM.index! > 0 ? body.slice(0, orM.index!) : "").replace(/^\s*$/gm, "").trim();
        return {
          selectable: true,
          intro: introD || undefined,
          options: [{ label: optA, desc: "" }, { label: optB, desc: "" }],
          count: 1,
        };
      }
    }
    // 5b. D-链接形态：「必须选择[[A]]或[[B]]」的威能二选一（混职战魂「灵能防御」）
    const orLinkM = body.match(/必须选择\[\[([^\]]+)\]\]或\[\[([^\]]+)\]\]/);
    if (orLinkM) {
      const optA = orLinkM[1].trim();
      const optB = orLinkM[2].trim();
      if (optA && optB && optA !== optB) {
        const introD = (orLinkM.index! > 0 ? body.slice(0, orLinkM.index!) : "").replace(/^\s*$/gm, "").trim();
        return {
          selectable: true,
          intro: introD || undefined,
          options: [{ label: optA, desc: "" }, { label: optB, desc: "" }],
          count: 1,
        };
      }
    }
    return { selectable: false, options: [] };
  }
  const intro = (firstIdx > 0 ? body.slice(0, firstIdx) : "").replace(/^\s*$/gm, "").trim();
  // 关键：「选择一个」指示语必须出现在选项之前的引言里，
  // 否则只是描述正文里顺带提到「选择」，而非可交互的选项列表
  if (!intro || !CLASS_CHOICE_INSTR.test(intro)) return { selectable: false, options: [] };
  // 若选择指令后直接内联列出选项（如游侠「兽王」：从以下类型中选择：熊，野猪，猫…），
  // 说明真正的选项已写进引言，!!! 标题只是数据小节而非可选项，应整体按文本展示
  if (/选择[：:][^。！？\n]{1,24}?[，、]/.test(intro)) return { selectable: false, options: [] };
  return { selectable: true, intro: intro || undefined, options, count: parseChoiceCount(intro) };
}

// —— 职业特性正文渲染：拆分原始 HTML 块 / [[链接]] / 文本，保留换行 ——
// 原始 HTML 块（如 <table>）整体提取为占位符，避免换行转换破坏其内部结构
function protectHtmlBlocks(text: string): { text: string; blocks: string[] } {
  const blocks: string[] = [];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf("<", i);
    if (lt < 0) { out.push(text.slice(i)); break; }
    // 仅识别完整的开标签
    const om = /^<([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?>/.exec(text.slice(lt));
    if (!om) { out.push(text[lt]); i = lt + 1; continue; }
    const tag = om[1].toLowerCase();
    const openRe = new RegExp("<" + tag + "(?:\\s[^>]*)?>", "i");
    const closeRe = new RegExp("</" + tag + "\\s*>", "i");
    let depth = 1;
    let j = lt + om[0].length;
    let end = -1;
    while (j < text.length) {
      const rest = text.slice(j);
      const o = openRe.exec(rest);
      const c = closeRe.exec(rest);
      const oi = o ? j + o.index : -1;
      const ci = c ? j + c.index : -1;
      if (ci >= 0 && (oi < 0 || ci < oi)) {
        depth--;
        if (depth === 0) { end = j + c!.index + c![0].length; break; }
        j = ci + c![0].length;
      } else if (oi >= 0) {
        depth++;
        j = oi + o![0].length;
      } else break;
    }
    if (end >= 0) {
      blocks.push(text.slice(lt, end));
      out.push("\u0001" + (blocks.length - 1) + "\u0001");
      i = end;
    } else {
      out.push(text[lt]);
      i = lt + 1;
    }
  }
  return { text: out.join(""), blocks };
}

export type WikiBodyToken =
  | { kind: "html"; html: string }          // 原始 HTML 块（表格等）
  | { kind: "link"; target: string; alias: string } // [[目标|别名]] 超链接
  | { kind: "text"; html: string };          // 已转换文本（换行 → <br/>）

// 将职业特性正文拆为 token：原始 HTML 块原样保留；[[链接]] 供 hover 卡片查找；
// 其余文本经 wikiToHtml 渲染并保留换行（<br/>）。
export function tokenizeWikiBody(body: string, fields: Record<string, string>): WikiBodyToken[] {
  const { text, blocks } = protectHtmlBlocks(body);
  const tokens: WikiBodyToken[] = [];
  const linkRe = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) tokens.push({ kind: "text", html: wikiToHtml(text.slice(last, m.index), fields).replace(/\n/g, "<br/>") });
    tokens.push({ kind: "link", target: m[1].trim(), alias: (m[2] ?? m[1]).trim() });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", html: wikiToHtml(text.slice(last), fields).replace(/\n/g, "<br/>") });
  // 还原 HTML 块占位符（同时移除占位符相邻的换行标记）
  for (const t of tokens) {
    if (t.kind === "text") {
      t.html = t.html.replace(/(?:<br\/>\s*)?\u0001(\d+)\u0001(?:\s*<br\/>)?/g, (_a, n: string) => blocks[Number(n)] ?? "");
    }
  }
  return tokens;
}
