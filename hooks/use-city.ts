// @ts-nocheck
/**
 * [INPUT]: `GET /api/city`、`POST /api/tasks/assign-next`、当前用户初始态、M06 共享 UI 组件
 * [OUTPUT]: 城市页客户端壳层、30 秒轮询、HUD 状态、tooltip 与 FOCUS 交互
 * [POS]: 位于 `hooks/use-city.ts`，被 `app/city/page.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `hooks/CLAUDE.md` 与 `/CLAUDE.md`
 */
// -nocheck
"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LogEntry from "@/components/hud/LogEntry";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import ResourceIcon from "@/components/ui/ResourceIcon";
import Tooltip from "@/components/ui/Tooltip";
const POLL_INTERVAL_MS = 30_000;
const DISTRICT_CLIP_PATH = "polygon(5% 0%, 95% 0%, 100% 20%, 100% 80%, 95% 100%, 5% 100%, 0% 80%, 0% 20%)";
const MAP_BACKGROUND_URL = "https://lh3.googleusercontent.com/aida-public/AB6AXuBnWRGiluCDGrb96_ij3-apGpLyOIjjvTCH3XjoBNrln-K4juXftlINRWdY6zkCjevg6RRqbWBbaTVbL0dgHkvpUNqXNSWZh3aP6vImBjoQquvKwZQn_dgkW8fiJVJnYkdNnZd5ICqPam5biCfGZNuz3gsbzp00WQ1D212aGY81rvtjNSQhnI-gw9ATsBM8_GEAaCOz34NYYe86L36aTVZWvHFGMx4h0TQqidEbwn6Djo7JuxHxRfu6T388MecqhKfGNLBoBpm-i4w";
const districtVisuals = {
    resource: {
        badge: "工业资源区",
        englishLabel: "Industrial Resource Zone",
        icon: "⚙",
        positionClassName: "left-[9%] top-[19%] h-28 w-48 md:left-[17%] md:top-[18%] md:h-32 md:w-56",
        surfaceClassName: "border-slate-400/45 bg-slate-500/8 text-slate-200 hover:bg-slate-500/14",
        summaryClassName: "text-slate-400/80",
        tooltipSide: "bottom",
    },
    residential: {
        badge: "居民聚居地",
        englishLabel: "Residential Settlement",
        icon: "⌂",
        positionClassName: "bottom-[17%] right-[8%] h-36 w-56 md:bottom-[18%] md:right-[20%] md:h-40 md:w-64",
        surfaceClassName: "border-[rgba(244,164,98,0.34)] bg-[rgba(244,164,98,0.08)] text-[var(--nlc-amber)] hover:bg-[rgba(244,164,98,0.14)]",
        summaryClassName: "text-[rgba(244,164,98,0.72)]",
        tooltipSide: "top",
    },
    medical: {
        badge: "紧急医疗站",
        englishLabel: "Emergency Medical Post",
        icon: "✚",
        positionClassName: "right-[3%] top-[37%] h-32 w-32 md:right-[7%] md:top-[39%] md:h-40 md:w-40",
        surfaceClassName: "border-blue-400/40 bg-blue-500/8 text-blue-200 hover:bg-blue-500/14",
        summaryClassName: "text-blue-200/80",
        tooltipSide: "left",
    },
    food: {
        badge: "食物区",
        englishLabel: "Food Production",
        icon: "❈",
        positionClassName: "bottom-[35%] left-[3%] h-20 w-32 md:bottom-[38%] md:left-[8%] md:h-24 md:w-40",
        surfaceClassName: "border-green-700/40 bg-green-800/8 text-green-200 hover:bg-green-700/14",
        summaryClassName: "text-green-200/80",
        tooltipSide: "top",
    },
    exploration: {
        badge: "哨站",
        englishLabel: "Outpost",
        icon: "◈",
        positionClassName: "right-[29%] top-[11%] h-16 w-28 md:right-[36%] md:top-[10%] md:h-20 md:w-32",
        surfaceClassName: "border-slate-700/45 bg-slate-700/8 text-slate-300 hover:bg-slate-700/14",
        summaryClassName: "text-slate-400/80",
        tooltipSide: "bottom",
    },
};
function joinClasses(...values) {
    return values.filter(Boolean).join(" ");
}
function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value);
}
async function readJson(response) {
    try {
        return (await response.json());
    }
    catch {
        return null;
    }
}
function getApiErrorMessage(payload, fallback) {
    const message = payload?.error?.message?.trim();
    return message && message.length > 0 ? message : fallback;
}
async function fetchCitySnapshot() {
    const response = await fetch("/api/city", {
        method: "GET",
        cache: "no-store",
        headers: {
            Accept: "application/json",
        },
    });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to load city snapshot."));
    }
    return payload;
}
async function persistAutoAssign(autoAssign) {
    const response = await fetch("/api/users/me/settings", {
        method: "PATCH",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({ autoAssign }),
    });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to update auto assign setting."));
    }
    return payload.user;
}
async function assignNextTask() {
    const response = await fetch("/api/tasks/assign-next", {
        method: "POST",
        cache: "no-store",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({}),
    });
    const payload = await readJson(response);
    if (!response.ok) {
        throw new Error(getApiErrorMessage(payload, "Failed to assign next task."));
    }
    return payload;
}
export function useCity(initialUser) {
    const router = useRouter();
    const mountedRef = useRef(true);
    const [city, setCity] = useState(null);
    const [user, setUser] = useState(initialUser);
    const [language, setLanguage] = useState("zh-CN");
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [actionMessage, setActionMessage] = useState(null);
    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);
    const refreshCity = useCallback(async (background = false) => {
        if (background) {
            setIsRefreshing(true);
        }
        else {
            setIsLoading(true);
        }
        try {
            const snapshot = await fetchCitySnapshot();
            if (!mountedRef.current) {
                return;
            }
            setCity(snapshot);
            setLanguage((currentValue) => (snapshot.languageOptions.includes(currentValue) ? currentValue : snapshot.currentLanguage));
            setErrorMessage(null);
        }
        catch (error) {
            if (!mountedRef.current) {
                return;
            }
            setErrorMessage(error instanceof Error ? error.message : "Failed to load city snapshot.");
        }
        finally {
            if (!mountedRef.current) {
                return;
            }
            if (background) {
                setIsRefreshing(false);
            }
            else {
                setIsLoading(false);
            }
        }
    }, []);
    useEffect(() => {
        void refreshCity();
        const pollTimer = window.setInterval(() => {
            void refreshCity(true);
        }, POLL_INTERVAL_MS);
        return () => {
            window.clearInterval(pollTimer);
        };
    }, [refreshCity]);
    const toggleAutoAssign = useCallback(async () => {
        const nextValue = !user.autoAssign;
        setActionMessage(null);
        setUser((currentValue) => ({ ...currentValue, autoAssign: nextValue }));
        setIsSavingSettings(true);
        try {
            const updatedUser = await persistAutoAssign(nextValue);
            if (!mountedRef.current) {
                return;
            }
            setUser(updatedUser);
        }
        catch (error) {
            if (!mountedRef.current) {
                return;
            }
            setUser((currentValue) => ({ ...currentValue, autoAssign: !nextValue }));
            setActionMessage(error instanceof Error ? error.message : "Failed to update auto assign setting.");
        }
        finally {
            if (mountedRef.current) {
                setIsSavingSettings(false);
            }
        }
    }, [user.autoAssign]);
    const focus = useCallback(async () => {
        setActionMessage(null);
        if (!user.autoAssign) {
            setIsTaskModalOpen(true);
            return;
        }
        setIsAssigning(true);
        try {
            const payload = await assignNextTask();
            if (!mountedRef.current) {
                return;
            }
            router.push(payload.redirectTo || `/focus?sessionId=${payload.sessionId}`);
        }
        catch (error) {
            if (!mountedRef.current) {
                return;
            }
            setActionMessage(error instanceof Error ? error.message : "Failed to assign next task.");
        }
        finally {
            if (mountedRef.current) {
                setIsAssigning(false);
            }
        }
    }, [router, user.autoAssign]);
    return {
        actionMessage,
        city,
        errorMessage,
        focus,
        isAssigning,
        isLoading,
        isRefreshing,
        isSavingSettings,
        isTaskModalOpen,
        language,
        setActionMessage,
        setIsTaskModalOpen,
        setLanguage,
        toggleAutoAssign,
        user,
    };
}
function statusBadgeClassName(status) {
    switch (status) {
        case "可采集":
            return "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
        case "建造进行中":
            return "border-amber-500/30 bg-amber-500/12 text-amber-100";
        case "资源不足":
            return "border-red-500/30 bg-red-500/12 text-red-200";
        case "无进行中任务":
            return "border-slate-500/30 bg-slate-600/12 text-slate-200";
    }
}
function resourceRows(resources) {
    return [
        { resource: "coal", amount: resources?.coal ?? 0 },
        { resource: "wood", amount: resources?.wood ?? 0 },
        { resource: "steel", amount: resources?.steel ?? 0 },
        { resource: "rawFood", amount: resources?.rawFood ?? 0 },
        { resource: "foodSupply", amount: resources?.foodSupply ?? 0 },
        { resource: "temperature", amount: "-20°C" },
    ];
}
function DistrictZone({ district }) {
    const visual = districtVisuals[district.district];
    return (_jsx(Tooltip, { content: _jsxs("div", { className: "space-y-1.5", children: [_jsx("div", { className: "text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[var(--nlc-orange)]", children: district.label }), _jsxs("div", { children: ["\u5F53\u524D\u72B6\u6001\uFF1A", district.status] }), _jsxs("div", { children: ["\u6B63\u5728\u6B64\u5904\u5DE5\u4F5C\u7684\u4EBA\u6570\uFF1A", district.workingCount] })] }), side: visual.tooltipSide, children: _jsxs("button", { "aria-label": district.label, className: joinClasses("district-zone absolute overflow-hidden rounded-sm border text-left shadow-[0_18px_50px_rgba(0,0,0,0.32)] transition duration-200", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nlc-orange)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nlc-dark)]", visual.positionClassName, visual.surfaceClassName), style: { clipPath: DISTRICT_CLIP_PATH }, type: "button", children: [_jsx("div", { className: "absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-black/20" }), _jsxs("div", { className: "relative flex h-full flex-col justify-between px-4 py-3", children: [_jsxs("div", { children: [_jsxs("div", { className: "flex items-center gap-2 text-[0.72rem] font-black uppercase tracking-[0.18em]", children: [_jsx("span", { className: "text-base leading-none", children: visual.icon }), _jsx("span", { children: visual.badge })] }), _jsx("div", { className: "mt-1 text-[0.62rem] uppercase tracking-[0.18em] text-white/55", children: visual.englishLabel })] }), _jsxs("div", { className: joinClasses("space-y-2 text-xs", visual.summaryClassName), children: [_jsx("span", { className: joinClasses("inline-flex rounded-full border px-2 py-1 text-[0.64rem] uppercase tracking-[0.16em]", statusBadgeClassName(district.status)), children: district.status }), _jsxs("div", { className: "text-[0.7rem] uppercase tracking-[0.16em]", children: ["Workers: ", district.workingCount] })] })] })] }) }));
}
export function CityPageShell({ initialUser }) {
    const { actionMessage, city, errorMessage, focus, isAssigning, isLoading, isRefreshing, isSavingSettings, isTaskModalOpen, language, setActionMessage, setIsTaskModalOpen, setLanguage, toggleAutoAssign, user, } = useCity(initialUser);
    const resources = useMemo(() => resourceRows(city?.resources ?? null), [city?.resources]);
    const districts = city?.districts ?? [];
    const activeDistrict = districts[0] ?? null;
    const languageOptions = city?.languageOptions?.length ? city.languageOptions : ["zh-CN", "en-US"];
    return (_jsxs("div", { className: "relative min-h-screen bg-[radial-gradient(circle_at_top,#342015_0%,#140d09_44%,#090604_100%)] text-[var(--nlc-text)]", children: [_jsx("header", { className: "sticky top-0 z-40 border-b border-[rgba(244,164,98,0.22)] bg-[rgba(20,13,9,0.92)] px-4 py-3 backdrop-blur-md sm:px-6", children: _jsxs("div", { className: "mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4", children: [_jsxs("div", { className: "flex items-center gap-4", children: [_jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-md border border-[rgba(244,164,98,0.24)] bg-[rgba(244,164,98,0.08)] text-2xl text-[var(--nlc-orange)]", children: "\u2318" }), _jsxs("div", { children: [_jsx("div", { className: "text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[var(--nlc-muted)]", children: "Generator Status" }), _jsx("h1", { className: "m-0 text-2xl font-semibold uppercase tracking-[0.18em] text-[var(--nlc-orange)]", children: "New London" }), _jsx("p", { className: "m-0 text-[0.72rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "Nominal \u00B7 City command synchronized" })] })] }), _jsxs("nav", { "aria-label": "Primary", className: "flex flex-wrap items-center gap-2", children: [_jsx(Button, { "aria-pressed": true, size: "sm", variant: "tab", children: "LOGISTICS" }), _jsx(Button, { size: "sm", variant: "tab", children: "COUNCIL" }), _jsx(Button, { size: "sm", variant: "tab", children: "ARCHIVES" })] })] }) }), _jsx("section", { className: "border-b border-[rgba(244,164,98,0.14)] bg-[rgba(0,0,0,0.22)] px-4 py-3 sm:px-6", children: _jsx("div", { className: "mx-auto flex w-full max-w-[1440px] flex-wrap gap-3", children: resources.map((item) => (_jsx("div", { className: "nlc-resource-chip min-w-[154px] justify-between bg-[rgba(0,0,0,0.22)]", children: _jsx(ResourceIcon, { amount: item.amount, resource: item.resource, showLabel: true }) }, item.resource))) }) }), _jsxs("main", { className: "mx-auto grid w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 xl:grid-cols-[minmax(0,1fr)_320px]", children: [_jsxs("section", { className: "relative min-h-[640px] overflow-hidden rounded-[28px] border border-[rgba(244,164,98,0.18)] bg-[rgba(10,7,5,0.82)] shadow-[0_26px_80px_rgba(0,0,0,0.34)]", children: [_jsx("div", { className: "absolute inset-0 bg-cover bg-center brightness-[0.33] saturate-[0.85]", style: { backgroundImage: `url(${MAP_BACKGROUND_URL})` } }), _jsx("div", { className: "absolute inset-0 bg-[radial-gradient(circle_at_50%_52%,transparent_18%,rgba(0,0,0,0.72)_100%)]" }), _jsx("div", { className: "absolute inset-0 bg-gradient-to-t from-[rgba(9,6,4,0.92)] via-transparent to-[rgba(9,6,4,0.45)]" }), _jsxs("div", { className: "absolute left-6 top-6 z-10 rounded-md border border-[rgba(244,164,98,0.16)] bg-[rgba(10,7,5,0.75)] px-4 py-3 backdrop-blur-sm", children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.24em] text-[var(--nlc-muted)]", children: "Great Frost" }), _jsx("div", { className: "mt-1 text-sm uppercase tracking-[0.2em] text-[var(--nlc-orange)]", children: "District tactical view" })] }), _jsxs("div", { className: "absolute inset-0", children: [_jsxs("div", { className: "absolute left-1/2 top-1/2 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-[rgba(255,157,0,0.4)] bg-[rgba(255,157,0,0.08)] shadow-[0_0_50px_rgba(255,157,0,0.18)] md:h-48 md:w-48", children: [_jsx("div", { className: "absolute inset-3 rounded-full border border-[rgba(255,157,0,0.22)] bg-[rgba(255,157,0,0.12)] animate-pulse" }), _jsxs("div", { className: "relative text-center", children: [_jsx("div", { className: "text-4xl text-[var(--nlc-amber)] md:text-5xl", children: "\u2726" }), _jsx("div", { className: "mt-2 text-[0.72rem] font-black uppercase tracking-[0.2em] text-[var(--nlc-amber)]", children: "\u6838\u5FC3\u80FD\u91CF\u67A2\u7EBD" }), _jsx("div", { className: "mt-1 text-[0.62rem] uppercase tracking-[0.18em] text-white/55", children: "Core Energy Hub" })] })] }), districts.map((district) => (_jsx(DistrictZone, { district: district }, district.district)))] }), _jsxs("div", { className: "absolute bottom-6 left-1/2 z-10 flex w-[calc(100%-2rem)] max-w-[920px] -translate-x-1/2 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", children: [_jsxs("div", { className: "flex flex-1 items-stretch gap-2 rounded-md border border-[rgba(244,164,98,0.26)] bg-[rgba(10,7,5,0.84)] p-1 backdrop-blur-md", children: [_jsxs("button", { className: "flex flex-1 flex-col items-center justify-center rounded-sm border-b-2 border-[var(--nlc-orange)] bg-[rgba(244,164,98,0.1)] px-4 py-3 text-[var(--nlc-orange)]", type: "button", children: [_jsx("span", { className: "text-lg leading-none", children: "\u232C" }), _jsx("span", { className: "mt-1 text-[0.68rem] font-bold uppercase tracking-[0.2em]", children: "DISTRICTS" })] }), _jsxs(Button, { className: "flex-1 flex-col gap-1 px-4 py-3", onClick: () => void focus(), size: "md", variant: "ghost", children: [_jsx("span", { className: "text-lg leading-none", children: "\u25CE" }), _jsx("span", { className: "text-[0.68rem] tracking-[0.2em]", children: "FOCUS" })] })] }), _jsxs("div", { className: "rounded-md border border-[rgba(244,164,98,0.26)] bg-[rgba(10,7,5,0.84)] px-4 py-3 backdrop-blur-md lg:min-w-[280px]", children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "Hovered district data source" }), activeDistrict ? (_jsxs("div", { className: "mt-2 flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-sm uppercase tracking-[0.16em] text-[var(--nlc-orange)]", children: activeDistrict.label }), _jsx("div", { className: "mt-1 text-xs text-[var(--nlc-muted)]", children: activeDistrict.status })] }), _jsxs("div", { className: "text-right", children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "Workers" }), _jsx("div", { className: "mt-1 text-lg font-semibold text-white", children: activeDistrict.workingCount })] })] })) : (_jsx("div", { className: "mt-2 text-sm text-[var(--nlc-muted)]", children: "City telemetry is still synchronizing." }))] })] }), (isLoading || isRefreshing || errorMessage || actionMessage) && (_jsxs("div", { className: "absolute left-6 right-6 top-24 z-10 space-y-2", children: [isLoading ? (_jsx("div", { className: "rounded-md border border-[rgba(244,164,98,0.18)] bg-[rgba(10,7,5,0.82)] px-4 py-3 text-sm text-[var(--nlc-muted)] backdrop-blur-sm", children: "Synchronizing city telemetry..." })) : null, isRefreshing ? (_jsx("div", { className: "rounded-md border border-[rgba(244,164,98,0.14)] bg-[rgba(10,7,5,0.76)] px-4 py-3 text-sm text-[var(--nlc-muted)] backdrop-blur-sm", children: "Polling `/api/city` for fresh district state." })) : null, errorMessage ? (_jsx("div", { className: "rounded-md border border-red-500/24 bg-red-950/28 px-4 py-3 text-sm text-red-100 backdrop-blur-sm", children: errorMessage })) : null, actionMessage ? (_jsx("div", { className: "rounded-md border border-amber-500/24 bg-amber-950/22 px-4 py-3 text-sm text-amber-100 backdrop-blur-sm", children: actionMessage })) : null] }))] }), _jsxs("aside", { className: "flex flex-col gap-4 xl:min-h-[640px] xl:justify-between", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("section", { className: "nlc-panel rounded-2xl px-5 py-5", children: [_jsxs("div", { className: "mb-4 flex items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "City status" }), _jsx("h2", { className: "mt-2 text-lg font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]", children: "Right Upper HUD" })] }), _jsx("button", { className: "rounded-full border border-[rgba(244,164,98,0.16)] px-3 py-1 text-[0.62rem] uppercase tracking-[0.2em] text-[var(--nlc-muted)]", onClick: () => setActionMessage(null), type: "button", children: "Clear" })] }), _jsxs("div", { className: "grid gap-3", children: [_jsxs("div", { className: "rounded-xl border border-[rgba(244,164,98,0.14)] bg-[rgba(255,255,255,0.03)] px-4 py-3", children: [_jsx("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: "Online citizens" }), _jsx("div", { className: "mt-2 text-2xl font-semibold text-white", children: formatNumber(city?.onlineCount ?? 0) })] }), _jsxs("div", { className: "rounded-xl border border-[rgba(244,164,98,0.14)] bg-[rgba(255,255,255,0.03)] px-4 py-3", children: [_jsx("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: "Health status" }), _jsx("div", { className: "mt-2 text-sm font-semibold text-[var(--nlc-orange)]", children: city?.healthStatus ?? "--" })] }), _jsxs("div", { className: "rounded-xl border border-[rgba(244,164,98,0.14)] bg-[rgba(255,255,255,0.03)] px-4 py-3", children: [_jsx("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: "Current policy" }), _jsx("div", { className: "mt-2 text-sm leading-6 text-white/88", children: city?.currentPolicyPlaceholder ?? "No active policy" })] })] }), _jsxs("div", { className: "mt-5 border-t border-[rgba(244,164,98,0.12)] pt-4", children: [_jsxs("div", { className: "mb-3 flex items-center justify-between gap-3", children: [_jsx("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: "Language placeholder" }), _jsxs("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: ["Current: ", language] })] }), _jsx("div", { className: "flex gap-2", children: languageOptions.map((option) => (_jsx(Button, { "aria-pressed": language === option, className: "flex-1", onClick: () => setLanguage(option), size: "sm", variant: "tab", children: option }, option))) })] })] }), _jsxs("section", { className: "nlc-panel rounded-2xl px-5 py-5", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "City log" }), _jsx("h3", { className: "mt-2 text-lg font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]", children: "Recent events" })] }), _jsxs("span", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: [city?.logs.length ?? 0, " entries"] })] }), _jsx("div", { className: "max-h-[340px] space-y-3 overflow-y-auto pr-1", children: city?.logs.length ? (city.logs.map((entry) => _jsx(LogEntry, { entry: entry, locale: language }, entry.id))) : (_jsx("div", { className: "rounded-xl border border-dashed border-[rgba(244,164,98,0.18)] px-4 py-6 text-sm text-[var(--nlc-muted)]", children: "No city logs available yet." })) })] })] }), _jsxs("section", { className: "nlc-panel rounded-2xl px-5 py-5", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[0.68rem] uppercase tracking-[0.22em] text-[var(--nlc-muted)]", children: "Right Lower HUD" }), _jsx("h3", { className: "mt-2 text-lg font-semibold uppercase tracking-[0.16em] text-[var(--nlc-orange)]", children: "Current citizen" })] }), _jsx("div", { className: joinClasses("rounded-full border px-3 py-1 text-[0.62rem] uppercase tracking-[0.18em]", user.hungerStatus === "hungry"
                                                    ? "border-red-500/24 bg-red-950/24 text-red-200"
                                                    : "border-emerald-500/20 bg-emerald-950/18 text-emerald-200"), children: user.hungerStatus })] }), _jsxs("div", { className: "flex items-center gap-4 rounded-xl border border-[rgba(244,164,98,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-4", children: [_jsx("div", { className: "flex h-14 w-14 items-center justify-center rounded-lg border border-[rgba(244,164,98,0.24)] bg-[rgba(244,164,98,0.1)] text-xl font-semibold text-[var(--nlc-orange)]", children: user.username.slice(0, 1).toUpperCase() }), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-[0.65rem] uppercase tracking-[0.18em] text-[var(--nlc-muted)]", children: "Captain's log" }), _jsxs("div", { className: "mt-1 truncate text-base font-semibold text-white", children: ["\u57CE\u5E02\u7BA1\u7406\u8005\uFF1A", user.username] }), _jsx("div", { className: "mt-1 text-xs uppercase tracking-[0.16em] text-[var(--nlc-muted)]", children: "Citizen ID ready for next focus session" })] })] }), _jsx("div", { className: "mt-5 rounded-xl border border-[rgba(244,164,98,0.16)] bg-[rgba(255,255,255,0.03)] px-4 py-4", children: _jsxs("div", { className: "flex items-center justify-between gap-4", children: [_jsxs("div", { children: [_jsx("div", { className: "text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--nlc-orange)]", children: "Auto Assign" }), _jsx("div", { className: "mt-1 text-sm leading-6 text-[var(--nlc-muted)]", children: user.autoAssign ? "开启后点击 FOCUS 立即指派任务。" : "关闭后点击 FOCUS 先打开 M09 预留 modal。" })] }), _jsx("button", { "aria-checked": user.autoAssign, className: joinClasses("relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition", user.autoAssign
                                                        ? "border-[rgba(244,164,98,0.42)] bg-[rgba(244,164,98,0.2)]"
                                                        : "border-[rgba(244,164,98,0.18)] bg-[rgba(255,255,255,0.05)]"), disabled: isSavingSettings, onClick: () => void toggleAutoAssign(), role: "switch", type: "button", children: _jsx("span", { className: joinClasses("absolute left-1 top-1 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-white text-[0.55rem] font-bold text-[var(--nlc-dark)] shadow transition", user.autoAssign ? "translate-x-8" : "translate-x-0"), children: isSavingSettings ? "…" : user.autoAssign ? "ON" : "OFF" }) })] }) }), _jsxs("div", { className: "mt-5 flex gap-3", children: [_jsx(Button, { className: "flex-1", onClick: () => void focus(), size: "md", variant: "primary", children: isAssigning ? "ASSIGNING..." : "FOCUS" }), _jsx(Button, { className: "flex-1", onClick: () => setIsTaskModalOpen(true), size: "md", variant: "secondary", children: "DISTRICTS" })] })] })] })] }), _jsx("footer", { className: "h-1 bg-[rgba(244,164,98,0.42)] shadow-[0_0_12px_rgba(244,164,98,0.46)]" }), _jsx(Modal, { description: "M08 \u4EC5\u4FDD\u7559\u53EF\u63A5\u5165 M09 \u7684\u4EFB\u52A1\u9009\u62E9\u58F3\u5C42\uFF0C\u4E0D\u5B9E\u73B0\u5177\u4F53\u4EFB\u52A1\u5217\u8868\u4E0E\u5206\u6D3E\u903B\u8F91\u3002", footer: _jsxs("div", { className: "flex justify-end gap-3", children: [_jsx(Button, { onClick: () => setIsTaskModalOpen(false), variant: "ghost", children: "Close" }), _jsx(Button, { onClick: () => setIsTaskModalOpen(false), variant: "secondary", children: "Waiting For M09" })] }), onClose: () => setIsTaskModalOpen(false), open: isTaskModalOpen, size: "lg", title: "District Task Modal Placeholder", children: _jsxs("div", { className: "space-y-4 text-sm leading-7 text-[var(--nlc-muted)]", children: [_jsxs("p", { className: "m-0", children: ["\u5F53\u524D\u7528\u6237\uFF1A", user.username] }), _jsx("p", { className: "m-0", children: "\u81EA\u52A8\u4EFB\u52A1\u5DF2\u5173\u95ED\uFF0C\u56E0\u6B64 `FOCUS` \u5148\u8FDB\u5165\u7A7A modal \u58F3\u5C42\uFF0C\u7B49\u5F85 M09 \u63A5\u5165\u533A\u5757\u4EFB\u52A1\u5217\u8868\u3002" }), _jsxs("div", { className: "rounded-xl border border-dashed border-[rgba(244,164,98,0.2)] px-4 py-6 text-[var(--nlc-text)]", children: [_jsx("div", { className: "text-[0.72rem] uppercase tracking-[0.22em] text-[var(--nlc-orange)]", children: "Pending integration" }), _jsx("div", { className: "mt-2", children: "\u8FD9\u91CC\u6545\u610F\u4E0D\u5B9E\u73B0\u4EFB\u52A1\u5217\u8868\u3001\u533A\u5757\u8BE6\u60C5\u4E0E join \u903B\u8F91\uFF0C\u907F\u514D\u8D8A\u754C\u8FDB\u5165 M09\u3002" })] })] }) })] }));
}
export default useCity;
