import { sql } from "drizzle-orm";
import { getDb } from "../../../db";

const HEADERS = { "Cache-Control": "no-store" };

// GET /common/health : 배포 워크플로(dev-registry.yaml)가 앱 교체 뒤 상태를 확인하는 경로.
// D1에 실제로 쿼리가 나가야 database를 "up"으로 본다.
export async function GET() {
  try {
    await getDb().run(sql`SELECT 1`);
    return Response.json({ status: "ok", database: "up" }, { headers: HEADERS });
  } catch (e) {
    console.error("health check failed", e);
    return Response.json(
      { status: "down", database: "down" },
      { status: 503, headers: HEADERS },
    );
  }
}
