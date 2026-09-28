# Pause and resume

Pause stops the 100ms tick loop so patients stop advancing; Resume restores ticking and dispatch.

## Sub-features

- `pause-freeze` — clock stops; canvas holds state.
- `resume-run` — button returns to Pause; sim continues.

## How to get to it (user POV)

- Open the demo home page.
- Click **Pause** under the canvas.
- Click **Resume** (same button) to continue.

## Driving it with cursor-ide-browser

Preconditions:

- Verification server healthy (`verify-jev-triage.ts doctor`).
- Page loaded at doctor URL.

- **Open.** `browser_navigate` to doctor URL. `browser_snapshot` shows button **Pause**.
- **Pause.** `browser_click` on **Pause**. Snapshot shows button **Resume** (not Pause).
- **Resume.** `browser_click` on **Resume**. Snapshot shows **Pause** again.
- **Proof.** Save snapshot to `artifacts/<run-id>/pause-resume.aria.txt` and screenshot `pause-resume.png`.

## Gotchas

- Label toggles in `client.ts`; do not query `#pause` text statically as always Pause.
- While paused, rooms already in consult still show countdown until you Resume and time advances.
