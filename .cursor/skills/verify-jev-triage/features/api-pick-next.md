# API pick next

`POST /api/next` accepts the waiting wire snapshot and returns Jev's choice (or errors when misconfigured).

## Sub-features

- `api-missing-key` — 500 when `TYPESAFE_API_KEY` unset (UI still works).
- `api-choice` — 200 with `patientId` when key valid.

## How to get to it (user POV)

- Not a browser path; operators hit the HTTP route (curl or helper).

## Driving it with cursor-ide-browser

Preconditions:

- Verification server launched (doctor OK).

- **Smoke.** From repo root: `bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts api-smoke`.
- **Proof.** Redirect output to `artifacts/<run-id>/api-smoke.txt`. With key: stdout contains `patientId=P01` or similar; without key: message about 500 + ESI fallback note.

## Gotchas

- Body must be non-empty waiting array (`parseWaiting`); empty → 400.
- Invalid chosen id → 422 from server; client maps failures to ESI fallback — that behavior is proven in `src/hospital.test.ts`, not this HTTP recipe alone.
