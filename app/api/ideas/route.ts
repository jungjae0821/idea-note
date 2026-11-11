import { parseListQuery, validateRecord } from "../../../lib/ideas-api";
import {
  createIdea,
  errorResponse,
  guard,
  json,
  listIdeas,
  readJson,
} from "../../../lib/ideas-server";

// GET /api/ideas?saved=true&limit=20&cursor=... : 내 아이디어 목록 (최신순)
export async function GET(request: Request) {
  try {
    const owner = guard(request);
    const query = parseListQuery(new URL(request.url).searchParams);
    return json(await listIdeas(owner, query));
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/ideas : 생성된 아이디어 기록을 저장
export async function POST(request: Request) {
  try {
    const owner = guard(request);
    const record = validateRecord(await readJson(request));
    return json({ idea: await createIdea(owner, record) }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}
