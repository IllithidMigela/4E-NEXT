# 仪式（ritual）私设编辑器设计

> 优先级：**P2**（头部字段化）· 状态：**设计完成，待实现**
> 数据依据：`dist/data/categories/ritual.json`（官方 162 条）

## 一、卡片结构（右侧预览）

GenericCard 纯文本卡片：头部（名称/仪式等级·类别·关键技能）+ 正文（`<div class=ritualinfo>` 信息行 + 效果）。

官方仪式头部固定结构（实测）：

```
等级：3       材料花费：25gp，和价值20gp的器材
类别：探险    市场价格：125gp
时间：10分钟  关键技能：神秘
```

## 二、数据模型

| 字段 | 类型 | 现状 | 建议 |
| --- | --- | --- | --- |
| ritualLevel 仪式等级 | select | ✅ | 保持 |
| ritualCategory 类别 | select | ✅ | 保持（`RITUAL_CATEGORIES`） |
| keySkill 关键技能 | select | ✅ | 保持 |
| **time 时间** | text | ⏳ 缺失 | **新增**：官方「时间：」行（10分钟/1小时/…） |
| **cost 材料花费** | text | ⏳ 缺失 | **新增**：「材料花费：」行 |
| **marketPrice 市场价格** | text | ⏳ 缺失 | **新增**：「市场价格：」行（可联动等级价） |
| sourceText 正文 | longtext | ✅ | 效果正文 |

## 三、设计要点

1. **头部字段补全**（核心）：`div.ritualinfo` 的六行全部字段化——新增 time / cost / marketPrice 三个 text 字段，与既有 ritualLevel/ritualCategory/keySkill 同面板（「仪式信息」，core）。
2. **联动**：ritualLevel → 市场价格提示（复用 `priceForLevel`，官方价格多为等级价 × 系数）。
3. **官方头部逆解析**：导入官方条目时，从 `div.ritualinfo` 提取六行字段回填表单（`parseRitualInfo`）。
4. 保存：字段序列化回 `div.ritualinfo` 结构（保持官方格式双向对齐）。
5. 主次分明：基本信息 core；仪式信息 core；正文常驻；外观/标签 附加设置。

## 四、解析方式

- `parseRitualInfo(html)`：匹配 `等级/类别/时间/材料花费/市场价格/关键技能` 六个 `<span>` → 字段。
- `serializeRitualInfo(fields)`：反向生成 `div.ritualinfo` 行。

## 五、实现清单

- [ ] homebrewSchema：新增 time/cost/marketPrice 字段 + 仪式信息面板
- [ ] `parseRitualInfo` / `serializeRitualInfo`
- [ ] `draftToForm` 仪式分支：官方头部逆解析回填
- [ ] 等级 → 价格联动提示

## 六、开放问题

1. 材料花费含「和价值XXgp的器材」复合文本，字段是否分拆「花费额 + 器材」？——建议单 text 自由输入，不做复合结构（官方格式多样）。
