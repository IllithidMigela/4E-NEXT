# D&D 4E 车卡器 · 前端

React + Vite + TypeScript + Material Web（MD3）+ material-color-utilities（动态取色）。

## 运行

在仓库根目录执行 pnpm install（monorepo），然后：

  pnpm --filter dnd4e-kcc-web dev        # 开发服务器（端口 5173）
  pnpm --filter dnd4e-kcc-web build      # 生产构建
  pnpm --filter dnd4e-kcc-web typecheck  # 类型检查（tsc --noEmit）

说明：Vite 依赖 esbuild，其原生二进制子进程在 DSH 沙箱内会被拦截（spawn EPERM），
因此 dev/build 需在你本机运行；沙箱内可用 typecheck（纯 tsc）验证类型与逻辑。

## 动态取色（Material You）

- 核心：src/theme.ts —— seedHexToTheme → themeToCssVars → 写 --md-sys-color-* token。
- 三种种子来源（SeedMode）：preset（预设）/ picker（用户自选）/ portrait（从角色立绘图片提取主色，sourceColorFromImage）。
- 明/暗模式切换；token 直接驱动 Material Web 组件（@material/web）。

## 待办（后续轮次）

1. Material Web 组件 React 封装（@lit/react 的 createComponent）。
2. 数据加载：manifest / search-index / 分类 JSON（来自 ../out/）。
3. 车卡器界面：选种族/职业/威能/专长/装备 + 派生属性。