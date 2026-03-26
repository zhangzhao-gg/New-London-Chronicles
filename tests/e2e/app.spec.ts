import { expect, test } from "@playwright/test";

import {
  cleanupUser,
  deleteTaskInstance,
  ensureActiveBuildInstance,
  getCityResources,
  getSession,
  getTaskTemplateByCode,
  pollSession,
  setAutoAssignForUser,
  updateBuildInstance,
  updateCityResources,
} from "./helpers/supabase-admin";

function uniqueUsername(prefix: string) {
  const normalizedPrefix = prefix.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase();
  const suffix = Date.now().toString(36).slice(-6);
  return `e2e${normalizedPrefix}${suffix}`.slice(0, 20);
}

async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/");
  await page.fill("#username", username);
  await page.getByRole("button", { name: /Initialize Survival/i }).click();
  await page.waitForURL("**/city");
}

async function expectAutoAssign(page: import("@playwright/test").Page, enabled: boolean) {
  const toggle = page.getByRole("switch", { name: "Auto assign" });
  await expect(toggle).toHaveAttribute("aria-checked", enabled ? "true" : "false");
}

async function browserJson<T>(page: import("@playwright/test").Page, input: {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}) {
  return page.evaluate(async (request) => {
    const response = await fetch(request.url, {
      method: request.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(request.body ? { "Content-Type": "application/json" } : {}),
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    return {
      body: await response.json(),
      ok: response.ok,
      status: response.status,
    };
  }, input) as Promise<{ body: T; ok: boolean; status: number }>;
}

test.describe.serial("real user flows", () => {
  test("login validation and protected routes follow the PRD", async ({ page }) => {
    const username = uniqueUsername("auth");

    await page.goto("/focus");
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/");
    await page.fill("#username", "a");
    await expect(page.getByText("用户名至少 2 个字符")).toBeVisible();
    await page.fill("#username", "bad!");
    await expect(page.getByText("仅支持中文、英文、数字、空格、-、_")).toBeVisible();

    await login(page, username);
    await expect(page).toHaveURL(/\/city$/);
    await expect(page.getByRole("heading", { name: "New London" })).toBeVisible();

    await cleanupUser(username);
  });

  test("complete page without summary falls back to city", async ({ page }) => {
    const username = uniqueUsername("complete-fallback");

    try {
      await login(page, username);
      await page.goto("/complete", { waitUntil: "domcontentloaded" });
      await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("/city");
      await expect(page.getByRole("heading", { name: "New London" })).toBeVisible();
    } finally {
      await cleanupUser(username);
    }
  });

  test("city hover, modal task list, focus timer controls, manual stop and city return all work", async ({ page }) => {
    const username = uniqueUsername("manual");

    try {
      await login(page, username);
      await setAutoAssignForUser(username, false);
      await page.reload();
      await expectAutoAssign(page, false);
      const initialCity = (await browserJson<{
        logs: Array<{ userLabel: string }>;
        resources: { coal: number };
      }>(page, { url: "/api/city" })).body;

      await page.getByRole("button", { name: "资源区" }).hover();
      const tooltip = page.getByRole("tooltip");
      await expect(tooltip).toContainText("资源区");
      await expect(tooltip).toContainText("当前状态");
      await expect(tooltip).toContainText("正在此处工作的居民");

      await page.getByRole("button", { name: "资源区" }).click();
      await expect(page.getByRole("dialog", { name: "资源区" })).toBeVisible();
      await page.waitForTimeout(3_000);
      const coalTask = page.locator("article").filter({ hasText: "采集煤炭" });
      await expect(coalTask).toBeVisible({ timeout: 20_000 });

      await coalTask.getByRole("button", { name: "前往工作" }).click();
      await page.waitForURL("**/focus?sessionId=*");

      const sessionId = new URL(page.url()).searchParams.get("sessionId");
      expect(sessionId).toBeTruthy();

      await expect(page.locator("#focus-duration-input")).toHaveValue("25");
      await expect(page.getByRole("button", { name: "开始", exact: true })).toBeEnabled();

      await page.fill("#focus-duration-input", "1");
      await page.getByRole("button", { name: "开始", exact: true }).click();
      await page.waitForTimeout(1_200);
      const heartbeatResponse = await browserJson(page, {
        url: "/api/session/heartbeat",
        method: "POST",
        body: { sessionId },
      });
      expect(heartbeatResponse.ok).toBeTruthy();

      await page.getByRole("button", { name: "暂停", exact: true }).click();
      await expect(page.getByRole("button", { name: "继续", exact: true })).toBeVisible();

      const storageSnapshot = await page.evaluate((currentSessionId) =>
        window.localStorage.getItem(`nlc:focus-state:${currentSessionId}`),
      sessionId);
      expect(storageSnapshot).toBeTruthy();

      await page.getByRole("button", { name: "继续", exact: true }).click();
      await page.waitForTimeout(1_200);
      await page.getByRole("button", { name: "重来" }).click();
      await expect(page.locator("text=01:00")).toBeVisible();

      await page.getByRole("button", { name: "手动停止" }).click();
      await page.waitForURL("**/complete");
      await expect(page.getByText("MANUAL_STOP")).toBeVisible();

      const endedSession = await getSession(sessionId!);
      expect(endedSession.end_reason).toBe("manual_stop");
      expect(endedSession.total_heartbeats).toBe(1);

      const updatedCity = (await browserJson<{
        logs: Array<{ userLabel: string }>;
        resources: { coal: number };
      }>(page, { url: "/api/city" })).body;
      expect(updatedCity.resources.coal).toBeGreaterThanOrEqual(initialCity.resources.coal + 20);
      expect(updatedCity.logs.some((entry) => entry.userLabel === username)).toBeTruthy();

      await page.getByRole("button", { name: "选择下一个任务" }).click();
      await page.waitForURL("**/city?openTasks=1");
      await expect(page.getByRole("dialog")).toBeVisible();

      await page.getByRole("button", { name: "返回城市" }).click();
      await expect(page).toHaveURL(/\/city\?openTasks=1$/);
    } finally {
      await cleanupUser(username);
    }
  });

  test("focus naturally ends with timer_completed and enters complete page", async ({ page }) => {
    const username = uniqueUsername("timer");

    try {
      await page.clock.install();
      await login(page, username);
      await setAutoAssignForUser(username, false);
      await page.reload();
      await expectAutoAssign(page, false);

      await page.getByRole("button", { name: "资源区" }).click();
      await page.getByRole("button", { name: "前往工作" }).first().click();
      await page.waitForURL("**/focus?sessionId=*");

      const sessionId = new URL(page.url()).searchParams.get("sessionId");
      expect(sessionId).toBeTruthy();

      await page.fill("#focus-duration-input", "1");
      await page.getByRole("button", { name: "开始", exact: true }).click();
      await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
      await page.clock.runFor("01:00");
      await page.clock.resume();
      await page.waitForURL("**/complete", { timeout: 15_000 });
      await expect(page.getByText("TIMER_COMPLETED")).toBeVisible();

      const endedSession = await pollSession(sessionId!, (session) => session.status === "ended");
      expect(endedSession.end_reason).toBe("timer_completed");
    } finally {
      await cleanupUser(username);
    }
  });

  test("build session completion enters complete with building_completed", async ({ page }) => {
    const username = uniqueUsername("build-complete");
    let createdInstanceId: string | null = null;

    try {
      await login(page, username);
      await setAutoAssignForUser(username, false);
      await page.reload();
      await expectAutoAssign(page, false);

      const buildInstance = await ensureActiveBuildInstance("build-tent");
      const buildTentTemplate = await getTaskTemplateByCode("build-tent");

      if (buildInstance.created) {
        createdInstanceId = buildInstance.instanceId;
      }

      await updateBuildInstance(buildInstance.instanceId, {
        progress_minutes: 110,
        remaining_minutes: 10,
        status: "active",
      });

      const joinPayload = await browserJson<{ sessionId: string }>(page, {
        url: "/api/tasks/join",
        method: "POST",
        body: {
          instanceId: buildInstance.instanceId,
          templateId: buildTentTemplate.id,
        },
      });
      expect(joinPayload.ok).toBeTruthy();
      await pollSession(joinPayload.body.sessionId, (session) => session.status === "pending");

      await page.goto(`/focus?sessionId=${joinPayload.body.sessionId}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Restoring current session...")).not.toBeVisible({ timeout: 20_000 });

      await page.fill("#focus-duration-input", "10");
      await expect(page.getByRole("button", { name: "开始", exact: true })).toBeEnabled();

      await page.clock.install();
      await page.getByRole("button", { name: "开始", exact: true }).click();
      await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
      await page.clock.runFor("10:00");
      await page.clock.resume();
      await page.waitForURL("**/complete", { timeout: 20_000 });
      await expect(page.getByText("BUILDING_COMPLETED")).toBeVisible();
    } finally {
      await cleanupUser(username);
      if (createdInstanceId) {
        await deleteTaskInstance(createdInstanceId);
      }
    }
  });

  test("auto assign focus and complete can continue to the next task", async ({ page }) => {
    const username = uniqueUsername("auto");

    try {
      await login(page, username);
      await expectAutoAssign(page, true);

      await page.getByRole("button", { name: "Focus" }).click();
      await page.waitForURL("**/focus?sessionId=*");

      const firstSessionId = new URL(page.url()).searchParams.get("sessionId");
      expect(firstSessionId).toBeTruthy();

      await page.fill("#focus-duration-input", "1");
      await page.getByRole("button", { name: "开始", exact: true }).click();
      await expect(page.getByRole("button", { name: "暂停", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "手动停止" }).click();
      await expect
        .poll(
          () => {
            const nextSessionId = new URL(page.url()).searchParams.get("sessionId");
            return nextSessionId && nextSessionId !== firstSessionId ? nextSessionId : null;
          },
          { timeout: 15_000 },
        )
        .not.toBeNull();

      const secondSessionId = new URL(page.url()).searchParams.get("sessionId");
      expect(secondSessionId).toBeTruthy();
      await expect(page.locator("#focus-duration-input")).toHaveValue("25", { timeout: 15_000 });
      await expect(page.getByRole("button", { name: "开始", exact: true })).toBeEnabled();

      const endedSession = await pollSession(firstSessionId!, (session) => session.status === "ended");
      expect(endedSession.end_reason).toBe("manual_stop");
    } finally {
      await cleanupUser(username);
    }
  });

  test("resource shortage disables convert tasks and build sessions can be restored with or without sessionId", async ({ page }) => {
    const username = uniqueUsername("restore");
    let createdInstanceId: string | null = null;
    const originalResources = await getCityResources();

    try {
      await login(page, username);
      await setAutoAssignForUser(username, false);
      await page.reload();
      await expectAutoAssign(page, false);

      await updateCityResources({ raw_food: 0 });
      await page.reload();
      await page.getByRole("button", { name: "食物区" }).click();
      await expect(page.getByRole("dialog", { name: "食物区" })).toBeVisible();
      const cookhouseTask = page.locator("article").filter({ hasText: "食堂工作" });
      await expect(cookhouseTask.getByText("缺少资源")).toBeVisible();
      await expect(cookhouseTask.getByRole("button", { name: "前往工作" })).toBeDisabled();

      const buildInstance = await ensureActiveBuildInstance("build-tent");
      const buildTentTemplate = await getTaskTemplateByCode("build-tent");
      if (buildInstance.created) {
        createdInstanceId = buildInstance.instanceId;
      }

      const joinPayload = await page.evaluate(
        async (payload) => {
          const response = await fetch("/api/tasks/join", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(payload),
          });

          return {
            body: await response.json(),
            ok: response.ok,
          };
        },
        {
          instanceId: buildInstance.instanceId,
          templateId: buildTentTemplate.id,
        },
      );
      expect(joinPayload.ok).toBeTruthy();

      await page.goto(`/focus?sessionId=${(joinPayload.body as { sessionId: string }).sessionId}`);
      await expect(page.getByText("建造帐篷", { exact: true })).toBeVisible();

      await page.goto("/focus");
      await expect(page.getByText("建造帐篷", { exact: true })).toBeVisible();
    } finally {
      await updateCityResources({
        coal: originalResources.coal,
        food_supply: originalResources.food_supply,
        raw_food: originalResources.raw_food,
        steel: originalResources.steel,
        wood: originalResources.wood,
      });
      await cleanupUser(username);
      if (createdInstanceId) {
        await deleteTaskInstance(createdInstanceId);
      }
    }
  });
});
