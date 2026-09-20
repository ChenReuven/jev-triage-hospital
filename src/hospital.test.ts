import { describe, expect, test } from "bun:test";
import {
  asPatientId,
  asTick,
  consultDuration,
  createHospital,
  esiCounts,
  esiNext,
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
