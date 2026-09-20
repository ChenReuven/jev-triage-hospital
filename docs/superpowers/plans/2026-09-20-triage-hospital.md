# JEV hospital triage demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun + canvas talk demo where Jev picks the next waiting patient for one of three 1:1 doctor rooms, with ESI fallback so the board never stalls.

**Architecture:** Pure hospital reducers in `src/hospital.ts` own the domain. `src/jev-triage.ts` plus `POST /api/next` are the TypeSafe boundary. `client.ts` owns the 100ms clock, the one-at-a-time dispatcher, and canvas. Tests cover only `hospital.ts`.

**Tech Stack:** Bun, TypeScript, HTML canvas, `@typesafe-ai/sdk` `^0.6.0`, `bun test`. No React.

**Spec:** `docs/superpowers/specs/2026-09-20-triage-hospital-design.md`

## Global Constraints

- Clone the `xo-jev` stack. Bun, HTML canvas, TypeSafe, no React.
- `src/hospital.ts` never imports the SDK or canvas.
- ESI 1 is most severe. `esiNext` is lowest ESI number, then lowest `arrivedAt`, then lowest `seq`.
- Fallback is ESI, never random.
- One in-flight Choice. Empty-room order is R1, R2, R3.
- Opening bag is 20 waiting. Counts 1, 2, 4, 6, 7. Ids `P01`..`P20`. Injected crash is `P21`.
- Consult ticks: 1→80, 2→60, 3→40, 4→30, 5→20. Clock is 100ms per tick.
- `POST /api/next` body is `{ id, esi, arrivedAt, seq, waitTicks }[]` only.
- Missing `TYPESAFE_API_KEY` is 500. Empty or invalid waiting is 400. Choice id not in the posted list is 422.
- Living cap 21. Inject is a no-op if `P21` exists or living is 21.
- Out of scope: login, persistence, specialties, sound, mobile layout, real PHI, more than 3 rooms, click-to-spawn, React.
- This folder is not a git repo yet. `git init` on the first commit.

## File map

- Create: `package.json`, `tsconfig.json`, `.gitignore`, `.env.sample`
- Create: `src/hospital.ts` (types + reducers)
- Create: `src/hospital.test.ts`
- Create: `src/jev-triage.ts` (Choice prompt)
- Create: `server.ts`, `client.ts`, `src/draw.ts`, `index.html`, `styles.css`
- Create: `.env` is local only. Never commit it.
- Create: `README.md` in the last task

---

### Task 1: Hospital bag

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `PatientId`, `RoomId`, `DoctorId`, `Tick`, `Esi`, `Patient`, `Room`, `JevPick`, `Hospital`, `asPatientId`, `asTick`, `ROOM_IDS`, `DOCTORS`, `createHospital`, `waitingPatients`, `esiCounts`

- [ ] **Step 1: Scaffold**

`package.json`:

```json
{
  "name": "jev-triage-hospital",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot server.ts",
    "start": "bun server.ts",
    "test": "bun test"
  },
  "dependencies": {
    "@typesafe-ai/sdk": "^0.6.0"
  },
  "devDependencies": {
    "@types/bun": "^1.4.2"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun"]
  },
  "include": ["*.ts", "src/**/*.ts"]
}
```

`.gitignore`:

```
node_modules
.env
.history
```

Run: `bun install`

- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import {
  createHospital,
  esiCounts,
  waitingPatients,
} from "./hospital";

describe("createHospital", () => {
  test("opens with 20 waiting, 3 empty rooms, ESI bag 1/2/4/6/7", () => {
    const h = createHospital();
    expect(waitingPatients(h).length).toBe(20);
    expect(h.rooms.map((r) => r.occupant)).toEqual([null, null, null]);
    expect(h.tick).toBe(0);
    expect(h.lastPick).toBe(null);
    expect(h.epoch).toBe(0);
    expect(h.inFlight).toBe(null);
    expect(esiCounts(h)).toEqual({ 1: 1, 2: 2, 3: 4, 4: 6, 5: 7 });
    expect(waitingPatients(h)[0]?.id).toBe("P01");
    expect(waitingPatients(h)[19]?.id).toBe("P20");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL with a module-not-found or `createHospital` not defined.

- [ ] **Step 4: Write minimal implementation**

`src/hospital.ts`:

```ts
export type PatientId = string & { readonly __brand: "PatientId" };
export type RoomId = "R1" | "R2" | "R3";
export type DoctorId = "D1" | "D2" | "D3";
export type Tick = number & { readonly __brand: "Tick" };
export type Esi = 1 | 2 | 3 | 4 | 5;

export type WaitingPatient = {
  status: "waiting";
  id: PatientId;
  esi: Esi;
  arrivedAt: Tick;
  seq: number;
};

export type InRoomPatient = {
  status: "in_room";
  id: PatientId;
  esi: Esi;
  arrivedAt: Tick;
  seq: number;
  roomId: RoomId;
  consultEndsAt: Tick;
};

export type DonePatient = {
  status: "done";
  id: PatientId;
  esi: Esi;
};

export type Patient = WaitingPatient | InRoomPatient | DonePatient;

export type Room = { id: RoomId; occupant: PatientId | null };

export type JevPick = {
  patientId: PatientId;
  source: "jev" | "esi";
  confidence: number;
  probabilities: Record<string, number>;
};

export type Hospital = {
  tick: Tick;
  patients: Map<PatientId, Patient>;
  rooms: [Room, Room, Room];
  lastPick: JevPick | null;
  epoch: number;
  inFlight: { roomId: RoomId; epoch: number } | null;
};

export const ROOM_IDS: readonly RoomId[] = ["R1", "R2", "R3"];

export const DOCTORS: readonly { id: DoctorId; roomId: RoomId }[] = [
  { id: "D1", roomId: "R1" },
  { id: "D2", roomId: "R2" },
  { id: "D3", roomId: "R3" },
];

const BAG_ESI: readonly Esi[] = [
  1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5,
];

export function asPatientId(id: string): PatientId {
  return id as PatientId;
}

export function asTick(n: number): Tick {
  return n as Tick;
}

export function padPatientId(n: number): PatientId {
  return asPatientId(`P${String(n).padStart(2, "0")}`);
}

export function cloneHospital(h: Hospital): Hospital {
  return {
    ...h,
    patients: new Map(h.patients),
    rooms: [{ ...h.rooms[0] }, { ...h.rooms[1] }, { ...h.rooms[2] }],
  };
}

export function createHospital(): Hospital {
  const patients = new Map<PatientId, Patient>();
  BAG_ESI.forEach((esi, index) => {
    const id = padPatientId(index + 1);
    patients.set(id, {
      status: "waiting",
      id,
      esi,
      arrivedAt: asTick(0),
      seq: index,
    });
  });
  return {
    tick: asTick(0),
    patients,
    rooms: [
      { id: "R1", occupant: null },
      { id: "R2", occupant: null },
      { id: "R3", occupant: null },
    ],
    lastPick: null,
    epoch: 0,
    inFlight: null,
  };
}

export function waitingPatients(h: Hospital): WaitingPatient[] {
  return [...h.patients.values()].filter(
    (p): p is WaitingPatient => p.status === "waiting",
  );
}

export function esiCounts(h: Hospital): Record<Esi, number> {
  const counts: Record<Esi, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const p of h.patients.values()) {
    counts[p.esi] += 1;
  }
  return counts;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json bun.lock .gitignore src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: hospital opens with the 20-patient ESI bag

EOF
)"
```

If `bun.lock` is named `bun.lockb`, add that file instead.

---

### Task 2: ESI next and consult duration

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `createHospital`, `waitingPatients`, `asPatientId`, `asTick`
- Produces: `consultDuration(esi: Esi): Tick`, `esiNext(h: Hospital): PatientId | null`

- [ ] **Step 1: Write the failing tests**

Append:

```ts
import { asPatientId, asTick, consultDuration, esiNext } from "./hospital";

describe("consultDuration", () => {
  test("maps ESI to consult ticks", () => {
    expect(consultDuration(1)).toBe(80);
    expect(consultDuration(2)).toBe(60);
    expect(consultDuration(3)).toBe(40);
    expect(consultDuration(4)).toBe(30);
    expect(consultDuration(5)).toBe(20);
  });
});

describe("esiNext", () => {
  test("returns the sole ESI-1 from the opening bag", () => {
    expect(esiNext(createHospital())).toBe("P01");
  });

  test("two ESI-2s, earlier seq wins after the ESI-1 is done", () => {
    const h = createHospital();
    h.patients.set(asPatientId("P01"), {
      status: "done",
      id: asPatientId("P01"),
      esi: 1,
    });
    expect(esiNext(h)).toBe("P02");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `consultDuration` and `esiNext` are not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/hospital.ts`:

```ts
export function consultDuration(esi: Esi): Tick {
  switch (esi) {
    case 1:
      return asTick(80);
    case 2:
      return asTick(60);
    case 3:
      return asTick(40);
    case 4:
      return asTick(30);
    case 5:
      return asTick(20);
    default: {
      const _exhaustive: never = esi;
      return _exhaustive;
    }
  }
}

export function esiNext(h: Hospital): PatientId | null {
  const waiting = waitingPatients(h);
  if (waiting.length === 0) {
    return null;
  }
  waiting.sort((a, b) => {
    if (a.esi !== b.esi) return a.esi - b.esi;
    if (a.arrivedAt !== b.arrivedAt) return a.arrivedAt - b.arrivedAt;
    return a.seq - b.seq;
  });
  return waiting[0].id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: pick next patient by ESI then arrival then seq

EOF
)"
```

---

### Task 3: Seat

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `createHospital`, `asPatientId`, `asTick`, `consultDuration`
- Produces: `seat(h: Hospital, patientId: PatientId, roomId: RoomId, tick: Tick): Hospital`

- [ ] **Step 1: Write the failing tests**

```ts
import { seat } from "./hospital";

describe("seat", () => {
  test("moves a waiting patient into a room with consultEndsAt", () => {
    const h = seat(createHospital(), asPatientId("P01"), "R1", asTick(0));
    const p = h.patients.get(asPatientId("P01"));
    expect(p).toEqual({
      status: "in_room",
      id: "P01",
      esi: 1,
      arrivedAt: 0,
      seq: 0,
      roomId: "R1",
      consultEndsAt: 80,
    });
    expect(h.rooms[0]?.occupant).toBe("P01");
    expect(waitingPatients(h).length).toBe(19);
  });

  test("second seat of the same id is a no-op", () => {
    const once = seat(createHospital(), asPatientId("P01"), "R1", asTick(0));
    const twice = seat(once, asPatientId("P01"), "R2", asTick(0));
    expect(twice).toBe(once);
    expect(twice.rooms[1]?.occupant).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `seat` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function seat(
  h: Hospital,
  patientId: PatientId,
  roomId: RoomId,
  tick: Tick,
): Hospital {
  const patient = h.patients.get(patientId);
  const room = h.rooms.find((r) => r.id === roomId);
  if (!patient || patient.status !== "waiting" || !room || room.occupant !== null) {
    return h;
  }
  const next = cloneHospital(h);
  next.tick = tick;
  next.patients.set(patientId, {
    status: "in_room",
    id: patientId,
    esi: patient.esi,
    arrivedAt: patient.arrivedAt,
    seq: patient.seq,
    roomId,
    consultEndsAt: asTick(tick + consultDuration(patient.esi)),
  });
  const roomIndex = ROOM_IDS.indexOf(roomId);
  next.rooms[roomIndex] = { id: roomId, occupant: patientId };
  return next;
}
```

`next.rooms` is a 3-tuple. Assigning by index is allowed because the clone copied three room objects.

For the no-op test, return the same reference `h` when the seat is illegal so `toBe(once)` holds.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: seat a waiting patient into an empty room

EOF
)"
```

---

### Task 4: Advance discharges

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `seat`, `asTick`, `asPatientId`
- Produces: `advance(h: Hospital): Hospital` which uses `h.tick`

- [ ] **Step 1: Write the failing tests**

```ts
import { advance } from "./hospital";

describe("advance", () => {
  test("discharges at consultEndsAt and clears the room", () => {
    let h = seat(createHospital(), asPatientId("P01"), "R1", asTick(0));
    h = { ...h, tick: asTick(80) };
    h = advance(h);
    expect(h.patients.get(asPatientId("P01"))).toEqual({
      status: "done",
      id: "P01",
      esi: 1,
    });
    expect(h.rooms[0]?.occupant).toBe(null);
  });

  test("does nothing before consultEndsAt", () => {
    const seated = seat(createHospital(), asPatientId("P01"), "R1", asTick(0));
    const early = { ...seated, tick: asTick(79) };
    const next = advance(early);
    expect(next.patients.get(asPatientId("P01"))?.status).toBe("in_room");
    expect(next.rooms[0]?.occupant).toBe("P01");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `advance` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function advance(h: Hospital): Hospital {
  let changed = false;
  const next = cloneHospital(h);
  for (const patient of [...next.patients.values()]) {
    if (patient.status !== "in_room") continue;
    if (patient.consultEndsAt > h.tick) continue;
    next.patients.set(patient.id, {
      status: "done",
      id: patient.id,
      esi: patient.esi,
    });
    const roomIndex = ROOM_IDS.indexOf(patient.roomId);
    next.rooms[roomIndex] = { id: patient.roomId, occupant: null };
    changed = true;
  }
  return changed ? next : h;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: discharge patients when consult time elapses

EOF
)"
```

---

### Task 5: Begin pick and apply reply

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `createHospital`, `seat`, `esiNext`, `cloneHospital`
- Produces: `firstEmptyRoom(h: Hospital): RoomId | null`, `beginPick(h: Hospital): Hospital`, `applyReply(h: Hospital, reply: NextReply): Hospital`, `type NextReply`

`NextReply` is:

```ts
export type NextReply =
  | {
      ok: true;
      patientId: PatientId;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { ok: false };
```

`applyReply` rules:

1. If `inFlight` is null, return `h`.
2. If `inFlight.epoch !== h.epoch`, return `h`.
3. Clear `inFlight`.
4. If the target room is already filled, return that hospital (no seat).
5. Seat `reply.patientId` when `ok` and that patient is waiting. `source` is `"jev"`.
6. Otherwise seat `esiNext`. `source` is `"esi"`, `confidence` is `1`, `probabilities` is `{ [id]: 1 }`.
7. If nobody is waiting, return with `inFlight` cleared.

This is the spec gap fix. A dropped Jev id must still clear `inFlight` or the dispatcher stalls forever.

- [ ] **Step 1: Write the failing tests**

```ts
import { applyReply, beginPick, firstEmptyRoom } from "./hospital";

describe("beginPick", () => {
  test("marks the first empty room in-flight", () => {
    const h = beginPick(createHospital());
    expect(firstEmptyRoom(createHospital())).toBe("R1");
    expect(h.inFlight).toEqual({ roomId: "R1", epoch: 0 });
  });
});

describe("applyReply", () => {
  test("stale epoch leaves the hospital unseated", () => {
    const inFlight = beginPick(createHospital());
    const stale = { ...inFlight, epoch: 1 };
    const next = applyReply(stale, {
      ok: true,
      patientId: asPatientId("P01"),
      confidence: 0.9,
      probabilities: { P01: 0.9 },
    });
    expect(next.rooms[0]?.occupant).toBe(null);
    expect(next.patients.get(asPatientId("P01"))?.status).toBe("waiting");
    expect(next.inFlight).toEqual({ roomId: "R1", epoch: 0 });
  });

  test("jev seat writes lastPick and fills R1", () => {
    const next = applyReply(beginPick(createHospital()), {
      ok: true,
      patientId: asPatientId("P01"),
      confidence: 0.81,
      probabilities: { P01: 0.81, P02: 0.12 },
    });
    expect(next.rooms[0]?.occupant).toBe("P01");
    expect(next.inFlight).toBe(null);
    expect(next.lastPick).toEqual({
      patientId: "P01",
      source: "jev",
      confidence: 0.81,
      probabilities: { P01: 0.81, P02: 0.12 },
    });
  });

  test("failed reply seats esiNext", () => {
    const next = applyReply(beginPick(createHospital()), { ok: false });
    expect(next.rooms[0]?.occupant).toBe("P01");
    expect(next.lastPick?.source).toBe("esi");
    expect(next.lastPick?.confidence).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `applyReply` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export type NextReply =
  | {
      ok: true;
      patientId: PatientId;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { ok: false };

export function firstEmptyRoom(h: Hospital): RoomId | null {
  for (const room of h.rooms) {
    if (room.occupant === null) return room.id;
  }
  return null;
}

export function beginPick(h: Hospital): Hospital {
  if (h.inFlight) return h;
  const roomId = firstEmptyRoom(h);
  if (!roomId || !esiNext(h)) return h;
  const next = cloneHospital(h);
  next.inFlight = { roomId, epoch: h.epoch };
  return next;
}

export function applyReply(h: Hospital, reply: NextReply): Hospital {
  if (!h.inFlight) return h;
  if (h.inFlight.epoch !== h.epoch) return h;
  const roomId = h.inFlight.roomId;
  const next = cloneHospital(h);
  next.inFlight = null;
  const room = next.rooms.find((r) => r.id === roomId);
  if (!room || room.occupant !== null) return next;

  let patientId: PatientId | null = null;
  let pick: JevPick;
  if (reply.ok) {
    const candidate = next.patients.get(reply.patientId);
    if (candidate?.status === "waiting") {
      patientId = reply.patientId;
      pick = {
        patientId,
        source: "jev",
        confidence: reply.confidence,
        probabilities: reply.probabilities,
      };
    }
  }
  if (!patientId) {
    patientId = esiNext(next);
    if (!patientId) return next;
    pick = {
      patientId,
      source: "esi",
      confidence: 1,
      probabilities: { [patientId]: 1 },
    };
  }
  const seated = seat(next, patientId, roomId, next.tick);
  seated.lastPick = pick!;
  return seated;
}
```

`pick!` is only reached after `patientId` is set. If the compiler complains, assign `pick` in both branches as a definite `JevPick`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: apply Jev or ESI replies without stalling in-flight

EOF
)"
```

---

### Task 6: Inject crash and reset

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `createHospital`, `esiNext`, `waitingPatients`, `asTick`
- Produces: `livingCount(h: Hospital): number`, `injectCrash(h: Hospital): Hospital`, `resetHospital(h: Hospital): Hospital`

- [ ] **Step 1: Write the failing tests**

```ts
import { injectCrash, livingCount, resetHospital } from "./hospital";

describe("injectCrash", () => {
  test("adds P21 ESI-1 and esiNext returns P21", () => {
    const h = injectCrash(createHospital());
    expect(waitingPatients(h).length).toBe(21);
    expect(h.patients.get(asPatientId("P21"))).toEqual({
      status: "waiting",
      id: "P21",
      esi: 1,
      arrivedAt: 0,
      seq: 20,
    });
    expect(esiNext(h)).toBe("P21");
  });

  test("is a no-op at 21 living or if P21 exists", () => {
    const once = injectCrash(createHospital());
    expect(livingCount(once)).toBe(21);
    expect(injectCrash(once)).toBe(once);
  });
});

describe("resetHospital", () => {
  test("rebuilds the bag and bumps epoch", () => {
    const h = resetHospital(injectCrash(createHospital()));
    expect(h.epoch).toBe(1);
    expect(waitingPatients(h).length).toBe(20);
    expect(h.patients.get(asPatientId("P21"))).toBeUndefined();
    expect(h.inFlight).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `injectCrash` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export function livingCount(h: Hospital): number {
  let n = 0;
  for (const p of h.patients.values()) {
    if (p.status !== "done") n += 1;
  }
  return n;
}

export function injectCrash(h: Hospital): Hospital {
  const id = asPatientId("P21");
  if (h.patients.has(id) || livingCount(h) >= 21) return h;
  const next = cloneHospital(h);
  next.patients.set(id, {
    status: "waiting",
    id,
    esi: 1,
    arrivedAt: next.tick,
    seq: 20,
  });
  return next;
}

export function resetHospital(h: Hospital): Hospital {
  const next = createHospital();
  next.epoch = h.epoch + 1;
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS, 10 spec behaviors covered.

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: inject one ESI-1 crash per epoch and reset the bag

EOF
)"
```

---

### Task 7: Waiting snapshot for the wire

**Files:**
- Modify: `src/hospital.ts`
- Test: `src/hospital.test.ts`

**Interfaces:**
- Consumes: `createHospital`, `asTick`
- Produces: `WaitingWire`, `waitingSnapshot(h: Hospital): WaitingWire[]`

- [ ] **Step 1: Write the failing test**

```ts
import { waitingSnapshot } from "./hospital";

describe("waitingSnapshot", () => {
  test("sends waitTicks as tick minus arrivedAt", () => {
    const h = { ...createHospital(), tick: asTick(10) };
    const snap = waitingSnapshot(h);
    expect(snap).toHaveLength(20);
    expect(snap[0]).toEqual({
      id: "P01",
      esi: 1,
      arrivedAt: 0,
      seq: 0,
      waitTicks: 10,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hospital.test.ts`
Expected: FAIL because `waitingSnapshot` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
export type WaitingWire = {
  id: PatientId;
  esi: Esi;
  arrivedAt: Tick;
  seq: number;
  waitTicks: number;
};

export function waitingSnapshot(h: Hospital): WaitingWire[] {
  return waitingPatients(h).map((p) => ({
    id: p.id,
    esi: p.esi,
    arrivedAt: p.arrivedAt,
    seq: p.seq,
    waitTicks: h.tick - p.arrivedAt,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/hospital.ts src/hospital.test.ts
git commit -m "$(cat <<'EOF'
feat: snapshot waiting patients for POST /api/next

EOF
)"
```

---

### Task 8: TypeSafe next-patient endpoint

**Files:**
- Create: `.env.sample`
- Create: `src/jev-triage.ts`
- Create: `server.ts`
- Create: `index.html` (stub page so Bun can boot)
- Create: `client.ts` (empty module so the stub script loads)
- Create: `styles.css` (empty file is fine)

**Interfaces:**
- Consumes: `WaitingWire` shape on the wire. Do not import `hospital.ts` into `jev-triage.ts` if that would pull tests sideways. Duplicate the wire type as `WaitingInput` in `jev-triage.ts` and parse at the boundary.
- Produces: `pickNextPatient(waiting: WaitingInput[]): Promise<{ patientId: string; confidence: number; probabilities: Record<string, number> }>`, `POST /api/next`

- [ ] **Step 1: Write `.env.sample`**

```
TYPESAFE_API_KEY=
```

- [ ] **Step 2: Implement `src/jev-triage.ts`**

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export type WaitingInput = {
  id: string;
  esi: number;
  arrivedAt: number;
  seq: number;
  waitTicks: number;
};

const client = new TypeSafeClient();

const ESI_RULE =
  "ESI 1 is immediately life-threatening. 5 is least urgent. Pick the sickest waiting patient. If several share the same ESI, pick the earliest arrivedAt, then the lowest seq.";

export async function pickNextPatient(waiting: WaitingInput[]): Promise<{
  patientId: string;
  confidence: number;
  probabilities: Record<string, number>;
}> {
  if (waiting.length === 0) {
    throw new Error("empty waiting list");
  }
  if (waiting.length === 1) {
    return {
      patientId: waiting[0].id,
      confidence: 1,
      probabilities: { [waiting[0].id]: 1 },
    };
  }

  const criteria: Record<string, string> = {};
  for (const p of waiting) {
    criteria[p.id] =
      `${p.id} ESI-${p.esi}, waited ${p.waitTicks} ticks, seq ${p.seq}. Lower ESI is sicker.`;
  }

  const response = await client.systemOne({
    state: {
      game: "hospital-triage",
      esi_rule: ESI_RULE,
      waiting,
    },
    questions: {
      next_patient: choice(
        "Pick the waiting patient id who should see the next free doctor.",
        criteria,
      ),
    },
  });

  const answer = response.answers.next_patient;
  const ids = new Set(waiting.map((p) => p.id));
  if (!ids.has(answer.choice)) {
    const err = new Error(`Jev chose unknown id ${answer.choice}`);
    (err as Error & { status: number }).status = 422;
    throw err;
  }
  return {
    patientId: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
  };
}

export function parseWaiting(body: unknown): WaitingInput[] | null {
  if (!Array.isArray(body) || body.length === 0) return null;
  const rows: WaitingInput[] = [];
  for (const row of body) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof row.id !== "string" ||
      typeof row.esi !== "number" ||
      ![1, 2, 3, 4, 5].includes(row.esi) ||
      typeof row.arrivedAt !== "number" ||
      typeof row.seq !== "number" ||
      typeof row.waitTicks !== "number"
    ) {
      return null;
    }
    rows.push({
      id: row.id,
      esi: row.esi,
      arrivedAt: row.arrivedAt,
      seq: row.seq,
      waitTicks: row.waitTicks,
    });
  }
  return rows;
}
```

- [ ] **Step 3: Implement `server.ts`**

Copy the Bun.serve pattern from `../xo-jev/server.ts`. Routes:

```ts
import index from "./index.html";
import { parseWaiting, pickNextPatient } from "./src/jev-triage";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/api/next": {
      async POST(req) {
        if (!process.env.TYPESAFE_API_KEY?.trim()) {
          return Response.json(
            { error: "Set TYPESAFE_API_KEY in .env" },
            { status: 500 },
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const waiting = parseWaiting(body);
        if (!waiting) {
          return Response.json(
            { error: "waiting must be a non-empty array of patient rows" },
            { status: 400 },
          );
        }
        try {
          const result = await pickNextPatient(waiting);
          return Response.json(result);
        } catch (error) {
          const status =
            error instanceof Error && "status" in error && error.status === 422
              ? 422
              : 500;
          return Response.json(
            {
              error: error instanceof Error ? error.message : "Jev pick failed",
            },
            { status },
          );
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Jev triage → http://localhost:${server.port}`);
```

The POST body is the waiting array itself, not `{ waiting: [...] }`. Match the spec.

- [ ] **Step 4: Stub `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jev triage</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="app">
      <h1>Jev triage</h1>
      <canvas id="board" width="1100" height="640"></canvas>
      <div class="controls">
        <button type="button" id="pause">Pause</button>
        <button type="button" id="reset">Reset</button>
        <button type="button" id="inject">ESI-1 walks in</button>
      </div>
    </main>
    <script type="module" src="./client.ts"></script>
  </body>
</html>
```

`client.ts` for this task:

```ts
console.log("triage client loaded");
```

- [ ] **Step 5: Verify the boundary**

Run: `bun test src/hospital.test.ts`
Expected: PASS

Run: `bun -e 'import { parseWaiting } from "./src/jev-triage.ts"; console.log(parseWaiting([]) === null, parseWaiting([{id:"P01",esi:1,arrivedAt:0,seq:0,waitTicks:0}])[0].id)'`
Expected: prints `true P01`

Run a 400 check without a key after starting the server is optional here. The missing-key 500 path is proven in Task 9 with the client fallback. For this task, start `bun run dev` in the background, then:

```bash
curl -s -o /tmp/next.json -w "%{http_code}" -X POST http://localhost:3000/api/next -H "content-type: application/json" -d '[]'
```

Expected: `400` if the key is set, or `500` if it is not. Both are legal. Kill the server after.

- [ ] **Step 6: Commit**

```bash
git add .env.sample src/jev-triage.ts server.ts index.html client.ts styles.css
git commit -m "$(cat <<'EOF'
feat: POST /api/next picks one waiting patient via Jev

EOF
)"
```

Do not add `.env`.

---

### Task 9: Client clock, dispatcher, buttons

**Files:**
- Modify: `client.ts`
- Modify: `src/hospital.ts` only if you need `withTick`. Prefer `cloneHospital` plus `h.tick = asTick(h.tick + 1)` in the client.

**Interfaces:**
- Consumes: `createHospital`, `advance`, `beginPick`, `applyReply`, `waitingSnapshot`, `injectCrash`, `resetHospital`, `asPatientId`, `asTick`
- Produces: a running loop on the page. Canvas still empty is OK if `draw` is a no-op function in this task.

- [ ] **Step 1: Implement `client.ts`**

```ts
import {
  type Hospital,
  type NextReply,
  type PatientId,
  advance,
  applyReply,
  asPatientId,
  asTick,
  beginPick,
  createHospital,
  injectCrash,
  resetHospital,
  waitingSnapshot,
} from "./src/hospital";
import { draw } from "./src/draw";

const canvas = document.getElementById("board") as HTMLCanvasElement;
const pauseBtn = document.getElementById("pause") as HTMLButtonElement;
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const injectBtn = document.getElementById("inject") as HTMLButtonElement;

let hospital: Hospital = createHospital();
let paused = false;
let timer: ReturnType<typeof setInterval> | null = null;

function render() {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  draw(ctx, hospital, canvas.width, canvas.height);
}

async function dispatch() {
  if (hospital.inFlight) return;
  const next = beginPick(hospital);
  if (!next.inFlight) return;
  hospital = next;
  render();
  const reply = await requestNext(waitingSnapshot(hospital));
  hospital = applyReply(hospital, reply);
  render();
  if (!hospital.inFlight) void dispatch();
}

async function requestNext(
  waiting: ReturnType<typeof waitingSnapshot>,
): Promise<NextReply> {
  try {
    const res = await fetch("/api/next", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(waiting),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as {
      patientId?: string;
      confidence?: number;
      probabilities?: Record<string, number>;
    };
    if (typeof body.patientId !== "string") return { ok: false };
    return {
      ok: true,
      patientId: asPatientId(body.patientId) as PatientId,
      confidence: typeof body.confidence === "number" ? body.confidence : 0,
      probabilities: body.probabilities ?? {},
    };
  } catch {
    return { ok: false };
  }
}

function onTick() {
  if (paused) return;
  hospital = advance({ ...hospital, tick: asTick(hospital.tick + 1) });
  render();
  void dispatch();
}

function startClock() {
  if (timer) return;
  timer = setInterval(onTick, 100);
}

pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
});

resetBtn.addEventListener("click", () => {
  hospital = resetHospital(hospital);
  render();
  void dispatch();
});

injectBtn.addEventListener("click", () => {
  hospital = injectCrash(hospital);
  render();
  void dispatch();
});

render();
startClock();
void dispatch();
```

- [ ] **Step 2: Stub `src/draw.ts` so the client typechecks**

```ts
import type { Hospital } from "./hospital";

export function draw(
  ctx: CanvasRenderingContext2D,
  _hospital: Hospital,
  width: number,
  height: number,
): void {
  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);
}
```

- [ ] **Step 3: Run tests**

Run: `bun test src/hospital.test.ts`
Expected: PASS

- [ ] **Step 4: Manual loop check**

Run: `bun run dev`
Open `http://localhost:3000`. Without a canvas scene you still see buttons. In the network tab, `POST /api/next` fires once, then again after each seat. Three rooms fill in sequence, not three POSTs at once. If the key is missing, status is 500 and ESI still seats `P01` then `P02` then `P03`.

- [ ] **Step 5: Commit**

```bash
git add client.ts src/draw.ts
git commit -m "$(cat <<'EOF'
feat: tick, dispatch, and seat from Pause Reset Inject

EOF
)"
```

---

### Task 10: Canvas board

**Files:**
- Modify: `src/draw.ts`
- Modify: `styles.css`
- Modify: `index.html` only if copy needs a subtitle

**Interfaces:**
- Consumes: `Hospital`, `DOCTORS`, `waitingPatients`, `consultDuration` not required if remaining seconds are `(consultEndsAt - tick) * 0.1`
- Produces: `draw(ctx, hospital, width, height)` matching the spec layout

- [ ] **Step 1: Implement `src/draw.ts`**

Layout:

- Waiting pane x=16, y=16, w=width*0.45-24, h=height-120
- Three rooms stacked in the remaining width. Room order top to bottom is R1, R2, R3.
- Pick strip y=height-96, full width.

ESI fills:

- 1 `#dc2626`
- 2 `#ea580c`
- 3 `#ca8a04`
- 4 `#2563eb`
- 5 `#16a34a`

Doctor fill `#111827`. Digit white. Id under the circle. Radius 16. Waiting grid 5 columns, sorted by ESI then `seq`. Occupied room draws remaining seconds as `${Math.ceil((consultEndsAt - tick) * 0.1)}s`. `inFlight` room uses `setLineDash([6, 4])`. Done patients are not drawn.

Tweens: keep a module-local `Map<PatientId, { x: number; y: number }>` of last drawn waiting slots. When a patient becomes `in_room`, lerp from that slot to the room center over 400ms using `performance.now()`. On `resetHospital` (detect `epoch` change), clear the map. If `draw` has no prior slot, snap to the room center.

Full `draw.ts` (replace the stub):

```ts
import {
  type Hospital,
  type PatientId,
  type RoomId,
  DOCTORS,
  waitingPatients,
} from "./hospital";

const ESI_FILL: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "#dc2626",
  2: "#ea580c",
  3: "#ca8a04",
  4: "#2563eb",
  5: "#16a34a",
};

const RADIUS = 16;
const TWEEN_MS = 400;

const lastWaitingPos = new Map<PatientId, { x: number; y: number }>();
const tweens = new Map<
  PatientId,
  { from: { x: number; y: number }; to: { x: number; y: number }; start: number }
>();
let lastEpoch = 0;

function roomCenter(
  roomId: RoomId,
  width: number,
  height: number,
): { x: number; y: number } {
  const left = width * 0.45;
  const strip = 96;
  const roomH = (height - strip - 32) / 3;
  const index = roomId === "R1" ? 0 : roomId === "R2" ? 1 : 2;
  return {
    x: left + (width - left) / 2,
    y: 16 + roomH * index + roomH / 2,
  };
}

export function draw(
  ctx: CanvasRenderingContext2D,
  hospital: Hospital,
  width: number,
  height: number,
): void {
  if (hospital.epoch !== lastEpoch) {
    lastWaitingPos.clear();
    tweens.clear();
    lastEpoch = hospital.epoch;
  }

  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, width, height);

  const waitW = width * 0.45 - 24;
  ctx.strokeStyle = "#2d3a4f";
  ctx.strokeRect(16, 16, waitW, height - 120);
  ctx.fillStyle = "#9aa8bc";
  ctx.font = "14px system-ui";
  ctx.fillText("WAITING", 28, 36);

  const waiting = waitingPatients(hospital).sort((a, b) => {
    if (a.esi !== b.esi) return a.esi - b.esi;
    return a.seq - b.seq;
  });
  const cols = 5;
  const gap = 12;
  const originX = 40;
  const originY = 56;
  waiting.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = originX + col * (RADIUS * 2 + gap + 28);
    const y = originY + row * (RADIUS * 2 + gap + 18);
    lastWaitingPos.set(p.id, { x, y });
    paintPatient(ctx, p.id, p.esi, x, y);
  });

  const left = width * 0.45;
  const strip = 96;
  const roomH = (height - strip - 32) / 3;
  for (const [index, room] of hospital.rooms.entries()) {
    const x = left;
    const y = 16 + roomH * index;
    const w = width - left - 16;
    ctx.strokeStyle = "#2d3a4f";
    ctx.setLineDash(
      hospital.inFlight?.roomId === room.id ? [6, 4] : [],
    );
    ctx.strokeRect(x, y, w, roomH - 8);
    ctx.setLineDash([]);
    ctx.fillStyle = "#e8eef7";
    ctx.fillText(`Room ${index + 1}`, x + 12, y + 24);
    const doc = DOCTORS[index];
    ctx.fillStyle = "#111827";
    ctx.beginPath();
    ctx.arc(x + 28, y + 52, RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8eef7";
    ctx.fillText("D", x + 23, y + 56);
    void doc;

    if (!room.occupant) continue;
    const patient = hospital.patients.get(room.occupant);
    if (!patient || patient.status !== "in_room") continue;
    const to = roomCenter(room.id, width, height);
    let from = lastWaitingPos.get(patient.id) ?? to;
    let tween = tweens.get(patient.id);
    if (!tween) {
      tween = { from, to, start: performance.now() };
      tweens.set(patient.id, tween);
    }
    const t = Math.min(1, (performance.now() - tween.start) / TWEEN_MS);
    const px = tween.from.x + (tween.to.x - tween.from.x) * t;
    const py = tween.from.y + (tween.to.y - tween.from.y) * t;
    paintPatient(ctx, patient.id, patient.esi, px, py);
    const seconds = Math.max(
      0,
      Math.ceil((patient.consultEndsAt - hospital.tick) * 0.1),
    );
    ctx.fillStyle = "#9aa8bc";
    ctx.fillText(`${seconds}s`, to.x - 8, to.y + RADIUS + 18);
  }

  ctx.fillStyle = "#9aa8bc";
  const pick = hospital.lastPick;
  const pickY = height - 72;
  if (!pick) {
    ctx.fillText("Last pick: none", 28, pickY);
    return;
  }
  const seated = hospital.patients.get(pick.patientId);
  const esi = seated?.esi ?? "?";
  ctx.fillText(
    `Last pick: ${pick.patientId}  ESI-${esi}  ${pick.source}  ${pick.confidence.toFixed(2)}`,
    28,
    pickY,
  );
  const parts = Object.entries(pick.probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `${id} ${n.toFixed(2)}`);
  ctx.fillText(parts.join("   "), 28, pickY + 22);
}

function paintPatient(
  ctx: CanvasRenderingContext2D,
  id: PatientId,
  esi: 1 | 2 | 3 | 4 | 5,
  x: number,
  y: number,
): void {
  ctx.fillStyle = ESI_FILL[esi];
  ctx.beginPath();
  ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px system-ui";
  ctx.fillText(String(esi), x - 4, y + 4);
  ctx.fillStyle = "#9aa8bc";
  ctx.fillText(id, x - 12, y + RADIUS + 14);
}
```

In `client.ts`, call `requestAnimationFrame` to keep tweens moving:

```ts
function loop() {
  render();
  requestAnimationFrame(loop);
}
loop();
```

Keep the 100ms `setInterval` for sim ticks. Do not tick the hospital inside rAF.

- [ ] **Step 2: `styles.css`**

Match `xo-jev` dark page. Center a wide app (`min(100%, 1120px)`). Style the three buttons like `.btn` in `../xo-jev/styles.css`. Canvas `background: #0f1419`.

- [ ] **Step 3: Verify on the real page**

Run: `bun test`
Expected: PASS

Run: `bun run dev`
Open `http://localhost:3000`.

You must see:

1. 20 colored circles on the left. One red `1` labeled `P01`.
2. Three room boxes on the right with a dark doctor circle.
3. `P01` tweens into Room 1 first (Jev or ESI).
4. Rooms 2 and 3 fill next from the remaining sickest.
5. **ESI-1 walks in** adds a second red circle `P21` that outranks greens on the next free doctor.
6. **Pause** freezes consult countdowns. **Reset** restores 20 waiting.

- [ ] **Step 4: Commit**

```bash
git add src/draw.ts styles.css client.ts index.html
git commit -m "$(cat <<'EOF'
feat: draw waiting pool, three rooms, and last-pick strip

EOF
)"
```

---

### Task 11: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the running app from Task 10
- Produces: setup instructions a teammate can follow

- [ ] **Step 1: Write `README.md`**

```md
# Jev triage hospital

2D talk demo. Twenty patients wait. Three doctors. Three rooms. Jev (TypeSafe Choice) picks who goes next. Sickest ESI first. Equal ESI uses arrival time.

This is a teaching sim. Not a clinical product. No real patient data.

## Setup

Needs [Bun](https://bun.sh) and a TypeSafe API key from [console.typesafe.ai](https://console.typesafe.ai).

```bash
cp .env.sample .env
```

Put your key in `.env`:

```
TYPESAFE_API_KEY=your_key_here
```

```bash
bun install
bun test
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). If the key is missing, rooms still fill using the ESI rule.

## What you should see

The red ESI-1 circle (`P01`) enters Room 1 first. **ESI-1 walks in** adds `P21`. **Pause** and **Reset** are under the canvas.

## How it works

1. `client.ts` ticks every 100ms and keeps one in-flight `POST /api/next`.
2. `src/jev-triage.ts` asks TypeSafe Choice among waiting patient ids.
3. `src/hospital.ts` seats, discharges, and ESI-falls back. Canvas never calls the SDK.
```

Nested fences in that README will break markdown. Write the README with the outer plan fence closed first, then a normal file. In the real `README.md`, use normal triple-backtick bash blocks. Do not nest them.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: setup and expected demo loop

EOF
)"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Domain types, bag, ids | 1 |
| consultDuration table | 2 |
| esiNext | 2 |
| seat | 3 |
| advance | 4 |
| dispatcher, applyReply, stale epoch | 5, 9 |
| inject P21, living 21, reset | 6 |
| waitingSnapshot waitTicks | 7 |
| POST /api/next, Choice prompt, 400/422/500 | 8 |
| 3s timeout, ESI fallback never random | 9 |
| canvas, colors, tween, buttons, pick strip | 10 |
| tests 1-10 | 1-6 |
| README | 11 |
| out of scope | Global Constraints |

## Type names to keep stable

`PatientId`, `RoomId`, `DoctorId`, `Tick`, `Esi`, `Patient`, `WaitingPatient`, `InRoomPatient`, `DonePatient`, `Room`, `JevPick`, `Hospital`, `NextReply`, `WaitingWire`, `WaitingInput`, `createHospital`, `cloneHospital`, `waitingPatients`, `esiCounts`, `consultDuration`, `esiNext`, `seat`, `advance`, `firstEmptyRoom`, `beginPick`, `applyReply`, `livingCount`, `injectCrash`, `resetHospital`, `waitingSnapshot`, `pickNextPatient`, `parseWaiting`, `draw`.
