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
