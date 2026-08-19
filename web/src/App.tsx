import { useEffect, useRef, useState } from "react";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import CharacterSheet from "./sheet/CharacterSheet";
import SearchView from "./SearchView";
import SettingsView from "./SettingsView";
import LearnView from "./LearnView";
import ReserveView from "./ReserveView";
import OverviewView from "./OverviewView";
import BackgroundView from "./BackgroundView";
import { loadCards, saveCards, loadActiveId, saveActiveId, uid, type SavedCard } from "./lib/storage";
import { defaultCharacter, migrateCharacter, type Character } from "./sheet/character";
import { TextButton } from "./components/md";
import SheetDialog from "./components/SheetDialog";

type View = "sheet" | "background" | "reserve" | "overview" | "search" | "learn" | "settings";
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
  const importRef = useRef<HTMLInputElement>(null);
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

  // 导出存档：单文件 JSON，包含 人物/储备/速览/背景 四页内容
  function exportSave() {
    const data = {
      app: "dnd4e-kcc",
      format: 1,
      exportedAt: new Date().toISOString(),
      pages: {
        character: char,
        reserve: { spellbook: char.spellbook ?? [], backpack: char.backpack ?? [] },
        overview: {},
        background: char.creation ?? {},
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (char.name || "角色").replace(/[\\/:*?"<>|]/g, "_") + ".d4e.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // 导入存档：解析并覆盖当前卡片（校验格式）
  function importSave(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        const c = data && (data.pages && data.pages.character) ? migrateCharacter(data.pages.character) : null;
        if (!c || data.app !== "dnd4e-kcc") throw new Error("bad");
        setChar(c);
        setCards((p) => {
          const next = p.map((x) => (x.id === activeId ? { ...x, char: c, name: c.name || x.name, updatedAt: Date.now() } : x));
          saveCards(next);
          return next;
        });
      } catch {
        window.alert("导入失败：文件格式不正确（请使用本应用的导出文件）。");
      }
    };
    reader.readAsText(file);
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
        <button type="button" className={view === "sheet" ? "side-btn active" : "side-btn"} title="人物" onClick={() => setView("sheet")}><span className="material-symbols-outlined">person</span><span className="sb-label">人物</span></button>
        <button type="button" className={view === "background" ? "side-btn active" : "side-btn"} title="背景" onClick={() => setView("background")}><span className="material-symbols-outlined">book</span><span className="sb-label">背景</span></button>
        <button type="button" className={view === "reserve" ? "side-btn active" : "side-btn"} title="储备" onClick={() => setView("reserve")}><span className="material-symbols-outlined">inventory_2</span><span className="sb-label">储备</span></button>
        <button type="button" className={view === "overview" ? "side-btn active" : "side-btn"} title="速览" onClick={() => setView("overview")}><span className="material-symbols-outlined">overview</span><span className="sb-label">速览</span></button>
        <div className="side-sep" />
        <button type="button" className="side-btn" title="存档" onClick={() => setCardOpen(true)}><span className="material-symbols-outlined">folder</span><span className="sb-label">存档</span></button>
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
          {view === "reserve" && <ReserveView layout={layout} char={char} setChar={setChar} />}
          {view === "background" && <BackgroundView mode={mode} char={char} setChar={setChar} />}
          {view === "overview" && <OverviewView />}
          {view === "search" && <SearchView />}
          {view === "learn" && <LearnView />}
          {view === "settings" && <SettingsView />}
        </div>
      </main>
      {cardOpen && (
        <SheetDialog open headline="存档" onClose={() => setCardOpen(false)} actions={
          <>
            <input ref={importRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) importSave(f); e.target.value = ""; }} />
            <TextButton onClick={() => importRef.current?.click()}>导入存档</TextButton>
            <TextButton onClick={exportSave}>导出存档</TextButton>
            <TextButton onClick={newCard}>＋ 新建人物卡</TextButton>
          </>
        }>
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

        </SheetDialog>
      )}
    </div>
  );
}

export default function App() {
  return <ThemeProvider><Shell /></ThemeProvider>;
}