#!/usr/bin/env bun
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SKILL_DIR = import.meta.dir;
const REPO_ROOT = join(SKILL_DIR, "..", "..", "..");
const RUN_DIR = join(SKILL_DIR, ".run");
const PID_FILE = join(RUN_DIR, "server.pid");
const PORT_FILE = join(RUN_DIR, "port");
const LOG_FILE = join(RUN_DIR, "server.log");

async function readPort(): Promise<number> {
  const raw = await readFile(PORT_FILE, "utf8").catch(() => "");
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : Number(process.env.VERIFY_PORT ?? 3010);
}

async function pidAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPid(): Promise<number | null> {
  const raw = await readFile(PID_FILE, "utf8").catch(() => "");
  const pid = Number(raw.trim());
  if (!Number.isFinite(pid) || pid <= 0) return null;
  if (!(await pidAlive(pid))) return null;
  return pid;
}

async function waitForHttp(port: number, ms = 15000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await Bun.sleep(200);
  }
  throw new Error(`Server did not answer on port ${port} within ${ms}ms`);
}

async function cmdLaunch(): Promise<void> {
  const existing = await readPid();
  if (existing) {
    throw new Error(
      `Verification server already running (pid ${existing}). Run: bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts stop`,
    );
  }
  const port = await readPort();
  await mkdir(RUN_DIR, { recursive: true });
  await writeFile(PORT_FILE, String(port));

  const log = Bun.file(LOG_FILE);
  const proc = Bun.spawn({
    cmd: ["bun", "--hot", "server.ts"],
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdout: log,
    stderr: log,
    stdin: "ignore",
  });

  await writeFile(PID_FILE, String(proc.pid));
  await waitForHttp(port);
  console.log(`verify-jev-triage: ready http://127.0.0.1:${port}/ (pid ${proc.pid})`);
}

async function cmdDoctor(): Promise<void> {
  const pid = await readPid();
  if (!pid) {
    console.error("verify-jev-triage doctor: FAIL — no live verification server (missing or stale pid)");
    process.exit(1);
  }
  const port = await readPort();
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const html = await res.text();
  const ok =
    res.ok &&
    html.includes('id="board"') &&
    html.includes('id="pause"') &&
    html.includes("Jev triage");
  if (!ok) {
    console.error(`verify-jev-triage doctor: FAIL — unexpected home page on :${port}`);
    process.exit(1);
  }
  console.log(`verify-jev-triage doctor: OK pid=${pid} port=${port} url=http://127.0.0.1:${port}/`);
}

async function cmdStop(): Promise<void> {
  const pid = await readPid();
  if (!pid) {
    await rm(RUN_DIR, { recursive: true, force: true });
    console.log("verify-jev-triage: no server to stop");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  await Bun.sleep(300);
  await rm(RUN_DIR, { recursive: true, force: true });
  console.log(`verify-jev-triage: stopped pid ${pid}`);
}

async function cmdApiSmoke(): Promise<void> {
  const port = await readPort();
  const pid = await readPid();
  if (!pid) {
    console.error("verify-jev-triage api-smoke: launch the verification server first");
    process.exit(1);
  }
  const body = [
    { id: "P01", esi: 1, arrivedAt: 0, seq: 0, waitTicks: 0 },
    { id: "P02", esi: 2, arrivedAt: 1, seq: 1, waitTicks: 5 },
  ];
  const res = await fetch(`http://127.0.0.1:${port}/api/next`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    if (res.status !== 500) {
      console.error(`verify-jev-triage api-smoke: expected 500 without key, got ${res.status}`);
      process.exit(1);
    }
    console.log("verify-jev-triage api-smoke: OK (no key → 500, UI still ESI-fallbacks)");
    return;
  }
  if (!res.ok) {
    console.error(`verify-jev-triage api-smoke: FAIL ${res.status} ${text}`);
    process.exit(1);
  }
  const json = JSON.parse(text) as { patientId?: string };
  if (json.patientId !== "P01" && json.patientId !== "P02") {
    console.error(`verify-jev-triage api-smoke: unexpected patientId ${json.patientId}`);
    process.exit(1);
  }
  console.log(`verify-jev-triage api-smoke: OK patientId=${json.patientId}`);
}

const cmd = process.argv[2];
switch (cmd) {
  case "launch":
    await cmdLaunch();
    break;
  case "doctor":
    await cmdDoctor();
    break;
  case "stop":
    await cmdStop();
    break;
  case "api-smoke":
    await cmdApiSmoke();
    break;
  default:
    console.error(
      "Usage: bun .cursor/skills/verify-jev-triage/verify-jev-triage.ts <launch|doctor|stop|api-smoke>",
    );
    process.exit(1);
}
