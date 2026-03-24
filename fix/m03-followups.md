# M03 Follow-ups

## 现在可合并

- `GET /api/city` 已按契约返回 HUD、district hover 聚合、`onlineCount`、日志、语言占位字段
- `GET /api/tasks` 已返回 `canJoin`、`disabledReason`、`actionLabel`
- `GET /api/logs` 已支持 `limit`，默认 `20`，最大 `100`
- `GET /api/session/current` 已支持 `sessionId` 查询参数、恢复 `build/work` 会话、12 小时超时兜底
- `npm run typecheck` 与 `npm run build` 已通过

## 建议放到后续 fix 分支

### P2 - 契约补齐
- 明确 `GET /api/tasks` 中非空 `instance` 的完整返回 shape
- 如果前端需要显示“剩余建造时长 / slotId / progress”，应先在 `docs/03-api-contracts.md` 锁定字段，再补实现

### P2 - 基础设施收敛
- 等 M02/M04 的统一 Supabase helper 稳定后，把 `lib/supabase-server.ts` 收敛到项目统一方案
- 优先替换当前原生 `fetch` + cookie 解析逻辑，减少后续维护成本

### P3 - 规则细化
- 明确 `medical-shift` 在 MVP 中是否存在实例，以及实例创建/关闭时机
- 若后续确认存在实例，再决定 `GET /api/tasks` 是否需要对 `medical-shift` 返回非空 `instance`

## 当前判断

- 上述问题都不是当前 M03 的合并阻塞项
- 建议本次先按已实现版本进入 PR 流程
- 后续单独开 fix 分支集中处理契约补齐和 helper 收敛
