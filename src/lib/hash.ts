import { createHash } from "node:crypto";

/** 对文本计算 sha256，返回十六进制字符串（用于规范层内容哈希、增量 diff 检测）。 */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}