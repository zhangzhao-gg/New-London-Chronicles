# 06 — AI Agent 建造策略

## 本次重构（2026-04-02）

### 做了什么

1. **删除 cron 脚本**：`scripts/task-strategy.ts` 移除，建造补位不再由定时任务驱动。
2. **新建 agent 接口**：`POST /api/tasks/strategy`，接受 `{ templateCode, slotId }`，由外部 AI agent 按需调用。
3. **清理死代码**：`rpc_task_strategy_tick`、`rpc_daily_city_upkeep` 两个幽灵 RPC 分支及关联类型、函数全部移除。
4. **决策权转移**：建什么、建哪里，从硬编码优先级表（`BUILD_PRIORITY`）转交给 LLM 推理。接口只做校验和执行。

### 接口契约

```
POST /api/tasks/strategy
Auth: Supabase session cookies
Body: { "templateCode": "build-tent", "slotId": "residential-03" }

成功 200: { "ok": true, "instanceId": "uuid", "templateCode": "...", "slotId": "..." }
拒绝 409: { "ok": false, "reason": "slot_occupied" | "template_not_found" | ... }
```

### Agent 调用流程

```
1. POST /api/auth/login          → 拿 session
2. GET  /api/city                 → 城市资源快照
3. GET  /api/tasks                → 模板 + 活跃实例 + 地块占用
4. LLM 推理                       → 基于城市全貌输出建造决策
5. POST /api/tasks/strategy       → 执行建造指令
```

---

## 未来规划

### 1. Agent 推理层

当前接口只是执行层。推理层（LLM agent）需要独立实现：

- 输入：城市资源、活跃建筑、用户数量、发展阶段
- 输出：建什么 + 建哪里
- 不做规则兜底，完全依赖 LLM 推理

### 2. 地理系统重构 — 从 district-slot 到 2D 环形空间

当前地块模型是扁平的 `{district}-{编号}`，本质上是一维编号系统，没有空间关系。

**目标模型：2D 环形城市**

```
                    三环
                 ┌─────────┐
              三环│  二环     │三环
           ┌─────┤┌───────┐├─────┐
        三环│ 二环││ 一环   ││二环  │三环
           │     │├───┐   ├┤     │
           │     ││ ⚙ │   ││     │
           │     │├───┘   ├┤     │
        三环│ 二环││  一环  ││二环  │三环
           └─────┤└───────┘├─────┘
              三环│  二环    │三环
                 └─────────┘
                    三环

        ⚙ = 能量塔（城市中心，固定存在）
```

- **中心**：能量塔，固定坐标原点，不可拆建
- **一环**：紧邻能量塔，核心建筑（医疗、伙房等生存必需）
- **二环**：中层区域，产业建筑（收集小屋、工作站等）
- **三环**：外围区域，扩展建筑（灯塔、猎人小屋等远征设施）

**需要改变的东西：**

- slotId 从 `{district}-{编号}` 演化为带坐标的 2D 地块（如 `ring-1-N`、`(x,y)` 或极坐标）
- 建筑不再按 district 限定区域，改为按环数限定可建范围
- `DISTRICT_SLOT_COUNTS` 硬编码常量消失，地块数据下沉到数据库
- `isValidSlotForDistrict` 校验逻辑改为基于坐标和环数的空间校验
- `GET /api/city` 需要返回 2D 地图数据，供前端渲染和 agent 感知

**这是架构级变更，涉及数据库、API 契约、前端渲染、agent 感知的全链路重构。**
