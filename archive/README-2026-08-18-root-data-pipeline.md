# D&D 4E 车卡器 · 数据管线

从中文社区 TiddlyWiki 单文件 HTML（TW5 JSON store）无损提取全部 tiddler，按 D&D 4E 规则分类清洗为规范化 JSON，并生成前端可加载的索引与分类文件。

## 已定稿约定

- 前端：暂不实现，先只做数据管线。
- 输出键语言：英文规范键 + 中文原文标签（sourceText 保留原始正文溯源）。
- 内容范围：PC 内容 + 术语/规则条目 + 生物（一并进前端）。
- 完整解析 wiki 正文：转写 {{}}、链接 [[]]、宏 <<>>、标题。

## 技术栈

- TypeScript（Node 26）：tsc 编译为 ESM 后由 node 运行（纯 JS，沙箱内可运行）。
- zod（schema 定义）。源为 JSON store，未直接依赖 cheerio 解析 HTML。
- 不用 tsx/esbuild：esbuild 需以管道 stdio 派生原生二进制子进程，会被沙箱拦截（spawn EPERM）。

## 命令

- pnpm extract       无损提取全部 tiddler → out/raw/tiddlers-raw.jsonl
- pnpm classify      按 4E 规则 + 标签/字段分类 → out/categories/_classification.json
- pnpm normalize     字段映射 + wiki 正文解析 → out/categories/*.json
- pnpm index         生成 manifest + 搜索索引 + 反向关系 → out/index/
- pnpm run profile   字段值分布审计（QA） → out/categories/_audit.json
- pnpm pipeline      一键：extract → classify → normalize → index

（注：profile/audit 与 pnpm 内置命令同名，需用 pnpm run profile）

## 分类（21 类）

race / class / paragon-path / epic-destiny / feat / power / equipment / item-set /
ritual / theme / domain / magic-school / pact / vice / virtue / bloodline / creature /
reference（术语/规则）/ nav（导航，供前端忽略）/ dictionary（译名字典，含 terms 表）
（meta 与 unknown 为系统/贡献者/图片/CSS，已丢弃）

## 输出结构

out/
  raw/tiddlers-raw.jsonl            无损层（溯源）
  categories/*.json                 归一化层（sourceText + fields 溯源 + wiki 解析）
  categories/_classification.json   分类报告
  categories/_audit.json            字段值分布审计
  index/manifest.json               索引清单（计数 + 文件映射）
  index/search-index.json           搜索索引（id/name/nameEn/category/tags/source/text）
  index/relations.json              反向关系（powerByGrantedBy：来源 → 威能 id 列表）
