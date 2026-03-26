# PR Title

fix: stabilize focus/city flows and add Playwright E2E coverage

## Summary

- add minimal Playwright + Chromium headless E2E infrastructure
- cover real user flows for login, city, focus, complete, restore, and auto-assign
- fix focus pending-session initialization so default 25-minute sessions can start immediately
- tighten city/focus desktop layouts so key controls remain visible at common viewports
- fix complete-page return flow so choosing the next task actually reopens task selection
- harden focus session restore and heartbeat completion edge cases

## What Changed

### Product fixes

- initialize pending focus sessions with a real default 25-minute local timer state
- pass `sessionId` into `/focus` from the server entry to stabilize deep-link restore
- route “选择下一个任务” to `/city?openTasks=1`
- auto-open the city task modal when `openTasks=1`
- add accessible names for primary focus controls
- reduce city/focus desktop scale and prevent key bottom controls from slipping below the fold

### Test coverage

- add `playwright.config.ts`
- add `tests/e2e/app.spec.ts`
- add `tests/e2e/helpers/supabase-admin.ts`
- add `tests/e2e/README.md`
- add `test:e2e` script

## Verification

- `npm run build`
- `npm run typecheck`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 npx playwright test tests/e2e/app.spec.ts --reporter=line`

Result:

- `7 passed (1.9m)`

## Known Gaps

- invalid or expired `sessionId` deep links on `/focus` still do not cleanly fall back to `/city`
- no pressure test coverage yet for multi-user heartbeat/polling races
- `resource_exhausted`, `timeout`, and `medical-shift/no_patients` still need dedicated E2E branches
