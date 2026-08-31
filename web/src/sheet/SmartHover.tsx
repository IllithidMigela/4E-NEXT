import { useRef } from "react";
import type { ReactNode, MouseEvent } from "react";

// 通用「悬停弹出」：触发元素 + 弹出层。
// 鼠标进入时根据触发元素距视口的位置智能判断弹出方位：
//   .p-up    触发元素在下半屏且上方有空间 → 向上弹出
//   .p-right 触发元素靠右导致右侧放不下    → 向右对齐左边界（left:auto; right:0）
// 沿用各触发元素自身的 :hover 显隐规则，仅新增方位 class，无需改动显隐逻辑。
export function SmartHover({
  className,
  popClass = "hp-pop",
  children,
  pop,
  onClick,
  title,
}: {
  className?: string;   // 触发元素类（如 .wiki-ref / .cls-option / .cls-choice-power / .compact-row）
  popClass?: string;    // 弹出层类（如 .wiki-ref-pop）。缺省用统一 .hp-pop
  children: ReactNode;
  pop?: ReactNode;      // 弹出内容；空则不渲染弹出层
  onClick?: (e: MouseEvent) => void;
  title?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);

  const orient = () => {
    const el = ref.current;
    const pc = popRef.current;
    if (!el || !pc) return;
    const vr = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 预计弹出层宽度（样式上限 400px，再受视口宽度约束）
    const estW = Math.min(400, vw - 120);
    // 下方放不下、且上方有足够余量 → 上弹
    const up = vr.bottom > vh / 2 && vr.top - estW > 8;
    // 右侧放不下 → 右对齐避免溢出窗口右缘
    const right = vr.left + estW > vw - 8;
    pc.classList.toggle("p-up", up);
    pc.classList.toggle("p-right", right);
  };

  if (pop == null) {
    return (
      <span className={className} onClick={onClick} title={title}>{children}</span>
    );
  }
  return (
    <span ref={ref} className={className} onMouseEnter={orient} onClick={onClick} title={title}>
      {children}
      <span ref={popRef} className={popClass}>{pop}</span>
    </span>
  );
}