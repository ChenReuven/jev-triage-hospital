# Reset hospital

Reset rebuilds the opening patient bag, bumps epoch, and restarts dispatch so the demo returns to its initial talk state.

## Sub-features

- `reset-bag` — waiting pool back to 20 patients.
- `reset-epoch` — stale in-flight picks ignored after reset.

## How to get to it (user POV)

- Load the demo.
- Optionally let the sim run or inject a crash patient.
- Click **Reset**.

## Driving it with cursor-ide-browser

Preconditions:

- Doctor OK.
- Page loaded.

- **Warm state.** Let sim run ~3s or click **ESI-1 walks in** once.
- **Reset.** `browser_click` **Reset**.
- **Proof.** Screenshot `reset-hospital.png` — waiting grid looks full again; last-pick strip may read `Last pick: none` briefly then update after next pick.
- Save snapshot `reset-hospital.aria.txt`.

## Gotchas

- Reset during an in-flight `/api/next` can race; for deterministic proof, **Pause** first, then Reset, then Resume.
- Canvas tweens reset on epoch change; wait ~500ms before screenshot.
