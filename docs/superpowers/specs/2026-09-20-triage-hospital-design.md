# About the JEV hospital triage demo

This is the agreed design for a 2D talk demo. Jev (TypeSafe Choice) picks the next waiting patient when a doctor frees. The demo is not a clinical product and does not handle real patient data.

Audience is someone watching Jev decide. The 2D board is a teaching sim, not a doctor workstation.

## Goal

A packed waiting room of 20 patients. Three doctors. Three rooms. One doctor per room. The sickest waiting patient goes next. ESI-1 outranks ESI-5. Equal ESI uses arrival time, then `seq`.

Jev makes that pick. If Jev fails, the same ESI rule seats the patient so the board never stalls.

## Layout on disk

Clone the `xo-jev` stack. Bun, HTML canvas, TypeSafe `@typesafe-ai/sdk`, no React.

- `src/hospital.ts` owns types, the 20-patient bag, `advance`, `seat`, `esiNext`, inject, and reset. No SDK import. No canvas import.
- `src/jev-triage.ts` builds the Choice prompt and calls `systemOne`.
- `server.ts` serves `index.html` and `POST /api/next`.
- `client.ts` owns the live `Hospital`, the 100ms clock, the one-at-a-time dispatcher, tweens, and the three HTML buttons.
- `index.html` and `styles.css` are the page.
- `src/hospital.test.ts` is `bun test` against `hospital.ts` only.

## Domain

`Esi` is `1 | 2 | 3 | 4 | 5`. 1 is the most severe.

A patient is exactly one of these variants:

```ts
type Patient =
  | { status: "waiting"; id: PatientId; esi: Esi; arrivedAt: Tick; seq: number }
  | {
      status: "in_room"
      id: PatientId
      esi: Esi
      arrivedAt: Tick
      seq: number
      roomId: RoomId
      consultEndsAt: Tick
    }
  | { status: "done"; id: PatientId; esi: Esi }
```

A doctor is `{ id: DoctorId; roomId: RoomId }` and is always 1:1 with a room. A doctor is idle when that room's `occupant` is `null`. There is no second busy flag.

```ts
type Room = { id: RoomId; occupant: PatientId | null }

type JevPick = {
  patientId: PatientId
  source: "jev" | "esi"
  confidence: number
  probabilities: Record<string, number>
}

type Hospital = {
  tick: Tick
  patients: Map<PatientId, Patient>
  rooms: [Room, Room, Room]
  lastPick: JevPick | null
  epoch: number
  inFlight: { roomId: RoomId; epoch: number } | null
}
```

`PatientId` is a branded string `P01`..`P21`. `RoomId` is `R1` | `R2` | `R3`. `DoctorId` is `D1` | `D2` | `D3`. `Tick` is a branded non-negative integer. These four types are not interchangeable.

Illegal states the types and reducers refuse:

- A patient in two rooms.
- A busy doctor with an empty room.
- Jev choosing a patient who is not `waiting`.
- Jev sending a patient to an occupied room.
- Two in-flight Choice calls.

## Opening census

On load and on Reset the bag is 20 waiting patients, 3 empty rooms, `tick = 0`, `lastPick = null`, `inFlight = null`.

ESI counts are fixed: one ESI-1, two ESI-2, four ESI-3, six ESI-4, seven ESI-5. Ids are `P01`..`P20` in that ESI order. `seq` is `0..19` in that same order so FIFO inside a band is stable when everyone shares `arrivedAt = 0`. Injected crash is `P21`.

## Consult length

The sim clock is 100ms per tick. Consult length is in ticks:

| ESI | ticks | wall time |
| --- | ----- | --------- |
| 1   | 80    | 8s        |
| 2   | 60    | 6s        |
| 3   | 40    | 4s        |
| 4   | 30    | 3s        |
| 5   | 20    | 2s        |

`seat` sets `consultEndsAt = tick + duration(esi)`.

## Clock and dispatcher

`advance(hospital)` only discharges. For each `in_room` patient with `consultEndsAt <= tick`, that patient becomes `done` and the room `occupant` becomes `null`. `advance` does not call Jev.

The client bumps `tick` every 100ms while not paused, then runs `advance`, then runs the dispatcher.

The dispatcher allows one in-flight pick:

1. If `inFlight` is set, stop.
2. If no waiting patient, stop.
3. If no empty room, stop.
4. Else take the first empty room in order Room 1, Room 2, Room 3. Set `inFlight`. POST the current waiting snapshot.

At t=0 the three rooms fill in sequence. Room 1 seats from 20 waiting. Room 2 seats from 19. Room 3 seats from 18. Parallel Choice calls are forbidden because they would all see the same ESI-1.

## Assign and fallback

When `POST /api/next` returns, drop the reply if any of these hold:

- `epoch` does not match `inFlight.epoch`
- `inFlight` is `null`
- the target room is already filled
- the patient is not `waiting`

Otherwise `seat(patientId, roomId, tick)`, set `lastPick` with `source: "jev"`, clear `inFlight`, then run the dispatcher again.

If the POST fails, times out at 3s, returns 4xx or 5xx, or returns an id that is not waiting, the client seats with `esiNext` and `source: "esi"`. `confidence` is `1` for ESI seats. Fallback is never random.

`esiNext` is the waiting patient with the lowest ESI number, then the lowest `arrivedAt`, then the lowest `seq`.

Reset increments `epoch`, ignores any in-flight reply, and rebuilds the bag.

Pause stops the 100ms timer. An in-flight POST may still complete. The reply still seats if the epoch matches.

## Inject ESI-1

The **ESI-1 walks in** button adds waiting patient `P21` (ESI-1, `seq = 20`, `arrivedAt = tick`) if `P21` is not already in the hospital. Living means `waiting` plus `in_room`. Inject is a no-op when `P21` already exists or when living is already 21. Inject does not cancel `inFlight`. The next dispatcher pass sees the new patient. One crash per epoch. Reset deletes `P21` with the rest of the bag.

## Jev prompt

`POST /api/next` body is the waiting list only: `{ id, esi, arrivedAt, seq, waitTicks }[]`. Rooms and doctors stay off the wire.

`jev-triage.ts` calls `systemOne` with:

- `state.esi_rule`. ESI 1 is immediately life-threatening. 5 is least urgent. Pick the sickest waiting patient. If several share the same ESI, pick the earliest `arrivedAt`, then the lowest `seq`.
- `state.waiting`. `{ id, esi, arrivedAt, seq, waitTicks }[]`. The client sends `waitTicks` as `tick - arrivedAt`. The server does not invent a clock.
- `questions.next_patient`. `choice()` keyed by waiting `PatientId`. Each criterion names id, ESI, wait ticks, and seq.

The handler returns `{ patientId, confidence, probabilities }`. Missing `TYPESAFE_API_KEY` is 500. Invalid JSON or an empty waiting array is 400. A Choice id that is not in the posted list is 422. The client treats 422 like any other failure and ESI-seats.

`hospital.ts` never imports the SDK.

## 2D view

One canvas. Three HTML buttons under it: **Pause**, **Reset**, **ESI-1 walks in**.

```
+------------------+--------+--------+--------+
| WAITING          | Room 1 | Room 2 | Room 3 |
| 20-circle grid   | Dr     | Dr     | Dr     |
+------------------+--------+--------+--------+
| Last pick strip                             |
```

Waiting pool is the left ~45%. Circles sit in a 5-column grid sorted by ESI (1 first), then `seq`. That sort is visual only. Assignment is Jev or `esiNext`.

Patient circle fill:

- ESI 1 `#dc2626`
- ESI 2 `#ea580c`
- ESI 3 `#ca8a04`
- ESI 4 `#2563eb`
- ESI 5 `#16a34a`

White digit 1-5 in the center. Id under the circle (`P03`). Radius about 16px.

Each room is a box labeled Room 1, Room 2, or Room 3. The doctor is a `#111827` circle with letter D in the top-left of the box. An occupied room draws the patient in the center and remaining seconds (`6s`). An `inFlight` room uses a dashed border. Done patients leave the canvas. The waiting grid closes the gap.

On `seat`, the circle lerps from its grid cell to the room center in 400ms. Model status is already `in_room` when the tween starts. Reset cancels tweens and redraws from the new snapshot.

The pick strip shows the last seated id, ESI, source (`jev` or `esi`), and confidence. A second line lists the top probabilities. The strip is empty until the first seat.

No camera pan. No particle effects. No graveyard of discharged patients.

## Tests

`bun test` on `src/hospital.test.ts`. Each test calls a hospital function with one concrete input and asserts a literal resulting state. No TypeSafe. No canvas.

1. New bag has 20 waiting, 3 empty rooms, ESI counts 1, 2, 4, 6, 7.
2. `esiNext` on that bag returns the sole ESI-1.
3. Two ESI-2s. The earlier `seq` wins.
4. `seat(p, R1, t)` makes p `in_room`, fills Room 1, sets `consultEndsAt = t + duration(esi)`.
5. `advance` at `consultEndsAt` makes p `done` and clears Room 1.
6. `advance` before `consultEndsAt` leaves the hospital unchanged.
7. `epoch++` then apply an old pick. Hospital unchanged.
8. A second `seat` of an already seated id is a no-op.
9. Inject ESI-1 while 20 wait. Waiting count is 21. `esiNext` returns the injected patient.
10. Inject at 21 living is a no-op. Inject when `P21` already exists is a no-op.

Proof of the running demo is opening the page with `TYPESAFE_API_KEY` set and watching the ESI-1 tween into Room 1 first. If the key is missing, Room 1 still fills with that ESI-1 via fallback.

## Out of scope

Login, persistence, specialties, sound, mobile layout, real PHI, more than 3 rooms, click-to-spawn while the census is already 20, React.

## Decisions already made

- Jev picks the next waiting patient. Jev does not score acuity and does not pick a room independently of the idle-room queue.
- Policy is ESI bands, then FIFO. Not a mixed wait-plus-acuity score.
- You do not type a complaint. Acuity is on the patient from spawn.
- Fallback is ESI, copied from this spec, not random as in `xo-jev`.
