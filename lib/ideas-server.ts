import { and, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { ideas } from "../db/schema";
import { IdeaError, type IdeaRecord } from "./idea";
import {
  CLIENT_HEADER,
  encodeCursor,
  parseClientId,
  type IdeaPatch,
  type ListQuery,
  type StoredIdea,
} from "./ideas-api";

const HEADERS = { "Cache-Control": "no-store" };
const MAX_BYTES = 20000;

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: HEADERS });

export function errorResponse(e: unknown) {
  if (!(e instanceof IdeaError)) console.error("ideas api error", e);
  const error =
    e instanceof IdeaError
      ? e
      : new IdeaError("SERVER_ERROR", "처리하지 못했어요. 다시 시도해주세요.", 500);
  return json({ error: error.code, message: error.message }, error.status);
}

// 다른 사이트에서 이 API를 대신 호출하지 못하게 막고 브라우저 ID를 꺼낸다.
export function guard(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new IdeaError("FORBIDDEN", "이 앱에서 요청해주세요.", 403);
  return parseClientId(request.headers.get(CLIENT_HEADER));
}

export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES)
    throw new IdeaError("INVALID_INPUT", "입력이 너무 길어요.", 413);
  const body = await request.text();
  if (body.length > MAX_BYTES)
    throw new IdeaError("INVALID_INPUT", "입력이 너무 길어요.", 413);
  try {
    return JSON.parse(body);
  } catch {
    throw new IdeaError("INVALID_INPUT", "입력 형식을 확인해주세요.");
  }
}

// 배포 플랫폼은 drizzle/ 마이그레이션을 적용하지만, 로컬 개발과 Docker(wrangler dev --local)는
// 적용하지 않는다. 같은 정의를 IF NOT EXISTS로 한 번 실행해 두 환경을 맞춘다.
let ready: Promise<void> | null = null;
function ensureSchema(db: ReturnType<typeof getDb>) {
  ready ??= (async () => {
    await db.run(sql`CREATE TABLE IF NOT EXISTS ideas (
      id text PRIMARY KEY NOT NULL,
      owner_id text NOT NULL,
      topic text NOT NULL,
      constraints text DEFAULT '' NOT NULL,
      category_id text NOT NULL,
      title text NOT NULL,
      body text NOT NULL,
      model_id text NOT NULL,
      created_at text NOT NULL,
      saved_at text,
      updated_at text NOT NULL
    )`);
    await db.run(
      sql`CREATE INDEX IF NOT EXISTS ideas_owner_created_idx ON ideas (owner_id, created_at, id)`,
    );
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

async function database() {
  const db = getDb();
  await ensureSchema(db);
  return db;
}

type Row = typeof ideas.$inferSelect;
const toIdea = (row: Row): StoredIdea => {
  const { ownerId, ...idea } = row;
  void ownerId;
  return idea;
};
const notFound = () =>
  new IdeaError("NOT_FOUND", "아이디어를 찾을 수 없어요.", 404);
const mine = (owner: string, id: string) =>
  and(eq(ideas.ownerId, owner), eq(ideas.id, id));

export async function listIdeas(owner: string, q: ListQuery) {
  const db = await database();
  const rows = await db
    .select()
    .from(ideas)
    .where(
      and(
        eq(ideas.ownerId, owner),
        q.saved === null
          ? undefined
          : q.saved
            ? isNotNull(ideas.savedAt)
            : isNull(ideas.savedAt),
        q.cursor
          ? or(
              lt(ideas.createdAt, q.cursor.createdAt),
              and(
                eq(ideas.createdAt, q.cursor.createdAt),
                lt(ideas.id, q.cursor.id),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(ideas.createdAt), desc(ideas.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit).map(toIdea);
  return {
    ideas: page,
    nextCursor: rows.length > q.limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function getIdea(owner: string, id: string) {
  const db = await database();
  const [row] = await db.select().from(ideas).where(mine(owner, id)).limit(1);
  if (!row) throw notFound();
  return toIdea(row);
}

export async function createIdea(owner: string, record: IdeaRecord) {
  const db = await database();
  const rows = await db
    .insert(ideas)
    .values({ ...record, ownerId: owner, updatedAt: new Date().toISOString() })
    .onConflictDoNothing()
    .returning();
  if (!rows.length)
    throw new IdeaError("CONFLICT", "같은 id의 아이디어가 이미 있어요.", 409);
  return toIdea(rows[0]);
}

export async function updateIdea(owner: string, id: string, patch: IdeaPatch) {
  const db = await database();
  const now = new Date().toISOString();
  const { saved, ...fields } = patch;
  const rows = await db
    .update(ideas)
    .set({
      ...fields,
      ...(saved === undefined
        ? {}
        : { savedAt: saved ? sql`coalesce(${ideas.savedAt}, ${now})` : null }),
      updatedAt: now,
    })
    .where(mine(owner, id))
    .returning();
  if (!rows.length) throw notFound();
  return toIdea(rows[0]);
}

export async function deleteIdea(owner: string, id: string) {
  const db = await database();
  const rows = await db
    .delete(ideas)
    .where(mine(owner, id))
    .returning({ id: ideas.id });
  if (!rows.length) throw notFound();
}
