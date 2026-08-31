import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Entry } from "./data/types";
import {
  loadPools,
  createPool,
  togglePoolEnabled,
  deletePool,
  importAsPool,
  copyPool,
  updatePoolMeta,
  type HomebrewPool,
} from "./lib/userdata";
import { localStorageBreakdown, type StorageBreakdown } from "./lib/storage";
import {
  bundleFileName,
  createBundle,
  createPoolBundle,
  serializeBundle,
  parseBundle,
  validateImport,
  type ConflictStrategy,
  type ImportResult,
  type D4eBundle,
} from "./lib/bundle";
import { FilledButton, FilledSelect, SelectOption, FilledTextField, TextButton } from "./components/md";
import SheetDialog from "./components/SheetDialog";
import EntryCard from "./sheet/EntryCard";
import { CATEGORY_LABELS } from "./data/labels";
import CachePanel from "./homebrew/CachePanel";
import PackList from "./homebrew/PackList";
import ResourceSearch from "./homebrew/ResourceSearch";
import PackWorkspace from "./homebrew/PackWorkspace";
import PackMetaDialog, { EMPTY_PACK_META, metaToValue, type PackMetaValue } from "./homebrew/PackMetaDialog";
import ConfirmDialog from "./homebrew/ConfirmDialog";
import { downloadText } from "./homebrew/util";

// 私设页（一级）：
//  ① 资源包列表（包名/简介/大小/作者/资源类型速览）+ 底部固定的导入·创建操作条
//  ② 全部资源包的词条/正文搜索栏
//  ③ 浏览器缓存占用板块（与标题同占整行宽度）
// 进入某个包后切换到二级页 PackWorkspace（分类管理 + 翻页 + 批量操作 + 导出）。

export default function HomebrewView({ layout }: { layout: "single" | "double" }) {
  const [pools, setPools] = useState<HomebrewPool[]>([]);
  const [usage, setUsage] = useState<StorageBreakdown>(() => localStorageBreakdown());
  const [openId, setOpenId] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | undefined>(undefined);

  // 导入流程
  const [bundled, setBundled] = useState<D4eBundle | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [strategy, setStrategy] = useState<ConflictStrategy>("copy");
  const [importMeta, setImportMeta] = useState<PackMetaValue>(EMPTY_PACK_META);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 包资料（新建 / 快速编辑外部显示与介绍）
  const [metaOpen, setMetaOpen] = useState(false);
  const [metaMode, setMetaMode] = useState<"create" | "edit">("create");
  const [metaTarget, setMetaTarget] = useState<string | null>(null);
  const [metaInitial, setMetaInitial] = useState<PackMetaValue>(EMPTY_PACK_META);

  const [pendingDelete, setPendingDelete] = useState<HomebrewPool | null>(null);
  const [hit, setHit] = useState<{ entry: Entry; poolId: string } | null>(null);

  const refresh = () => {
    setPools(loadPools());
    setUsage(localStorageBreakdown());
  };
  useEffect(refresh, []);

  const allEntries = useMemo(() => pools.flatMap((p) => p.entries), [pools]);
  const openPool = openId ? pools.find((p) => p.id === openId) : undefined;

  // ===== 导入 =====
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    e.target.value = "";
    const parsed = parseBundle(text);
    if (!parsed.ok) {
      window.alert(parsed.error);
      return;
    }
    const r = await validateImport(parsed.bundle.entries, strategy);
    const meta = parsed.bundle.meta;
    setBundled(parsed.bundle);
    setImportMeta({
      name: meta.name || (meta.author ? meta.author + " 的资源包" : "导入包"),
      author: meta.author ?? "",
      version: meta.version ?? "",
      description: meta.description ?? "",
      icon: meta.icon || "extension",
    });
    setResult(r);
    setImportOpen(true);
  }

  async function onChangeStrategy(e: Event) {
    const v = (e.target as HTMLSelectElement).value as ConflictStrategy;
    setStrategy(v);
    if (bundled) setResult(await validateImport(bundled.entries, v));
  }

  function confirmImport() {
    if (!result || !bundled) return;
    const p = importAsPool(importMeta.name.trim() || "导入包", {
      author: importMeta.author.trim() || undefined,
      description: importMeta.description.trim() || undefined,
      version: importMeta.version.trim() || undefined,
      icon: importMeta.icon,
    }, result.accepted);
    setImportOpen(false);
    setBundled(null);
    setResult(null);
    refresh();
    setOpenEntryId(undefined);
    setOpenId(p.id);
  }

  // ===== 包资料 =====
  function openCreate() {
    setMetaMode("create");
    setMetaTarget(null);
    setMetaInitial({ ...EMPTY_PACK_META, name: "我的私设包 " + (pools.length + 1) });
    setMetaOpen(true);
  }

  function openEditMeta(id: string) {
    const p = pools.find((x) => x.id === id);
    if (!p) return;
    setMetaMode("edit");
    setMetaTarget(id);
    setMetaInitial(metaToValue(p));
    setMetaOpen(true);
  }

  function submitMeta(v: PackMetaValue) {
    if (metaMode === "create") {
      createPool(v.name, { author: v.author, description: v.description, version: v.version, icon: v.icon });
    } else if (metaTarget) {
      updatePoolMeta(metaTarget, v);
    }
    setMetaOpen(false);
    refresh();
  }

  // ===== 导出 =====
  function exportPool(id: string) {
    const p = pools.find((x) => x.id === id);
    if (!p) return;
    downloadText(bundleFileName(p.name), serializeBundle(createPoolBundle(p)));
  }

  function exportAll() {
    downloadText(bundleFileName("全部私设"), serializeBundle(createBundle(allEntries, { name: "全部私设", description: "导出自本浏览器的全部私设资源包" })));
  }

  // ===== 二级页面 =====
  if (openPool) {
    return (
      <div className="search-view hb-view">
        <PackWorkspace
          key={openPool.id}
          poolId={openPool.id}
          initialEntryId={openEntryId}
          layout={layout}
          onBack={() => { setOpenId(null); setOpenEntryId(undefined); refresh(); }}
          onChanged={refresh}
        />
      </div>
    );
  }

  return (
    <div className={"search-view hb-view hb-home" + (layout === "double" ? " double" : "")}>
      {/* 缓存占用：单栏/双栏都占整行宽度 */}
      <CachePanel usage={usage} pools={pools} />

      <div className="hb-home-grid">
        <PackList
          pools={pools}
          onOpen={(id) => { setOpenEntryId(undefined); setOpenId(id); }}
          onEditMeta={openEditMeta}
          onExport={exportPool}
          onDuplicate={(id) => { copyPool(id); refresh(); }}
          onDelete={(id) => setPendingDelete(pools.find((p) => p.id === id) ?? null)}
          onToggle={(id) => { togglePoolEnabled(id); refresh(); }}
          onImport={() => fileRef.current?.click()}
          onCreate={openCreate}
          onExportAll={exportAll}
        />
        <ResourceSearch pools={pools} onOpen={(entry, poolId) => setHit({ entry, poolId })} />
      </div>

      {/* 页脚尾注：居中说明当前加载状况 */}
      <p className="hint hb-foot-note">
        管理浏览器内加载的 .d4e 资源包：{pools.length} 个包 · {allEntries.length} 条资源。启用的包会即时参与词条搜索与角色卡渲染。
      </p>

      <input ref={fileRef} type="file" accept=".d4e,.json" onChange={onFile} style={{ display: "none" }} />

      {/* 导入确认：包资料 + 冲突策略 + 校验结果 */}
      <SheetDialog
        xwide
        open={importOpen}
        headline="导入 .d4e 资源包"
        sub={bundled ? (bundled.meta.author ?? "未知作者") + " · " + (bundled.meta.exportedAt ?? "").slice(0, 10) : undefined}
        actions={<FilledButton disabled={!result || result.accepted.length === 0} onClick={confirmImport}>导入 {result ? result.accepted.length : 0} 条</FilledButton>}
        onClose={() => setImportOpen(false)}
      >
        {result && (
          <div className="resource-import">
            <div className="hb-meta-row">
              <label className="hb-field">
                <span className="hb-label">包名称</span>
                <FilledTextField value={importMeta.name} onInput={(e) => setImportMeta((m) => ({ ...m, name: (e.target as HTMLInputElement).value ?? "" }))} />
              </label>
              <label className="hb-field">
                <span className="hb-label">作者</span>
                <FilledTextField value={importMeta.author} onInput={(e) => setImportMeta((m) => ({ ...m, author: (e.target as HTMLInputElement).value ?? "" }))} />
              </label>
              <label className="hb-field hb-field-narrow">
                <span className="hb-label">版本</span>
                <FilledTextField value={importMeta.version} onInput={(e) => setImportMeta((m) => ({ ...m, version: (e.target as HTMLInputElement).value ?? "" }))} />
              </label>
            </div>
            <label className="hb-field">
              <span className="hb-label">简介</span>
              <textarea className="hb-textarea" rows={3} value={importMeta.description} onChange={(e) => setImportMeta((m) => ({ ...m, description: e.target.value }))} />
            </label>
            <div className="settings-row">
              <span className="field-label">冲突策略</span>
              <FilledSelect value={strategy} onChange={onChangeStrategy}>
                <SelectOption value="copy">复制为新 ID</SelectOption>
                <SelectOption value="override">覆盖</SelectOption>
                <SelectOption value="keep">保留官方（跳过冲突）</SelectOption>
              </FilledSelect>
            </div>
            {bundled?.meta.categories && (
              <div className="hb-pack-cats">
                {Object.entries(bundled.meta.categories).map(([c, n]) => (
                  <span key={c} className="hb-cat-chip">{CATEGORY_LABELS[c] ?? c}<em>{n}</em></span>
                ))}
              </div>
            )}
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

      <PackMetaDialog open={metaOpen} mode={metaMode} initial={metaInitial} onClose={() => setMetaOpen(false)} onSubmit={submitMeta} />

      <ConfirmDialog
        open={pendingDelete !== null}
        headline="删除资源包"
        message={pendingDelete ? "确定删除「" + pendingDelete.name + "」吗？包内 " + pendingDelete.entries.length + " 条资源会一并删除，建议先导出备份。" : ""}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (pendingDelete) deletePool(pendingDelete.id);
          setPendingDelete(null);
          refresh();
        }}
        onClose={() => setPendingDelete(null)}
      />

      {/* 搜索命中：条目预览 + 跳转到所属包 */}
      <SheetDialog
        open={hit !== null}
        headline={hit?.entry.name ?? ""}
        sub={hit ? (CATEGORY_LABELS[hit.entry.category] ?? hit.entry.category) + " · " + (pools.find((p) => p.id === hit.poolId)?.name ?? "") : undefined}
        actions={
          <TextButton
            onClick={() => {
              if (!hit) return;
              setOpenEntryId(hit.entry.id);
              setOpenId(hit.poolId);
              setHit(null);
            }}
          >
            前往所属包编辑
          </TextButton>
        }
        onClose={() => setHit(null)}
      >
        {hit && <EntryCard entry={hit.entry} />}
      </SheetDialog>
    </div>
  );
}
