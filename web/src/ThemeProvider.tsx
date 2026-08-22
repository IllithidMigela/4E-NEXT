import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { seedHexToTheme, themeToCssVars, applyCssVars, imageToSeedHex, type SeedMode } from "./theme";
import { downscaleImage } from "./lib/image";

export type BgMode = "off" | "portrait" | "custom";
export type FontMode = "serif" | "sans";

interface ThemeContextValue {
  seedMode: SeedMode;
  seedHex: string;
  presetHex: string;
  portraitHex: string;
  bgHex: string;
  isDark: boolean;
  setSeedMode: (m: SeedMode) => void;
  setSeedHex: (h: string) => void;
  setPresetHex: (h: string) => void;
  setDark: (d: boolean) => void;
  portraitOriginal: string | null;
  portraitCropped: string | null;
  setPortrait: (original: string, cropped: string) => Promise<void>;
  clearPortrait: () => void;
  bgMode: BgMode;
  bgCustom: string | null;
  setBgMode: (m: BgMode) => void;
  setBgCustom: (url: string | null) => void;
  bgImage: string | null;
  bgBlur: number;
  bgFeather: number;
  setBgBlur: (v: number) => void;
  setBgFeather: (v: number) => void;
  fontMode: FontMode;
  setFontMode: (m: FontMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DEFAULT_SEED = "#5e81ac"; // Nord 冰霜

async function extractHexFromUrl(url: string): Promise<string> {
  // 先缩到 512px 内，避免大图 canvas 内存超限
  const small = await downscaleImage(url, 512);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("图片加载失败"));
    img.src = small;
  });
  return imageToSeedHex(img);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [seedMode, setSeedMode] = useState<SeedMode>("preset");
  const [seedHex, setSeedHex] = useState(DEFAULT_SEED);
  const [presetHex, setPresetHex] = useState(DEFAULT_SEED);
  const [portraitHex, setPortraitHex] = useState(DEFAULT_SEED);
  const [bgHex, setBgHex] = useState(DEFAULT_SEED);
  const [isDark, setDark] = useState(false);
  const [portraitOriginal, setPortraitOriginal] = useState<string | null>(null);
  const [portraitCropped, setPortraitCropped] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<BgMode>("off");
  const [bgCustom, setBgCustom] = useState<string | null>(null);
  const [bgBlur, setBgBlur] = useState(2);
  const [bgFeather, setBgFeather] = useState(55);
  const [fontMode, setFontModeState] = useState<FontMode>(() => {
    const saved = localStorage.getItem("kcc.fontMode");
    return saved === "sans" ? "sans" : "serif";
  });

  const bgImage = useMemo(() => {
    if (bgMode === "portrait") return portraitOriginal;
    if (bgMode === "custom") return bgCustom;
    return null;
  }, [bgMode, portraitOriginal, bgCustom]);

  useEffect(() => {
    if (!bgImage) return;
    let cancelled = false;
    void extractHexFromUrl(bgImage)
      .then((h) => { if (!cancelled) setBgHex(h); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, [bgImage]);

  const activeHex = useMemo(() => {
    if (seedMode === "picker") return seedHex;
    if (seedMode === "portrait") return portraitHex;
    if (seedMode === "background") return bgHex;
    return presetHex;
  }, [seedMode, seedHex, portraitHex, bgHex, presetHex]);

  const theme = useMemo(() => seedHexToTheme(activeHex), [activeHex]);

  useEffect(() => {
    applyCssVars(themeToCssVars(theme, isDark));
    // 原生控件（color 选择器、滚动条等）随明暗切换
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [theme, isDark]);

  async function setPortrait(original: string, cropped: string) {
    setPortraitOriginal(original);
    setPortraitCropped(cropped);
    try {
      setPortraitHex(await extractHexFromUrl(original));
    } catch (e) {
      console.error(e);
    }
  }

  function clearPortrait() {
    setPortraitOriginal(null);
    setPortraitCropped(null);
    setPortraitHex(DEFAULT_SEED);
  }

  function setFontMode(m: FontMode) {
    setFontModeState(m);
    try { localStorage.setItem("kcc.fontMode", m); } catch { /* 忽略 */ }
  }

  // 字体切换：html[data-font] 驱动 CSS 变量。
  // 547（无衬线体）的 result.css 自带全局 body 字体规则，切回衬线体时必须移除，
  // 否则其规则会持续把 body/卡片字体覆盖为无衬线体。
  useEffect(() => {
    document.documentElement.dataset.font = fontMode;
    const existing = document.querySelector('link[href*="zeoseven.com/547"]');
    if (fontMode === "sans") {
      if (!existing) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://fontsapi.zeoseven.com/547/main/result.css";
        link.crossOrigin = "anonymous";
        document.head.appendChild(link);
      }
    } else if (existing) {
      existing.remove();
    }
  }, [fontMode]);

  const value: ThemeContextValue = {
    seedMode, seedHex, presetHex, portraitHex, bgHex, isDark,
    setSeedMode, setSeedHex, setPresetHex, setDark,
    portraitOriginal, portraitCropped, setPortrait, clearPortrait,
    bgMode, bgCustom, setBgMode, setBgCustom, bgImage,
    bgBlur, bgFeather, setBgBlur, setBgFeather,
    fontMode, setFontMode,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme 必须在 ThemeProvider 内使用");
  return ctx;
}
