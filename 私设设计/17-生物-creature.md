# 生物（creature）私设编辑器设计

> 优先级：**P1**（数据块价值高，可直接驱动战斗模拟器）· 状态：**设计完成，待实现**
> 数据依据：`dist/data/categories/creature.json`（官方 205 条，全部含 `<div class=creature>` 数据块）
> 依赖：PowerBlockEditor 复用 + 装备「威能段编辑器」同构

## 一、卡片结构（右侧预览）

GenericCard（`gen-creature-card`）渲染 `<div class=creature>` 数据块。官方结构（实测）：

```html
<div class=creature>
  <div class="bold font-size-h4 bg-title"><span>哀悼侍女</span><span>召唤生物</span></div>  ← 名称 + 角色
  <div class=bg-title><span>中型 妖精界 类人生物（不死）</span></div>                        ← 体型 源界 类别（标签）
  <div><span>''生命值'' 你的重伤值</span><span>''回复力'' …</span></div>                     ← 双栏数据行
  <div><span>''防御'' …</span><span></span></div>
  <div><span>''速度'' 6</span><span></span></div>
  <div class="bold bg-power">[图标] 闪光姿态✦灵气2</div>                                     ← 特质/行动段头
  <div class=description>…</div>                                                            ← 段描述
  <div class="bold bg-power">[图标] 标准动作（光耀）✦随意</div>
  <div class=description>攻击：近战1（一个生物）；…<br>命中：…</div>
</div>
```

## 二、数据模型

| 字段 | 类型 | 现状 |
| --- | --- | --- |
| name / nameEn / source | 基本信息 | ✅ |
| sourceText 正文 | longtext | ✅（含完整数据块 HTML） |

## 三、设计要点

1. **数据块编辑器**（核心新增）三段：
   - **头部**：角色（标准/精英/独一/下属/召唤生物）+ 体型（微型/小型/中型/大型/超大型）+ 源界（妖精界/元素界/…）+ 类别标签（类人生物（不死）…）——枚举 chip。
   - **数据行**（双栏）：生命值 / 回复力 / 防御 / 速度 / 技能 / 豁免 / 行动点 —— 每行 = 标签 + 值（双列并排，左标签右值）；复用「标签块」模式，行数自由增删。
   - **特质 / 行动 / 灵气段**：段头（动作类型图标 + 名称✦频率）+ 描述——**完全复用装备「威能段编辑器」**（段头 = 动作 chip + 频率 chip + 名称 + 图标自动选择；描述 = 文本区，可含 `<br>` 换行）。
2. **动作段预设**：标准动作 / 次要动作 / 移动动作 / 自由动作 / 借机动作 / 即时中断 / 即时反应 + 灵气/特质——官方动作图标（`{{$:/dnd/images/melee}}` 等）按动作类型自动映射。
3. **频率**：随意 / 遭遇 / 每日（怪物频率同威能三值，可复用）。
4. **官方逆解析**：`parseCreatureBlock(html)` —— bg-title 头部行、双栏数据行、bg-power 段 → 结构化；`serializeCreatureBlock` 反拼装（保持官方 HTML 格式，`gen-creature-card` 渲染不变）。
5. 主次分明：基本信息 core；数据块 core；外观/标签 附加设置。正文区（数据块之外）可隐藏或保留备注。

## 四、解析方式

- `parseCreatureBlock` / `serializeCreatureBlock`：核心新解析器（正则按行类型切分：bg-title / 双栏 div / bg-power + description）。
- 双栏行：`''标签'' 值` 与 `''标签'' 值` 切两列。
- 段头：`[图标] 名称✦频率` 与 `名称（关键词）✦频率` 变体。

## 五、实现清单

- [ ] `parseCreatureBlock` / `serializeCreatureBlock`（homebrewSchema.ts 或独立 creature.ts）
- [ ] 数据块编辑器组件（头部枚举 + 双栏数据行 + 段列表）
- [ ] 动作段预设 + 图标自动映射
- [ ] `draftToForm` 生物分支：官方数据块逆解析回填
- [ ] `buildEntry` 生物分支：数据块序列化

## 六、开放问题

1. 数据块之外的自由正文（非数据块 lore）是否保留 textarea？——建议保留（部分条目数据块外有描述），`WITHOUT_BODY` 不启用。
2. 角色枚举取值集合（标准/精英/独一/下属/召唤生物 + 其他）需从 205 条统计收敛。
