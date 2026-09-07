# 译名字典（dictionary）私设编辑器设计

> 优先级：**P3**（轻量文本）· 状态：**设计完成，待实现**
> 数据依据：`dist/data/categories/dictionary.json`（官方仅 1 条，整部词典为一篇条目）

## 一、卡片结构（右侧预览）

GenericCard 纯文本卡片：头部（名称）+ 正文（整篇词条文本，每行一对 `英文: 中文`）。

## 二、数据模型

| 字段 | 类型 | 现状 | 建议 |
| --- | --- | --- | --- |
| name / nameEn / source | 基本信息 | ✅ | 保持 |
| **terms 词条对** | 结构化列表 | ⏳ 缺失 | **核心新增**：`英文: 中文` 键值对列表 |

官方数据已有 `terms` 字段（如 `Achra: 阿克拉\nBane: 班恩\n…`），当前编辑器未接入。

## 三、设计要点

1. **词条对列表编辑器**（核心）：每行 = 英文输入框 + 中文输入框 + 删除，顶部「＋ 添加词条」；批量粘贴支持（粘贴多行 `英: 中` 自动拆分）。
2. 保存：序列化为 `terms` 字符串（每行一对）；`draftToForm` 逆解析回列表。
3. 正文区隐藏（`WITHOUT_BODY`）——词典正文完全由词条列表派生，避免手写格式错误。
4. 主次分明：基本信息 core；词条列表 core；外观/标签 附加设置。

## 四、解析方式

- `serializeTerms(pairs)` → `"Achra: 阿克拉\nBane: 班恩"`（对齐官方 terms 字段格式）
- `parseTerms(text)` → 键值对数组（按 `: ` 或 `：` 切分，空行过滤）

## 五、实现清单

- [ ] `homebrewSchema.ts`：dictionary 字段区改为 terms 列表（SheetField 新 type `pairs` 或专用组件）
- [ ] `EntryEditor.tsx`：词条对编辑器组件（批量粘贴支持）
- [ ] `buildEntry` / `draftToForm`：terms 双向序列化
- [ ] `CATEGORY_SECTIONS.dictionary`：基本信息 + 词条列表 core；标记 `WITHOUT_BODY`

## 六、开放问题

1. 官方仅 1 条，若用户拆分使用（每条一个词条），terms 与 name 的关系如何呈现？——建议保持整篇单条模型，不做拆分。
