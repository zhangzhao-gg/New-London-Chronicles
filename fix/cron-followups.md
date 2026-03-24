# Fix 清单（M05 后续）

## 目标
在不扩大业务规则范围的前提下，补齐 M05 上线前仍有风险的地方。

## 优先级 P0：确保服务器 cron 真能执行

### 现状
- `docs/05-deployment.md` 的 crontab 使用：`node -r ts-node/register scripts/task-strategy.ts`
- 当前仓库 `package.json` 没有 `ts-node`

### 需要修改
- `package.json`
- `package-lock.json`
- 如选择改运行方式而不是补依赖，则同时检查：`docs/05-deployment.md`

### 建议修法
二选一：

1. 最小修复
   - 给项目补上 `ts-node`
   - 保持现有 crontab 方案不变

2. 更稳修复
   - 不依赖运行时转译
   - 将 cron 脚本改成构建后可直接执行的 JS 入口
   - 如采用此方案，需要同步部署脚本与文档

### 风险说明
这是最直接的阻塞项；不修的话，生产机上的每分钟策略脚本可能根本跑不起来。

---

## 优先级 P1：把 cron 写操作收回数据库事务

### 现状
- `lib/cron.ts` 现在优先调用：
  - `rpc_task_strategy_tick`
  - `rpc_daily_city_upkeep`
- 但仓库里还没有 `supabase/migrations/003_task_rpc.sql`
- 当前 fallback 能跑，但不是数据库事务级原子实现

### 需要修改
- `supabase/migrations/003_task_rpc.sql`
- 如需补充本地初始化入口，则检查：`supabase/seed.sql`
- 如 RPC 返回结构与文档不一致，需要先由契约负责人确认，不能直接改 API shape

### RPC 需要覆盖的点
1. `rpc_task_strategy_tick()`
   - 仅扫描 `build` 模板
   - 固定优先级：
     - `build-tent`
     - `build-collection-hut`
     - `build-medical-post`
     - `build-hunters-hut`
     - `build-cookhouse`
     - `build-workshop`
     - `build-lighthouse`
   - 每模板最多 `2` 个 `active` 实例
   - 资源不足时不创建实例，不写负库存
   - 槽位按文档顺序取第一个未占用位置
   - `collect` / `convert` 不创建实例

2. `rpc_daily_city_upkeep()`
   - `business_date` 按 `Asia/Shanghai`
   - 每日煤炭扣减 `1000`
   - 当日活跃用户每人扣减 `1` 份 `food_supply`
   - 食物不足时不写负库存，并把缺口对应用户置为 `hungry`
   - 返回文档固定结构：
     - `active_users`
     - `food_consumed`
     - `coal_consumed`
     - `newly_hungry_users`
     - `business_date`

### 风险说明
这是并发一致性风险，不一定立刻爆，但一旦 cron 重叠或库存竞争加剧，会影响结果稳定性。

---

## 优先级 P2：补规则缺口，避免不同实现各自猜测

### 缺口 1：食物不足时，哪批用户变 `hungry`
当前文档只说“把缺口对应用户置为 hungry”，没有定义排序规则。

### 缺口 2：煤炭不足 `1000` 时的精确定义
当前文档没有写清：
- 是最多扣到 `0`
- 还是视为失败
- 还是记录缺口但库存不变

### 建议处理方式
- 先由产品/契约负责人确认
- 再决定是否修改：
  - `PRD.md`
  - `docs/02-database-schema.md`
  - `docs/03-api-contracts.md`
  - `docs/04-modules.md`
  - `docs/05-deployment.md`

### 风险说明
这不是当前开发阻塞，但如果不统一，后续 SQL/RPC/Node fallback 可能各自实现出不同结果。

---

## 建议拆分为 3 个最小 Fix 提交

### Fix 1
- 让 `scripts/task-strategy.ts` 在线上可执行
- 只碰运行链路和依赖

### Fix 2
- 新增 `supabase/migrations/003_task_rpc.sql`
- 把 cron 关键写操作放回数据库事务

### Fix 3
- 补齐规则缺口
- 仅在负责人确认后再动文档或实现

---

## 当前 M05 代码状态
- 当前分支里的 M05 实现可通过 `npm run typecheck`
- 已满足模块目标的基础交付
- 后续 fix 更适合单开分支继续做
