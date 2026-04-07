/**
 * [INPUT]: `useCity(initialUser, initialCity)`、`@/components/ui/*`、`UI/city.html`、`sessionStorage["nlc:focus-ended-toast"]`
 * [OUTPUT]: 城市页客户端 HUD 壳层、区块地图、状态面板与专注结束 toast 通知
 * [POS]: 位于 `components/city/CityPageShell.tsx`，被 `app/city/page.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/city/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

import {
  BottomIconDistricts,
  BottomIconFocus,
  GlobeGlyph,
  NavIconAlerts,
  NavIconBuild,
  NavIconMap,
  NavIconPersonnel,
  SettingsGlyph,
} from "@/components/city/CityIcons";
import DistrictModal from "@/components/city/DistrictModal";
import Button from "@/components/ui/Button";
import ResourceIcon, { type ResourceKind } from "@/components/ui/ResourceIcon";
import Tooltip, { type TooltipSide } from "@/components/ui/Tooltip";
import {
  useCity,
  type CityDistrict,
  type CitySnapshot,
  type DistrictKey,
  type DistrictStatus,
} from "@/hooks/use-city";
import type { UserDto } from "@/lib/auth";
import { t, getSavedLocale, saveLocale, LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";

const DISTRICT_CLIP_PATH = "polygon(5% 0%, 95% 0%, 100% 20%, 100% 80%, 95% 100%, 5% 100%, 0% 80%, 0% 20%)";
const MAP_BACKGROUND_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBnWRGiluCDGrb96_ij3-apGpLyOIjjvTCH3XjoBNrln-K4juXftlINRWdY6zkCjevg6RRqbWBbaTVbL0dgHkvpUNqXNSWZh3aP6vImBjoQquvKwZQn_dgkW8fiJVJnYkdNnZd5ICqPam5biCfGZNuz3gsbzp00WQ1D212aGY81rvtjNSQhnI-gw9ATsBM8_GEAaCOz34NYYe86L36aTVZWvHFGMx4h0TQqidEbwn6Djo7JuxHxRfu6T388MecqhKfGNLBoBpm-i4w";
const ADMIN_AVATAR_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCwRgeTWQVVdMFnNCD6g_DG-XCqove2SCd0dwbELK8C990veMZd4f2osXDxyOAVWpIahzU_XHpKvLXcBEg-nhecKW2Ox1Mjta8CGx4gYKPxLgijQpHiBdxwiLQ2MHXmqQYwt6NUKTVXeFvrZSwUaIGTxHGLCqxYwvzE-ejy8Xth-uFhNySGEuil7SHO6bIXcgr26bu8zfGaa558rEkzz1ZYX0YxrbwqVpTleBR4ic0qjGyoZ2NqpNM9StQT3WuMTlANUlEfrqhQgQo";

type ResourceRow = {
  resource: ResourceKind;
  amount: number | string;
};

type DistrictVisual = {
  badgeKey: string;
  labelKey: string;
  icon: string;
  layout: "corner-left" | "corner-right" | "center";
  positionStyle: React.CSSProperties;
  surfaceClassName: string;
  accentClassName: string;
  tooltipSide: TooltipSide;
};

const resourceI18nKeys: Record<ResourceKind, string> = {
  coal: "res.coal",
  wood: "res.wood",
  steel: "res.steel",
  rawFood: "res.rawFood",
  foodSupply: "res.foodSupply",
  steamCore: "res.steamCore",
  temperature: "res.temperature",
};

/* ─── 区块定位直接用 style 驱动，绕开 Tailwind 百分比类名扫描不确定性 ─── */

const districtVisuals: Record<DistrictKey, DistrictVisual> = {
  resource: {
    badgeKey: "district.resource.badge",
    labelKey: "district.resource.label",
    icon: "⚙",
    layout: "corner-left",
    positionStyle: { top: "20%", left: "30%", width: "14rem", height: "8rem" },
    surfaceClassName: "border-amber-400/40 bg-amber-500/12 text-amber-100 hover:bg-amber-500/18",
    accentClassName: "text-amber-300/90",
    tooltipSide: "bottom",
  },
  residential: {
    badgeKey: "district.residential.badge",
    labelKey: "district.residential.label",
    icon: "⌂",
    layout: "corner-right",
    positionStyle: { bottom: "20%", right: "25%", width: "16rem", height: "10rem" },
    surfaceClassName:
      "border-[rgba(244,164,98,0.34)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)] hover:bg-[rgba(244,164,98,0.14)]",
    accentClassName: "text-[rgba(255,193,137,0.82)]",
    tooltipSide: "top",
  },
  medical: {
    badgeKey: "district.medical.badge",
    labelKey: "district.medical.label",
    icon: "✚",
    layout: "center",
    positionStyle: { top: "28%", right: "22%", width: "10rem", height: "10rem" },
    surfaceClassName: "border-blue-400/40 bg-blue-500/8 text-blue-200 hover:bg-blue-500/14",
    accentClassName: "text-blue-300/76",
    tooltipSide: "left",
  },
  food: {
    badgeKey: "district.food.badge",
    labelKey: "district.food.label",
    icon: "❈",
    layout: "center",
    positionStyle: { bottom: "40%", left: "10%", width: "10rem", height: "6rem" },
    surfaceClassName: "border-green-800/35 bg-green-800/8 text-green-200 hover:bg-green-800/14",
    accentClassName: "text-green-400/76",
    tooltipSide: "top",
  },
  exploration: {
    badgeKey: "district.exploration.badge",
    labelKey: "district.exploration.label",
    icon: "◈",
    layout: "center",
    positionStyle: { top: "10%", right: "40%", width: "8rem", height: "5rem" },
    surfaceClassName: "border-cyan-400/40 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/18",
    accentClassName: "text-cyan-300/85",
    tooltipSide: "bottom",
  },
};

const navItems = [
  { labelKey: "nav.map", icon: NavIconMap, active: true },
  { labelKey: "nav.build", icon: NavIconBuild, active: false },
  { labelKey: "nav.personnel", icon: NavIconPersonnel, active: false },
  { labelKey: "nav.alerts", icon: NavIconAlerts, active: false },
] as const;

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

const statusI18nKeys: Record<DistrictStatus, string> = {
  "可采集": "status.collectible",
  "建造进行中": "status.buildingInProgress",
  "资源不足": "status.insufficientResources",
  "无进行中任务": "status.noActiveTask",
};

function statusBadgeClassName(status: DistrictStatus) {
  switch (status) {
    case "可采集":
      return "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
    case "建造进行中":
      return "border-amber-500/30 bg-amber-500/12 text-amber-100";
    case "资源不足":
      return "border-red-500/30 bg-red-500/12 text-red-200";
    case "无进行中任务":
    default:
      return "border-slate-500/30 bg-slate-600/12 text-slate-200";
  }
}

function formatLogTimestamp(value: string, locale: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function resourceRows(city: CitySnapshot | null): ResourceRow[] {
  return [
    { resource: "coal", amount: city?.resources.coal ?? 0 },
    { resource: "wood", amount: city?.resources.wood ?? 0 },
    { resource: "steel", amount: city?.resources.steel ?? 0 },
    { resource: "rawFood", amount: city?.resources.rawFood ?? 0 },
    { resource: "foodSupply", amount: city?.resources.foodSupply ?? 0 },
    { resource: "temperature", amount: `${city?.temperatureC ?? -20}°C` },
  ];
}

function DistrictZone({
  active,
  district,
  locale,
  onActivate,
  onOpen,
}: {
  active: boolean;
  district: CityDistrict;
  locale: Locale;
  onActivate: (districtKey: DistrictKey) => void;
  onOpen: (districtKey: DistrictKey) => void;
}) {
  const visual = districtVisuals[district.district];
  const zoneBadge = t(visual.badgeKey, locale);
  const zoneLabel = t(visual.labelKey, locale);
  const zoneFooter = district.workingCount > 0
    ? `${t("tooltip.workers", locale)}${formatNumber(district.workingCount)}`
    : t("tooltip.noCrews", locale);

  return (
    <Tooltip
      className="!absolute"
      style={visual.positionStyle}
      content={
        <div className="space-y-2">
          <div>
            <div className="text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]">
              {zoneBadge}
            </div>
            <div className="text-[11px] text-slate-400">{zoneLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className={joinClasses("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", statusBadgeClassName(district.status))}>
              {t(statusI18nKeys[district.status], locale)}
            </span>
          </div>
          <div className="text-[11px] text-slate-300">
            {t("tooltip.workers", locale)}<span className="font-mono font-bold text-white">{formatNumber(district.workingCount)}</span>
          </div>
        </div>
      }
      side={visual.tooltipSide}
    >
      <button
        aria-label={district.label}
        className={joinClasses(
          "h-full w-full overflow-hidden rounded-sm border text-left shadow-[0_18px_50px_rgba(0,0,0,0.32)] transition duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nlc-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nlc-dark)]",
          visual.surfaceClassName,
          active && "scale-[1.02] shadow-[0_0_28px_rgba(255,157,0,0.18)]",
        )}
        onClick={() => onOpen(district.district)}
        onFocus={() => onActivate(district.district)}
        onMouseEnter={() => onActivate(district.district)}
        style={{ clipPath: DISTRICT_CLIP_PATH }}
        type="button"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/20" />
        <div className="relative h-full">
          {visual.layout === "corner-left" ? (
            <>
              <div className={joinClasses("absolute left-4 top-2", visual.accentClassName)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">{visual.icon}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em]">{zoneLabel}</span>
                </div>
              </div>
              <div className="absolute bottom-2 right-4 text-xs font-mono tracking-tighter text-slate-500">{zoneFooter}</div>
            </>
          ) : null}

          {visual.layout === "corner-right" ? (
            <>
              <div className={joinClasses("absolute right-6 top-4 text-right", visual.accentClassName)}>
                <div className="flex items-center justify-end gap-2">
                  <span className="text-sm leading-none">{visual.icon}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.14em]">{zoneLabel}</span>
                </div>
              </div>
              <div className="absolute bottom-4 left-6 text-xs tracking-tight text-[rgba(244,164,98,0.64)]">{zoneFooter}</div>
            </>
          ) : null}

          {visual.layout === "center" ? (
            <div className={joinClasses("absolute inset-0 flex flex-col items-center justify-center p-4 text-center", visual.accentClassName)}>
              <span className="text-lg leading-none">{visual.icon}</span>
              <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em]">{zoneLabel}</span>
            </div>
          ) : null}

          {active ? (
            <div className="absolute inset-x-3 bottom-3 rounded-full border border-[rgba(255,157,0,0.16)] bg-[rgba(0,0,0,0.28)] px-2 py-1 text-center text-[9px] uppercase tracking-[0.16em] text-[rgba(255,221,190,0.88)]">
              {t(statusI18nKeys[district.status], locale)}
            </div>
          ) : null}
        </div>
      </button>
    </Tooltip>
  );
}

function StatusNotice({ children, tone = "default" }: { children: string; tone?: "default" | "error" | "warn" }) {
  const toneClassName =
    tone === "error"
      ? "border-red-500/24 bg-red-950/28 text-red-100"
      : tone === "warn"
        ? "border-amber-500/24 bg-amber-950/22 text-amber-100"
        : "border-[rgba(244,164,98,0.18)] bg-[rgba(10,7,5,0.82)] text-[var(--nlc-muted)]";

  return <div className={joinClasses("rounded-md border px-4 py-3 text-sm backdrop-blur-sm", toneClassName)}>{children}</div>;
}

export function CityPageShell({ initialCity = null, initialUser }: { initialCity?: CitySnapshot | null; initialUser: UserDto }) {
  const searchParams = useSearchParams();
  const {
    actionMessage,
    city,
    errorMessage,
    focus,
    freeFocus,
    isAssigning,
    isLoading,
    isRefreshing,
    isSavingSettings,
    isStartingFreeFocus,
    isTaskModalOpen,
    language,
    setActionMessage,
    setIsTaskModalOpen,
    setLanguage,
    toggleAutoAssign,
    user,
  } = useCity(initialUser, initialCity);

  const [activeDistrictKey, setActiveDistrictKey] = useState<DistrictKey | null>(null);
  const [hasHandledOpenTasksQuery, setHasHandledOpenTasksQuery] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [focusToast, setFocusToast] = useState<string | null>(null);
  const [focusToastExiting, setFocusToastExiting] = useState(false);
  const focusEndedConsumedRef = useRef(false);

  const locale = (language === "en-US" ? "en-US" : "zh-CN") as Locale;

  const langMenuRef = useRef<HTMLDivElement>(null);

  /* ─── 点击外部关闭语言菜单 ─── */
  useEffect(() => {
    if (!showLangMenu) return;
    function handleClick(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLangMenu]);

  /* ─── 首次挂载时从 localStorage 恢复语言偏好 ─── */
  useEffect(() => {
    const saved = getSavedLocale();
    if (saved !== locale) {
      setLanguage(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ─── 消费 focus 结束 toast ─── */
  useEffect(() => {
    if (focusEndedConsumedRef.current) return;
    const raw = sessionStorage.getItem("nlc:focus-ended-toast");
    if (!raw) return;
    focusEndedConsumedRef.current = true;
    sessionStorage.removeItem("nlc:focus-ended-toast");

    let summary: { narrative?: string; resource?: string };
    try { summary = JSON.parse(raw); } catch { return; }

    setFocusToast(summary.narrative ?? "专注已结束");

    if (user.autoAssign && summary.resource && summary.resource !== "focus") {
      const timer = setTimeout(() => void focus(), 3000);
      return () => clearTimeout(timer);
    }
  }, [focus, user.autoAssign]);

  useEffect(() => {
    if (!focusToast) return;
    const t1 = setTimeout(() => setFocusToastExiting(true), 3500);
    const t2 = setTimeout(() => { setFocusToast(null); setFocusToastExiting(false); }, 3740);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [focusToast]);

  const resources = useMemo(() => resourceRows(city), [city]);
  const districts = city?.districts ?? [];
  const districtTelemetryMessage = city ? t("map.telemetryUnavailable", locale) : t("map.telemetrySyncing", locale);

  useEffect(() => {
    if (!districts.length) {
      setActiveDistrictKey(null);
      return;
    }

    setActiveDistrictKey((currentValue) =>
      currentValue && districts.some((district) => district.district === currentValue) ? currentValue : districts[0].district,
    );
  }, [districts]);

  useEffect(() => {
    if (hasHandledOpenTasksQuery) {
      return;
    }

    if (searchParams.get("openTasks") !== "1") {
      setHasHandledOpenTasksQuery(true);
      return;
    }

    if (user.autoAssign || !districts.length) {
      return;
    }

    setIsTaskModalOpen(true);
    setHasHandledOpenTasksQuery(true);
  }, [districts.length, hasHandledOpenTasksQuery, searchParams, setIsTaskModalOpen, user.autoAssign]);

  const activeDistrict = useMemo(
    () => districts.find((district) => district.district === activeDistrictKey) ?? districts[0] ?? null,
    [activeDistrictKey, districts],
  );
  const activeDistrictVisual = activeDistrict ? districtVisuals[activeDistrict.district] : null;

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[radial-gradient(circle_at_top,#342015_0%,#140d09_46%,#090604_100%)] text-[var(--nlc-text)] lg:h-screen lg:overflow-hidden">
      <header className="sticky top-0 z-50 border-b-2 border-[rgba(244,164,98,0.22)] bg-[rgba(20,13,9,0.94)] px-4 py-1.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded border border-[rgba(244,164,98,0.2)] bg-[rgba(244,164,98,0.08)] p-2 text-xl text-[var(--nlc-orange)]">
                ⚙
              </div>
              <div>
                <h1 className="m-0 text-xl font-bold uppercase tracking-[0.14em] text-[var(--nlc-orange)]">{t("header.title", locale)}</h1>
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--nlc-muted)]">
                  {t("header.subtitle", locale)}
                </p>
              </div>
            </div>

            <nav className="hidden items-center gap-1 border-l border-[rgba(244,164,98,0.18)] pl-6 lg:flex" aria-label="Primary">
              <button className="rounded px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--nlc-orange)] transition-colors hover:bg-[rgba(244,164,98,0.1)]" type="button">
                {t("nav.logistics", locale)}
              </button>
              <button className="px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400 transition-colors hover:text-[var(--nlc-orange)]" type="button">
                {t("nav.council", locale)}
              </button>
              <button className="px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-400 transition-colors hover:text-[var(--nlc-orange)]" type="button">
                {t("nav.archives", locale)}
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 rounded border border-[rgba(244,164,98,0.12)] bg-black/35 p-1">
              <button
                aria-label="Settings"
                className="rounded p-2 text-slate-400 transition-colors hover:bg-[rgba(244,164,98,0.08)] hover:text-[var(--nlc-orange)]"
                type="button"
              >
                <SettingsGlyph />
              </button>
              <div className="relative" ref={langMenuRef}>
                <button
                  aria-label={t("header.language", locale)}
                  className="relative rounded p-2 text-slate-400 transition-colors hover:bg-[rgba(244,164,98,0.08)] hover:text-[var(--nlc-orange)]"
                  onClick={() => setShowLangMenu((v) => !v)}
                  type="button"
                >
                  <GlobeGlyph />
                  <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--nlc-orange)]" />
                </button>
                {showLangMenu ? (
                  <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-md border border-[rgba(244,164,98,0.2)] bg-[rgba(16,11,8,0.96)] py-1 shadow-xl backdrop-blur-md">
                    {LOCALES.map((loc) => (
                      <button
                        className={joinClasses(
                          "block w-full px-4 py-2 text-left text-xs transition-colors",
                          loc === locale
                            ? "bg-[rgba(244,164,98,0.12)] font-bold text-[var(--nlc-orange)]"
                            : "text-slate-400 hover:bg-[rgba(244,164,98,0.06)] hover:text-[var(--nlc-orange)]",
                        )}
                        key={loc}
                        onClick={() => { setLanguage(loc); saveLocale(loc as Locale); setShowLangMenu(false); }}
                        type="button"
                      >
                        {LOCALE_LABELS[loc]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="h-10 w-10 overflow-hidden rounded border-2 border-[rgba(244,164,98,0.4)] p-0.5">
              <img alt="City administrator portrait" className="h-full w-full rounded-sm object-cover" src={ADMIN_AVATAR_URL} />
            </div>
          </div>
        </div>
      </header>

      <div className="border-b border-[rgba(244,164,98,0.1)] bg-gradient-to-b from-[rgba(20,13,9,0.94)] to-[rgba(0,0,0,0.58)]">
        <div className="mx-auto flex max-w-[1360px] flex-wrap justify-center gap-2.5 px-4 py-2.5">
          {resources.map((item) => (
            <div
              className={joinClasses(
                "flex min-w-[132px] items-center gap-2.5 bg-black/40 px-3 py-2",
                item.resource === "temperature"
                  ? "border-l-2 border-[rgba(255,157,0,0.48)]"
                  : "border-l-2 border-[rgba(244,164,98,0.32)]",
              )}
              key={item.resource}
            >
              <ResourceIcon resource={item.resource} size="sm" />
              <div>
                <p
                  className={joinClasses(
                    "m-0 text-[10px] font-bold uppercase tracking-[0.16em]",
                    item.resource === "temperature" ? "text-[rgba(255,157,0,0.62)]" : "text-slate-500",
                  )}
                >
                  {t(resourceI18nKeys[item.resource], locale)}
                </p>
                <p
                  className={joinClasses(
                    "m-0 mt-1 text-base font-bold leading-none",
                    item.resource === "temperature" ? "text-[var(--nlc-amber)]" : "text-slate-100",
                  )}
                >
                  {item.amount}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <main className="flex min-h-0 flex-1 flex-col lg:min-h-0 lg:flex-row lg:overflow-hidden">
        <aside className="border-b border-[rgba(244,164,98,0.14)] bg-[rgba(12,8,5,0.9)] px-3 py-3 lg:flex lg:min-h-0 lg:w-72 lg:flex-col lg:justify-between lg:overflow-y-auto lg:border-b-0 lg:border-r lg:border-[rgba(244,164,98,0.14)]">
          <div>
            <div className="mb-4 flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              {navItems.map((item) => (
                <button
                  className={joinClasses(
                    "flex min-w-[112px] items-center gap-2.5 rounded-sm border px-4 py-3 text-left transition-all lg:min-w-0",
                    item.active
                      ? "border-[rgba(244,164,98,0.24)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-orange)]"
                      : "border-transparent text-slate-500 hover:border-[rgba(244,164,98,0.16)] hover:bg-[rgba(244,164,98,0.04)] hover:text-[var(--nlc-orange)]",
                  )}
                  key={item.labelKey}
                  type="button"
                >
                  <item.icon />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{t(item.labelKey, locale)}</span>
                </button>
              ))}
            </div>

            <div className="space-y-4 px-1 lg:px-0">
              <div className="rounded-sm border border-[rgba(244,164,98,0.2)] bg-[rgba(244,164,98,0.05)] p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.2em] text-[var(--nlc-muted)]">{t("sidebar.citizenHope", locale)}</p>
                  <span className="text-[10px] font-bold tabular-nums text-[var(--nlc-orange)]">65%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-[65%] rounded-full bg-[var(--nlc-orange)] shadow-[0_0_8px_rgba(244,164,98,0.5)] transition-all duration-700" />
                </div>
              </div>

              <div className="rounded-sm border border-red-900/30 bg-red-950/20 p-3.5">
                <div className="mb-2 flex items-center justify-between">
                  <p className="m-0 text-[10px] font-black uppercase tracking-[0.2em] text-red-400/70">{t("sidebar.discontent", locale)}</p>
                  <span className="text-[10px] font-bold tabular-nums text-red-400">28%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full w-[28%] rounded-full bg-red-600 transition-all duration-700" />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between border-b border-[rgba(244,164,98,0.12)] px-2 pb-1">
                  <span className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--nlc-orange)]">{t("sidebar.cityLog", locale)}</span>
                  <span className="text-[10px] text-[var(--nlc-muted)]">{city?.logs.length ?? 0}</span>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-sm border border-[rgba(244,164,98,0.08)] bg-black/20 p-2 lg:max-h-[280px]">
                  {city?.logs.length ? (
                    city.logs.slice(0, 8).map((entry) => (
                      <div className="flex gap-2" key={entry.id}>
                        <span className="whitespace-nowrap font-mono text-[11px] text-[var(--nlc-orange)]/55">
                          {formatLogTimestamp(entry.createdAt, language)}
                        </span>
                        <p className="m-0 text-xs leading-snug text-slate-400">
                          <span className="text-[var(--nlc-orange)]">{entry.userLabel}</span>
                          <span className="mx-1 text-slate-600">·</span>
                          {entry.actionDesc}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="m-0 text-[10px] leading-5 text-[var(--nlc-muted)]">{t("sidebar.telemetrySync", locale)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="relative min-h-[560px] flex-1 overflow-hidden bg-slate-950 lg:min-h-0">
          <div className="absolute inset-0 bg-cover bg-center brightness-[0.36] saturate-[0.88]" style={{ backgroundImage: `url(${MAP_BACKGROUND_URL})` }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(9,6,4,0.96)] via-transparent to-[rgba(9,6,4,0.45)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_20%,rgba(0,0,0,0.64)_100%)]" />

          <div className="absolute left-5 top-5 z-10 rounded-sm border border-[rgba(244,164,98,0.16)] bg-[rgba(10,7,5,0.75)] px-3.5 py-2.5 backdrop-blur-sm">
            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]">{t("map.environmentLabel", locale)}</div>
            <div className="mt-1 text-[0.82rem] uppercase tracking-[0.16em] text-[var(--nlc-orange)]">{t("map.viewType", locale)}</div>
          </div>

          <div className="absolute left-5 right-5 top-20 z-10 space-y-2">
            {isLoading ? <StatusNotice>{t("map.syncMessage", locale)}</StatusNotice> : null}
            {isRefreshing ? <StatusNotice>{t("map.pollingMessage", locale)}</StatusNotice> : null}
            {!isLoading && !districts.length ? <StatusNotice>{districtTelemetryMessage}</StatusNotice> : null}
            {errorMessage ? <StatusNotice tone="error">{errorMessage}</StatusNotice> : null}
            {actionMessage ? <StatusNotice tone="warn">{actionMessage}</StatusNotice> : null}
          </div>

          <div className="absolute inset-0 flex items-center justify-center">
            <button
              className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-2 border-[rgba(255,157,0,0.4)] bg-[rgba(255,157,0,0.08)] shadow-[0_0_40px_rgba(255,157,0,0.18)] transition hover:bg-[rgba(255,157,0,0.14)] md:h-40 md:w-40"
              onClick={() => setActionMessage(t("district.coreHub.info", locale))}
              type="button"
            >
              <div className="absolute inset-3 rounded-full border border-[rgba(255,157,0,0.22)] bg-[rgba(255,157,0,0.1)] animate-pulse" />
              <div className="relative px-4 text-center text-[var(--nlc-amber)]">
                <div className="text-3xl md:text-4xl">✦</div>
                <div className="mt-2 text-[10px] font-black uppercase tracking-[0.22em]">{t("district.coreHub.badge", locale)}</div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.18em] text-[rgba(255,208,165,0.72)]">{t("district.coreHub.label", locale)}</div>
              </div>
            </button>

            {districts.map((district) => (
              <DistrictZone
                active={activeDistrict?.district === district.district}
                district={district}
                key={district.district}
                locale={locale}
                onActivate={setActiveDistrictKey}
                onOpen={(districtKey) => {
                  setActiveDistrictKey(districtKey);
                  setIsTaskModalOpen(true);
                }}
              />
            ))}
          </div>

          <div className="absolute right-8 top-8 z-10 hidden w-64 border border-[rgba(244,164,98,0.22)] bg-[rgba(0,0,0,0.6)] p-3.5 backdrop-blur-md xl:block">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="m-0 text-sm font-black uppercase tracking-[0.18em] text-[var(--nlc-orange)]">{t("overview.title", locale)}</h3>
                <p className="m-0 mt-1 text-[10px] font-mono text-slate-400">{t("overview.id", locale)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded border border-[rgba(244,164,98,0.12)] bg-[rgba(244,164,98,0.05)] p-3">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--nlc-muted)]">{t("overview.selectedDistrict", locale)}</p>
                <p className="mt-2 text-base font-semibold text-slate-100">
                  {activeDistrict ? t(districtVisuals[activeDistrict.district].labelKey, locale) : t("overview.noDistrictSelected", locale)}
                </p>
                <p className="m-0 mt-1 text-xs text-[var(--nlc-muted)]">
                  {activeDistrictVisual ? t(activeDistrictVisual.labelKey, locale) : t("overview.inspectHint", locale)}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-white/70">{t("overview.workers", locale)} {formatNumber(activeDistrict?.workingCount ?? 0)}</span>
                  {activeDistrict ? (
                    <span className={joinClasses("rounded-full border px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.16em]", statusBadgeClassName(activeDistrict.status))}>
                      {t(statusI18nKeys[activeDistrict.status], locale)}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="rounded border border-red-900/20 bg-red-950/20 p-3">
                <p className="m-0 text-[10px] font-bold uppercase tracking-[0.18em] text-red-300/80">{t("overview.healthStatus", locale)}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-red-500">✚</span>
                  <span className="text-sm text-red-200">{city?.healthStatus ?? t("overview.healthDefault", locale)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[rgba(244,164,98,0.12)] pt-4">
              <div className="flex -space-x-2">
                <div className="h-6 w-6 rounded-full border border-[var(--nlc-orange)] bg-slate-800" />
                <div className="h-6 w-6 rounded-full border border-[var(--nlc-orange)] bg-slate-700" />
                <div className="h-6 w-6 rounded-full border border-[var(--nlc-orange)] bg-slate-600" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--nlc-muted)]">
                {t("overview.policyLabel", locale)} {city?.currentPolicyPlaceholder ?? t("overview.noPolicy", locale)}
              </span>
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 z-10 flex w-[min(84%,980px)] -translate-x-1/2 flex-col gap-2.5 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-1 items-center gap-2 rounded-sm border border-[rgba(244,164,98,0.3)] bg-[rgba(20,13,9,0.9)] p-1 backdrop-blur-md shadow-2xl">
              <button
                aria-pressed="true"
                className="flex flex-1 flex-col items-center justify-center border-b-2 border-[var(--nlc-orange)] bg-[rgba(244,164,98,0.1)] py-2.5 text-[var(--nlc-orange)] transition-colors"
                type="button"
              >
                <BottomIconDistricts />
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em]">{t("bottom.districts", locale)}</span>
              </button>
              <button
                className={joinClasses(
                  "flex flex-1 flex-col items-center justify-center py-2.5 transition-colors",
                  isAssigning
                    ? "cursor-not-allowed text-slate-500 opacity-60"
                    : "text-slate-500 hover:bg-[rgba(244,164,98,0.05)] hover:text-[var(--nlc-orange)]",
                )}
                disabled={isAssigning}
                onClick={() => void focus()}
                type="button"
              >
                <BottomIconFocus />
                <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em]">{isAssigning ? t("bottom.assigning", locale) : t("bottom.focus", locale)}</span>
              </button>
            </div>

            <div className="flex flex-1 justify-end">
              <div className="w-full max-w-[288px] border border-[rgba(244,164,98,0.3)] bg-[rgba(20,13,9,0.9)] p-3 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-[rgba(244,164,98,0.4)] p-0.5">
                    <img alt="Administrator portrait" className="h-full w-full rounded-sm object-cover" src={ADMIN_AVATAR_URL} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--nlc-orange)]">{t("bottom.captainLog", locale)}</p>
                    <h4 className="m-0 mt-1 truncate text-sm font-bold text-slate-100">{t("bottom.cityAdmin", locale)}{user.username}</h4>
                    <p className="m-0 mt-1 text-[10px] italic text-slate-400">{t("bottom.adminSync", locale)}</p>
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-[11px] text-[var(--nlc-muted)] sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={joinClasses(
                        "rounded-full border px-2 py-1 uppercase tracking-[0.16em]",
                        user.hungerStatus === "hungry"
                          ? "border-red-500/24 bg-red-950/24 text-red-200"
                          : "border-emerald-500/20 bg-emerald-950/18 text-emerald-200",
                      )}
                    >
                      {user.hungerStatus}
                    </span>
                    <span className="rounded-full border border-[rgba(244,164,98,0.18)] px-2 py-1 uppercase tracking-[0.16em] text-white/70">
                      {t("bottom.online", locale)} {formatNumber(city?.onlineCount ?? 0)}
                    </span>
                  </div>

                  <button
                    aria-label={t("bottom.autoAssign", locale)}
                    aria-checked={user.autoAssign}
                    className={joinClasses(
                      "relative inline-flex h-8 w-16 items-center rounded-full border transition",
                      user.autoAssign
                        ? "border-[rgba(244,164,98,0.42)] bg-[rgba(244,164,98,0.2)]"
                        : "border-[rgba(244,164,98,0.18)] bg-[rgba(255,255,255,0.05)]",
                    )}
                    disabled={isSavingSettings}
                    onClick={() => void toggleAutoAssign()}
                    role="switch"
                    type="button"
                  >
                    <span
                      className={joinClasses(
                        "absolute left-1 top-1 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-white text-[0.55rem] font-bold text-[var(--nlc-dark)] shadow transition",
                        user.autoAssign ? "translate-x-8" : "translate-x-0",
                      )}
                    >
                      {isSavingSettings ? "…" : user.autoAssign ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="h-1 bg-[rgba(244,164,98,0.42)] shadow-[0_0_12px_rgba(244,164,98,0.46)]" />

      {focusToast ? createPortal(
        <div className={joinClasses("fixed right-4 top-4 z-[9999] max-w-sm rounded-sm border border-emerald-500/40 bg-[rgba(4,8,5,0.94)] px-5 py-3.5 text-[0.74rem] leading-5 text-emerald-100 shadow-[0_18px_36px_rgba(16,185,129,0.24)] backdrop-blur-sm sm:right-6 sm:top-5", focusToastExiting ? "nlc-toast-exit" : "nlc-toast-enter")} role="alert">{focusToast}</div>,
        document.body,
      ) : null}

      <DistrictModal district={activeDistrict} isStartingFreeFocus={isStartingFreeFocus} onClose={() => setIsTaskModalOpen(false)} onFreeFocus={() => { setIsTaskModalOpen(false); void freeFocus(); }} open={isTaskModalOpen} />
    </div>
  );
}
