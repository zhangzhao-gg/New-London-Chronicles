/**
 * [INPUT]: `GET /api/city`、`POST /api/tasks/assign-next`、`POST /api/session/create`、当前用户初始态
 * [OUTPUT]: 城市页客户端状态 hook、30 秒轮询、FOCUS 交互控制与 `freeFocus` 直接专注入口
 * [POS]: 位于 `hooks/use-city.tsx`，被 `components/city/CityPageShell.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `hooks/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { UserDto } from "@/lib/auth";
import { navigateTo } from "@/lib/client-navigation";

const POLL_INTERVAL_MS = 30_000;

export type DistrictKey = "resource" | "residential" | "medical" | "food" | "exploration";
export type DistrictStatus = "可采集" | "建造进行中" | "无进行中任务" | "资源不足";

export type CityDistrict = {
  district: DistrictKey;
  label: string;
  status: DistrictStatus;
  workingCount: number;
};

export type CitySnapshot = {
  resources: {
    coal: number;
    wood: number;
    steel: number;
    rawFood: number;
    foodSupply: number;
  };
  buildings: Array<{
    id: number | string;
    name: string;
    district: DistrictKey;
    slotId: string;
    completedAt: string | null;
  }>;
  districts: CityDistrict[];
  onlineCount: number;
  healthStatus: string;
  currentPolicyPlaceholder: string;
  currentLanguage: string;
  languageOptions: string[];
  logs: Array<{
    id: number | string;
    userLabel: string;
    actionDesc: string;
    createdAt: string;
  }>;
  temperatureC: number;
};

export type CityHookState = {
  actionMessage: string | null;
  city: CitySnapshot | null;
  errorMessage: string | null;
  focus: () => Promise<void>;
  freeFocus: () => Promise<void>;
  isAssigning: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isSavingSettings: boolean;
  isStartingFreeFocus: boolean;
  isTaskModalOpen: boolean;
  language: string;
  setActionMessage: (message: string | null) => void;
  setIsTaskModalOpen: (nextValue: boolean) => void;
  setLanguage: (nextValue: string) => void;
  toggleAutoAssign: () => Promise<void>;
  user: UserDto;
};

class CityApiError extends Error {
  code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

function isConflictError(error: unknown): error is { code: string } {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "CONFLICT");
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

async function fetchCitySnapshot(): Promise<CitySnapshot> {
  const response = await fetch("/api/city", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<CitySnapshot & { error?: { message?: string } }>(response);

  if (
    !response.ok ||
    !payload ||
    !Array.isArray(payload.languageOptions) ||
    !Array.isArray(payload.districts)
  ) {
    throw new Error(getApiErrorMessage(payload, "Failed to load city snapshot."));
  }

  return payload;
}

async function persistAutoAssign(autoAssign: boolean) {
  const response = await fetch("/api/users/me/settings", {
    method: "PATCH",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ autoAssign }),
  });

  const payload = await readJson<{ user?: UserDto; error?: { message?: string } }>(response);

  if (!response.ok || !payload?.user) {
    throw new Error(getApiErrorMessage(payload, "Failed to update auto assign setting."));
  }

  return payload.user;
}

async function createFreeFocusSession() {
  const response = await fetch("/api/session/create", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
  });

  const payload = await readJson<{ redirectTo?: string; sessionId?: string; error?: { message?: string } }>(response);

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to create free focus session."));
  }

  return payload.redirectTo ?? `/focus?sessionId=${payload.sessionId}`;
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

  const payload = await readJson<{ redirectTo?: string; sessionId?: string; error?: { code?: string; message?: string } }>(response);

  if (!response.ok || !payload) {
    throw new CityApiError(getApiErrorMessage(payload, "Failed to assign next task."), payload?.error?.code ?? null);
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

  if (!response.ok) {
    throw new CityApiError(getApiErrorMessage(payload, "Failed to restore live session."), payload?.error?.code ?? null);
  }

  return payload?.session?.id ? `/focus?sessionId=${payload.session.id}` : null;
}

export function useCity(initialUser: UserDto, initialCity: CitySnapshot | null = null): CityHookState {
  const mountedRef = useRef(true);
  const assigningRef = useRef(false);
  const [city, setCity] = useState<CitySnapshot | null>(initialCity);
  const [user, setUser] = useState(initialUser);
  const [language, setLanguage] = useState(initialCity?.currentLanguage ?? "zh-CN");
  const [isLoading, setIsLoading] = useState(initialCity == null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isStartingFreeFocus, setIsStartingFreeFocus] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      assigningRef.current = false;
    };
  }, []);

  const refreshCity = useCallback(async (background = false) => {
    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const snapshot = await fetchCitySnapshot();

      if (!mountedRef.current) {
        return;
      }

      setCity(snapshot);
      setLanguage((currentValue) =>
        snapshot.languageOptions.includes(currentValue) ? currentValue : snapshot.currentLanguage,
      );
      setErrorMessage(null);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to load city snapshot.");
    } finally {
      if (!mountedRef.current) {
        return;
      }

      if (background) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (initialCity) {
      void refreshCity(true);
    } else {
      void refreshCity();
    }

    const pollTimer = window.setInterval(() => {
      void refreshCity(true);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollTimer);
    };
  }, [initialCity, refreshCity]);

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
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setUser((currentValue) => ({ ...currentValue, autoAssign: !nextValue }));
      setActionMessage(error instanceof Error ? error.message : "Failed to update auto assign setting.");
    } finally {
      if (mountedRef.current) {
        setIsSavingSettings(false);
      }
    }
  }, [user.autoAssign]);

  const focus = useCallback(async () => {
    if (assigningRef.current) {
      return;
    }

    setActionMessage(null);

    assigningRef.current = true;
    setIsAssigning(true);

    try {
      const liveSessionRedirect = await fetchLiveSessionRedirect();

      if (!mountedRef.current) {
        return;
      }

      if (liveSessionRedirect) {
        navigateTo(liveSessionRedirect);
        return;
      }

      if (!user.autoAssign) {
        const freeFocusRedirect = await createFreeFocusSession();

        if (!mountedRef.current) {
          return;
        }

        navigateTo(freeFocusRedirect);
        return;
      }

      const payload = await assignNextTask();

      if (!mountedRef.current) {
        return;
      }

      navigateTo(payload.redirectTo || `/focus?sessionId=${payload.sessionId}`);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      if (isConflictError(error)) {
        try {
          const redirectTo = await fetchLiveSessionRedirect();

          if (!mountedRef.current) {
            return;
          }

          if (redirectTo) {
            navigateTo(redirectTo);
            return;
          }

          setActionMessage("检测到已有进行中的工作，但未能恢复当前 session。请刷新页面重试。");
          return;
        } catch (restoreError) {
          setActionMessage(restoreError instanceof Error ? restoreError.message : "Failed to restore live session.");
          return;
        }
      }

      setActionMessage(error instanceof Error ? error.message : "Failed to assign next task.");
    } finally {
      assigningRef.current = false;

      if (mountedRef.current) {
        setIsAssigning(false);
      }
    }
  }, [user.autoAssign]);

  const freeFocus = useCallback(async () => {
    setActionMessage(null);
    setIsStartingFreeFocus(true);

    try {
      const liveSessionRedirect = await fetchLiveSessionRedirect();

      if (!mountedRef.current) return;

      if (liveSessionRedirect) {
        navigateTo(liveSessionRedirect);
        return;
      }

      const redirectTo = await createFreeFocusSession();

      if (!mountedRef.current) return;

      navigateTo(redirectTo);
    } catch (error) {
      if (!mountedRef.current) return;

      setActionMessage(error instanceof Error ? error.message : "Failed to start free focus.");
    } finally {
      if (mountedRef.current) {
        setIsStartingFreeFocus(false);
      }
    }
  }, []);

  return {
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
    refreshCity,
    setActionMessage,
    setIsTaskModalOpen,
    setLanguage,
    toggleAutoAssign,
    user,
  };
}

export default useCity;
