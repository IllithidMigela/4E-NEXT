export type WikiFlavor = "tw5" | "tw2" | "unknown";

export interface FlavorDetection {
  flavor: WikiFlavor;
  signals: string[];
}

/**
 * 探测单文件 HTML 的维基实现版本。
 * TW5 与 TW2 的 storeArea 存储格式不同，解析方式需对应切换。
 * 信号会随真实源文件进一步校准。
 */
export function detectFlavor(html: string): FlavorDetection {
  const signals: string[] = [];

  const tw5Signals = [
    "text/vnd.tiddlywiki",
    "$:/core",
    "$:/boot/boot.js",
    "tiddlywiki-tiddler-store",
    "\"version\":\"5.",
  ];
  const tw2Signals = [
    "<!--{{{",
    "POST-SHADOWAREA",
    "TiddlyWiki Classic",
    "tiddler=",
  ];

  for (const s of tw5Signals) if (html.includes(s)) signals.push("tw5:" + s);
  for (const s of tw2Signals) if (html.includes(s)) signals.push("tw2:" + s);

  const tw5 = signals.filter((s) => s.startsWith("tw5:")).length;
  const tw2 = signals.filter((s) => s.startsWith("tw2:")).length;

  const flavor: WikiFlavor = tw5 > tw2 ? "tw5" : tw2 > tw5 ? "tw2" : "unknown";
  return { flavor, signals };
}
