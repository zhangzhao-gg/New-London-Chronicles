# components/focus/
> L2 | 父级: `components/CLAUDE.md`

成员清单

`FocusExperience.tsx`: M10 Focus 主界面，支持有任务/Free Focus 两态，任务完成通知与 auto-assign，结束时写 toast 摘要并导航回 city。  
`MusicPlayer.tsx`: M11 音频系统组件，承载 lo-fi 播放器 UI 与播放列表选择面板。  
`FocusGlyphs.tsx`: Focus 模块共享 SVG 图标集合（Header / Timer / Todo / 语言切换）。
`CLAUDE.md`: focus 组件目录职责与边界说明。  

法则

- `components/focus/` 只承载 Focus 模块专属纯客户端组件，不访问数据库、cookie、Route Handler 请求对象。  
- 音频相关业务状态统一由 `lib/audio.ts` 管理，组件只订阅快照并转发交互。  
- 视觉必须复用全局 token 与共享样式基线，不在目录内定义第二套设计系统。  

[PROTOCOL]: 变更时更新此头部，然后检查 `components/CLAUDE.md` 与 `/CLAUDE.md`
