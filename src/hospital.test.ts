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
