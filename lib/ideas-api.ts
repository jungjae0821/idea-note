import { IdeaError, validateInput, type IdeaRecord } from "./idea.ts";

export type StoredIdea = IdeaRecord & { updatedAt: string };
export type IdeaPatch = { title?: string; body?: string; saved?: boolean };
export type ListQuery = {
  saved: boolean | null;
  limit: number;
  cursor: { createdAt: string; id: string } | null;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;
const MAX_BODY = 10000;

export const CLIENT_HEADER = "x-client-id";

const isIso = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T/.test(v) &&
  !isNaN(Date.parse(v));

export function parseClientId(value: string | null): string {
  if (!value || !UUID.test(value))
    throw new IdeaError(
      "INVALID_CLIENT",
      `${CLIENT_HEADER} 헤더에 브라우저 ID(UUID)를 넣어주세요.`,
      401,
    );
  return value.toLowerCase();
}

export function parseIdeaId(value: string): string {
  if (!UUID.test(value))
    throw new IdeaError("NOT_FOUND", "아이디어를 찾을 수 없어요.", 404);
  return value.toLowerCase();
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new IdeaError(
      "INVALID_INPUT",
      `${field}은(는) 1~${max.toLocaleString("ko-KR")}자로 입력해주세요.`,
    );
  return value.trim();
}

// 생성 API(/api/generate)가 돌려준 기록, 또는 기존 IndexedDB 기록을 그대로 받는다.
export function validateRecord(raw: unknown): IdeaRecord {
  const x = raw as Partial<IdeaRecord> | null;
  if (!x || typeof x !== "object")
    throw new IdeaError("INVALID_INPUT", "입력 형식을 확인해주세요.");
  const input = validateInput(x);
  if (typeof x.id !== "string" || !UUID.test(x.id))
    throw new IdeaError("INVALID_INPUT", "id는 UUID여야 해요.");
  if (typeof x.modelId !== "string" || !x.modelId || x.modelId.length > 100)
    throw new IdeaError("INVALID_INPUT", "modelId를 확인해주세요.");
  if (!isIso(x.createdAt))
    throw new IdeaError("INVALID_INPUT", "createdAt은 ISO 시각이어야 해요.");
  if (x.savedAt != null && !isIso(x.savedAt))
    throw new IdeaError("INVALID_INPUT", "savedAt은 ISO 시각이거나 null이어야 해요.");
  return {
    ...input,
    id: x.id.toLowerCase(),
    title: text(x.title, "제목", MAX_TITLE),
    body: text(x.body, "본문", MAX_BODY),
    modelId: x.modelId,
    createdAt: new Date(x.createdAt).toISOString(),
    savedAt: x.savedAt ? new Date(x.savedAt).toISOString() : null,
  };
}

export function validatePatch(raw: unknown): IdeaPatch {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new IdeaError("INVALID_INPUT", "입력 형식을 확인해주세요.");
  const x = raw as Record<string, unknown>;
  const unknownKeys = Object.keys(x).filter(
    (k) => !["title", "body", "saved"].includes(k),
  );
  if (unknownKeys.length)
    throw new IdeaError(
      "INVALID_INPUT",
      `수정할 수 없는 항목이에요: ${unknownKeys.join(", ")}`,
    );
  const patch: IdeaPatch = {};
  if ("title" in x) patch.title = text(x.title, "제목", MAX_TITLE);
  if ("body" in x) patch.body = text(x.body, "본문", MAX_BODY);
  if ("saved" in x) {
    if (typeof x.saved !== "boolean")
      throw new IdeaError("INVALID_INPUT", "saved는 true 또는 false여야 해요.");
    patch.saved = x.saved;
  }
  if (!Object.keys(patch).length)
    throw new IdeaError("INVALID_INPUT", "수정할 항목(title, body, saved)을 넣어주세요.");
  return patch;
}

export function encodeCursor(record: { createdAt: string; id: string }) {
  return `${record.createdAt}_${record.id}`;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const savedRaw = params.get("saved");
  if (savedRaw !== null && savedRaw !== "true" && savedRaw !== "false")
    throw new IdeaError("INVALID_INPUT", "saved는 true 또는 false여야 해요.");
  const limitRaw = params.get("limit");
  const limit = limitRaw === null ? 20 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new IdeaError("INVALID_INPUT", "limit은 1~100 사이 정수여야 해요.");
  const cursorRaw = params.get("cursor");
  let cursor: ListQuery["cursor"] = null;
  if (cursorRaw !== null) {
    const at = cursorRaw.lastIndexOf("_");
    const createdAt = cursorRaw.slice(0, at);
    const id = cursorRaw.slice(at + 1);
    if (at < 0 || !isIso(createdAt) || !UUID.test(id))
      throw new IdeaError("INVALID_INPUT", "cursor 형식을 확인해주세요.");
    cursor = { createdAt, id: id.toLowerCase() };
  }
  return {
    saved: savedRaw === null ? null : savedRaw === "true",
    limit,
    cursor,
  };
}
