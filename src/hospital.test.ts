import { describe, expect, test } from "bun:test";
import {
  asPatientId,
  consultDuration,
  createHospital,
  esiCounts,
  esiNext,
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
