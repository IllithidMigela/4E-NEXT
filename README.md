# 4E NEXT

面向 D&D 4E 中文社区，基于4e Wiki 数据的网页端车卡器：
完全的 **Google Material Design 3** 设计风格支持

## 1. 仓库结构（pnpm monorepo）

```
.
├── data/4e Wiki.htm            # 数据源：中文社区 TiddlyWiki 单文件 HTML（23MB）
├── src/                        # 数据管线（Node + TypeScript + zod）
│   ├── cli.ts                  # CLI 入口（extract/classify/normalize/index/all/profile）
│   ├── etl/                    # extract → classify → normalize → index 各阶段 + audit
│   ├── schema/raw.ts           # tiddler 原始 schema（zod）
│   └── lib/                    # IO/命名/路径/wiki 文本解析等工具
├── out/                        # 管线输出（raw/categories/index，不入库）
├── web/                        # 前端应用（React 19 + Vite 6 + MD3）
│   ├── public/data/            # 前端数据（由 out/ 同步，manifest/search-index/relations + categories）
│   ├── scripts/copy-data.mjs   # out/ → public/data 同步脚本
│   ├── src/
│   │   ├── App.tsx             # 壳：导航栏（MD3 Navigation Rail）、视图切换、人物卡管理
│   │   ├── ThemeProvider.tsx   # 动态取色上下文（Material You）
│   │   ├── theme.ts            # 种子色 → MD3 Theme → --md-sys-color-* CSS 变量
│   │   ├── styles.css          # 全部自定义样式：MD3 token 层 + 组件样式 + 动效交互层
│   │   ├── components/md.tsx   # @material/web 组件的 React 封装（@lit/react）
│   │   ├── components/SheetDialog.tsx  # 原生 md-dialog 弹窗壳（退出动画 + 关闭按钮）
│   │   ├── sheet/              # 车卡器主体（CharacterSheet、选择器弹窗、词条卡片等）
│   │   ├── SearchView.tsx      # 词条搜索（分类浏览 + 全局搜索）
│   │   ├── LearnView.tsx       # 规则速查（派生公式、购点法、升级表）
│   │   ├── SettingsView.tsx    # 外观设置（动态取色/背景）
│   │   └── lib/                # 基础物品/等级物价/存储/图片/wiki 渲染/水波纹/弹层滚动锁等
│   └── dist/                   # 生产构建产物（相对路径，可直接部署到任意子路径）
└── archive/                    # 历史 README 归档（数据管线版 + 早期前端版）
```

## 2. 技术栈

| 层 | 技术 |
| --- | --- |
| 数据管线 | TypeScript（Node 26）+ zod；tsc 编译为 ESM 后由 node 运行 |
| 前端 | React 19 + Vite 6 + TypeScript 5.7 |
| MD3 组件 | @material/web 2.5.0（官方 Web 组件，内含 tokens v0.192 规范）+ @lit/react 1.0.8 封装 |
| 动态取色 | @material/material-color-utilities 0.3.0（themeFromSourceColor / sourceColorFromImage） |
| 头像裁切 | react-easy-crop 5 |
| 字体 | Chiron Sung HK VF（可变字重）+ Material Symbols Outlined（图标） |

## 3. 数据管线

```bash
pnpm pipeline   # 一键：extract → classify → normalize → index
pnpm extract    # 无损提取全部 tiddler → out/raw/tiddlers-raw.jsonl
pnpm classify   # 按 4E 规则分类 → out/categories/_classification.json
pnpm normalize  # 字段映射 + wiki 正文解析（{{}}/[[link]]/<<宏>>/标题）→ out/categories/*.json
pnpm index      # manifest + 搜索索引 + 反向关系 → out/index/
pnpm run profile  # 字段值分布审计（QA）→ out/categories/_audit.json
```

21 个分类：race / class / paragon-path / epic-destiny / feat / power / equipment /
item-set / ritual / theme / domain / magic-school / pact / vice / virtue / bloodline /
creature / reference / nav / dictionary（meta 与 unknown 为系统条目，已丢弃）。

前端构建前由 `web/scripts/copy-data.mjs` 把 out/ 同步到 web/public/data/。

## 4. 前端架构要点

- **壳（App.tsx）**：左侧固定 Navigation Rail（车卡/角色/词条/规则/设置 + 编辑/渲染切换 + 单双栏切换）；视图切换带 MD3 进入动画；人物卡多卡管理（localStorage 自动保存）。
- **车卡器（CharacterSheet.tsx）**：种族/职业/威能/专长/装备槽位、属性购点、防御/技能/生命派生、升级信息、金钱、语言/行动点等；选择走 PickerModal / ClassPickerModal / PowerSlotPicker 等大弹窗，金钱明细/基础物品/阵营/购点预设等窄弹窗走原生 md-dialog（见 5.6）。
- **渲染模式**：编辑 / 渲染（只读展示）双模式；单栏 / 双栏布局。
- **数据加载**：manifest / search-index / relations 与分类 JSON 按需 fetch（web/public/data/）。

## 5. Material Design 3 设计系统（重点）

**规范来源**：项目已安装的 `@material/web@2.5.0` 自带官方设计 token
（`tokens/_md-sys-motion.scss`、`_md-sys-shape.scss`、`_md-sys-elevation.scss`、
`_md-sys-typescale.scss`，v0.192），所有动效与形状数值直接取自这些规范文件，无需额外下载。

### 5.1 动态取色（Material You）

- 管线：`seedHexToTheme(种子色)` → `themeFromSourceColor` → `themeToCssVars` 把
  Scheme 与扩展 surface 角色写成 `--md-sys-color-*` 变量 → 驱动全部自定义样式与
  @material/web 组件（组件 token 自动继承同名变量）。
- 四种种子来源（SettingsView 切换）：preset（Nord 预设色板）/ picker（自选色）/
  portrait（立绘原图取色，sourceColorFromImage）/ background（背景图取色）。
- 明/暗模式：切换时 `color-scheme` 同步（原生控件/滚动条跟随），surface token 交叉淡化过渡。

### 5.2 Shape 圆角系统

`:root` 定义官方角标，全部组件圆角统一引用：

| token | 值 | 典型应用 |
| --- | --- | --- |
| `--md-sys-shape-corner-extra-small` | 4px | 文本输入框、小数值输入 |
| `--md-sys-shape-corner-small` | 8px | 芯片（chip）、列表行、筛选项 |
| `--md-sys-shape-corner-medium` | 12px | 卡片、区块、弹层卡片 |
| `--md-sys-shape-corner-large` | 16px | （备用） |
| `--md-sys-shape-corner-extra-large` | 28px | 对话框（picker/crop） |
| `--md-sys-shape-corner-full` | 9999px | 药丸按钮、圆形步进器、导航目的地、徽章 |

### 5.3 Motion 动效系统

`:root` 定义官方时长与缓动 token（v0.192）：

| 时长 token | 值 | | 缓动 token | 曲线 |
| --- | --- | --- | --- | --- |
| short1–4 | 50/100/150/200ms | | standard | cubic-bezier(0.2, 0, 0, 1) |
| medium1–4 | 250/300/350/400ms | | standard-accelerate | cubic-bezier(0.3, 0, 1, 1) |
| long1–4 | 450/500/550/600ms | | standard-decelerate | cubic-bezier(0, 0, 0, 1) |
| extra-long1–4 | 700–1000ms | | emphasized | cubic-bezier(0.2, 0, 0, 1) |
| | | | emphasized-accelerate / -decelerate | (0.3, 0, 0.8, 0.15) / (0.05, 0.7, 0.1, 1) |

动画目录（styles.css「MD3 动效与交互层」）：

- **状态层（state layer）**：所有自定义交互元素（button / .compact-row / .portrait-frame）
  的 ::before 覆盖层，hover 8% / 键盘聚焦 10% / 按压 12%（currentColor），
  short2 + standard 缓动淡入淡出。
- **水波纹（ink ripple）**：`src/lib/ripple.ts` 对 document 做 pointerdown 事件委托，
  在自定义按钮/可点击卡片上注入 `.md3-ink` 圆形波纹（scale 0→1 + 淡出，
  long1 + standard）；@material/web 组件（md-*）自带官方水波纹，委托自动跳过；
  main.tsx 启动时 `initRipple()`。
- **对话框**：
  - 窄弹窗（金钱明细/基础物品/阵营/购点预设/人物卡管理）→ 原生 `<md-dialog>`
    （官方打开/关闭动画、32% scrim、Esc/遮罩关闭、内容原生滚动 + 滚动分割线、
    背景由浏览器原生模态锁定）；默认 900px 宽（与威能选择框一致），基础物品选择
    1000px 加宽变体（内容区三列卡片）。
  - 弹窗卡头与威能/物品/专长卡同语言：彩色头 + 右侧小字 meta（基础物品=物品橙
    ITEM_COLOR，其余跟随动态主色），文字用 on-primary 保证明暗模式对比度。
  - 大选择器（PickerModal 等）→ 自定义遮罩 + 容器上移放大
    translateY(24px) scale(0.94)（medium2 + emphasized-decelerate），打开期间由
    `lib/overlayLock.ts` 锁定页面滚动（与原生模态一致）。
- **视图切换**：内容淡入上移 translateY(12px)（medium2 + emphasized-decelerate）。
- **卡片悬停抬升**：可点卡片 hover 时 elevation level1 阴影（MD3 elevated card 反馈）。
- **主题过渡**：明暗/取色切换时全部 surface token 背景 medium2 + standard 交叉淡化。
- **键盘聚焦**：focus-visible 显示 2dp 主色环（outline-offset 2px）+ 状态层 10%。
- **无障碍**：`prefers-reduced-motion: reduce` 时全部动画/过渡压缩到 0.01ms。
- 既有 hover 背景色变化统一加 short2 + standard 过渡，按压反馈符合 MD3 交互节奏。

### 5.4 Elevation 阴影

`:root` 定义官方 level1–5 阴影 token（`--md-sys-elevation-shadow-level1..5`）：
弹层卡片 level2、悬浮预览/对话框 level3、悬停抬升 level1。

### 5.5 例外：官方规则色

威能（随意绿/遭遇红/每日灰/辅助墨）、物品（橙）、专长（蓝）卡头颜色是 D&D 4E
官方规则语义色（`src/lib/colors.ts`），固定不随全局动态取色变化——这是规则可读性
要求，与 MD3 的「语义色不动态化」原则一致。

### 5.6 组件映射（components/md.tsx）

@lit/react 封装的 18 个官方 MD3 Web 组件：Filled/Outlined/Text Button、IconButton、
Filled/Outlined TextField、Filled/Outlined Select、List/ListItem、Switch、Checkbox、
Dialog、Divider、Slider、SelectOption。表单类交互统一使用官方组件（自带 MD3 状态层/
水波纹/动画）；列表、卡片等自定义复合组件使用上文 token + 动效层对齐规范。

**对话框分层**：

| 类型 | 实现 | 说明 |
| --- | --- | --- |
| 窄弹窗（默认 900px / 加宽 1000px） | `components/SheetDialog.tsx` → 官方 `<md-dialog>` | 原生 `<dialog>.showModal()`：顶层居中、原生滚动、焦点圈定、Esc/遮罩关闭、背景模态锁定；彩色卡头与词条卡同语言 |
| 大选择器（900–1000px） | 自定义 `.picker-overlay` + CSS 进入动画 | 保留自定双栏布局（如职业选择的左侧来源导航），打开期间由 overlayLock 锁定背景滚动 |
| 立绘裁切 | 自定义 `.crop-overlay`（react-easy-crop） | 交互式裁切区，同样锁定背景滚动 |

## 6. 命令速查

```bash
# 根目录（monorepo）
pnpm install
pnpm pipeline                              # 数据管线一键
pnpm run profile                           # 数据审计

# 前端
pnpm --filter dnd4e-kcc-web dev            # 开发服务器 http://localhost:5173
pnpm --filter dnd4e-kcc-web typecheck      # tsc --noEmit
pnpm --filter dnd4e-kcc-web build          # copy-data + tsc + vite build → web/dist/
pnpm --filter dnd4e-kcc-web preview        # 本地预览构建产物
```

## 7. 本地开发注意事项

- 仓库为 pnpm workspace（packages: web），依赖安装后 node_modules 在各包内。
- **沙箱限制**：Vite 依赖 esbuild 原生二进制子进程，在 DSH 沙箱内会被拦截
  （spawn EPERM），dev/build 需在本机终端运行；沙箱内可用 typecheck（纯 tsc）验证。
- vite.config.ts 构建产物使用相对路径 `base: "./"`，dist/index.html 可双击打开，
  也兼容部署到任意子路径（如 GitHub Pages 项目页）。
- 数据管线同样为纯 JS（tsc 编译后 node 运行），沙箱内可执行。

## 8. 构建与部署

1. `pnpm pipeline`（或确保 out/ 已就绪）
2. `pnpm --filter dnd4e-kcc-web build` → 产物在 web/dist/（数据已内嵌 public/data/）
3. 部署 web/dist/ 到任意静态托管即可（相对路径，无服务端依赖；localStorage 数据存于用户浏览器）


## 9. 致谢

数据来源：[4e Wiki](https://4e-wiki.netlify.app/)（现任维护者：风之守护）
