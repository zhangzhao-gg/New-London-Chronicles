# 03 - API Contracts

## 1. 通用约定

- 所有响应使用 `application/json; charset=utf-8`
- 失败响应统一结构：

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Login required."
  }
}
```

错误码固定集合：

- `UNAUTHORIZED`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `INSUFFICIENT_RESOURCE`
- `NO_PATIENTS`
- `FORBIDDEN`

## 2. 共享 DTO

```ts
type HungerStatus = "healthy" | "hungry";
type TaskType = "collect" | "build" | "convert" | "work";
type TaskInstanceStatus = "active" | "completed";
type SessionStatus = "pending" | "active" | "ended";
type SessionEndReason =
  | "timer_completed"
  | "manual_stop"
  | "resource_exhausted"
  | "building_completed"
  | "timeout";

type ResourceMap = {
  coal: number;
  wood: number;
  steel: number;
  rawFood: number;
  foodSupply: number;
};

type UserDto = {
  id: string;
  username: string;
  autoAssign: boolean;
  hungerStatus: HungerStatus;
  createdAt: string;
};
```

## 3. `PATCH /api/users/me/settings`

用途：切换当前用户设置。

Request:

```json
{
  "autoAssign": true
}
```

Success `200`:

```json
{
  "user": {
    "id": "e2f47f0c-75f3-4c65-8efb-58dfe904433b",
    "username": "王五",
    "autoAssign": true,
    "hungerStatus": "healthy",
    "createdAt": "2026-03-23T12:00:00.000Z"
  }
}
```

Failure:

- `400 VALIDATION_ERROR`
- `401 UNAUTHORIZED`

## 4. `POST /api/auth/login`

用途：创建或恢复 Supabase anonymous session，并解析业务用户。

Request:

```json
{
  "username": "王五"
}
```

Validation:

- `username.trim().length` 必须在 `2..20`
- 允许字符：中文、英文、数字、空格、`-`、`_`
- 用户名比较大小写不敏感

Success `200`:

```json
{
  "user": {
    "id": "e2f47f0c-75f3-4c65-8efb-58dfe904433b",
    "username": "王五",
    "autoAssign": true,
    "hungerStatus": "healthy",
    "createdAt": "2026-03-23T12:00:00.000Z"
  }
}
```

规则：

- 鉴权态只依赖 Supabase httpOnly cookie session，请求体不再回传 access token
- 登录成功时刷新 `users.last_seen_at = now()`

Failure:

- `400 VALIDATION_ERROR`
- `500 CONFLICT`

## 5. `GET /api/city`

用途：城市页 HUD 聚合查询。

认证：需要已登录 session。

Success `200`:

```json
{
  "resources": {
    "coal": 5000,
    "wood": 3000,
    "steel": 500,
    "rawFood": 0,
    "foodSupply": 50
  },
  "buildings": [
    {
      "id": "69a910b9-1a03-47f2-9f93-76690cb9c4f8",
      "name": "小明&大壮的帐篷",
      "district": "residential",
      "slotId": "residential-01",
      "completedAt": "2026-03-23T13:00:00.000Z"
    }
  ],
  "districts": [
    {
      "district": "resource",
      "label": "资源区",
      "status": "可采集",
      "workingCount": 3
    },
    {
      "district": "residential",
      "label": "居住区",
      "status": "建造进行中",
      "workingCount": 2
    }
  ],
  "onlineCount": 8,
  "healthStatus": "健康",
  "currentPolicyPlaceholder": "No active policy",
  "currentLanguage": "zh-CN",
  "languageOptions": ["zh-CN", "en-US"],
  "logs": [
    {
      "id": 18,
      "userLabel": "王五",
      "actionDesc": "在资源区采集了40单位煤炭",
      "createdAt": "2026-03-23T13:20:00.000Z"
    }
  ],
  "temperatureC": -20
}
```

聚合规则：

- `onlineCount` = `sessions.status in ('pending', 'active')` 且 `coalesce(last_heartbeat_at, started_at, created_at) >= now() - interval '30 minutes'` 的去重用户数
- `districts[*].workingCount` = 当前 `status = 'active'` 的 session 按 `task_templates.district` 聚合人数
- `districts[*].status` 取值固定为：`可采集`、`建造进行中`、`无进行中任务`、`资源不足`
- `logs` 返回最近 `20` 条
- `buildings` 返回最近 `30` 个已完成建筑
- 本接口成功返回时同时刷新当前用户 `last_seen_at = now()`

## 6. `GET /api/tasks`

用途：区块弹窗任务列表。

认证：需要已登录 session。

Success `200`:

```json
{
  "tasks": [
    {
      "template": {
        "id": "cad6c607-5616-4f76-a0f8-73313ef02760",
        "code": "collect-coal",
        "name": "采集煤炭",
        "type": "collect",
        "district": "resource",
        "outputResource": "coal",
        "outputPerHeartbeat": 20,
        "durationMinutes": null,
        "buildCost": {},
        "heartbeatCost": {}
      },
      "instance": null,
      "participants": 3,
      "canJoin": true,
      "disabledReason": null,
      "actionLabel": "前往工作"
    }
  ]
}
```

建造 / 工作类示例：

```json
{
  "tasks": [
    {
      "template": {
        "id": "b872de23-4e83-4b85-8c85-f0a51d8d10ef",
        "code": "build-tent",
        "name": "建造帐篷",
        "type": "build",
        "district": "residential",
        "outputResource": "progress",
        "outputPerHeartbeat": 10,
        "durationMinutes": 120,
        "buildCost": {
          "wood": 10
        },
        "heartbeatCost": {}
      },
      "instance": {
        "id": "8d6f0f1d-2f2a-49de-9804-13bafb4f6982",
        "slotId": "residential-01",
        "progressMinutes": 40,
        "remainingMinutes": 80
      },
      "participants": 2,
      "canJoin": true,
      "disabledReason": null,
      "actionLabel": "加入建造"
    }
  ]
}
```

规则：

- 采集类永远返回 `instance = null`
- 转化类与采集类一致，永远返回 `instance = null`
- 建造类与工作类在 `instance != null` 时固定返回 `id`、`slotId`、`progressMinutes`、`remainingMinutes`
- 转化类原料不足时返回 `canJoin = false`，`disabledReason = "insufficient_resource"`
- `food_supply` 不足固定按 `food_supply = 0` 判定；自动分配时 `food_supply = 0 && raw_food > 0` 优先 `cookhouse-shift`，`food_supply = 0 && raw_food = 0` 优先 `hunt`
- `medical-shift` 在无病人时返回 `canJoin = false`，`disabledReason = "no_patients"`

## 7. `POST /api/tasks/join`

用途：加入任务，必要时创建实例与 session。

Request:

```json
{
  "templateId": "b872de23-4e83-4b85-8c85-f0a51d8d10ef",
  "instanceId": "8d6f0f1d-2f2a-49de-9804-13bafb4f6982"
}
```

约定：

- 采集类：`instanceId = null`
- 转化类：`instanceId = null`
- 建造类：`instanceId` 必填，必须指向活跃实例
- 工作类：与建造类相同

Success `200`:

```json
{
  "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
  "status": "pending",
  "task": {
    "templateId": "b872de23-4e83-4b85-8c85-f0a51d8d10ef",
    "instanceId": "8d6f0f1d-2f2a-49de-9804-13bafb4f6982",
    "type": "build",
    "name": "建造帐篷"
  },
  "requiresStart": true,
  "redirectTo": "/focus?sessionId=8079c0ca-c301-4cc1-a675-11d313afad9d"
}
```

Failure:

- `404 NOT_FOUND`
- `409 CONFLICT`
- `409 INSUFFICIENT_RESOURCE`
- `409 NO_PATIENTS`

## 8. `POST /api/tasks/assign-next`

用途：当用户开启自动任务时，为其直接分配下一个任务并创建 `pending` session。

Request:

```json
{}
```

Success `200`:

```json
{
  "sessionId": "70c6f87e-7805-4ff5-a0fa-e7ea59fb348f",
  "status": "pending",
  "task": {
    "templateId": "cad6c607-5616-4f76-a0f8-73313ef02760",
    "instanceId": null,
    "type": "collect",
    "name": "采集煤炭",
    "district": "resource"
  },
  "redirectTo": "/focus?sessionId=70c6f87e-7805-4ff5-a0fa-e7ea59fb348f"
}
```

规则：

- 仅当 `user.autoAssign = true` 时允许调用
- 当 `food_supply = 0` 时：`raw_food > 0` 优先分配 `cookhouse-shift`，`raw_food = 0` 优先分配 `hunt`
- 选择优先级固定为：
  1. 城市当前最缺乏资源对应的采集任务
  2. 资源充足时，优先选择已存在的进行中建造实例
  3. 若建造所需资源不足，回退到采集任务
- 该接口不直接把 session 置为 `active`

Failure:

- `401 UNAUTHORIZED`
- `404 NOT_FOUND`
- `409 CONFLICT`

## 9. `GET /api/session/current`

用途：恢复当前用户可继续的会话。

Query:

- `?sessionId=<uuid>` 可选；用于 `/focus` 页面按显式 session 取数

Success `200`:

```json
{
  "session": {
    "id": "8079c0ca-c301-4cc1-a675-11d313afad9d",
    "status": "active",
    "startedAt": "2026-03-23T13:00:00.000Z",
    "lastHeartbeatAt": "2026-03-23T13:20:00.000Z",
    "task": {
      "templateId": "b872de23-4e83-4b85-8c85-f0a51d8d10ef",
      "instanceId": "8d6f0f1d-2f2a-49de-9804-13bafb4f6982",
      "type": "build",
      "name": "建造帐篷",
      "district": "residential"
    }
  }
}
```

无可恢复会话时：

```json
{
  "session": null
}
```

规则：

- 传 `sessionId` 时：
  - 返回该 `sessionId` 对应、且属于当前用户的 `pending | active` session
  - `collect / convert / build / work` 都允许返回
  - 找不到则返回 `404 NOT_FOUND`
- 未传 `sessionId` 时：
  - 仅返回 `build` 与 `work` 类型中 `status in ('pending', 'active')` 的 session
- 采集类与转化类不做恢复，用户重新开始即可
- 若 session 已超时 12 小时，本接口先把它置为 `ended(timeout)`，再返回 `null`

## 10. `POST /api/session/start`

用途：显式把 session 标记为开始。

Request:

```json
{
  "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
  "endReason": "manual_stop"
}
```

Success `200`:

```json
{
  "ok": true,
  "startedAt": "2026-03-23T13:00:00.000Z"
}
```

规则：

- `pending -> active`
- 幂等
- 仅允许 session 所属用户调用
- 首次成功调用时写入 `startedAt` 与 `lastHeartbeatAt`

## 10.1 Focus Timer Client Contract

专注页不新增 pause API，按钮行为固定如下：

- `开始`：
  - `pending` session 首次点击时调用 `POST /api/session/start`
  - `active` session 且当前为暂停态时，只恢复本地计时器，不额外调用 API
- `暂停`：
  - 只暂停本地倒计时与 heartbeat 调度
  - 不修改服务端 session 状态，服务端仍保持 `active`
  - 暂停超过 `12` 小时，由服务端超时规则结束 session
- `重来`：
  - 仅重置当前本地倒计时到本次用户选定的初始分钟数
  - 已经成功写入的 heartbeat 贡献保留
  - 尚未形成 10 分钟 heartbeat 的本地零散计时直接丢弃

本地持久化固定使用：

```ts
localStorage["nlc:focus-state:<sessionId>"] = {
  selectedMinutes: number,
  remainingSeconds: number,
  isPaused: boolean
}
```

恢复规则：

- 同浏览器刷新或返回 `/focus` 时，优先读取本地 `focus-state`
- 若存在 `build/work` 类型可恢复 session 但本地没有 `focus-state`，页面展示“恢复专注”态并要求用户重新输入本轮倒计时分钟数；已写入的任务进度不受影响

## 11. `POST /api/session/heartbeat`

用途：每 10 分钟写一次真实贡献。

Request:

```json
{
  "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
  "endReason": "manual_stop"
}
```

Success `200`:

```json
{
  "contribution": {
    "minutes": 10,
    "resources": {
      "coal": 20,
      "wood": 0,
      "steel": 0,
      "rawFood": 0,
      "foodSupply": 0
    }
  },
  "taskEnded": false,
  "buildingCompleted": false,
  "remainingMinutes": 80,
  "endReason": null
}
```

结束分支：

```json
{
  "contribution": {
    "minutes": 10,
    "resources": {
      "coal": 0,
      "wood": 0,
      "steel": 0,
      "rawFood": -1,
      "foodSupply": 2
    }
  },
  "taskEnded": true,
  "buildingCompleted": false,
  "remainingMinutes": 0,
  "endReason": "resource_exhausted"
}
```

规则：

- 仅允许 `status = 'active'` 的 session 发 heartbeat
- 采集类：直接往 `city_resources` 加库存
- 建造类与工作类：`remaining_minutes -= 10`，`progress_minutes += 10`
- 转化类：锁库存后确认 `raw_food >= 1`，再 `raw_food -= 1` 与 `food_supply += 2`；允许多人同时参与，库存不足时本次 heartbeat 触发结束
- 建造完成时返回 `buildingCompleted = true`
- 服务器一旦判断结束，客户端必须停止继续发 heartbeat

## 12. `POST /api/session/end`

用途：结束会话并生成结算文案。

触发：

- 番茄钟自然结束
- 用户手动停止
- 轮询发现资源耗尽或建筑已完成

Request:

```json
{
  "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
  "endReason": "manual_stop"
}
```

Success `200`:

```json
{
  "summary": {
    "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
    "endReason": "timer_completed",
    "resource": "coal",
    "amount": 40,
    "narrative": "王五完成了采集煤炭，为新伦敦贡献了40单位煤炭。",
    "buildingCompleted": false,
    "buildingName": null,
    "participantsLabel": null
  }
}
```

建造完成时：

```json
{
  "summary": {
    "sessionId": "8079c0ca-c301-4cc1-a675-11d313afad9d",
    "endReason": "building_completed",
    "resource": "progress",
    "amount": 120,
    "narrative": "小明完成了建造帐篷，为新伦敦贡献了120分钟施工进度。",
    "buildingCompleted": true,
    "buildingName": "小明&大壮的帐篷",
    "participantsLabel": "小明&大壮"
  }
}
```

规则：

- 幂等
- 若 session 已结束，返回第一次结算出的相同 `summary`
- 请求体 `endReason` 只允许 `manual_stop` 或 `timer_completed`
- 服务端结束原因优先级固定为：`sessions.end_reason`（若 heartbeat 已写入） > 请求体 `endReason` > `timer_completed`
- `resource_exhausted`、`building_completed`、`timeout` 只能由服务端状态产生，客户端不可直接传入
- `city_logs` 在该接口内写入，且每个 session 只写一条日志

## 13. `GET /api/logs`

用途：城市日志滚动刷新。

认证：需要已登录 session。

Query:

- `?limit=50`，默认 `20`，最大 `100`

Success `200`:

```json
{
  "logs": [
    {
      "id": 18,
      "userLabel": "王五",
      "actionDesc": "在资源区采集了40单位煤炭",
      "createdAt": "2026-03-23T13:20:00.000Z"
    }
  ]
}
```

## 14. `POST /api/internal/city/upkeep`

用途：执行每日城市消耗，由服务器定时任务调用。

认证：

- Header `x-cron-secret: ${CRON_SHARED_SECRET}`

Request:

```json
{}
```

Success `200`:

```json
{
  "ok": true,
  "summary": {
    "businessDate": "2026-03-24",
    "activeUsers": 18,
    "foodConsumed": 18,
    "coalConsumed": 1000,
    "newlyHungryUsers": 3
  }
}
```

规则：

- 每日执行一次
- 消耗 `1000` 煤作为能量塔日常消耗
- 按当日 `last_seen_at` 统计活跃用户，每人消耗 `1` 份 `food_supply`
- 食物不足时，不写负库存，把缺口对应用户置为 `hungry`
- `businessDate` 固定按 `Asia/Shanghai` 自然日计算
