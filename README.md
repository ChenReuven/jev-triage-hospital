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
