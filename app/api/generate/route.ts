import { generateIdea, IdeaError } from "../../../lib/idea";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "FORBIDDEN", message: "이 앱에서 요청해주세요." },
      { status: 403, headers },
    );
  if (Number(request.headers.get("content-length") || 0) > 12000)
    return Response.json(
      { error: "INVALID_INPUT", message: "입력이 너무 길어요." },
      { status: 413, headers },
    );
  try {
    const text = await request.text();
    if (text.length > 12000)
      throw new IdeaError("INVALID_INPUT", "입력이 너무 길어요.", 413);
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      throw new IdeaError("INVALID_INPUT", "입력 형식을 확인해주세요.");
    }
    const key = request.headers.get("x-gemini-key") || "";
    if (key.length > 256)
      throw new IdeaError("INVALID_KEY", "API 키 형식을 확인해주세요.");
    const record = await generateIdea(input, key);
    return Response.json({ record }, { headers });
  } catch (e) {
    const error =
      e instanceof IdeaError
        ? e
        : new IdeaError(
            "GENERATION_FAILED",
            "생성하지 못했어요. 다시 시도해주세요.",
            500,
          );
    return Response.json(
      { error: error.code, message: error.message },
      { status: error.status, headers },
    );
  }
}
