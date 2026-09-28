# Jev triage verification map

Maintained source for user-facing behavior of the talk demo. Read this index, then open the feature file before driving.

## Baseline preconditions

- Repo root: `jev-triage-hospital`.
- `bun install` done once.
- Launch with `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts launch` (default port **3010**).
- `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts doctor` passes.
- Do not drive a dev server the user started on `:3000` unless you explicitly adopted it in this run.

## Driving conventions

- Start from a fresh launch unless the feature says otherwise.
- Use button accessible names from `index.html` (`Pause`, `Reset`, `ESI-1 walks in`).
- Canvas state is visual — capture screenshots; do not rely on undocumented globals.
- After mutations (Reset, Inject), wait ≥1s for dispatch/tween before proof.
- Record feature id + entry point in artifact filenames.

## Proof and skip reporting

- Capture the user action and resulting UI (snapshot and/or screenshot).
- If a path is unreachable, log the command and unmet precondition; do not mark verified via a different entry point.

## Feature entry contract

Each feature file: H1 + paragraph, then H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with cursor-ide-browser`, `Gotchas`.

## Features

- [Pause and resume](./pause-resume.md) — freeze and restart the 100ms sim clock.
- [Reset hospital](./reset-hospital.md) — rebuild bag and bump epoch.
- [Inject crash patient](./inject-crash-patient.md) — add ESI-1 `P21` via **ESI-1 walks in**.
- [Simulation auto-dispatch](./simulation-auto-dispatch.md) — board runs without clicks; rooms fill over time.
- [API pick next](./api-pick-next.md) — `POST /api/next` boundary (optional; UI still needs separate proof).
