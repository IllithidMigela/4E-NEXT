// 轻量 Markdown 渲染（人物背景等自由文本），支持常用语法子集
export function mdToHtml(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\*([^*]+)\*/g, "<i>$1</i>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const lines = src.split("\n");
  const out: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inCode) { out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>"); codeBuf = []; inCode = false; }
      else { closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }
    if (/^#{1,4} /.test(line)) { closeList(); const lv = line.match(/^#+/)![0].length; out.push("<h" + (lv + 2) + ">" + inline(line.slice(lv + 1)) + "</h" + (lv + 2) + ">"); continue; }
    if (/^> /.test(line)) { closeList(); out.push("<blockquote>" + inline(line.slice(2)) + "</blockquote>"); continue; }
    if (/^[-*] /.test(line)) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(line.slice(2)) + "</li>"); continue; }
    if (/^\d+\. /.test(line)) { closeList(); out.push("<p>" + inline(line) + "</p>"); continue; }
    if (/^\s*$/.test(line)) { closeList(); out.push(""); continue; }
    closeList();
    out.push("<p>" + inline(line) + "</p>");
  }
  if (inCode) out.push("<pre><code>" + esc(codeBuf.join("\n")) + "</code></pre>");
  closeList();
  return out.join("\n");
}