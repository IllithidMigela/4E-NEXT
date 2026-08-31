import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initRipple } from "./lib/ripple";
import { initOverlayLock } from "./lib/overlayLock";
import "./styles.css";
// 增补样式（私设页 v2、导出分组）独立成文件，避免整份覆盖 styles.css 时被一并丢失
import "./styles.extra.css";

initRipple();
initOverlayLock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
