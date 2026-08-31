import { CATEGORY_LABELS } from "../data/labels";
import { FilledButton, OutlinedButton, Switch, TextButton } from "../components/md";
import { fmtBytes } from "../lib/storage";
import { poolCategoryCounts, poolSizeBytes, DEFAULT_POOL_ICON, type HomebrewPool } from "../lib/userdata";
import { fmtDate } from "./util";

// 资源包列表板块：可滚动的包卡片 + 底部固定（不随列表滚动）的导入/创建操作条。

export interface PackListProps {
  pools: HomebrewPool[];
  onOpen: (id: string) => void;
  onEditMeta: (id: string) => void;
  onExport: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onImport: () => void;
  onCreate: () => void;
  onExportAll: () => void;
}

export default function PackList({ pools, onOpen, onEditMeta, onExport, onDuplicate, onDelete, onToggle, onImport, onCreate, onExportAll }: PackListProps) {
  const totalEntries = pools.reduce((n, p) => n + p.entries.length, 0);

  return (
    <section className="hb-sec hb-sec-packs">
      <div className="hb-sec-head">
        <h3 className="hb-sec-title">
          <span className="material-symbols-outlined">inventory_2</span>
          资源包
        </h3>
        <span className="hb-sec-sub">{pools.length} 个包 · {totalEntries} 条资源</span>
      </div>

      <div className="hb-pack-list">
        {pools.map((p) => {
          const cats = poolCategoryCounts(p);
          return (
            <article key={p.id} className={"hb-pack" + (p.enabled ? "" : " off")}>
              <div className="hb-pack-top">
                <span className="hb-pack-icon">
                  <span className="material-symbols-outlined">{p.icon || DEFAULT_POOL_ICON}</span>
                </span>
                <div className="hb-pack-text">
                  <div className="hb-pack-title-row">
                    <button type="button" className="hb-pack-name" title="进入包内编辑" onClick={() => onOpen(p.id)}>{p.name}</button>
                    {p.version && <span className="hb-pack-ver">v{p.version}</span>}
                    {!p.enabled && <span className="hb-pack-off">已禁用</span>}
                  </div>
                  <p className={"hb-pack-desc" + (p.description ? "" : " empty")}>
                    {p.description || "尚未填写简介，点击「编辑资料」补充说明。"}
                  </p>
                  <div className="hb-pack-meta">
                    <span><span className="material-symbols-outlined">person</span>{p.author || "未署名"}</span>
                    <span><span className="material-symbols-outlined">article</span>{p.entries.length} 条</span>
                    <span><span className="material-symbols-outlined">database</span>{fmtBytes(poolSizeBytes(p))}</span>
                    <span><span className="material-symbols-outlined">schedule</span>{fmtDate(p.updatedAt)}</span>
                  </div>
                  <div className="hb-pack-cats">
                    {cats.length === 0 && <span className="hb-cat-chip empty">空包 · 还没有资源</span>}
                    {cats.slice(0, 6).map((c) => (
                      <span key={c.category} className="hb-cat-chip">
                        {CATEGORY_LABELS[c.category] ?? c.category}
                        <em>{c.count}</em>
                      </span>
                    ))}
                    {cats.length > 6 && <span className="hb-cat-chip more">+{cats.length - 6}</span>}
                  </div>
                </div>
                <span className="hb-pack-switch" title={p.enabled ? "启用中：参与渲染与搜索" : "已禁用：保留数据但离线"}>
                  <Switch selected={p.enabled} onChange={() => onToggle(p.id)} />
                </span>
              </div>

              <div className="hb-pack-ops">
                <FilledButton onClick={() => onOpen(p.id)}>
                  <span slot="icon" className="material-symbols-outlined">edit_note</span>
                  管理条目
                </FilledButton>
                <TextButton onClick={() => onEditMeta(p.id)}>编辑资料</TextButton>
                <TextButton onClick={() => onExport(p.id)}>导出</TextButton>
                <TextButton onClick={() => onDuplicate(p.id)}>复制</TextButton>
                <TextButton className="hb-del" onClick={() => onDelete(p.id)}>删除</TextButton>
              </div>
            </article>
          );
        })}

        {pools.length === 0 && (
          <div className="hb-empty">
            <span className="material-symbols-outlined">inventory_2</span>
            <p className="hb-empty-title">浏览器内还没有资源包</p>
            <p className="hint">导入朋友分享的 .d4e 文件，或创建一个属于自己的空包开始制作私设内容。</p>
          </div>
        )}
      </div>

      <div className="hb-sec-foot">
        <FilledButton onClick={onImport}>
          <span slot="icon" className="material-symbols-outlined">upload_file</span>
          导入新包
        </FilledButton>
        <OutlinedButton onClick={onCreate}>
          <span slot="icon" className="material-symbols-outlined">add</span>
          创建新包
        </OutlinedButton>
        <TextButton disabled={totalEntries === 0} onClick={onExportAll}>导出全部</TextButton>
      </div>
    </section>
  );
}
