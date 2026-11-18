import { parseIdeaId, validatePatch } from "../../../../lib/ideas-api";
import {
  deleteIdea,
  errorResponse,
  getIdea,
  guard,
  json,
  readJson,
  updateIdea,
} from "../../../../lib/ideas-server";

type Context = { params: Promise<{ id: string }> };

// GET /api/ideas/:id : 상세
export async function GET(request: Request, { params }: Context) {
  try {
    const owner = guard(request);
    const id = parseIdeaId((await params).id);
    return json({ idea: await getIdea(owner, id) });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/ideas/:id : title, body 수정 / saved(true|false)로 저장 표시 전환
export async function PATCH(request: Request, { params }: Context) {
  try {
    const owner = guard(request);
    const id = parseIdeaId((await params).id);
    const patch = validatePatch(await readJson(request));
    return json({ idea: await updateIdea(owner, id, patch) });
  } catch (e) {
    return errorResponse(e);
  }
}

// DELETE /api/ideas/:id
export async function DELETE(request: Request, { params }: Context) {
  try {
    const owner = guard(request);
    const id = parseIdeaId((await params).id);
    await deleteIdea(owner, id);
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
