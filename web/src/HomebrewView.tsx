import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "./data/types";
import {
  loadPools,
  createPool,
  togglePoolEnabled,
  deletePool,
  importAsPool,
  copyPool,
  renamePool,
  removeEntryFromAnyPool,
  entryPoolId,
  type HomebrewPool,
} from "./lib/userdata";
import { localStorageUsage, fmtBytes, type StorageUsage } from "./lib/storage";
import {
  createBundle,
  serializeBundle,
  parseBundle,
  validateImport,
  type ConflictStrategy,
  type ImportResult,
  type D4eBundle,
} from "./lib/bundle";
import { FilledButton, FilledSelect, OutlinedButton, SelectOption, TextButton, FilledTextField } from "./components/md";
import SheetDialog from "./components/SheetDialog";
import HomebrewEditor from "./components/HomebrewEditor";
import { CATEGORY_LABELS } from "./data/labels";
import EntryCard from "./sheet/EntryCard";

const MANIFEST_CAT_ORDER = [
  "race", "class", "paragon-path", "epic-destiny", "feat", "power", "equipment",
  "item-set", "ritual", "theme", "domain", "magic-school", "pact", "vice",
  "virtue", "bloodline", "creature", "reference", "dictionary",
];

function download(name: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HomebrewView() {
  const [pools, setPools] = useState<HomebrewPool[]>([]);
  const [poolFilter, setPoolFilter] = useState<string>("all");
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("all");
  const [newPoolName, setNewPoolName] = useState("");

  const [bundled, setBundled] = useState<D4eBundle | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>("copy");
  const [importName, setImportName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const [renamingPool, setRenamingPool] = useState<string | null>(null);
  const [renamePoolText, setRenamePoolText] = useState("");
  const [usage, setUsage] = useState<StorageUsage>(() => localStorageUsage());

  const refresh = () => {
    setPools(loadPools());
    setUsage(localStorageUsage());
  };
  useEffect(refresh, []);

  // 全部条目（含禁用包，供管理）
  const allEntries = useMemo(() => pools.flatMap((p) => p.entries), [pools]);

  const cats = useMemo(() => {
    const set = new Set<string>();
    for (const e of allEntries) set.add(e.category);
    const list = MANIFEST_CAT_ORDER.filter((c) => set.has(c));
    for (const c of set) if (!list.includes(c)) list.push(c);
    return list;
  }, [allEntries]);

  const visible = useMemo(() => allEntries.filter((e) => (cat === "all" || e.category === cat) && (poolFilter === "all" || entryPoolId(e.id) === poolFilter)), [allEntries, cat, poolFilter]);

  const detail = visible.find((e) => e.id === sel) ?? null;

  function poolNameOf(id: string): string {
    return pools.find((p) => p.id === id)?.name ?? "";
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    e.target.value = "";
    const parsed = parseBundle(text);
    if (!parsed.ok) {
      alert(parsed.error);
      return;
    }
    const r = await validateImport(parsed.bundle.entries, strategy);
    setBundled(parsed.bundle);
    setImportName(parsed.bundle.meta.author ? parsed.bundle.meta.author + " 的资料包" : "导入包");
    setResult(r);
    setConfirmOpen(true);
  }

  async function onChangeStrategy(e: Event) {
    const v = (e.target as HTMLSelectElement).value as ConflictStrategy;
    setStrategy(v);
    if (bundled) setResult(await validateImport(bundled.entries, v));
  }

  function confirmImport() {
    if (!result || !bundled) return;
    importAsPool(importName.trim() || "导入包", bundled.meta.author, result.accepted);
    setConfirmOpen(false);
    setBundled(null);
    setResult(null);
    refresh();
  }

  function exportEntries(name: string, entries: Entry[]) {
    download(name, serializeBundle(createBundle(entries)));
  }

  function createEmpty() {
    const n = newPoolName.trim();
    if (!n) return;
    createPool(n);
    setNewPoolName("");
    refresh();
  }

  function confirmRename() {
    const name = renamePoolText.trim();
    if (renamingPool && name) renamePool(renamingPool, name);
    setRenamingPool(null);
    setRenamePoolText("");
    refresh();
  }

  function duplicatePool(id: string) {
    copyPool(id);
    refresh();
  }

  function exportAll() {
    exportEntries("全部私设.d4e", allEntries);
  }

  return (
    <div className="search-view hb-view">
      <div className="search-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <span className="meta" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span>私设 · 第三方资源包 · 共 {allEntries.length} 条 / {pools.length} 包</span>
          <span className="ls-usage" title={"共 " + usage.keys + " 个存储项，上限约 5MB"}>
            <span className="ls-usage-label">localStorage</span>
            <span className="ls-usage-bar"><span className="ls-usage-fill" style={{ width: Math.max(2, usage.percent) + "%" }} /></span>
            <span className="ls-usage-text">{fmtBytes(usage.used)} / 5 MB（{usage.percent.toFixed(1)}%）</span>
          </span>
        </span>
        <span className="resource-actions">
          <FilledButton onClick={() => { setEditing(null); setEditorOpen(true); }}>新建条目</FilledButton>
          <FilledButton onClick={() => fileInput?.click()}>导入 .d4e</FilledButton>
          <input ref={(el) => setFileInput(el)} type="file" accept=".d4e,.json" onChange={onFile} style={{ display: "none" }} />
          <FilledButton disabled={allEntries.length === 0} onClick={exportAll}>导出全部</FilledButton>
        </span>
      </div>

      {/* 包管理 */}
      <div className="hb-panels">
        <div className="hb-create">
          <FilledTextField value={newPoolName} label="新包名称" onInput={(e) => setNewPoolName((e.target as HTMLInputElement).value ?? "")} />
          <OutlinedButton onClick={createEmpty}>新建包</OutlinedButton>
        </div>
        {pools.length > 0 && (
          <div className="hb-pools">
            {pools.map((p) => (
              <div key={p.id} className={"hb-pool" + (poolFilter === p.id ? " selected" : "")}>
                <span className="hb-pool-toggle" role="switch" aria-checked={p.enabled} title={p.enabled ? "启用（参与渲染）" : "禁用（离线）"} onClick={() => { togglePoolEnabled(p.id); refresh(); }}>
                  <span className={"hb-toggle-dot" + (p.enabled ? " on" : "")} />
                </span>
                <span className="hb-pool-name">
                  {renamingPool === p.id ? (
                    <input
                      className="hb-pool-rename"
                      value={renamePoolText}
                      autoFocus
                      onChange={(e) => setRenamePoolText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") { e.preventDefault(); setRenamingPool(null); setRenamePoolText(""); } }}
                      onBlur={confirmRename}
                    />
                  ) : (
                    <a className="hb-pool-name-link" href="#" onClick={(e) => { e.preventDefault(); setPoolFilter(poolFilter === p.id ? "all" : p.id); }} title={p.enabled ? "启用" : "禁用"}>
                      {p.name}
                      <em>{p.entries.length} 条{p.author ? " · " + p.author : ""}</em>
                    </a>
                  )}
                </span>
                <span className="hb-pool-ops">
                  <TextButton className="hb-edit" onClick={() => exportEntries(p.name + ".d4e", p.entries)}>导出</TextButton>
                  <TextButton className="hb-edit" onClick={() => { setRenamingPool(p.id); setRenamePoolText(p.name); }}>重命名</TextButton>
                  <TextButton className="hb-edit" onClick={() => duplicatePool(p.id)}>复制</TextButton>
                  <TextButton className="hb-del" onClick={() => { if (confirm("删除包「" + p.name + "」？其全部条目将被删除")) { deletePool(p.id); refresh(); } }}>删除</TextButton>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cat-chips">
        <button type="button" className={cat === "all" ? "chip active" : "chip"} onClick={() => { setCat("all"); setSel(null); }}>全部</button>
        {cats.map((k) => (
          <button key={k} type="button" className={cat === k ? "chip active" : "chip"} onClick={() => { setCat(k); setSel(null); }}>{CATEGORY_LABELS[k] ?? k}</button>
        ))}
      </div>

      <div className="split">
        <div className="result-list">
          {visible.map((r) => (
            <div key={r.id} className="hb-row">
              <button type="button" className={"result-item hb-row-main" + (r.id === sel ? " selected" : "")} onClick={() => setSel(r.id)}>
                <span className="result-name">{r.name}{r.nameEn ? " " + r.nameEn : ""}</span>
                <span className="result-cat">{(CATEGORY_LABELS[r.category] ?? r.category)}<em className="hb-pool-tag"> · {poolNameOf(entryPoolId(r.id) ?? "")}</em></span>
              </button>
              <TextButton className="hb-edit" onClick={() => { setEditing(r); setEditorOpen(true); }}>编辑</TextButton>
            </div>
          ))}
          {visible.length === 0 && <p className="hint">还没有私设条目。先「新建包」，再「新建条目」或在导入 .d4e 后选择此包。</p>}
        </div>
        <div className="entry-detail">
          {detail ? (
            <>
              <div className="meta" style={{ marginBottom: 6 }}>
                <TextButton onClick={() => { removeEntryFromAnyPool(detail.id); refresh(); setSel(null); }}>删除此条目</TextButton>
              </div>
              <EntryCard entry={detail} />
            </>
          ) : (
            <p className="hint">选择左侧私设条目查看详情（卡片带有「自制」徽标）。</p>
          )}
        </div>
      </div>

      <SheetDialog
        open={confirmOpen}
        headline="导入 .d4e 为新包"
        sub={bundled ? (bundled.meta.author ?? "未知作者") + " · " + (bundled.meta.exportedAt ?? "").slice(0, 10) : undefined}
        actions={<FilledButton disabled={!result || result.accepted.length === 0} onClick={confirmImport}>导入为包 {result ? result.accepted.length : 0} 条</FilledButton>}
        onClose={() => setConfirmOpen(false)}
      >
        {result && (
          <div className="resource-import">
            <div className="settings-row">
              <span className="field-label">包名</span>
              <FilledTextField value={importName} label="包名称" onInput={(e) => setImportName((e.target as HTMLInputElement).value ?? "")} />
            </div>
            <div className="settings-row">
              <span className="field-label">冲突策略</span>
              <FilledSelect value={strategy} onChange={onChangeStrategy}>
                <SelectOption value="copy">复制为新 ID</SelectOption>
                <SelectOption value="override">覆盖</SelectOption>
                <SelectOption value="keep">保留官方（跳过冲突）</SelectOption>
              </FilledSelect>
            </div>
            <div className="resource-import-summary">
              <span>将通过 <b>{result.accepted.length}</b> 条</span>
              <span>校验失败 <b className="red">{result.rejected.length}</b> 条</span>
              <span>冲突解决 <b>{result.conflicts.length}</b> 条</span>
            </div>
            {result.rejected.length > 0 && (
              <div className="resource-sub block">
                <h4>未通过（需修正后再导入）</h4>
                <ul>
                  {result.rejected.map((r) => (
                    <li key={r.id}><b>{r.id}</b>：{r.reasons.join("；")}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.conflicts.length > 0 && (
              <div className="resource-sub block">
                <h4>冲突处理</h4>
                <ul>
                  {result.conflicts.map((c, i) => (
                    <li key={i}>{c.sourceId}{c.resolvedId !== c.sourceId ? " → " + c.resolvedId : "（" + c.action + "）"}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </SheetDialog>

      <HomebrewEditor open={editorOpen} initial={editing} onClose={() => setEditorOpen(false)} onSaved={() => { refresh(); setSel(null); }} />
    </div>
  );
}