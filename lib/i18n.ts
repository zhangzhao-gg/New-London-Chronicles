/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: 轻量 i18n 工具函数 t() + 双语字典 + locale 常量
 * [POS]: 位于 `lib/i18n.ts`，被所有需要多语言文案的组件消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `lib/CLAUDE.md` 与 `/CLAUDE.md`
 */

export type Locale = "zh-CN" | "en-US";

export const LOCALES: Locale[] = ["zh-CN", "en-US"];

export const LOCALE_LABELS: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

const STORAGE_KEY = "nlc:locale";

/* ─── 持久化 ─── */

export function getSavedLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en-US" ? "en-US" : "zh-CN";
  } catch {
    return "zh-CN";
  }
}

export function saveLocale(locale: Locale) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch { /* storage blocked — ignore */ }
}

/* ─── 字典 ─── */

type Dict = Record<string, string>;

const zhCN: Dict = {
  /* ── Header ── */
  "header.title": "New London",
  "header.subtitle": "发电机状态：正常",
  "header.settings": "设置",
  "header.language": "语言",

  /* ── 导航 ── */
  "nav.map": "地图",
  "nav.build": "建造",
  "nav.personnel": "人事",
  "nav.alerts": "警报",
  "nav.logistics": "后勤",
  "nav.council": "议会",
  "nav.archives": "档案",

  /* ── 资源 ── */
  "res.coal": "煤炭",
  "res.wood": "木材",
  "res.steel": "钢材",
  "res.rawFood": "生食材",
  "res.foodSupply": "食物配给",
  "res.steamCore": "蒸汽核心",
  "res.temperature": "温度",

  /* ── 侧边栏 ── */
  "sidebar.citizenHope": "市民希望",
  "sidebar.discontent": "不满度",
  "sidebar.cityLog": "城市日志",
  "sidebar.telemetrySync": "城市遥测同步中。",

  /* ── 区块 ── */
  "district.resource.badge": "工业资源区",
  "district.resource.label": "工业资源区",
  "district.residential.badge": "居民聚居地",
  "district.residential.label": "居民聚居地",
  "district.medical.badge": "紧急医疗站",
  "district.medical.label": "紧急医疗站",
  "district.food.badge": "食物区",
  "district.food.label": "食物区",
  "district.exploration.badge": "哨站",
  "district.exploration.label": "哨站",
  "district.coreHub.badge": "核心能量枢纽",
  "district.coreHub.label": "核心能量枢纽",
  "district.coreHub.info": "核心能量枢纽在 M08 中仅作展示。",

  /* ── 区块状态 ── */
  "status.collectible": "可采集",
  "status.buildingInProgress": "建造进行中",
  "status.insufficientResources": "资源不足",
  "status.noActiveTask": "无进行中任务",

  /* ── 地图区域 ── */
  "map.syncMessage": "正在同步城市遥测...",
  "map.pollingMessage": "正在拉取最新区块状态。",
  "map.telemetryUnavailable": "区块遥测不可用",
  "map.telemetrySyncing": "正在同步城市遥测",
  "map.environmentLabel": "大霜冻",
  "map.viewType": "区块战术视图",

  /* ── 区域信息面板 ── */
  "overview.title": "区块概览",
  "overview.id": "ID: 00-412-X",
  "overview.selectedDistrict": "选中区块",
  "overview.noDistrictSelected": "未选中区块",
  "overview.inspectHint": "在城市地图上移动以检查区块。",
  "overview.workers": "工作人员",
  "overview.healthStatus": "健康状态",
  "overview.healthDefault": "严重冻伤暴露",
  "overview.policyLabel": "法令：",
  "overview.noPolicy": "无当前生效法令",

  /* ── 底部操作栏 ── */
  "bottom.districts": "区块",
  "bottom.focus": "专注",
  "bottom.assigning": "分配中",
  "bottom.captainLog": "舰长日志",
  "bottom.cityAdmin": "城市管理者：",
  "bottom.adminSync": "城市管理者状态已同步",
  "bottom.online": "在线",
  "bottom.autoAssign": "自动分配",

  /* ── Tooltip ── */
  "tooltip.workers": "工作人员：",
  "tooltip.noCrews": "无工作中人员",

  /* ── 过渡动画 ── */
  "transition.title": "派遣工人中",
  "transition.subtitle": "正在初始化值班协议...",

  /* ── DistrictModal ── */
  "modal.selectHint": "请选择一个区块后查看可用任务。",
  "modal.workers": "工作人员",
  "modal.districtUnavailable": "区块不可用",
  "modal.backToCity": "返回城市",
  "modal.title": "区块任务面板",
  "modal.operations": "区块作战",
  "modal.noOpenTasks": "当前区块没有开放中的任务。",
  "modal.noDistrict": "当前没有可供查看的区块。",
  "modal.joining": "加入中",
  "modal.loadFailed": "任务加载失败。",
  "modal.joinFailed": "加入任务失败。",
  "modal.conflict": "你已经有工作了，请先完成当前专注任务。",
  "modal.insufficientInventory": "当前城市库存不足，暂时无法加入。",
  "task.participants": "参与人数",
  "task.slot": "槽位",
  "task.slotNA": "N/A",
  "task.progress": "已推进",
  "task.remaining": "剩余",
  "task.minutes": "分钟",
  "task.totalDuration": "总工时",
  "task.continuingWork": "持续推进区块工序",
  "task.writesCityState": "，实例完成后会直接写入城市状态。",
  "task.convertResource": "执行资源转化",
  "task.perHeartbeat": "/10min",
  "task.noPatients": "当前没有病患，医疗班次暂不开放。",
  "task.missingResources": "缺少资源：",
  "task.defaultEffect": "进入区块后会在 Focus 中开始本轮工作。",

  /* ── 区块描述 ── */
  "districtCopy.exploration.title": "远征前哨",
  "districtCopy.exploration.subtitle": "前哨正在等待新的远征排班与外部巡查。",
  "districtCopy.food.title": "食物区",
  "districtCopy.food.subtitle": "食物区负责维持生存线，原料与配给会在这里被重新调度。",
  "districtCopy.medical.title": "医疗站",
  "districtCopy.medical.subtitle": "医疗站关注病患与冻伤处理，任务可用性随城市状态变化。",
  "districtCopy.residential.title": "居民聚居地",
  "districtCopy.residential.subtitle": "居民区的建造与后勤维护会持续决定城市的容纳与稳定。",
  "districtCopy.resource.title": "工业资源区",
  "districtCopy.resource.subtitle": "资源区决定煤炭、木材与钢材的供给节奏，是城市心脏外的第二条命脉。",
};

const enUS: Dict = {
  /* ── Header ── */
  "header.title": "New London",
  "header.subtitle": "Generator Status: Nominal",
  "header.settings": "Settings",
  "header.language": "Language",

  /* ── 导航 ── */
  "nav.map": "Map",
  "nav.build": "Build",
  "nav.personnel": "Personnel",
  "nav.alerts": "Alerts",
  "nav.logistics": "Logistics",
  "nav.council": "Council",
  "nav.archives": "Archives",

  /* ── 资源 ── */
  "res.coal": "Coal",
  "res.wood": "Wood",
  "res.steel": "Steel",
  "res.rawFood": "Raw Food",
  "res.foodSupply": "Food Supply",
  "res.steamCore": "Steam Core",
  "res.temperature": "Temperature",

  /* ── 侧边栏 ── */
  "sidebar.citizenHope": "Citizen Hope",
  "sidebar.discontent": "Discontent",
  "sidebar.cityLog": "City Log",
  "sidebar.telemetrySync": "City telemetry is synchronizing.",

  /* ── 区块 ── */
  "district.resource.badge": "Industrial Zone",
  "district.resource.label": "Industrial Resource Zone",
  "district.residential.badge": "Settlement",
  "district.residential.label": "Residential Settlement",
  "district.medical.badge": "Medical Post",
  "district.medical.label": "Emergency Medical Post",
  "district.food.badge": "Food Zone",
  "district.food.label": "Food Production",
  "district.exploration.badge": "Outpost",
  "district.exploration.label": "Outpost",
  "district.coreHub.badge": "Core Hub",
  "district.coreHub.label": "Core Energy Hub",
  "district.coreHub.info": "Core Energy Hub is informational in M08.",

  /* ── 区块状态 ── */
  "status.collectible": "Collectible",
  "status.buildingInProgress": "Building in progress",
  "status.insufficientResources": "Insufficient resources",
  "status.noActiveTask": "No active task",

  /* ── 地图区域 ── */
  "map.syncMessage": "Synchronizing city telemetry...",
  "map.pollingMessage": "Polling for fresh district state.",
  "map.telemetryUnavailable": "District telemetry unavailable",
  "map.telemetrySyncing": "Synchronizing city telemetry",
  "map.environmentLabel": "Great Frost",
  "map.viewType": "District tactical view",

  /* ── 区域信息面板 ── */
  "overview.title": "District Overview",
  "overview.id": "ID: 00-412-X",
  "overview.selectedDistrict": "Selected District",
  "overview.noDistrictSelected": "No district selected",
  "overview.inspectHint": "Move across the city map to inspect districts.",
  "overview.workers": "Workers",
  "overview.healthStatus": "Health Status",
  "overview.healthDefault": "Critical Cold Exposure",
  "overview.policyLabel": "Law:",
  "overview.noPolicy": "No active policy",

  /* ── 底部操作栏 ── */
  "bottom.districts": "Districts",
  "bottom.focus": "Focus",
  "bottom.assigning": "Assigning",
  "bottom.captainLog": "Captain\u2019s Log",
  "bottom.cityAdmin": "Administrator: ",
  "bottom.adminSync": "City Administrator status synchronized",
  "bottom.online": "Online",
  "bottom.autoAssign": "Auto assign",

  /* ── Tooltip ── */
  "tooltip.workers": "Workers: ",
  "tooltip.noCrews": "No active crews",

  /* ── 过渡动画 ── */
  "transition.title": "Deploying Worker",
  "transition.subtitle": "Initializing shift protocol...",

  /* ── DistrictModal ── */
  "modal.selectHint": "Select a district to view available tasks.",
  "modal.workers": "Workers",
  "modal.districtUnavailable": "District unavailable",
  "modal.backToCity": "Back to city",
  "modal.title": "District Task Board",
  "modal.operations": "District Operations",
  "modal.noOpenTasks": "No open tasks in this district.",
  "modal.noDistrict": "No district available for viewing.",
  "modal.joining": "Joining",
  "modal.loadFailed": "Failed to load district tasks.",
  "modal.joinFailed": "Failed to join task.",
  "modal.conflict": "You already have an active task. Please finish it first.",
  "modal.insufficientInventory": "Insufficient city inventory to join.",
  "task.participants": "Participants",
  "task.slot": "Slot",
  "task.slotNA": "N/A",
  "task.progress": "Progress",
  "task.remaining": "Remaining",
  "task.minutes": "min",
  "task.totalDuration": "Total duration",
  "task.continuingWork": "Continuing district work",
  "task.writesCityState": ". Writes to city state on completion.",
  "task.convertResource": "Resource conversion",
  "task.perHeartbeat": "/10min",
  "task.noPatients": "No patients currently. Medical shifts unavailable.",
  "task.missingResources": "Missing resources: ",
  "task.defaultEffect": "Entering the zone starts this shift in Focus.",

  /* ── 区块描述 ── */
  "districtCopy.exploration.title": "Exploration Outpost",
  "districtCopy.exploration.subtitle": "The outpost awaits new expedition scheduling and perimeter patrols.",
  "districtCopy.food.title": "Food District",
  "districtCopy.food.subtitle": "Maintains the survival line — raw materials and rations are redistributed here.",
  "districtCopy.medical.title": "Medical Ward",
  "districtCopy.medical.subtitle": "Handles patients and frostbite treatment. Availability depends on city state.",
  "districtCopy.residential.title": "Residential Settlement",
  "districtCopy.residential.subtitle": "Construction and logistics maintenance define the city\u2019s capacity and stability.",
  "districtCopy.resource.title": "Industrial Resource Zone",
  "districtCopy.resource.subtitle": "Controls coal, wood, and steel supply rhythms — the city\u2019s second lifeline.",
};

const dictionaries: Record<Locale, Dict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

/* ─── 翻译函数 ─── */

export function t(key: string, locale: Locale): string {
  return dictionaries[locale]?.[key] ?? dictionaries["zh-CN"]?.[key] ?? key;
}
