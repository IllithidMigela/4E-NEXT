import { useEffect, useState, type ChangeEvent } from "react";
import { FilledButton, FilledTextField, TextButton } from "../components/md";
import SheetDialog from "../components/SheetDialog";
import { DEFAULT_POOL_ICON, POOL_ICONS, type PoolMeta } from "../lib/userdata";

// 资源包「外部显示与介绍」编辑器：新建包与快速编辑共用。

export interface PackMetaValue {
  name: string;
  author: string;
  version: string;
  description: string;
  icon: string;
}

export const EMPTY_PACK_META: PackMetaValue = { name: "", author: "", version: "", description: "", icon: DEFAULT_POOL_ICON };

export function metaToValue(m: PoolMeta & { name?: string }): PackMetaValue {
  return {
    name: m.name ?? "",
    author: m.author ?? "",
    version: m.version ?? "",
    description: m.description ?? "",
    icon: m.icon || DEFAULT_POOL_ICON,
  };
}

export default function PackMetaDialog({
  open,
  mode,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: PackMetaValue;
  onClose: () => void;
  onSubmit: (v: PackMetaValue) => void;
}) {
  const [v, setV] = useState<PackMetaValue>(initial);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setV(initial);
      setErr("");
    }
    // initial 为父级每次打开时构造的快照，仅在开合时同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function set<K extends keyof PackMetaValue>(k: K, val: PackMetaValue[K]) {
    setV((p) => ({ ...p, [k]: val }));
  }

  function submit() {
    if (!v.name.trim()) {
      setErr("请填写包名称");
      return;
    }
    onSubmit({ ...v, name: v.name.trim() });
  }

  return (
    <SheetDialog
      open={open}
      headline={mode === "create" ? "创建新资源包" : "编辑资源包资料"}
      sub="这些信息会展示在私设列表与导出的 .d4e 文件中"
      actions={
        <>
          <TextButton onClick={onClose}>取消</TextButton>
          <FilledButton onClick={submit}>{mode === "create" ? "创建" : "保存"}</FilledButton>
        </>
      }
      onClose={onClose}
    >
      {err && <div className="hb-err">{err}</div>}
      <div className="hb-meta-form">
        <div className="hb-meta-row">
          <label className="hb-field">
            <span className="hb-label">包名称 *</span>
            <FilledTextField value={v.name} placeholder="如：北地传说扩展" onInput={(e) => set("name", (e.target as HTMLInputElement).value ?? "")} />
          </label>
          <label className="hb-field">
            <span className="hb-label">作者</span>
            <FilledTextField value={v.author} placeholder="可选" onInput={(e) => set("author", (e.target as HTMLInputElement).value ?? "")} />
          </label>
          <label className="hb-field hb-field-narrow">
            <span className="hb-label">版本</span>
            <FilledTextField value={v.version} placeholder="如 1.0.0" onInput={(e) => set("version", (e.target as HTMLInputElement).value ?? "")} />
          </label>
        </div>
        <label className="hb-field">
          <span className="hb-label">简介</span>
          <textarea
            className="hb-textarea"
            rows={4}
            value={v.description}
            placeholder="一句话说明这个包提供了什么内容、适用于哪些桌游团。"
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set("description", e.target.value)}
          />
        </label>
        <div className="hb-field">
          <span className="hb-label">图标</span>
          <div className="hb-icon-picker" role="radiogroup" aria-label="包图标">
            {POOL_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                role="radio"
                aria-checked={v.icon === ic}
                className={"hb-icon-opt" + (v.icon === ic ? " active" : "")}
                title={ic}
                onClick={() => set("icon", ic)}
              >
                <span className="material-symbols-outlined">{ic}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SheetDialog>
  );
}
