import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initRipple } from "./lib/ripple";
import { initOverlayLock } from "./lib/overlayLock";
import "./styles.css";

initRipple();
initOverlayLock();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
