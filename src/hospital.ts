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

  if (reply.ok) {
    const candidate = next.patients.get(reply.patientId);
    if (candidate?.status === "waiting") {
      const pick: JevPick = {
        patientId: reply.patientId,
        source: "jev",
        confidence: reply.confidence,
        probabilities: reply.probabilities,
      };
      const seated = seat(next, reply.patientId, roomId, next.tick);
      seated.lastPick = pick;
      return seated;
    }
  }

  const patientId = esiNext(next);
  if (!patientId) return next;
  const pick: JevPick = {
    patientId,
    source: "esi",
    confidence: 1,
    probabilities: { [patientId]: 1 },
  };
  const seated = seat(next, patientId, roomId, next.tick);
  seated.lastPick = pick;
  return seated;
}
