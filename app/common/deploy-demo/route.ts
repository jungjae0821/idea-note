import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

// Change this version in dev, then promote the verified version to main.
export async function GET() {
  return Response.json(
    { version: "team-v1", pod: env.DEPLOY_POD || "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
