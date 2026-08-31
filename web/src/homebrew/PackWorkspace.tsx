import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Entry } from "../data/types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "../data/labels";
import { Checkbox, FilledButton, FilledTextField, IconButton, OutlinedButton, Switch, TextButton } from "../components/md";
import EntryCard from "../sheet/EntryCard";
import EntryEditor from "./EntryEditor";
import { downloadText, fmtDate } from "./util";
import { fmtBytes } from "../lib/storage";
import {
  DEFAULT_POOL_ICON,
  POOL_ICONS,
  duplicateEntry,
  loadPool,
  loadPools,
  moveEntriesToPool,
  poolCategoryCounts,
  poolSizeBytes,
  removeEntriesFromAnyPool,
  togglePoolEnabled,
  updatePoolMeta,
  type HomebrewPool,
} from "../lib/userdata";
import { bundleFileName, createBundle, createPoolBundle, serializeBundle } from "../lib/bundle";

// 二级页面：包内工作区。按资源类型分类管理 + 翻页 + 批量操作 + 单包导出。
// 所有「填写 / 选择」都在页面内完成：包资料是内联面板，移动与删除是内联操作条，
// 条目编辑进入三级页面 EntryEditor，不使用弹窗。

type SortMode = "custom" | "name" | "category";
const PAGE_SIZES = [12, 24, 48];

const SORT_LABELS: Record<SortMode, string> = {
  custom: "添加顺序",
  name: "按名称",
  category: "按类型",
};

interface MetaForm {
  name: string;
  author: string;
  version: string;
  description: string;
  icon: string;
}

function metaOf(p: HomebrewPool): MetaForm {
  return {
    name: p.name,
    author: p.author ?? "",
    version: p.version ?? "",
    description: p.description ?? "",
    icon: p.icon || DEFAULT_POOL_ICON,
  };
}

export default function PackWorkspace({
  poolId,
  initialEntryId,
  initialMetaOpen,
  layout,
  onBack,
  onChanged,
}: {
  poolId: string;
  /** 从搜索结果跳转进来时，直接选中并翻到该条目所在页 */
  initialEntryId?: string;
  /** 从包卡片「编辑资料」进来时，直接展开包资料面板 */
  initialMetaOpen?: boolean;
  layout: "single" | "double";
  onBack: () => void;
  onChanged: () => void;
}) {
  const [pool, setPool] = useState<HomebrewPool | undefined>(() => loadPool(poolId));
  const [allPools, setAllPools] = useState<HomebrewPool[]>(() => loadPools());

  const [view, setView] = useState<"list" | "editor">("list");
  const [editing, setEditing] = useState<Entry | null>(null);

  const [cat, setCat] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("custom");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0]);
  const [page, setPage] = useState(() => {
    if (!initialEntryId) return 1;
    const idx = loadPool(poolId)?.entries.findIndex((e) => e.id === initialEntryId) ?? -1;
    return idx >= 0 ? Math.floor(idx / PAGE_SIZES[0]) + 1 : 1;
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(initialEntryId ?? null);

  const [metaOpen, setMetaOpen] = useState(Boolean(initialMetaOpen));
  const [meta, setMeta] = useState<MetaForm>(() => {
    const p = loadPool(poolId);
    return p ? metaOf(p) : { name: "", author: "", version: "", description: "", icon: DEFAULT_POOL_ICON };
  });
  const [movePick, setMovePick] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  function refresh() {
    setPool(loadPool(poolId));
    setAllPools(loadPools());
    onChanged();
  }

  const entries = useMemo(() => pool?.entries ?? [], [pool]);

  const cats = useMemo(() => {
    const counts = pool ? poolCategoryCounts(pool) : [];
    const known = CATEGORY_ORDER.filter((c) => counts.some((x) => x.category === c));
    for (const c of counts) if (!known.includes(c.category)) known.push(c.category);
    return known.map((c) => ({ category: c, count: counts.find((x) => x.category === c)?.count ?? 0 }));
  }, [pool]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = entries.filter((e) => cat === "all" || e.category === cat);
    if (q) {
      list = list.filter((e) =>
        (e.name + " " + (e.nameEn ?? "") + " " + (e.tags ?? []).join(" ") + " " + (e.source ?? "") + " " + (e.sourceText ?? ""))
          .toLowerCase()
          .includes(q),
      );
    }
    if (sort === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
    if (sort === "category") {
      list = [...list].sort(
        (a, b) =>
          (CATEGORY_ORDER.indexOf(a.category) + 1 || 99) - (CATEGORY_ORDER.indexOf(b.category) + 1 || 99) ||
          a.name.localeCompare(b.name, "zh-CN"),
      );
    }
    return list;
  }, [entries, cat, query, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));

  // 筛选条件变化后回到第一页（首个渲染保留跳转带来的初始页码）
  const firstFilterRun = useRef(true);
  useEffect(() => {
    if (firstFilterRun.current) {
      firstFilterRun.current = false;
      return;
    }
    setPage(1);
  }, [cat, query, sort, pageSize]);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const shown = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page, pageSize]);
  const detail = useMemo(() => entries.find((e) => e.id === detailId) ?? null, [entries, detailId]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const pageAllPicked = shown.length > 0 && shown.every((e) => pickedSet.has(e.id));

  if (!pool) {
    return (
      <div className="hb-ws">
        <div className="hb-ws-head">
          <IconButton title="返回资源包列表" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span></IconButton>
          <div className="hb-ws-title"><div className="hb-ws-name">资源包不存在</div></div>
        </div>
        <p className="hint">这个包可能已被删除，请返回列表。</p>
      </div>
    );
  }

  const activePool = pool;

  // 三级页面：条目编辑
  if (view === "editor") {
    return (
      <EntryEditor
        poolId={activePool.id}
        entry={editing}
        defaultCategory={cat === "all" ? undefined : cat}
        layout={layout}
        onBack={() => setView("list")}
        onSaved={(saved, opts) => {
          refresh();
          setDetailId(saved.id);
          if (opts.done) setView("list");
        }}
      />
    );
  }

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function togglePickPage() {
    const ids = shown.map((e) => e.id);
    setPicked((p) => (pageAllPicked ? p.filter((x) => !ids.includes(x)) : [...new Set([...p, ...ids])]));
  }

  function openNew() {
    setEditing(null);
    setView("editor");
  }

  function openEdit(e: Entry) {
    setEditing(e);
    setView("editor");
  }

  function exportPack() {
    downloadText(bundleFileName(activePool.name), serializeBundle(createPoolBundle(activePool)));
  }

  function exportPicked() {
    const list = entries.filter((e) => pickedSet.has(e.id));
    if (list.length === 0) return;
    downloadText(
      bundleFileName(activePool.name + " 节选"),
      serializeBundle(createBundle(list, { name: activePool.name + " 节选", author: activePool.author, description: activePool.description, version: activePool.version, icon: activePool.icon })),
    );
  }

  function confirmDelete() {
    const ids = pendingDelete ?? [];
    if (ids.length === 0) return;
    removeEntriesFromAnyPool(ids);
    setPicked((p) => p.filter((x) => !ids.includes(x)));
    if (detailId && ids.includes(detailId)) setDetailId(null);
    setPendingDelete(null);
    refresh();
  }

  function doDuplicate(id: string) {
    const copy = duplicateEntry(id);
    refresh();
    if (copy) setDetailId(copy.id);
  }

  function doMove(targetId: string) {
    moveEntriesToPool(picked, targetId);
    setPicked([]);
    setMovePick(false);
    refresh();
  }

  function openMeta() {
    setMeta(metaOf(activePool));
    setMetaOpen(true);
  }

  function saveMeta() {
    if (!meta.name.trim()) return;
    updatePoolMeta(activePool.id, meta);
    setMetaOpen(false);
    refresh();
  }

  const otherPools = allPools.filter((p) => p.id !== activePool.id);
  const sizeText = fmtBytes(poolSizeBytes(activePool));
  const deleteNames = (pendingDelete ?? []).map((id) => entries.find((e) => e.id === id)?.name ?? id);

  return (
    <div className={"hb-ws" + (layout === "double" ? " double" : "")}>
      <div className="hb-ws-head">
        <IconButton title="返回资源包列表" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span></IconButton>
        <span className="hb-ws-icon"><span className="material-symbols-outlined">{activePool.icon || DEFAULT_POOL_ICON}</span></span>
        <div className="hb-ws-title">
          <div className="hb-ws-name">
            {activePool.name}
            {activePool.version && <span className="hb-pack-ver">v{activePool.version}</span>}
            {!activePool.enabled && <span className="hb-pack-off">已禁用</span>}
          </div>
          <div className="hb-ws-meta">
            {(activePool.author || "未署名") + " · " + entries.length + " 条 · " + sizeText + " · 更新于 " + fmtDate(activePool.updatedAt)}
          </div>
        </div>
        <div className="hb-ws-ops">
          <span className="hb-ws-switch" title={activePool.enabled ? "启用中：参与渲染与搜索" : "已禁用：保留数据但离线"}>
            <Switch selected={activePool.enabled} onChange={() => { togglePoolEnabled(activePool.id); refresh(); }} />
            <span className="hb-label">{activePool.enabled ? "启用" : "禁用"}</span>
          </span>
          <FilledButton onClick={openNew}>
            <span slot="icon" className="material-symbols-outlined">add</span>
            新建条目
          </FilledButton>
          <OutlinedButton onClick={() => (metaOpen ? setMetaOpen(false) : openMeta())}>{metaOpen ? "收起资料" : "编辑资料"}</OutlinedButton>
          <OutlinedButton onClick={exportPack}>
            <span slot="icon" className="material-symbols-outlined">download</span>
            导出此包
          </OutlinedButton>
        </div>
      </div>

      {/* 包资料：内联面板（不弹窗） */}
      {metaOpen ? (
        <section className="hb-meta-panel">
          <div className="hb-meta-panel-head">
            <h4 className="hb-ed-card-title">包资料</h4>
            <span className="hint">这些信息会展示在私设列表，并随 .d4e 一起导出。</span>
          </div>
          <div className="hb-meta-row">
            <div className="hb-field">
              <span className="hb-label">包名称 *</span>
              <FilledTextField value={meta.name} onInput={(e) => setMeta((m) => ({ ...m, name: (e.target as HTMLInputElement).value ?? "" }))} />
            </div>
            <div className="hb-field">
              <span className="hb-label">作者</span>
              <FilledTextField value={meta.author} placeholder="可选" onInput={(e) => setMeta((m) => ({ ...m, author: (e.target as HTMLInputElement).value ?? "" }))} />
            </div>
            <div className="hb-field">
              <span className="hb-label">版本</span>
              <FilledTextField value={meta.version} placeholder="如 1.0.0" onInput={(e) => setMeta((m) => ({ ...m, version: (e.target as HTMLInputElement).value ?? "" }))} />
            </div>
          </div>
          <div className="hb-field">
            <span className="hb-label">简介</span>
            <textarea
              className="hb-textarea"
              rows={3}
              value={meta.description}
              placeholder="一句话说明这个包提供了什么内容、适用于哪些桌游团。"
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMeta((m) => ({ ...m, description: e.target.value }))}
            />
          </div>
          <div className="hb-field">
            <span className="hb-label">图标</span>
            <div className="hb-icon-picker" role="radiogroup" aria-label="包图标">
              {POOL_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  role="radio"
                  aria-checked={meta.icon === ic}
                  className={"hb-icon-opt" + (meta.icon === ic ? " active" : "")}
                  onClick={() => setMeta((m) => ({ ...m, icon: ic }))}
                >
                  <span className="material-symbols-outlined">{ic}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="hb-meta-panel-ops">
            <TextButton onClick={() => setMetaOpen(false)}>取消</TextButton>
            <FilledButton onClick={saveMeta}>保存资料</FilledButton>
          </div>
        </section>
      ) : (
        activePool.description && <p className="hb-ws-desc">{activePool.description}</p>
      )}

      <div className="hb-ws-tools">
        <div className="cat-chips hb-ws-cats">
          <button type="button" className={cat === "all" ? "chip active" : "chip"} onClick={() => setCat("all")}>
            全部<em className="hb-chip-count">{entries.length}</em>
          </button>
          {cats.map((c) => (
            <button key={c.category} type="button" className={cat === c.category ? "chip active" : "chip"} onClick={() => setCat(c.category)}>
              {CATEGORY_LABELS[c.category] ?? c.category}
              <em className="hb-chip-count">{c.count}</em>
            </button>
          ))}
        </div>
        <div className="hb-ws-filter">
          <FilledTextField value={query} label="在本包内搜索" onInput={(e) => setQuery((e.target as HTMLInputElement).value ?? "")} />
          <span className="hb-sort">
            <span className="hb-label">排序</span>
            {(Object.keys(SORT_LABELS) as SortMode[]).map((m) => (
              <button key={m} type="button" className={"chip mini" + (sort === m ? " active" : "")} onClick={() => setSort(m)}>{SORT_LABELS[m]}</button>
            ))}
          </span>
        </div>
      </div>

      {picked.length > 0 && (
        <div className="hb-bulk">
          <span className="hb-bulk-count">已选 {picked.length} 条</span>
          <TextButton onClick={() => { setPicked([]); setMovePick(false); }}>取消选择</TextButton>
          <TextButton onClick={exportPicked}>导出所选</TextButton>
          <TextButton disabled={otherPools.length === 0} onClick={() => { setMovePick((v) => !v); setPendingDelete(null); }}>移动到…</TextButton>
          <TextButton className="hb-del" onClick={() => { setPendingDelete(picked); setMovePick(false); }}>删除所选</TextButton>
        </div>
      )}

      {/* 移动目标：内联选择（不弹窗） */}
      {movePick && picked.length > 0 && (
        <div className="hb-inline-bar">
          <span className="hb-label">移动 {picked.length} 条到：</span>
          {otherPools.map((p) => (
            <button key={p.id} type="button" className="chip mini" onClick={() => doMove(p.id)}>
              <span className="material-symbols-outlined">{p.icon || DEFAULT_POOL_ICON}</span>
              {p.name}
            </button>
          ))}
          <TextButton onClick={() => setMovePick(false)}>取消</TextButton>
        </div>
      )}

      {/* 删除确认：内联操作条（不弹窗） */}
      {pendingDelete && pendingDelete.length > 0 && (
        <div className="hb-inline-bar danger">
          <span className="material-symbols-outlined">warning</span>
          <span className="hb-inline-text">
            确认删除{pendingDelete.length === 1 ? "「" + deleteNames[0] + "」" : " " + pendingDelete.length + " 条条目"}？删除后不可撤销，建议先导出备份。
          </span>
          <TextButton className="hb-del" onClick={confirmDelete}>确认删除</TextButton>
          <TextButton onClick={() => setPendingDelete(null)}>取消</TextButton>
        </div>
      )}

      <div className="hb-ws-body">
        <div className="hb-ws-list">
          <div className="hb-list-head">
            <label className="hb-check-all">
              <Checkbox checked={pageAllPicked} onChange={togglePickPage} />
              <span className="hb-label">本页全选</span>
            </label>
            <span className="hb-label">
              {filtered.length === 0 ? "无匹配条目" : "第 " + ((page - 1) * pageSize + 1) + "–" + Math.min(page * pageSize, filtered.length) + " 条 / 共 " + filtered.length + " 条"}
            </span>
          </div>

          <div className="hb-entry-list">
            {shown.map((e) => (
              <div key={e.id} className={"hb-entry-row" + (e.id === detailId ? " selected" : "")}>
                <Checkbox checked={pickedSet.has(e.id)} onChange={() => togglePick(e.id)} />
                <button type="button" className="hb-entry-main" onClick={() => setDetailId(e.id)}>
                  <span className="hb-entry-name">{e.name}{e.nameEn ? " " + e.nameEn : ""}</span>
                  <span className="hb-entry-sub">
                    {CATEGORY_LABELS[e.category] ?? e.category}
                    {e.source ? " · " + e.source : ""}
                    {e.tags?.length ? " · " + e.tags.slice(0, 3).join("、") : ""}
                  </span>
                </button>
                <span className="hb-entry-ops">
                  <IconButton title="编辑" onClick={() => openEdit(e)}><span className="material-symbols-outlined">edit</span></IconButton>
                  <IconButton title="复制一份" onClick={() => doDuplicate(e.id)}><span className="material-symbols-outlined">content_copy</span></IconButton>
                  <IconButton title="删除" onClick={() => { setPendingDelete([e.id]); setMovePick(false); }}><span className="material-symbols-outlined">delete</span></IconButton>
                </span>
              </div>
            ))}

            {shown.length === 0 && (
              <div className="hb-empty small">
                <span className="material-symbols-outlined">note_add</span>
                <p className="hb-empty-title">{entries.length === 0 ? "这个包还是空的" : "没有符合条件的条目"}</p>
                <p className="hint">{entries.length === 0 ? "点击右上角「新建条目」开始制作，保存后可连续创建下一条。" : "清除搜索词或切换资源类型标签。"}</p>
              </div>
            )}
          </div>

          <div className="hb-pager">
            <span className="hb-pager-nav">
              <IconButton title="第一页" disabled={page <= 1} onClick={() => setPage(1)}><span className="material-symbols-outlined">first_page</span></IconButton>
              <IconButton title="上一页" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><span className="material-symbols-outlined">chevron_left</span></IconButton>
              <span className="hb-pager-info">第 {page} / {pages} 页</span>
              <IconButton title="下一页" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}><span className="material-symbols-outlined">chevron_right</span></IconButton>
              <IconButton title="最后一页" disabled={page >= pages} onClick={() => setPage(pages)}><span className="material-symbols-outlined">last_page</span></IconButton>
            </span>
            <span className="hb-pager-size">
              <span className="hb-label">每页</span>
              {PAGE_SIZES.map((n) => (
                <button key={n} type="button" className={"chip mini" + (pageSize === n ? " active" : "")} onClick={() => setPageSize(n)}>{n}</button>
              ))}
            </span>
          </div>
        </div>

        <div className="hb-ws-detail">
          {detail ? (
            <>
              <div className="hb-detail-ops">
                <FilledButton onClick={() => openEdit(detail)}>
                  <span slot="icon" className="material-symbols-outlined">edit</span>
                  编辑此条
                </FilledButton>
                <TextButton onClick={() => doDuplicate(detail.id)}>复制</TextButton>
                <TextButton className="hb-del" onClick={() => { setPendingDelete([detail.id]); setMovePick(false); }}>删除</TextButton>
              </div>
              <EntryCard entry={detail} />
            </>
          ) : (
            <div className="hb-empty small">
              <span className="material-symbols-outlined">preview</span>
              <p className="hb-empty-title">条目预览</p>
              <p className="hint">选择左侧条目查看渲染效果（卡片带有「自制」徽标）。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
