# M04 Follow-ups Checklist

## 目标

记录当前 M04 实现中不适合在本分支直接修复、但建议后续在独立 fix 分支处理的事项。

## 建议优先级

### P1 - 在 M10 联调前确认

1. `/api/session/end` 无法区分 `manual_stop` 与 `timer_completed`
   - 现状：请求体只有 `sessionId`
   - 影响：服务端无法准确返回 `summary.endReason`
   - 当前实现：若 session 未被 heartbeat 预先标记为 `resource_exhausted` / `building_completed`，则默认按 `timer_completed` 结算
   - 建议修复：补充明确契约，由客户端显式传入结束来源，或新增服务端可判定的结束来源机制
   - 涉及文档：`docs/03-api-contracts.md`、`docs/04-modules.md`

### P2 - 下个后端修复批次处理

2. `food_supply 不足` 的判定阈值未写死
   - 现状：额外规则只写“food_supply 不足且 raw_food > 0 时优先 assign cookhouse-shift；food_supply 不足且 raw_food = 0 时优先 assign hunt”
   - 影响：不同实现者可能采用不同阈值
   - 当前实现：按最保守解释，使用 `food_supply = 0`
   - 建议修复：在产品/契约层明确“不足”的具体阈值，例如 `= 0` 或 `< active_users`
   - 涉及文档：`PRD.md`、`docs/03-api-contracts.md`

### P3 - 模块边界内无需在本分支处理

3. `rpc_task_strategy_tick` / `rpc_daily_city_upkeep` 未在本次落地
   - 原因：属于 M05 范围，不属于当前 M04 交付
   - 影响：不影响本次 M04 的 `join / assign-next / start / heartbeat / end`
   - 建议：由 M05 在自己的分支实现，不在本分支混改

4. 仓库本地依赖缺失，无法直接运行 `npm run typecheck`
   - 现状：本机未安装项目依赖，`tsc` 不在 PATH
   - 已完成替代验证：
     - 新增 TS 文件做了定向类型检查
     - `001/002/003` migration 已在本地 PostgreSQL 临时库顺跑
     - 核心 RPC 场景已实测验证
   - 建议：PR 合并前由 CI 或完整开发环境再跑一次标准检查

## 建议的后续 fix 分支范围

建议新开小分支，只做以下事项：

- 澄清 `/api/session/end` 结束来源契约
- 澄清 `food_supply 不足` 的精确定义
- 若文档变更后需要，再最小化调整 `app/api/session/end/route.ts` 与 `supabase/migrations/003_task_rpc.sql`

## 不建议在当前分支做的事

- 不要顺手扩大到 M05
- 不要改数据库 schema
- 不要修改无关 API shape
- 不要把前端 M10 的状态判断逻辑混进当前 M04 分支
