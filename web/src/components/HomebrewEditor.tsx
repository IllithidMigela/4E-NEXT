import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { Entry } from "../data/types";
import { FilledButton, FilledSelect, FilledTextField, SelectOption, TextButton } from "./md";
import SheetDialog from "./SheetDialog";
import { CATEGORY_LABELS } from "../data/labels";
import { buildEntry, draftToForm, fieldsFor, CATEGORY_LIST, type SheetField } from "../lib/homebrewSchema";
import { upsertEntryInPool, loadPools, entryPoolId, type HomebrewPool } from "../lib/userdata";
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
  onClose: () => void;
  onSaved: (entry: Entry) => void;
}

const blank = (cats: string[]) => ({ name: "", nameEn: "", category: cats[0] ?? "", tags: "", source: "", sourceText: "" });

export default function HomebrewEditor({ open, initial, onClose, onSaved }: Props) {
  const isNew = initial === null;
  const [form, setForm] = useState<Record<string, string>>(blank(CATEGORY_LIST));
  const [pools, setPools] = useState<HomebrewPool[]>([]);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setErr("");
    const all = loadPools();
    setPools(all);
    const fallback = all[0]?.id ?? "";
    if (isNew) {
      const draft = loadDraft();
      setForm({ ...blank(CATEGORY_LIST), __pool: (draft.__pool && all.some((p) => p.id === draft.__pool)) ? draft.__pool : fallback, ...draft });
    } else {
      setForm({ ...draftToForm(initial), __pool: entryPoolId(initial.id) ?? fallback });
      clearDraft();
    }
  }, [open, isNew, initial]);

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
    if (isNew) saveDraft(next);
  }

  function doSave() {
    const r = buildEntry(form, initial?.id);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    const poolId = form.__pool && pools.some((p) => p.id === form.__pool) ? form.__pool : undefined;
    const saved = upsertEntryInPool(r.entry.id, r.entry, poolId);
    if (isNew) clearDraft();
    onSaved(saved);
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

  return (
    <SheetDialog
      open={open}
      headline={isNew ? "新建私设条目" : "编辑私设条目"}
      sub={"正文用 wikitext，右侧实时预览" + (isNew ? "（已自动保存草稿）" : "")}
      actions={
        <>
          <TextButton onClick={discardKeep}>取消</TextButton>
          <FilledButton onClick={doSave}>保存</FilledButton>
        </>
      }
      onClose={discardKeep}
    >
      {err && <div className="hb-err">{err}</div>}
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