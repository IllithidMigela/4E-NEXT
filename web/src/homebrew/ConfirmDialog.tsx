import { FilledButton, TextButton } from "../components/md";
import SheetDialog from "../components/SheetDialog";

// 轻量确认框（MD3 对话框壳），替代浏览器原生 confirm，保持视觉一致。
export default function ConfirmDialog({
  open,
  headline,
  message,
  confirmLabel = "确认",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  headline: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <SheetDialog
      open={open}
      headline={headline}
      onClose={onClose}
      actions={
        <>
          <TextButton onClick={onClose}>取消</TextButton>
          <FilledButton className={danger ? "hb-danger-btn" : undefined} onClick={onConfirm}>{confirmLabel}</FilledButton>
        </>
      }
    >
      <p className="hb-confirm-text">{message}</p>
    </SheetDialog>
  );
}
