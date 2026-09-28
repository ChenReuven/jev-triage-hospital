# Simulation auto-dispatch

On load the client starts a 100ms clock and dispatches `POST /api/next` one room at a time; patients leave the waiting pool and enter rooms without user input.

## Sub-features

- `auto-tick` — time advances every 100ms.
- `auto-seat` — empty rooms trigger pick + seat (Jev or ESI fallback).

## How to get to it (user POV)

- Open the demo and wait without clicking (optionally Pause after observing).

## Driving it with cursor-ide-browser

Preconditions:

- Doctor OK.
- Fresh **Reset** optional for predictable P01-first narrative.

- **Load.** `browser_navigate` to doctor URL.
- **Wait.** ~4s real time (multiple picks and consult starts).
- **Proof.** Screenshot `simulation-auto-dispatch.png` — at least one room shows a patient circle and countdown (`Ns` under room); pick strip not permanently `Last pick: none`.
- Snapshot `simulation-auto-dispatch.aria.txt`.

## Gotchas

- Without `TYPESAFE_API_KEY`, API returns 500 but UI still seats via ESI fallback — sim should not stall.
- Tween animation needs rAF; screenshot after ≥400ms from a pick for smoother layout.
