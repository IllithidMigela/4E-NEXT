import { useEffect, useState } from "react";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import CharacterSheet from "./sheet/CharacterSheet";
import SearchView from "./SearchView";
import SettingsView from "./SettingsView";
import LearnView from "./LearnView";
import { loadCards, saveCards, loadActiveId, saveActiveId, uid, type SavedCard } from "./lib/storage";
import { defaultCharacter, migrateCharacter, type Character } from "./sheet/character";
import { TextButton } from "./components/md";
import SheetDialog from "./components/SheetDialog";

type View = "sheet" | "search" | "learn" | "settings";
type Layout = "single" | "double";

// S 曲线羽化：多段渐停近似缓动，底部渐隐更自然
function featherMask(feather: number): string {
  const start = Math.max(0, 100 - feather);
  const b = feather;
  const stops = [
    "black 0%",
    "black " + start + "%",
    "rgba(0, 0, 0, 0.82) " + (start + b * 0.15) + "%",
    "rgba(0, 0, 0, 0.5) " + (start + b * 0.35) + "%",
    "rgba(0, 0, 0, 0.2) " + (start + b * 0.6) + "%",
    "transparent 100%",
  ];
  return "linear-gradient(to bottom, " + stops.join(", ") + ")";
}

function Shell() {
  const { bgImage, bgBlur, bgFeather } = useTheme();
  const [view, setView] = useState<View>("sheet");
  const [layout, setLayout] = useState<Layout>(() => (localStorage.getItem("kcc-layout") !== "single" ? "double" : "single"));
  const [mode, setMode] = useState<"edit" | "render">("edit");
  const [cards, setCards] = useState<SavedCard[]>(() => {
    const loaded = loadCards().map((card) => ({ ...card, char: migrateCharacter(card.char) }));
    if (loaded.length > 0) return loaded;
    const first: SavedCard = { id: uid(), name: "角色 1", char: defaultCharacter(), updatedAt: Date.now() };
    saveCards([first]);
    return [first];
  });
  const [activeId, setActiveId] = useState<string>(() => loadActiveId() ?? cards[0]?.id ?? "");
  const [char, setChar] = useState<Character>(() => cards.find((c) => c.id === activeId)?.char ?? defaultCharacter());
  const [cardOpen, setCardOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  // 自动保存：char 变更防抖写回当前卡
  useEffect(() => {
    const t = setTimeout(() => {
      setCards((p) => {
        const next = p.map((c) => (c.id === activeId ? { ...c, char, updatedAt: Date.now() } : c));
        saveCards(next);
        return next;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [char, activeId]);

  function toggleLayout() {
    setLayout((p) => {
      const next = p === "single" ? "double" : "single";
      localStorage.setItem("kcc-layout", next);
      return next;
    });
  }

  function switchCard(id: string) {
    const target = cards.find((c) => c.id === id);
    if (!target) return;
    setChar(target.char);
    setActiveId(id);
    saveActiveId(id);
    setCardOpen(false);
  }

  function newCard() {
    const card: SavedCard = { id: uid(), name: "角色 " + (cards.length + 1), char: defaultCharacter(), updatedAt: Date.now() };
    const next = [...cards, card];
    setCards(next);
    saveCards(next);
    setChar(card.char);
    setActiveId(card.id);
    saveActiveId(card.id);
    setCardOpen(false);
  }

  function deleteCard(id: string) {
    if (cards.length <= 1) return;
    const rest = cards.filter((c) => c.id !== id);
    setCards(rest);
    saveCards(rest);
    if (activeId === id) {
      const next = rest[0];
      setChar(next.char);
      setActiveId(next.id);
      saveActiveId(next.id);
    }
    if (renamingId === id) setRenamingId(null);
  }

  function saveCardNow(id: string) {
    setCards((p) => {
      const next = p.map((c) => (c.id === id ? { ...c, char: id === activeId ? char : c.char, updatedAt: Date.now() } : c));
      saveCards(next);
      return next;
    });
  }

  function confirmRename() {
    const name = renameText.trim();
    if (renamingId && name) {
      setCards((p) => {
        const next = p.map((c) => (c.id === renamingId ? { ...c, name } : c));
        saveCards(next);
        return next;
      });
    }
    setRenamingId(null);
  }

  const bgStyle = bgImage
    ? {
        backgroundImage: "url(" + bgImage + ")",
        filter: "blur(" + bgBlur + "px) saturate(1.05)",
        WebkitMaskImage: featherMask(bgFeather),
        maskImage: featherMask(bgFeather),
      }
    : undefined;

  return (
    <div className="app">
      {bgImage && <div className="bg-layer" style={bgStyle} />}
      <nav className="side-bar">
        <button type="button" className={view === "sheet" ? "side-btn active" : "side-btn"} title="车卡" onClick={() => setView("sheet")}><span className="material-symbols-outlined">person</span><span className="sb-label">车卡</span></button>
        <button type="button" className="side-btn" title="人物卡" onClick={() => setCardOpen(true)}><span className="material-symbols-outlined">folder</span><span className="sb-label">角色</span></button>
        <button type="button" className={view === "search" ? "side-btn active" : "side-btn"} title="词条" onClick={() => setView("search")}><span className="material-symbols-outlined">search</span><span className="sb-label">词条</span></button>
        <button type="button" className={view === "learn" ? "side-btn active" : "side-btn"} title="规则" onClick={() => setView("learn")}><span className="material-symbols-outlined">school</span><span className="sb-label">规则</span></button>
        <button type="button" className={view === "settings" ? "side-btn active" : "side-btn"} title="设置" onClick={() => setView("settings")}><span className="material-symbols-outlined">settings</span><span className="sb-label">设置</span></button>
        <div className="rail-spacer" />
        <div className="side-sep" />
        <button type="button" className="side-btn" title={mode === "edit" ? "切换到渲染模式" : "切换到编辑模式"} onClick={() => setMode((m) => (m === "edit" ? "render" : "edit"))}><span className="material-symbols-outlined">{mode === "edit" ? "edit" : "lock"}</span><span className="sb-label">{mode === "edit" ? "编辑" : "渲染"}</span></button>
        <button type="button" className="side-btn" title={layout === "single" ? "切换到双栏布局" : "切换到单栏布局"} onClick={toggleLayout}><span className="material-symbols-outlined">{layout === "single" ? "view_module" : "view_agenda"}</span><span className="sb-label">{layout === "single" ? "双栏" : "单栏"}</span></button>
        <div className="rail-version">v{__APP_VERSION__}A</div>
      </nav>
      <main className="content">
        <div className="view-anim" key={view}>
          {view === "sheet" && <CharacterSheet layout={layout} mode={mode} char={char} setChar={setChar} />}
          {view === "search" && <SearchView />}
          {view === "learn" && <LearnView />}
          {view === "settings" && <SettingsView />}
        </div>
      </main>
      {cardOpen && (
        <SheetDialog open headline="人物卡" onClose={() => setCardOpen(false)} actions={<TextButton onClick={newCard}>＋ 新建人物卡</TextButton>}>
          <div className="preset-list">
            {cards.map((c) => (
              <div key={c.id} className={c.id === activeId ? "card-row active" : "card-row"}>
                <div className="card-row-main">
                  {renamingId === c.id ? (
                    <input className="card-rename-input" value={renameText} autoFocus onChange={(e) => setRenameText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); } }} onBlur={() => setRenamingId(null)} />
                  ) : (
                    <button type="button" className="card-row-name" onClick={() => switchCard(c.id)} title="切换到这张卡">
                      <span className="preset-name">{c.name}{c.id === activeId ? "（当前）" : ""}</span>
                      <span className="preset-label">Lv{c.char.level} · {new Date(c.updatedAt).toLocaleString("zh-CN")}</span>
                    </button>
                  )}
                </div>
                <div className="card-row-btns">
                  <button type="button" className="crop-btn" onClick={() => saveCardNow(c.id)}>保存</button>
                  <button type="button" className="crop-btn" onClick={() => { setRenamingId(c.id); setRenameText(c.name); }}>重命名</button>
                  {cards.length > 1 && <button type="button" className="crop-btn crop-danger" onClick={() => deleteCard(c.id)}>删除</button>}
                </div>
              </div>
            ))}
          </div>
          <p className="preset-hint">改动自动保存到本机（localStorage）；保存按钮立即写入，重命名回车确认 / Esc 取消。</p>
        </SheetDialog>
      )}
    </div>
  );
}

export default function App() {
  return <ThemeProvider><Shell /></ThemeProvider>;
}