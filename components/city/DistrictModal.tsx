/**
 * [INPUT]: 当前选中区块、`GET /api/tasks`、`GET /api/session/current`、`POST /api/tasks/join`、`POST /api/session/bind-task`、`onFreeFocus`
 * [OUTPUT]: M09 区块任务弹窗，展示任务列表、新建/绑定任务、"直接专注"入口，含 live session 感知
 * [POS]: 位于 `components/city/DistrictModal.tsx`，被 `components/city/CityPageShell.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/city/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { CityDistrict, DistrictKey } from "@/hooks/use-city";
import { navigateTo } from "@/lib/client-navigation";

const TASK_THUMB_URL = "/images/city-map-bg.jpg";

type TaskTemplate = {
  id: string;
  code: string;
  name: string;
  type: "collect" | "build" | "convert" | "work";
  district: DistrictKey;
  outputResource: string | null;
  outputPerHeartbeat: number | null;
  durationMinutes: number | null;
  buildCost: Record<string, number>;
  heartbeatCost: Record<string, number>;
};

type TaskListItem = {
  template: TaskTemplate;
  instance: {
    id: string;
    slotId: string | null;
    progressMinutes: number;
    remainingMinutes: number;
  } | null;
  building: { id: string; name: string; slotId: string; location: string | null } | null;
  participants: number;
  canJoin: boolean;
  disabledReason: "insufficient_resource" | "no_patients" | null;
  actionLabel: string;
};

type DistrictModalProps = {
  district: CityDistrict | null;
  isStartingFreeFocus?: boolean;
  onClose: () => void;
  onFreeFocus?: () => void;
  open: boolean;
};

class DistrictModalApiError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

const districtCopy: Record<DistrictKey, { title: string; subtitle: string }> = {
  exploration: {
    title: "Exploration Outpost",
    subtitle: "前哨正在等待新的远征排班与外部巡查。",
  },
  food: {
    title: "Food District",
    subtitle: "食物区负责维持生存线，原料与配给会在这里被重新调度。",
  },
  medical: {
    title: "Medical Ward",
    subtitle: "医疗站关注病患与冻伤处理，任务可用性随城市状态变化。",
  },
  residential: {
    title: "Residential Settlement",
    subtitle: "居民区的建造与后勤维护会持续决定城市的容纳与稳定。",
  },
  resource: {
    title: "Industrial Resource Zone",
    subtitle: "资源区决定煤炭、木材与钢材的供给节奏，是城市心脏外的第二条命脉。",
  },
};

const slotDistrictNames: Record<string, string> = {
  resource: "资源区",
  food: "食物区",
  medical: "医疗区",
  residential: "居住区",
  exploration: "前哨区",
};

function formatSlotLabel(slotId: string): string {
  const dashIndex = slotId.lastIndexOf("-");
  if (dashIndex < 0) return slotId;

  const district = slotId.slice(0, dashIndex);
  const index = slotId.slice(dashIndex + 1);

  return `${slotDistrictNames[district] ?? district} ${index}号位`;
}

const resourceLabels: Record<string, string> = {
  coal: "煤炭",
  foodSupply: "食物配给",
  food_supply: "食物配给",
  rawFood: "生食材",
  raw_food: "生食材",
  steel: "钢材",
  steamCore: "蒸汽核心",
  wood: "木材",
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getApiErrorMessage(payload: { error?: { message?: string } } | null, fallback: string) {
  const message = payload?.error?.message?.trim();
  return message && message.length > 0 ? message : fallback;
}

async function fetchTasks() {
  const response = await fetch("/api/tasks", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<{ tasks?: TaskListItem[]; error?: { message?: string } }>(response);

  if (!response.ok || !payload?.tasks) {
    throw new Error(getApiErrorMessage(payload, "Failed to load district tasks."));
  }

  return payload.tasks;
}

async function joinTask(task: TaskListItem) {
  const response = await fetch("/api/tasks/join", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      templateId: task.template.id,
      instanceId: task.instance?.id ?? null,
    }),
  });

  const payload = await readJson<{ redirectTo?: string; sessionId?: string; error?: { code?: string; message?: string } }>(response);

  if (!response.ok || !payload) {
    throw new DistrictModalApiError(getApiErrorMessage(payload, "Failed to join task."), payload?.error?.code ?? null);
  }

  return payload;
}

/* ------------------------------------------------------------------ */
/*  live session 侦测 + 任务绑定                                      */
/* ------------------------------------------------------------------ */

type LiveSessionInfo = {
  id: string;
  task: { templateId: string; instanceId: string | null } | null;
};

async function fetchLiveSession(): Promise<LiveSessionInfo | null> {
  const response = await fetch("/api/session/current?any=1", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) return null;

  const payload = await readJson<{ session?: LiveSessionInfo | null }>(response);
  return payload?.session ?? null;
}

async function bindTaskToSession(sessionId: string, task: TaskListItem) {
  const response = await fetch("/api/session/bind-task", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sessionId,
      templateId: task.template.id,
      instanceId: task.instance?.id ?? null,
    }),
  });

  const payload = await readJson<{ ok?: boolean; error?: { code?: string; message?: string } }>(response);

  if (!response.ok || !payload?.ok) {
    throw new DistrictModalApiError(
      getApiErrorMessage(payload, "Failed to bind task."),
      payload?.error?.code ?? null,
    );
  }

  return payload;
}

function formatCostSummary(costs: Record<string, number>) {
  const entries = Object.entries(costs);

  if (!entries.length) {
    return "当前城市库存不足，暂时无法加入。";
  }

  return entries.map(([resource, amount]) => `${resourceLabels[resource] ?? resource} × ${amount}`).join(" / ");
}

function formatTaskEffect(task: TaskListItem) {
  if (task.template.type === "build" || task.template.type === "work") {
    const durationText = task.template.durationMinutes ? `总工时 ${task.template.durationMinutes} 分钟` : "持续推进区块工序";
    return `${durationText}，实例完成后会直接写入城市状态。`;
  }

  if (task.template.type === "convert") {
    const costText = formatCostSummary(task.template.heartbeatCost);
    const outputText =
      task.template.outputResource && task.template.outputPerHeartbeat
        ? `${resourceLabels[task.template.outputResource] ?? task.template.outputResource} +${task.template.outputPerHeartbeat}/10min`
        : "执行资源转化";

    return `${costText}，产出 ${outputText}。`;
  }

  if (task.template.outputResource && task.template.outputPerHeartbeat) {
    return `每次 heartbeat 产出 ${resourceLabels[task.template.outputResource] ?? task.template.outputResource} +${task.template.outputPerHeartbeat}。`;
  }

  return "进入区块后会在 Focus 中开始本轮工作。";
}

function formatDisabledReason(task: TaskListItem) {
  if (task.disabledReason === "no_patients") {
    return "当前没有病患，医疗班次暂不开放。";
  }

  if (task.disabledReason === "insufficient_resource") {
    const costs =
      Object.keys(task.template.heartbeatCost).length > 0 ? task.template.heartbeatCost : task.template.buildCost;

    return `缺少资源：${formatCostSummary(costs)}`;
  }

  return null;
}

type ToastTone = "warn" | "success";

function ModalToast({ message, tone, onDone }: { message: string; tone: ToastTone; onDone: () => void }) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => setExiting(true), 2800);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  useEffect(() => {
    if (!exiting) return;
    const id = setTimeout(onDone, 240);
    return () => clearTimeout(id);
  }, [exiting, onDone]);

  const isSuccess = tone === "success";

  return createPortal(
    <div
      className={joinClasses(
        "fixed right-4 top-4 z-[9999] max-w-sm rounded-sm border px-5 py-3.5 text-[0.74rem] leading-5 backdrop-blur-sm sm:right-6 sm:top-5",
        isSuccess
          ? "border-emerald-500/40 bg-[rgba(4,8,5,0.94)] text-emerald-100 shadow-[0_18px_36px_rgba(16,185,129,0.24)]"
          : "border-amber-500/40 bg-[rgba(8,5,4,0.94)] text-amber-100 shadow-[0_18px_36px_rgba(120,53,15,0.32)]",
        exiting ? "nlc-toast-exit" : "nlc-toast-enter",
      )}
      role="alert"
    >
      {message}
    </div>,
    document.body,
  );
}

export function DistrictModal({ district, isStartingFreeFocus = false, onClose, onFreeFocus, open }: DistrictModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoiningTaskKey, setIsJoiningTaskKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [boundTaskKey, setBoundTaskKey] = useState<string | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  function triggerShake() {
    setIsShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setIsShaking(false), 520);
  }

  useEffect(() => {
    if (!open) {
      setLiveSessionId(null);
      setBoundTaskKey(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const [nextTasks, liveSession] = await Promise.all([
          fetchTasks(),
          fetchLiveSession().catch(() => null),
        ]);

        if (!cancelled) {
          setTasks(nextTasks);

          if (liveSession) {
            setLiveSessionId(liveSession.id);

            if (liveSession.task) {
              setBoundTaskKey(`${liveSession.task.templateId}:${liveSession.task.instanceId ?? "template"}`);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load district tasks.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const districtTasks = useMemo(
    () => tasks.filter((task) => task.template.district === district?.district),
    [district?.district, tasks],
  );

  const copy = district ? districtCopy[district.district] : null;

  async function handleBind(task: TaskListItem) {
    if (!liveSessionId) return;

    const taskKey = `${task.template.id}:${task.instance?.id ?? "template"}`;
    setErrorMessage(null);
    setIsJoiningTaskKey(taskKey);

    try {
      await bindTaskToSession(liveSessionId, task);
      setBoundTaskKey(taskKey);
      setToast({ message: `OK → 开始${task.template.name}`, tone: "success" });
    } catch (error) {
      if (error instanceof DistrictModalApiError && error.code === "CONFLICT") {
        setToast({ message: error.message, tone: "warn" });
        triggerShake();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to bind task.");
    } finally {
      setIsJoiningTaskKey(null);
    }
  }

  async function handleJoin(task: TaskListItem) {
    const taskKey = `${task.template.id}:${task.instance?.id ?? "template"}`;
    setErrorMessage(null);
    setIsJoiningTaskKey(taskKey);

    try {
      const payload = await joinTask(task);
      onClose();
      navigateTo(payload.redirectTo ?? `/focus?sessionId=${payload.sessionId}`);
    } catch (error) {
      if (error instanceof DistrictModalApiError && error.code === "CONFLICT") {
        setToast({ message: "你已经有工作了，请先完成当前专注任务。", tone: "warn" });
        triggerShake();
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to join task.");
    } finally {
      setIsJoiningTaskKey(null);
    }
  }

  return (
    <>
    {toast ? <ModalToast message={toast.message} onDone={dismissToast} tone={toast.tone} /> : null}
    <Modal
      description={district ? `${district.label} · ${copy?.subtitle ?? ""}` : "请选择一个区块后查看可用任务。"}
      panelClassName={isShaking ? "nlc-shake" : undefined}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--nlc-muted)]">
            {district ? `Workers ${district.workingCount}` : "District unavailable"}
          </span>
          <div className="flex items-center gap-2">
            {onFreeFocus ? (
              <Button disabled={isStartingFreeFocus} onClick={onFreeFocus} variant="secondary">
                {isStartingFreeFocus ? "启动中…" : "直接专注"}
              </Button>
            ) : null}
            <Button onClick={onClose} variant="ghost">
              返回城市
            </Button>
          </div>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={district ? district.label : "District Task Board"}
    >
      {district ? (
        <div className="space-y-5">
          <section className="relative h-44 overflow-hidden rounded-sm border border-[rgba(244,164,98,0.2)]">
            <img alt="" className="h-full w-full object-cover brightness-[0.4] contrast-125" src={TASK_THUMB_URL} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#120d0a] via-transparent to-black/30" />
            <div className="absolute bottom-5 left-6">
              <p className="m-0 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[rgba(244,164,98,0.5)]">District Operations</p>
              <h3 className="m-0 mt-1 text-3xl uppercase tracking-tight text-[var(--nlc-orange)]">{copy?.title}</h3>
              <p className="m-0 mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[rgba(244,164,98,0.5)]">{copy?.subtitle}</p>
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-500/22 bg-red-950/24 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className={joinClasses(
                    "flex animate-pulse items-center",
                    i === 0
                      ? "gap-6 rounded-sm border-2 border-[rgba(244,164,98,0.15)] bg-[rgba(244,164,98,0.05)] p-6"
                      : "gap-4 rounded-sm border border-[rgba(244,164,98,0.1)] bg-black/20 p-4",
                  )}
                >
                  <div className={joinClasses("shrink-0 rounded", i === 0 ? "h-20 w-20 bg-[rgba(244,164,98,0.08)]" : "h-14 w-14 bg-[rgba(244,164,98,0.06)]")} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-[rgba(244,164,98,0.1)]" />
                    <div className="h-3 w-full max-w-xs rounded bg-[rgba(244,164,98,0.06)]" />
                  </div>
                  <div className={joinClasses("shrink-0 rounded", i === 0 ? "h-11 w-24 bg-[rgba(244,164,98,0.1)]" : "h-9 w-20 bg-[rgba(244,164,98,0.08)]")} />
                </div>
              ))}
            </div>
          ) : null}

          {!isLoading && !districtTasks.length ? (
            <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/20 px-5 py-8 text-center text-sm text-[var(--nlc-muted)]">
              当前区块没有开放中的任务。
            </div>
          ) : null}

          {!isLoading ? (
            <div className="space-y-4">
              {districtTasks.map((task, index) => {
                const taskKey = `${task.template.id}:${task.instance?.id ?? "template"}`;
                const disabledReason = formatDisabledReason(task);
                const isJoining = isJoiningTaskKey === taskKey;
                const isBound = boundTaskKey === taskKey;
                const featured = index === 0 && task.canJoin;

                return (
                  <article
                    className={joinClasses(
                      "flex items-center transition-all",
                      featured
                        ? "gap-6 rounded-sm border-2 border-[rgba(244,164,98,0.4)] bg-[rgba(244,164,98,0.1)] p-6 hover:bg-[rgba(244,164,98,0.15)]"
                        : "gap-4 rounded-sm border border-[rgba(244,164,98,0.2)] bg-black/40 p-4 hover:border-[rgba(244,164,98,0.4)]",
                    )}
                    key={taskKey}
                  >
                    {/* 缩略图 */}
                    <div
                      className={joinClasses(
                        "shrink-0 overflow-hidden rounded border",
                        featured
                          ? "h-20 w-20 border-[rgba(244,164,98,0.3)] bg-black/40"
                          : "h-14 w-14 border-[rgba(244,164,98,0.2)] bg-black/60",
                      )}
                    >
                      <img
                        alt=""
                        className={joinClasses("h-full w-full object-cover grayscale", featured ? "opacity-60" : "opacity-40")}
                        src={TASK_THUMB_URL}
                      />
                    </div>

                    {/* 任务信息 */}
                    <div className="min-w-0 flex-1">
                      {featured ? (
                        <p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--nlc-orange)]">
                          {task.template.type}
                        </p>
                      ) : null}
                      <p className={joinClasses("m-0 font-bold", featured ? "text-sm text-slate-100" : "text-xs text-slate-200")}>
                        {task.building ? `${task.building.name} · ${task.template.name}` : task.template.name}
                      </p>
                      {task.building ? (
                        <p className="m-0 mt-0.5 text-[0.6rem] tracking-wide text-[rgba(244,164,98,0.55)]">
                          ▸ {task.building.location ?? formatSlotLabel(task.building.slotId)}
                        </p>
                      ) : null}
                      <p className={joinClasses("m-0 mt-1", featured ? "text-xs text-slate-400" : "text-[11px] text-slate-500")}>
                        {formatTaskEffect(task)}
                      </p>

                      {task.instance ? (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem] text-white/60">
                          <span className="rounded-full border border-[rgba(244,164,98,0.12)] px-1.5 py-0.5">
                            参与 {task.participants}
                          </span>
                          {task.instance.remainingMinutes > 0 ? (
                            <>
                              <span className="rounded-full border border-[rgba(244,164,98,0.12)] px-1.5 py-0.5">
                                已推进 {task.instance.progressMinutes}m
                              </span>
                              <span className="rounded-full border border-[rgba(244,164,98,0.12)] px-1.5 py-0.5">
                                剩余 {task.instance.remainingMinutes}m
                              </span>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <p className="m-0 mt-1 text-[0.65rem] text-white/50">参与人数 {task.participants}</p>
                      )}

                      {disabledReason ? (
                        <p className="m-0 mt-2 text-xs text-amber-200/80">{disabledReason}</p>
                      ) : null}
                    </div>

                    {/* 操作按钮 */}
                    <button
                      className={joinClasses(
                        "shrink-0 font-bold uppercase tracking-wider transition-all",
                        isBound
                          ? joinClasses(
                              "border-2 border-emerald-500 bg-emerald-500/20 text-emerald-200",
                              featured ? "px-8 py-3 text-xs" : "px-6 py-2 text-[10px]",
                            )
                          : featured
                            ? "border-2 border-[var(--nlc-orange)] bg-[var(--nlc-orange)] px-8 py-3 text-xs text-[var(--nlc-dark)] hover:bg-transparent hover:text-[var(--nlc-orange)]"
                            : "border border-[rgba(244,164,98,0.6)] px-6 py-2 text-[10px] text-[var(--nlc-orange)] hover:bg-[rgba(244,164,98,0.2)]",
                        !isBound && (!task.canJoin || isJoining) && "pointer-events-none opacity-40",
                      )}
                      disabled={isBound || !task.canJoin || isJoining}
                      onClick={() => void (liveSessionId ? handleBind(task) : handleJoin(task))}
                      type="button"
                    >
                      {isBound ? "正在工作中" : isJoining ? "Joining" : task.actionLabel}
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/20 px-5 py-8 text-center text-sm text-[var(--nlc-muted)]">
          当前没有可供查看的区块。
        </div>
      )}
    </Modal>
    </>
  );
}

export default DistrictModal;
