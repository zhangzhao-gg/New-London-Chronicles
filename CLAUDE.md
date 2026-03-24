# New London Chronicles - 冰汽时代美学的多人共享专注城市

Next.js 15.2.4 + React 19.0.0 + Tailwind CSS 4.1.1 + Supabase JS 2.49.4 + ts-node 10.9.2

## 项目现状

当前仓库仍是冷启动阶段：`PRD.md` + 静态原型 + 拆分技术蓝图。真实工程代码尚未创建，`docs/` 是当前技术基线，`TECH.md` 只保留导航作用。

## 根目录地图

<directory>
app/ - Next.js 页面与 Route Handlers，当前已落地全局样式与根布局
</directory>

<directory>
components/ - 纯 UI 组件与页面块，当前已落地 M06 共享组件
</directory>

<directory>
hooks/ - 客户端轮询、倒计时、心跳与音频控制 (planned)
</directory>

<directory>
lib/ - 认证、Supabase client 工厂、RPC 封装、领域工具 (planned)
</directory>

<directory>
public/ - 图片、音频、字体等静态资产 (planned)
</directory>

<directory>
scripts/ - 脱离 Next runtime 的后台脚本，当前仅 `task-strategy.ts` (planned)
</directory>

<directory>
supabase/ - migration、seed、数据库函数，是真实状态源 (planned)
</directory>

<directory>
types/ - 前后端共享 DTO 与领域类型 (planned)
</directory>

<directory>
docs/ - 拆分后的技术规范，按主题承载实现基线与 review 缺口
</directory>

<directory>
UI/ - 静态原型，提供视觉与布局参考，不是运行时代码
</directory>

## 配置文件

<config>
PRD.md - 产品规则与玩法边界，温度常量与任务系统以此为准
</config>

<config>
package.json - Next.js / React / Tailwind / TypeScript 依赖与脚本入口
</config>

<config>
tsconfig.json - TypeScript 严格模式与路径解析配置
</config>

<config>
TECH.md - 技术文档入口，重定向到 docs/ 下的拆分规范
</config>

<config>
docs/README.md - 技术规范总索引，说明拆分地图与已知缺口
</config>

<config>
.gitignore - 仓库忽略规则，当前至少屏蔽 macOS `.DS_Store` 噪音
</config>

<config>
CLAUDE.md - 项目 L1 宪法，维护目录地图与 GEB 文档协议
</config>

## 架构法则

1. 单一真相源：
   - 数据结构以 `supabase/migrations/` 为准
   - API 合约以 `docs/03-api-contracts.md` 为准
   - 视觉 token 以 `docs/01-foundation.md` 与 `docs/04-modules.md` 为准
2. 浏览器不直连 Supabase 表。所有业务读写先经过 Next Route Handlers。
3. 用户登录体验是“用户名即入口”，底层会话使用 Supabase anonymous auth，不再引入自建 JWT 用户态。
4. 贡献写入只允许出现在 `heartbeat` 与 `end` 流程，禁止在页面组件里偷偷改状态。
5. 新目录出现时必须创建对应 L2 `CLAUDE.md`；业务文件出现时必须带 L3 头部契约。
6. 前端实现必须对照 `UI/*.html` 原型还原布局、信息层级、视觉氛围与交互落点；若与技术契约冲突，业务规则以 `PRD.md` 与 `docs/` 为准。

## 并行开发协议

- Batch 1: `M01 + M06`
- Batch 2: `M02 + M03 + M04 + M05`
- Batch 3: `M07 + M08 + M11`
- Batch 4: `M09 + M10`

硬边界：

- 不得跨模块修改未归属的文件，除非共享契约文档先更新。
- 不得在 Batch 3/4 改数据库字段或 API 返回结构。
- 不得在 UI 模块里新增私有业务状态源。

## GEB 协议

L1 位于项目根：`/CLAUDE.md`

L2 位于模块目录：`/{module}/CLAUDE.md`

L3 位于业务文件头部：

```ts
/**
 * [INPUT]: 依赖 ...
 * [OUTPUT]: 对外提供 ...
 * [POS]: 位于 ...，被 ... 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
```

固定回环：

1. 改文件职责或导出，先更新 L3。
2. 改目录成员，更新该目录 L2 `CLAUDE.md`。
3. 改顶层模块、技术栈或骨架，更新本 L1。

## 实施纪律

- 文件超过 800 行就拆。
- 目录直接子文件超过 8 个就分层。
- Route Handler 不写原始 SQL。
- 文档滞后视为任务未完成。

法则: 极简・稳定・导航・版本精确
