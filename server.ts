import index from "./index.html";
import { parseWaiting, pickNextPatient } from "./src/jev-triage";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/api/next": {
      async POST(req) {
        if (!process.env.TYPESAFE_API_KEY?.trim()) {
          return Response.json(
            { error: "Set TYPESAFE_API_KEY in .env" },
            { status: 500 },
          );
        }
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const waiting = parseWaiting(body);
        if (!waiting) {
          return Response.json(
            { error: "waiting must be a non-empty array of patient rows" },
            { status: 400 },
          );
        }
        try {
          const result = await pickNextPatient(waiting);
          return Response.json(result);
        } catch (error) {
          const status =
            error instanceof Error && "status" in error && error.status === 422
              ? 422
              : 500;
          return Response.json(
            {
              error: error instanceof Error ? error.message : "Jev pick failed",
            },
            { status },
          );
        }
      },
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`Jev triage → http://localhost:${server.port}`);
