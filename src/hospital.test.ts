import { describe, expect, test } from "bun:test";
import {
  advance,
  applyReply,
  asPatientId,
  asTick,
  beginPick,
  consultDuration,
  createHospital,
  esiCounts,
  esiNext,
  firstEmptyRoom,
  seat,
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

  test("unknown jev id seats esiNext and clears inFlight", () => {
    const next = applyReply(beginPick(createHospital()), {
      ok: true,
      patientId: asPatientId("P99"),
      confidence: 0.5,
      probabilities: { P99: 0.5 },
    });
    expect(next.rooms[0]?.occupant).toBe("P01");
    expect(next.inFlight).toBe(null);
    expect(next.lastPick?.source).toBe("esi");
    expect(next.lastPick?.patientId).toBe("P01");
  });
});
