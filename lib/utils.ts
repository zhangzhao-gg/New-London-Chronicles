/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: 对外提供 joinClasses 工具函数
 * [POS]: 位于 `lib/utils.ts`，被全局组件消费的纯工具函数集合
 * [PROTOCOL]: 变更时更新此头部，然后检查 `lib/CLAUDE.md`
 */

/* ── 条件拼接 CSS 类名 ── */

export function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
