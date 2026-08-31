import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { Entry } from "../data/types";
import { CATEGORY_LABELS } from "../data/labels";
import { FilledButton, FilledTextField, IconButton, OutlinedButton, TextButton } from "../components/md";
import EntryCard from "../sheet/EntryCard";
import { buildEntry, draftToForm, fieldsFor, CATEGORY_LIST, type SheetField } from "../lib/homebrewSchema";
import { wikiToMarkdown } from "../lib/markdown";
import { loadPools, uniqueEntryId, upsertEntryInPool, type HomebrewPool } from "../lib/userdata";

// 三级页面：条目编辑器（整页编辑，不使用弹窗）。
// 左侧表单 / 右侧实时预览；正文为 Markdown，配一排插入按钮，避免记语法。

const DRAFT_KEY = "kcc.homebrewDraft.v1";

function loadDraft(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function saveDraft(form: Record<string, string>) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  } catch {
    /* 忽略 */
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
}

const blank = (cat?: string): Record<string, string> => ({
  name: "",
  nameEn: "",
  category: cat && CATEGORY_LIST.includes(cat) ? cat : CATEGORY_LIST[0],
  tags: "",
  source: "",
  sourceText: "",
  bodyFormat: "md",
});

/** 正文工具栏：[标签, 插入前缀, 插入后缀, 占位文字, 整行插入] */
const TOOLS: { label: string; icon: string; before: string; after: string; sample: string; block?: boolean }[] = [
  { label: "标题", icon: "title", before: "## ", after: "", sample: "小节标题", block: true },
  { label: "加粗", icon: "format_bold", before: "**", after: "**", sample: "重点" },
  { label: "斜体", icon: "format_italic", before: "*", after: "*", sample: "强调" },
  { label: "列表", icon: "format_list_bulleted", before: "- ", after: "", sample: "一条内容", block: true },
  { label: "编号", icon: "format_list_numbered", before: "1. ", after: "", sample: "第一步", block: true },
  { label: "引用", icon: "format_quote", before: "> ", after: "", sample: "风味描述", block: true },
  { label: "表格", icon: "table", before: "| 名称 | 数值 |\n| --- | --- |\n| 示例 | 1d6 |", after: "", sample: "", block: true },
  { label: "分割线", icon: "horizontal_rule", before: "---", after: "", sample: "", block: true },
  { label: "链接", icon: "link", before: "[", after: "](https://)", sample: "链接文字" },
];

export default function EntryEditor({
  poolId,
  entry,
  defaultCategory,
  layout,
  onBack,
  onSaved,
}: {
  poolId: string;
  /** null = 新建 */
  entry: Entry | null;
  defaultCategory?: string;
  layout: "single" | "double";
  onBack: () => void;
  /** done=true 表示保存后应返回列表 */
  onSaved: (saved: Entry, opts: { done: boolean }) => void;
}) {
  const isNew = entry === null;
  const [pools] = useState<HomebrewPool[]>(() => loadPools());
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (entry) return { ...draftToForm(entry), __pool: poolId };
    const draft = loadDraft();
    const base = blank(defaultCategory);
    return {
      ...base,
      ...draft,
      category: defaultCategory && CATEGORY_LIST.includes(defaultCategory) ? defaultCategory : draft.category ?? base.category,
      bodyFormat: "md",
      __pool: poolId,
    };
  });
  const [err, setErr] = useState("");
  const [tip, setTip] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isNew) clearDraft();
  }, [isNew]);

  const fields = useMemo(() => fieldsFor(form.category ?? ""), [form.category]);
  const isLegacyWiki = form.bodyFormat === "wiki";

  function patch(next: Record<string, string>) {
    setForm((prev) => {
      const merged = { ...prev, ...next };
      if (isNew) saveDraft(merged);
      return merged;
    });
    setTip("");
  }

  function set(k: string, v: string) {
    patch({ [k]: v });
  }

  /** 在正文光标处插入 Markdown 片段 */
  function insert(tool: (typeof TOOLS)[number]) {
    const ta = bodyRef.current;
    const val = form.sourceText ?? "";
    if (!ta) {
      set("sourceText", val + (val && !val.endsWith("\n") ? "\n" : "") + tool.before + tool.sample + tool.after);
      return;
    }
    const start = ta.selectionStart ?? val.length;
    const end = ta.selectionEnd ?? start;
    const selected = val.slice(start, end) || tool.sample;
    let head = val.slice(0, start);
    if (tool.block && head && !head.endsWith("\n")) head += "\n";
    const insertText = tool.before + selected + tool.after;
    const next = head + insertText + val.slice(end);
    set("sourceText", next);
    const caret = head.length + tool.before.length;
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(caret, caret + selected.length);
    });
  }

  function toMarkdown() {
    patch({ sourceText: wikiToMarkdown(form.sourceText ?? ""), bodyFormat: "md" });
    setTip("已转换为 Markdown，请检查排版后保存。");
  }

  const previewEntry = useMemo(() => {
    const r = buildEntry({ ...form, name: (form.name ?? "").trim() || "（未命名）" }, entry?.id ?? "preview");
    return r.ok ? r.entry : null;
  }, [form, entry]);

  function save(keepCreating: boolean) {
    const targetId = isNew ? uniqueEntryId((form.name ?? "").trim()) : entry.id;
    const r = buildEntry(form, targetId);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr("");
    const target = form.__pool && pools.some((p) => p.id === form.__pool) ? form.__pool : poolId;
    const saved = upsertEntryInPool(r.entry.id, r.entry, target);
    if (isNew) clearDraft();
    if (keepCreating && isNew) {
      onSaved(saved, { done: false });
      setForm({ ...blank(form.category), __pool: form.__pool ?? poolId });
      setTip("已保存「" + saved.name + "」，可继续创建下一条。");
      requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
      return;
    }
    onSaved(saved, { done: true });
  }

  function renderField(f: SheetField) {
    const val = form[f.key] ?? "";
    if (f.key === "category") {
      return (
        <div key={f.key} className="hb-field">
          <span className="hb-label">资源类型 *</span>
          <div className="cat-chips hb-ed-chips">
            {CATEGORY_LIST.map((c) => (
              <button key={c} type="button" className={"chip mini" + (val === c ? " active" : "")} onClick={() => set("category", c)}>
                {CATEGORY_LABELS[c] ?? c}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.type === "select") {
      return (
        <div key={f.key} className="hb-field">
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <div className="hb-ed-chips">
            {(f.options ?? []).map((o) => (
              <button key={o} type="button" className={"chip mini" + (val === o ? " active" : "")} onClick={() => set(f.key, val === o ? "" : o)}>
                {o}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (f.key === "sourceText") {
      return (
        <div key={f.key} className="hb-field hb-body-field">
          <span className="hb-label">正文</span>
          <div className="hb-md-tools">
            {TOOLS.map((t) => (
              <button key={t.label} type="button" className="hb-md-tool" title={t.label} onClick={() => insert(t)}>
                <span className="material-symbols-outlined">{t.icon}</span>
              </button>
            ))}
          </div>
          <textarea
            ref={bodyRef}
            className="hb-textarea hb-body-textarea"
            value={val}
            rows={16}
            placeholder="在这里写条目正文。支持 Markdown 语法使用。"
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)}
          />
          <span className="hint">支持 Markdown 语法使用。上面一排按钮可直接插入标题、列表、表格等格式。</span>
        </div>
      );
    }
    if (f.type === "longtext") {
      return (
        <div key={f.key} className="hb-field">
          <span className="hb-label">{f.label}</span>
          <textarea
            className="hb-textarea"
            value={val}
            rows={4}
            placeholder={f.placeholder}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)}
          />
        </div>
      );
    }
    return (
      <div key={f.key} className="hb-field">
        <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
        <FilledTextField value={val} placeholder={f.placeholder} onInput={(e) => set(f.key, (e.target as HTMLInputElement).value ?? "")} />
      </div>
    );
  }

  const poolName = pools.find((p) => p.id === (form.__pool ?? poolId))?.name ?? "";
  const basics = fields.filter((f) => ["name", "nameEn", "category", "tags", "source"].includes(f.key));
  const extras = fields.filter((f) => !["name", "nameEn", "category", "tags", "source", "sourceText"].includes(f.key));
  const body = fields.find((f) => f.key === "sourceText");

  return (
    <div className={"hb-editor" + (layout === "double" ? " double" : "")}>
      <div className="hb-ed-head">
        <IconButton title="返回条目列表" onClick={onBack}><span className="material-symbols-outlined">arrow_back</span></IconButton>
        <div className="hb-ed-title">
          <div className="hb-ed-crumb">{poolName}<span className="material-symbols-outlined">chevron_right</span>{isNew ? "新建条目" : "编辑条目"}</div>
          <div className="hb-ed-name">{(form.name ?? "").trim() || "（未命名）"}</div>
        </div>
        <div className="hb-ed-ops">
          <TextButton onClick={onBack}>取消</TextButton>
          {isNew && <OutlinedButton onClick={() => save(true)}>保存并继续新建</OutlinedButton>}
          <FilledButton onClick={() => save(false)}>
            <span slot="icon" className="material-symbols-outlined">save</span>
            保存
          </FilledButton>
        </div>
      </div>

      {err && <div className="hb-err">{err}</div>}
      {tip && <div className="hb-tip">{tip}</div>}
      {isLegacyWiki && (
        <div className="hb-legacy">
          <span className="material-symbols-outlined">history</span>
          <span>这条内容是早期版本的 wikitext 正文，仍按原样渲染。</span>
          <TextButton onClick={toMarkdown}>转换为 Markdown</TextButton>
        </div>
      )}

      <div className="hb-ed-body">
        <div className="hb-ed-form">
          <section className="hb-ed-card">
            <h4 className="hb-ed-card-title">归属与基本信息</h4>
            <div className="hb-field">
              <span className="hb-label">归属包</span>
              <div className="hb-ed-chips">
                {pools.map((p) => (
                  <button key={p.id} type="button" className={"chip mini" + ((form.__pool ?? poolId) === p.id ? " active" : "")} onClick={() => set("__pool", p.id)}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            {basics.map(renderField)}
          </section>

          {extras.length > 0 && (
            <section className="hb-ed-card">
              <h4 className="hb-ed-card-title">{CATEGORY_LABELS[form.category ?? ""] ?? "分类"}字段</h4>
              {extras.map(renderField)}
            </section>
          )}

          <section className="hb-ed-card">{body && renderField(body)}</section>
        </div>

        <div className="hb-ed-preview">
          <div className="hb-ed-preview-head">
            <span className="material-symbols-outlined">visibility</span>
            实时预览
          </div>
          {previewEntry ? <EntryCard entry={previewEntry} /> : <p className="hint">填写名称与资源类型后显示预览。</p>}
        </div>
      </div>
    </div>
  );
}
