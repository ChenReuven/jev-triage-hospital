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
