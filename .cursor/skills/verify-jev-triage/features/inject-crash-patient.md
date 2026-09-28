# Inject crash patient

**ESI-1 walks in** adds patient `P21` (ESI-1) when living count allows, simulating a crash arrival.

## Sub-features

- `inject-once` — adds P21 when fewer than 21 living and P21 absent.
- `inject-noop` — second click while P21 exists does nothing visible.

## How to get to it (user POV)

- Load the demo.
- Click **ESI-1 walks in**.

## Driving it with cursor-ide-browser

Preconditions:

- Doctor OK.
- Page loaded; sim running (not paused).

- **Inject.** `browser_click` **ESI-1 walks in**.
- **Wait.** `browser_wait` ~2s for dispatch.
- **Proof.** Screenshot `inject-crash.png` — waiting area shows an extra red (ESI-1) patient label `P21` near the pool (canvas text). If Jev/ESI seats P21, last-pick strip may mention `P21`.
- Snapshot `inject-crash.aria.txt` (buttons unchanged; proof is mostly visual).

## Gotchas

- No-op when 21 living or P21 already present — do not fail inject if the button click does nothing on second try.
- Prefer first inject on a fresh Reset for a clear P21 appearance.
