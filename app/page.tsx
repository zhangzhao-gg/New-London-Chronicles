/**
 * [INPUT]: `POST /api/auth/login`、M06 共享 Button、`UI/start.html` 登录原型
 * [OUTPUT]: M07 登录页，提供用户名即时校验与登录跳转
 * [POS]: 位于 `app/page.tsx`，作为当前阶段的根页面
 * [PROTOCOL]: 变更时更新此头部，然后检查 `app/CLAUDE.md` 与 `/CLAUDE.md`
 */

"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import Button from "@/components/ui/Button";

const LOGIN_BACKGROUND_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBSQtA82Kjcz8PRk5t69IU84R9Ckn-cu8oAhtO-SmEZ5FCIeW3m1NFfZGuhVd6_lbeY9tUJLJ_TkbvMXTVXZFJ3dSMvykokD51GrWSCY8_7wELgPCMSB7Rl-T-D0NKrb1odWewCn4wDRrl8MUZBJ-H9f0rUXayAWyN9AsP3x9BA-A2cOfDZPxOyo1AqDmi0fyLIl-B0kUksc1dfCvUNnuqAbDvh816yoR8dFZs7Mb6wKdH7hElKAgQhXCizSx6FLZmGfYaukX4TesA";

const USERNAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9 _-]+$/u;
const FALLBACK_ERROR_MESSAGE = "Login failed. Please try again.";

type LoginErrorResponse = {
  error?: {
    message?: unknown;
  };
};

function validateUsername(value: string): string | null {
  const normalized = value.trim();

  if (!normalized) {
    return "用户名不能为空";
  }

  if (normalized.length < 2) {
    return "用户名至少 2 个字符";
  }

  if (normalized.length > 20) {
    return "用户名不能超过 20 个字符";
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return "仅支持中文、英文、数字、空格、-、_";
  }

  return null;
}

function getErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return FALLBACK_ERROR_MESSAGE;
  }

  const message = (payload as LoginErrorResponse).error?.message;

  return typeof message === "string" && message.trim() ? message : FALLBACK_ERROR_MESSAGE;
}

export default function HomePage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedUsername = username.trim();
  const describedBy = [fieldError ? "username-error" : null, submitError ? "login-error" : null]
    .filter(Boolean)
    .join(" ");
  const isSubmitDisabled = isSubmitting || !trimmedUsername || Boolean(fieldError);

  function handleUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    const nextValue = event.target.value;

    setUsername(nextValue);
    setFieldError(validateUsername(nextValue));
    setSubmitError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const requestUsername = username.trim();
    const nextFieldError = validateUsername(requestUsername);

    if (nextFieldError) {
      setFieldError(nextFieldError);
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username: requestUsername }),
      });

      if (response.ok) {
        router.push("/city");
        return;
      }

      let payload: unknown = null;

      try {
        payload = (await response.json()) as LoginErrorResponse;
      } catch {}

      setSubmitError(getErrorMessage(payload));
    } catch {
      setSubmitError(FALLBACK_ERROR_MESSAGE);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#140e0a] text-[var(--nlc-text)]">
      <div className="fixed inset-0">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-cover bg-center grayscale-[0.55] contrast-[1.18]"
          style={{ backgroundImage: `url(${LOGIN_BACKGROUND_URL})` }}
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[rgba(10,7,5,0.52)]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(18,28,40,0.05),transparent_30%),radial-gradient(circle_at_top,rgba(255,157,0,0.08),transparent_30%),linear-gradient(180deg,rgba(7,9,15,0.08),rgba(8,12,20,0.24))]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_42%,rgba(5,4,3,0.72)_100%)]"
        />
        <div aria-hidden="true" className="absolute left-[12%] top-[48%] size-2 rounded-full bg-amber-300/80 blur-[3px]" />
        <div aria-hidden="true" className="absolute left-[16%] top-[58%] size-1.5 rounded-full bg-orange-300/75 blur-[2px]" />
        <div aria-hidden="true" className="absolute right-[24%] top-[46%] size-2 rounded-full bg-amber-200/75 blur-[3px]" />
        <div aria-hidden="true" className="absolute right-[21%] top-[61%] size-1.5 rounded-full bg-orange-300/80 blur-[2px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b border-[rgba(244,164,98,0.12)] bg-[rgba(18,12,9,0.42)] px-6 py-4 backdrop-blur-sm lg:px-12">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-3xl leading-none text-[var(--nlc-orange)]">
              ✦
            </span>
            <div>
              <p className="m-0 text-[0.68rem] font-semibold uppercase tracking-[0.36em] text-[rgba(247,221,197,0.46)]">
                New London Project
              </p>
              <h2 className="m-0 text-lg font-bold uppercase tracking-[0.24em] text-white sm:text-xl">Frostpunk Tales</h2>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-lg border border-[rgba(244,164,98,0.2)] bg-[rgba(63,70,81,0.22)] text-lg text-slate-100"
          >
            ⚙
          </div>
        </header>

        <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex w-full max-w-md flex-col items-center gap-10 text-center">
            <div className="space-y-4">
              <div className="inline-flex border-y border-[rgba(244,164,98,0.3)] px-4 py-1">
                <span className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-[var(--nlc-orange)]">
                  New London District VII
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="m-0 text-5xl font-bold leading-none tracking-tight text-white italic sm:text-6xl lg:text-7xl">
                  The Great <br />
                  <span className="text-[var(--nlc-orange)]">Freezing</span>
                </h1>
                <p className="mx-auto max-w-xs text-base font-light tracking-[0.04em] text-[rgba(247,221,197,0.72)] sm:text-lg">
                  Temperature dropping. Coal levels critical. Identify yourself, Citizen.
                </p>
              </div>
            </div>

            <form
              className="relative w-full rounded-xl border border-[rgba(120,130,148,0.35)] bg-[rgba(18,12,9,0.62)] p-8 text-left shadow-[0_24px_60px_rgba(0,0,0,0.38)] backdrop-blur-sm sm:p-10"
              noValidate
              onSubmit={handleSubmit}
            >
              <div aria-hidden="true" className="absolute -left-px -top-px size-4 border-l-2 border-t-2 border-[rgba(244,164,98,0.6)]" />
              <div aria-hidden="true" className="absolute -right-px -top-px size-4 border-r-2 border-t-2 border-[rgba(244,164,98,0.6)]" />
              <div aria-hidden="true" className="absolute -bottom-px -left-px size-4 border-b-2 border-l-2 border-[rgba(244,164,98,0.6)]" />
              <div aria-hidden="true" className="absolute -bottom-px -right-px size-4 border-b-2 border-r-2 border-[rgba(244,164,98,0.6)]" />

              <div className="flex flex-col gap-6">
                <div className="relative">
                  <label
                    className="absolute -top-3 left-4 bg-[rgba(18,12,9,0.96)] px-2 text-[0.72rem] font-bold uppercase tracking-[0.28em] text-[rgba(244,164,98,0.82)]"
                    htmlFor="username"
                  >
                    Citizen Designation
                  </label>
                  <input
                    aria-describedby={describedBy || undefined}
                    aria-invalid={fieldError ? true : undefined}
                    autoComplete="username"
                    autoFocus
                    className="nlc-focus-ring w-full border-x-0 border-b-2 border-t-0 border-[rgba(120,130,148,0.55)] bg-[rgba(18,12,9,0.78)] px-4 py-4 text-xl text-white transition-colors placeholder:text-[rgba(148,163,184,0.45)] focus:border-[var(--nlc-orange)] focus:outline-none"
                    disabled={isSubmitting}
                    id="username"
                    name="username"
                    onChange={handleUsernameChange}
                    placeholder="Enter your name..."
                    type="text"
                    value={username}
                  />
                </div>

                {fieldError ? (
                  <p className="m-0 text-sm text-[var(--nlc-orange)]" id="username-error" role="alert">
                    {fieldError}
                  </p>
                ) : null}

                {submitError ? (
                  <p className="m-0 rounded-md border border-[rgba(244,164,98,0.24)] bg-[rgba(53,29,18,0.62)] px-4 py-3 text-sm text-[rgba(255,233,214,0.92)]" id="login-error" role="alert">
                    {submitError}
                  </p>
                ) : null}

                <Button fullWidth disabled={isSubmitDisabled} size="lg" type="submit" variant="primary">
                  {isSubmitting ? "Initializing..." : "Initialize Survival"}
                </Button>
              </div>
            </form>
          </div>
        </section>

        <footer className="px-6 py-6 text-center text-[0.62rem] font-bold uppercase tracking-[0.5em] text-[rgba(148,163,184,0.55)]">
          Property of the Last City © 1887-2024
        </footer>
      </div>
    </main>
  );
}
