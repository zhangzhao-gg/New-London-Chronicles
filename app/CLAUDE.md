# app/
> L2 | 父级: /CLAUDE.md

成员清单

`city/`: M08 城市地图页入口目录。  
`focus/`: M10 Focus 页面入口目录。  
`complete/`: M10 完成页入口目录。  
`globals.css`: 全局设计 token、共享表面样式与通用视觉基线。  
`layout.tsx`: 根布局，负责注入 `globals.css` 与全局字体。  
`page.tsx`: M07 登录页入口，负责用户名校验与登录跳转。  
`CLAUDE.md`: app 目录地图与职责边界。  

法则

- `app/` 只承载页面入口、布局与 HTTP 边界，不直接读写数据库。
- 全局样式以 `globals.css` 为唯一入口，不在页面文件重复定义 token。
- 新增页面前先确认模块归属，避免提前侵入未开始的页面模块。

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
