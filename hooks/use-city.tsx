/**
 * [INPUT]: `GET /api/city`、`POST /api/tasks/assign-next`、当前用户初始态
 * [OUTPUT]: 城市页客户端状态 hook、30 秒轮询与 FOCUS 交互控制
 * [POS]: 位于 `hooks/use-city.tsx`，被 `components/city/CityPageShell.tsx` 消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 `hooks/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { UserDto } from "@/lib/auth";

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
  isAssigning: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isSavingSettings: boolean;
  isTaskModalOpen: boolean;
  language: string;
  setActionMessage: (message: string | null) => void;
  setIsTaskModalOpen: (nextValue: boolean) => void;
  setLanguage: (nextValue: string) => void;
  toggleAutoAssign: () => Promise<void>;
  user: UserDto;
};

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

async function fetchCitySnapshot() {
  const response = await fetch("/api/city", {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await readJson<CitySnapshot & { error?: { message?: string } }>(response);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, "Failed to load city snapshot."));
  }

  return payload as CitySnapshot;
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

  const payload = await readJson<{ redirectTo?: string; sessionId?: string; error?: { message?: string } }>(response);

  if (!response.ok || !payload) {
    throw new Error(getApiErrorMessage(payload, "Failed to assign next task."));
  }

  return payload;
}

export function useCity(initialUser: UserDto): CityHookState {
  const router = useRouter();
  const mountedRef = useRef(true);
  const assigningRef = useRef(false);
  const [city, setCity] = useState<CitySnapshot | null>(null);
  const [user, setUser] = useState(initialUser);
  const [language, setLanguage] = useState("zh-CN");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
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

    if (!user.autoAssign) {
      setIsTaskModalOpen(true);
      return;
    }

    assigningRef.current = true;
    setIsAssigning(true);

    try {
      const payload = await assignNextTask();

      if (!mountedRef.current) {
        return;
      }

      router.push(payload.redirectTo || `/focus?sessionId=${payload.sessionId}`);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setActionMessage(error instanceof Error ? error.message : "Failed to assign next task.");
    } finally {
      assigningRef.current = false;

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

export default useCity;
