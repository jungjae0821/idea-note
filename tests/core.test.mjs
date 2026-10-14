import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { generateIdea, validateInput, MODEL } from "../lib/idea.ts";
import { listHistory, putRecord } from "../lib/storage.ts";

const input = {
  topic: "대학생 자투리 시간",
  constraints: "2명, 4주",
  categoryId: "project",
};
const good =
  (
    title = "틈새 캠퍼스",
    body = "짧은 시간에 할 수 있는 프로젝트를 제안합니다.",
  ) =>
  async (_url, init) => {
    assert.equal(new Headers(init.headers).get("x-goog-api-key"), "test-key");
    const request = JSON.parse(init.body);
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.ok(request.contents[0].parts[0].text.includes(input.constraints));
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify({ title, body }) }] },
        },
      ],
    });
  };
test("주제·조건 입력 검증 및 공백 정리", () => {
  assert.equal(validateInput({ ...input, topic: " 주제 " }).topic, "주제");
  for (const value of [
    null,
    {},
    { ...input, topic: "  " },
    { ...input, topic: "a".repeat(201) },
    { ...input, constraints: 4 },
    { ...input, categoryId: "other" },
  ])
    assert.throws(() => validateInput(value), { code: "INVALID_INPUT" });
});
test("키가 없으면 외부 호출을 하지 않는다", async () => {
  await assert.rejects(
    generateIdea(input, "", () => {
      throw Error("must not call");
    }),
    { code: "MODEL_NOT_READY" },
  );
});
test("성공 결과는 입력·모델·시각을 포함하고 재생성은 새 ID를 만든다", async () => {
  const a = await generateIdea(input, "test-key", good()),
    b = await generateIdea(input, "test-key", good());
  assert.notEqual(a.id, b.id);
  assert.equal(a.constraints, input.constraints);
  assert.equal(a.modelId, MODEL);
  assert.equal(a.savedAt, null);
  assert.ok(!isNaN(Date.parse(a.createdAt)));
});
test("제목이 비어 있으면 주제를 사용한다", async () => {
  assert.equal(
    (await generateIdea(input, "test-key", good(""))).title,
    input.topic,
  );
});
test("빈 본문·잘린 출력·안전 차단은 성공으로 처리하지 않는다", async () => {
  await assert.rejects(generateIdea(input, "test-key", good("title", "")), {
    code: "EMPTY_RESULT",
  });
  for (const data of [
    { candidates: [] },
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        { finishReason: "MAX_TOKENS", content: { parts: [{ text: "{}" }] } },
      ],
    },
  ])
    await assert.rejects(
      generateIdea(input, "test-key", async () => Response.json(data)),
      { code: "EMPTY_RESULT" },
    );
});
test("무료 한도·키 오류·서비스 오류를 구분한다", async () => {
  for (const [status, code] of [
    [429, "RATE_LIMITED"],
    [400, "INVALID_KEY"],
    [403, "INVALID_KEY"],
    [503, "GENERATION_FAILED"],
  ])
    await assert.rejects(
      generateIdea(input, "test-key", async () => new Response("", { status })),
      { code },
    );
});
test("네트워크 실패는 재시도 가능한 연결 오류다", async () => {
  await assert.rejects(
    generateIdea(input, "test-key", async () => {
      throw new TypeError("network");
    }),
    { code: "MODEL_UNAVAILABLE" },
  );
});
test("저장하지 않은 성공 결과도 기록으로 조회하고 중복 저장하지 않는다", async () => {
  const record = await generateIdea(input, "test-key", good());
  await putRecord(record);
  let all = await listHistory();
  assert.ok(all.some((r) => r.id === record.id && r.savedAt === null));
  const saved = await putRecord(record, true),
    savedAgain = await putRecord(record, true);
  assert.equal(saved.savedAt, savedAgain.savedAt);
  all = await listHistory();
  assert.equal(all.filter((r) => r.id === record.id).length, 1);
  // A different browser tab writing the earlier unsaved object cannot clear savedAt.
  const rewritten = await putRecord(record);
  assert.equal(rewritten.savedAt, saved.savedAt);
});
test("8건 기록과 6건 저장을 다시 열어 조회한다 (모델 응답은 대역)", async () => {
  const batch = [];
  for (let i = 0; i < 8; i++) {
    const r = await generateIdea(input, "test-key", good(`아이디어 ${i}`));
    await putRecord(r, i < 6);
    batch.push(r.id);
  }
  const reopened = (await listHistory()).filter((r) => batch.includes(r.id));
  assert.equal(reopened.length, 8);
  assert.equal(reopened.filter((r) => r.savedAt).length, 6);
  assert.ok(
    reopened.every((r) => r.body && r.constraints === input.constraints),
  );
});
test("저장소 사용 불가 시 결과 원본은 유지된다", async () => {
  const record = await generateIdea(input, "test-key", good());
  const original = structuredClone(record);
  const factory = globalThis.indexedDB;
  globalThis.indexedDB = {
    open() {
      throw Error("storage unavailable");
    },
  };
  try {
    await assert.rejects(putRecord(record, true));
    assert.deepEqual(record, original);
  } finally {
    globalThis.indexedDB = factory;
  }
});
