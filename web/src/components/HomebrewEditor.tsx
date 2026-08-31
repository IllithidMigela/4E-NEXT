import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "../data/types";
import { FilledButton, FilledSelect, FilledTextField, SelectOption, TextButton } from "./md";
import SheetDialog from "./SheetDialog";
import { CATEGORY_LABELS } from "../data/labels";
import { buildEntry, draftToForm, fieldsFor, CATEGORY_LIST, type SheetField } from "../lib/homebrewSchema";
import { upsertEntryInPool, loadPools, entryPoolId, uniqueEntryId, type HomebrewPool } from "../lib/userdata";
import { wikiToHtml } from "../lib/wikirender";

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

interface Props {
  open: boolean;
  /** null=新建；否则为编辑对象 */
  initial: Entry | null;
  /** 新建时默认归属包（二级编辑页传入当前包） */
  defaultPoolId?: string;
  /** 新建时默认资源类型（跟随当前分类标签） */
  defaultCategory?: string;
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

const blank = (cats: string[], cat?: string) => ({
  name: "",
  nameEn: "",
  category: cat && cats.includes(cat) ? cat : cats[0] ?? "",
  tags: "",
  source: "",
  sourceText: "",
});

export default function HomebrewEditor({ open, initial, defaultPoolId, defaultCategory, onClose, onSaved }: Props) {
  const isNew = initial === null;
  const [form, setForm] = useState<Record<string, string>>(blank(CATEGORY_LIST));
  const [pools, setPools] = useState<HomebrewPool[]>([]);
  const [err, setErr] = useState<string>("");
  const [tip, setTip] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    setTip("");
    const all = loadPools();
    setPools(all);
    const fallback = defaultPoolId && all.some((p) => p.id === defaultPoolId) ? defaultPoolId : all[0]?.id ?? "";
    if (isNew) {
      const draft = loadDraft();
      const base = blank(CATEGORY_LIST, defaultCategory);
      setForm({
        ...base,
        ...draft,
        // 默认包/分类由调用方（当前包、当前分类标签）决定，优先于历史草稿
        category: defaultCategory && CATEGORY_LIST.includes(defaultCategory) ? defaultCategory : draft.category ?? base.category,
        __pool: defaultPoolId && all.some((p) => p.id === defaultPoolId) ? defaultPoolId : (draft.__pool && all.some((p) => p.id === draft.__pool)) ? draft.__pool : fallback,
      });
    } else {
      setForm({ ...draftToForm(initial), __pool: entryPoolId(initial.id) ?? fallback });
      clearDraft();
    }
  }, [open, isNew, initial, defaultPoolId, defaultCategory]);

  const fields = useMemo(() => fieldsFor(form.category ?? ""), [form.category]);

  const extras = useMemo(() => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "tags" || ["name", "nameEn", "category", "source", "sourceText"].includes(f.key)) continue;
      const v = (form[f.key] ?? "").trim();
      if (v) e[f.key] = v;
    }
    return e;
  }, [fields, form]);

  const preview = useMemo(() => wikiToHtml(form.sourceText ?? "", extras), [form.sourceText, extras]);

  function set(k: string, v: string) {
    const next = { ...form, [k]: v };
    setForm(next);
    setTip("");
    if (isNew) saveDraft(next);
  }

  /** 保存。continueNew=true 时保存后清空表单继续创建下一条（保留归属包与资源类型）。 */
  function doSave(continueNew: boolean) {
    // 新建时按名称生成用户层唯一 id，避免不同包内同名条目互相覆盖
    const targetId = isNew ? uniqueEntryId((form.name ?? "").trim()) : initial.id;
    const r = buildEntry(form, targetId);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setErr("");
    const poolId = form.__pool && pools.some((p) => p.id === form.__pool) ? form.__pool : undefined;
    const saved = upsertEntryInPool(r.entry.id, r.entry, poolId);
    onSaved(saved);
    if (isNew) clearDraft();
    if (continueNew && isNew) {
      setForm({ ...blank(CATEGORY_LIST, form.category), __pool: form.__pool ?? "" });
      setTip("已保存「" + saved.name + "」，可继续创建下一条。");
      return;
    }
    onClose();
  }

  function discardKeep() {
    if (isNew) clearDraft();
    onClose();
  }

  function renderField(f: SheetField) {
    const val = form[f.key] ?? "";
    if (f.type === "select") {
      const options = f.key === "category" ? CATEGORY_LIST : f.options;
      return (
        <label key={f.key} className="hb-field">
          <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
          <FilledSelect value={val} onChange={(e) => set(f.key, (e.target as HTMLSelectElement).value)}>
            {options!.map((o) => (
              <SelectOption key={o} value={o}>
                {f.key === "category" ? (CATEGORY_LABELS[o] ?? o) : o}
              </SelectOption>
            ))}
          </FilledSelect>
        </label>
      );
    }
    if (f.type === "longtext") {
      return (
        <label key={f.key} className="hb-field">
          <span className="hb-label">{f.label}</span>
          <textarea className="hb-textarea" value={val} rows={f.key === "sourceText" ? 12 : 4} placeholder={f.placeholder} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set(f.key, e.target.value)} />
        </label>
      );
    }
    return (
      <label key={f.key} className="hb-field">
        <span className="hb-label">{f.label}{f.required ? " *" : ""}</span>
        <FilledTextField value={val} placeholder={f.placeholder} onInput={(e) => set(f.key, (e.target as HTMLInputElement).value ?? "")} />
      </label>
    );
  }

  const catLabel = CATEGORY_LABELS[form.category ?? ""] ?? form.category ?? "";
  const poolName = pools.find((p) => p.id === form.__pool)?.name;

  return (
    <SheetDialog
      xwide
      open={open}
      headline={isNew ? "新建私设条目" : "编辑私设条目"}
      sub={(poolName ? poolName + " · " : "") + (isNew ? "正文用 wikitext，右侧实时预览（已自动保存草稿）" : "条目 ID：" + initial.id)}
      actions={
        <>
          <TextButton onClick={discardKeep}>取消</TextButton>
          {isNew && <TextButton onClick={() => doSave(true)}>保存并继续新建</TextButton>}
          <FilledButton onClick={() => doSave(false)}>保存</FilledButton>
        </>
      }
      onClose={discardKeep}
    >
      {err && <div className="hb-err">{err}</div>}
      {tip && <div className="hb-tip">{tip}</div>}
      <div className="hb-grid">
        <div className="hb-form">
          <div className="hb-field">
            <span className="hb-label">归属包</span>
            {pools.length ? (
              <FilledSelect value={form.__pool ?? ""} onChange={(e) => set("__pool", (e.target as HTMLSelectElement).value)}>
                {pools.map((p) => (
                  <SelectOption key={p.id} value={p.id}>{p.name}{p.enabled ? "" : "（禁用）"}</SelectOption>
                ))}
              </FilledSelect>
            ) : (
              <span className="hb-label">暂无包，请先在私设页新建一个包。</span>
            )}
          </div>
          {fields.map(renderField)}
        </div>
        <div className="hb-preview">
          <div className="hb-preview-head">
            <b>{(form.name || "（未命名）")}</b>
            {form.nameEn ? " " + form.nameEn : ""}
            <span className="origin-badge">预览</span>
            <span className="hb-preview-cat">{catLabel}{form.source ? " · " + form.source : ""}</span>
          </div>
          {preview ? (
            <div className="hb-preview-body mt" dangerouslySetInnerHTML={{ __html: preview }} />
          ) : (
            <p className="hint">填写正文后此处实时渲染。</p>
          )}
        </div>
      </div>
    </SheetDialog>
  );
}
