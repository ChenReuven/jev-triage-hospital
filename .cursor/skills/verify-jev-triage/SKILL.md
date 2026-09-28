---
name: verify-jev-triage
description: Drive the Jev triage hospital Bun canvas demo like a user — launch an isolated dev server, doctor health, browser controls (Pause/Reset/Inject), optional POST /api/next smoke. Use after UI/client/server changes or before shipping talk-demo behavior.
---

# Verify Jev triage hospital

Primary surface: **web UI** at `/` (canvas `#board`, buttons `#pause`, `#reset`, `#inject`). Secondary: **HTTP** `POST /api/next`.

Never drive `http://localhost:3000` unless you started it in this run. Use the verification instance on **port 3010** (override with `VERIFY_PORT`).

## Launch

From repo root:

```bash
bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts launch
```

Ready when the command prints `ready http://127.0.0.1:3010/` (or your `VERIFY_PORT`). Bun serves `server.ts` with HMR; pid and port live under `.cursor/skills/verify-jev-triage/.run/`.

Teardown (only the pid this helper started):

```bash
bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts stop
```

## Doctor

```bash
bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts doctor
```

Pass means: pid file points at a live process, `GET /` is 200, HTML contains `Jev triage`, `#board`, and `#pause`. Run doctor before driving whenever launch failed, the page is blank, or port conflicts are suspected.

## Drive

Harness: **cursor-ide-browser** MCP (or any CDP browser) against the verification URL from doctor.

Stable handles (from `index.html`):

| Control | Element | Accessible name |
| --- | --- | --- |
| Canvas | `#board` | (no text; use screenshot) |
| Pause / Resume | `#pause` | button name toggles `Pause` ↔ `Resume` |
| Reset | `#reset` | `Reset` |
| Crash inject | `#inject` | `ESI-1 walks in` |

Recipe template:

1. `browser_navigate` → `http://127.0.0.1:3010/` (use doctor URL).
2. `browser_snapshot` — expect heading **Jev triage** and buttons above.
3. Follow one feature file under `features/` (read `features/README.md` first).
4. Prefer user actions (clicks) over calling `hospital` reducers directly.

Optional API boundary (does not replace UI proof for canvas features):

```bash
bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts api-smoke
```

## Evidence

Write artifacts under:

`.cursor/skills/verify-jev-triage/artifacts/<run-id>/`

Use a fresh `run-id` (timestamp or uuid). Per feature, capture:

- **UI:** `browser_snapshot` text saved as `*.aria.txt` (or paste snapshot) plus `browser_take_screenshot` → `*.png`.
- **API:** stdout from `api-smoke` copied to `api-smoke.txt` when exercising `api-pick-next`.

Proof standards:

- Exercise the real control (button click or user-visible wait), not `src/hospital.ts` imports in a one-off script.
- Pair action + observable outcome (e.g. Pause → button reads `Resume`; sim running → last-pick strip eventually not `none` on screenshot).
- Do not delete artifacts during cleanup.

## Cleanup

```bash
bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts stop
```

Removes `.run/` only. **Do not** `pkill bun` or kill by process name. Confirm artifacts still exist after stop.

## Helpers

| Command | Purpose |
| --- | --- |
| `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts launch` | Start isolated server |
| `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts doctor` | Read-only health |
| `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts stop` | Tear down started server |
| `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts api-smoke` | POST `/api/next` sample body |

Feature recipes: `features/README.md`.

Maintenance: `/maintain-verification-skill` when routes, buttons, or ports change.
