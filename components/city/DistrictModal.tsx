/**
 * [INPUT]: 当前选中区块、`GET /api/tasks` 结果、`POST /api/tasks/join` 跳转返回
 * [OUTPUT]: M09 区块任务弹窗，展示区块任务列表并负责加入任务跳转到 `/focus`
 * [POS]: 位于 `components/city/DistrictModal.tsx`，被 `components/city/CityPageShell.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `components/city/CLAUDE.md`、`components/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useEffect, useMemo, useState } from "react";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import type { CityDistrict, DistrictKey } from "@/hooks/use-city";
import { navigateTo } from "@/lib/client-navigation";

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
  participants: number;
  canJoin: boolean;
  disabledReason: "insufficient_resource" | "no_patients" | null;
  actionLabel: string;
};

type DistrictModalProps = {
  district: CityDistrict | null;
  onClose: () => void;
  open: boolean;
};

class DistrictModalApiError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

const districtCopy: Record<
  DistrictKey,
  {
    title: string;
    subtitle: string;
    hero: string;
  }
> = {
  exploration: {
    title: "Exploration Outpost",
    subtitle: "前哨正在等待新的远征排班与外部巡查。",
    hero: "bg-[linear-gradient(180deg,rgba(34,24,16,0.1),rgba(18,13,10,0.95)),radial-gradient(circle_at_top,rgba(148,163,184,0.24),transparent_42%)]",
  },
  food: {
    title: "Food District",
    subtitle: "食物区负责维持生存线，原料与配给会在这里被重新调度。",
    hero: "bg-[linear-gradient(180deg,rgba(34,24,16,0.1),rgba(18,13,10,0.95)),radial-gradient(circle_at_top,rgba(74,222,128,0.18),transparent_42%)]",
  },
  medical: {
    title: "Medical Ward",
    subtitle: "医疗站关注病患与冻伤处理，任务可用性随城市状态变化。",
    hero: "bg-[linear-gradient(180deg,rgba(34,24,16,0.1),rgba(18,13,10,0.95)),radial-gradient(circle_at_top,rgba(96,165,250,0.2),transparent_42%)]",
  },
  residential: {
    title: "Residential Settlement",
    subtitle: "居民区的建造与后勤维护会持续决定城市的容纳与稳定。",
    hero: "bg-[linear-gradient(180deg,rgba(34,24,16,0.1),rgba(18,13,10,0.95)),radial-gradient(circle_at_top,rgba(244,164,98,0.24),transparent_42%)]",
  },
  resource: {
    title: "Industrial Resource Zone",
    subtitle: "资源区决定煤炭、木材与钢材的供给节奏，是城市心脏外的第二条命脉。",
    hero: "bg-[linear-gradient(180deg,rgba(34,24,16,0.1),rgba(18,13,10,0.95)),radial-gradient(circle_at_top,rgba(148,163,184,0.22),transparent_42%)]",
  },
};

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

async function fetchLiveSessionRedirect() {
  const response = await fetch("/api/session/current?any=1", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<{ session?: { id: string } | null; error?: { code?: string; message?: string } }>(response);

  if (!response.ok || !payload?.session?.id) {
    throw new DistrictModalApiError(getApiErrorMessage(payload, "Failed to restore live session."), payload?.error?.code ?? null);
  }

  return `/focus?sessionId=${payload.session.id}`;
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

export function DistrictModal({ district, onClose, open }: DistrictModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isJoiningTaskKey, setIsJoiningTaskKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskListItem[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const nextTasks = await fetchTasks();

        if (!cancelled) {
          setTasks(nextTasks);
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
        try {
          const redirectTo = await fetchLiveSessionRedirect();
          onClose();
          navigateTo(redirectTo);
          return;
        } catch (restoreError) {
          setErrorMessage(restoreError instanceof Error ? restoreError.message : "Failed to restore live session.");
          return;
        }
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to join task.");
    } finally {
      setIsJoiningTaskKey(null);
    }
  }

  return (
    <Modal
      description={district ? `${district.label} · ${copy?.subtitle ?? ""}` : "请选择一个区块后查看可用任务。"}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-[0.2em] text-[var(--nlc-muted)]">
            {district ? `Workers ${district.workingCount}` : "District unavailable"}
          </span>
          <Button onClick={onClose} variant="ghost">
            返回城市
          </Button>
        </div>
      }
      onClose={onClose}
      open={open}
      size="lg"
      title={district ? district.label : "District Task Board"}
    >
      {district ? (
        <div className="space-y-5">
          <section
            className={joinClasses(
              "relative overflow-hidden rounded-2xl border border-[rgba(244,164,98,0.18)] px-6 py-8",
              copy?.hero,
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_24%)]" />
            <div className="relative">
              <p className="m-0 text-[0.7rem] uppercase tracking-[0.3em] text-[var(--nlc-muted)]">District Operations</p>
              <h3 className="m-0 mt-2 text-3xl uppercase tracking-[0.08em] text-[var(--nlc-orange)]">{copy?.title}</h3>
              <p className="m-0 mt-3 max-w-2xl text-sm leading-7 text-[var(--nlc-muted)]">{copy?.subtitle}</p>
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-2xl border border-red-500/22 bg-red-950/24 px-4 py-3 text-sm text-red-100">
              {errorMessage}
            </div>
          ) : null}

          {isLoading ? (
            <div className="rounded-2xl border border-[rgba(244,164,98,0.14)] bg-black/20 px-5 py-8 text-center text-sm text-[var(--nlc-muted)]">
              正在同步 `{district.label}` 区块任务...
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

                return (
                  <article
                    className={joinClasses(
                      "rounded-2xl border px-5 py-5 transition-colors",
                      index === 0 && task.canJoin
                        ? "border-[rgba(255,157,0,0.44)] bg-[rgba(244,164,98,0.08)]"
                        : "border-[rgba(244,164,98,0.16)] bg-[rgba(0,0,0,0.28)]",
                    )}
                    key={taskKey}
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[rgba(244,164,98,0.16)] px-2 py-1 text-[0.64rem] uppercase tracking-[0.24em] text-[var(--nlc-orange)]">
                            {task.template.type}
                          </span>
                          <span className="text-[0.72rem] uppercase tracking-[0.24em] text-[var(--nlc-muted)]">
                            参与人数 {task.participants}
                          </span>
                        </div>
                        <h4 className="m-0 mt-3 text-xl uppercase tracking-[0.08em] text-white">{task.template.name}</h4>
                        <p className="m-0 mt-2 text-sm leading-7 text-[var(--nlc-muted)]">{formatTaskEffect(task)}</p>

                        {task.instance ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[0.72rem] uppercase tracking-[0.18em] text-white/76">
                            <span className="rounded-full border border-[rgba(244,164,98,0.16)] px-2 py-1">
                              槽位 {task.instance.slotId ?? "N/A"}
                            </span>
                            <span className="rounded-full border border-[rgba(244,164,98,0.16)] px-2 py-1">
                              已推进 {task.instance.progressMinutes} 分钟
                            </span>
                            <span className="rounded-full border border-[rgba(244,164,98,0.16)] px-2 py-1">
                              剩余 {task.instance.remainingMinutes} 分钟
                            </span>
                          </div>
                        ) : null}

                        {disabledReason ? (
                          <p className="m-0 mt-3 text-sm leading-6 text-amber-100">{disabledReason}</p>
                        ) : null}
                      </div>

                      <div className="xl:w-48">
                        <Button
                          disabled={!task.canJoin || isJoining}
                          fullWidth
                          onClick={() => void handleJoin(task)}
                          variant={task.canJoin ? "primary" : "secondary"}
                        >
                          {isJoining ? "Joining" : task.actionLabel}
                        </Button>
                      </div>
                    </div>
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
  );
}

export default DistrictModal;
