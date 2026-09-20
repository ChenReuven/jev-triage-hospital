import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

export type WaitingInput = {
  id: string;
  esi: number;
  arrivedAt: number;
  seq: number;
  waitTicks: number;
};

let client: TypeSafeClient | undefined;

function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient();
  return client;
}

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

  const response = await getClient().systemOne({
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
