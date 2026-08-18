import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import pkg from "./package.json";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: { port: 5173 },
  // 仅构建产物使用相对路径（可双击打开 dist/index.html、兼容子路径部署）；dev 保持绝对路径避免白屏
  base: command === "build" ? "./" : "/",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
}));
