import { safeHtml } from "../lib/sanitize";
import { creatureBlockFields, wikiToHtml } from "../lib/wikirender";

/**
 * 怪物 / 生物数据块（4E Wiki 的 <div class=creature> 形态）。
 *
 * 数据本身已经是一张完整卡片——标题栏、双栏数据行、段头、威能都在里面，
 * 所以这里**不再往外包一层卡片壳**：主持页、词条页与生物选择器共用这一个组件，
 * 样式全部来自 .gen-creature-card（styles.extra.css 第 ⑬ 段）。
 *
 * text 由数据管线渲染好（怪物）或取自生物词条正文（生物）。
 * 生物正文的标题行是 `{{!!title}}` 宏，条目自己没带 title 字段，故传 title = 条目名兜底，
 * 否则卡片顶部只剩档位标签（如「魔宠」）而没有名字。
 */
export default function MonsterCard({ text, title, fields }: {
  text: string;
  title?: string;
  fields?: Record<string, string>;
}) {
  return (
    <div
      className="pc-details gen-creature-card"
      dangerouslySetInnerHTML={safeHtml(wikiToHtml(text, title ? creatureBlockFields(title, fields) : fields ?? {}))}
    />
  );
}
