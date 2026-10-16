"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, WifiOff, X } from "lucide-react";
import { CATEGORY, MODEL, type IdeaInput, type IdeaRecord } from "../lib/idea";
import { listHistory, putRecord } from "../lib/storage";
type View =
  "home" | "input" | "result" | "saved" | "history" | "detail" | "settings";
type Theme = "system" | "light" | "dark";
const initial: IdeaInput = { categoryId: CATEGORY, topic: "", constraints: "" };
const fmt = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const day = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric" }).format(
    new Date(date),
  );
const time = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(date),
  );
const samples = [
  "대학생의 자투리 시간을 활용하는 앱",
  "동네에서 시작하는 친환경 프로젝트",
  "혼자 사는 사람을 위한 작은 서비스",
];
// Section labels the generation prompt asks for (lib/idea.ts); shown as headings when a line is only the label.
const SECTION =
  /^(요약|대상과 문제|핵심 기능(\s*3개)?|첫 실행 단계|확인할 가정)\s*[:：]?$/;
function sections(body: string) {
  const parts: { heading: string; text: string }[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (SECTION.test(line))
      parts.push({ heading: line.replace(/\s*[:：]$/, ""), text: "" });
    else {
      if (!parts.length) parts.push({ heading: "", text: "" });
      parts[parts.length - 1].text += raw + "\n";
    }
  }
  return parts
    .map((p) => ({ ...p, text: p.text.trim() }))
    .filter((p) => p.heading || p.text);
}
const excerpt = (body: string) =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !SECTION.test(line))
    .join(" ")
    .slice(0, 140);
const KAKAO = /^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/;
export default function App() {
  const [view, setView] = useState<View>("home");
  const [records, setRecords] = useState<IdeaRecord[]>([]);
  const [input, setInput] = useState(initial);
  const [result, setResult] = useState<IdeaRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [online, setOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [historyPersisted, setHistoryPersisted] = useState(true);
  const [detailFrom, setDetailFrom] = useState<View>("history");
  const [firebaseConfig, setFirebaseConfig] = useState("");
  const [contact, setContact] = useState("");
  const [contactDraft, setContactDraft] = useState("");
  const [theme, setTheme] = useState<Theme>("system");
  const [account, setAccount] = useState<{
    displayName?: string;
    email?: string;
  } | null>(null);
  const authRef = useRef<any>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const main = useRef<HTMLElement>(null);
  async function refresh() {
    try {
      setRecords(await listHistory());
      setStorageError("");
    } catch (e) {
      setStorageError((e as Error).message);
    }
  }
  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);
    try {
      setFirebaseConfig(localStorage.getItem("idea-note-firebase") || "");
      const link = localStorage.getItem("idea-note-contact") || "";
      setContact(link);
      setContactDraft(link);
      const saved = localStorage.getItem("idea-note-theme");
      if (saved === "light" || saved === "dark") setTheme(saved);
    } catch {}
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const sync = () => refresh();
    window.addEventListener("focus", sync);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => navigator.serviceWorker.ready)
        .then(async () => {
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => e.name)
            .filter((url) => {
              const u = new URL(url);
              return (
                u.origin === location.origin &&
                !u.pathname.startsWith("/api/") &&
                /\.(js|css|woff2?|svg)(\?|$)/.test(u.pathname)
              );
            });
          const shellUrls = [...new Set(["/", "/favicon.svg", ...urls].map(url => new URL(url, location.origin).href))];
          const cache = await caches.open("idea-note-shell-v1");
          // Existing cached files remain usable when the device or server is offline.
          await Promise.allSettled(shellUrls.map(async url => {
            const response = await fetch(url, { cache: "reload" });
            if (!response.ok) throw new Error("Shell resource unavailable");
            await cache.put(url, response);
          }));
          const cached = await Promise.all(shellUrls.map(url => cache.match(url)));
          setOfflineReady(urls.some(url => new URL(url).pathname.endsWith(".js")) && cached.every(Boolean));
        })
        .catch((error) => { console.warn("Offline shell registration failed", error); });
    }
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", sync);
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => {
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [view]);
  useEffect(() => {
    if (!busy) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  function go(next: View) {
    if (lock.current) return;
    setView(next);
    setError("");
    setNotice("");
  }
  function create(topic?: string) {
    if (topic !== undefined) setInput({ ...initial, topic });
    if (!key) {
      go("settings");
      setNotice("먼저 Gemini API 키를 연결해주세요.");
      return;
    }
    go("input");
  }
  async function generate() {
    if (lock.current) return;
    if (!input.topic.trim()) {
      setError("주제를 입력해주세요.");
      return;
    }
    if (!online) {
      setError(
        "새 아이디어 생성에는 인터넷 연결이 필요해요. 저장한 아이디어는 계속 볼 수 있어요.",
      );
      return;
    }
    if (!key) {
      go("settings");
      setNotice("Gemini API 키를 연결해주세요.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    setView("result");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-key": key },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(65000),
      });
      const data = (await response.json()) as {
        message?: string;
        record: IdeaRecord;
      };
      if (!response.ok)
        throw new Error(
          data.message || "생성하지 못했어요. 다시 시도해주세요.",
        );
      setResult(data.record);
      try {
        await putRecord(data.record);
        setHistoryPersisted(true);
        await refresh();
      } catch (e) {
        setHistoryPersisted(false);
        setStorageError((e as Error).message);
      }
    } catch (e) {
      setError(
        e instanceof Error && e.name === "TimeoutError"
          ? "응답 시간이 초과됐어요. 다시 시도해주세요."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  async function save(markSaved = true) {
    if (!result || saving) return;
    setSaving(true);
    setNotice("");
    try {
      const updated = await putRecord(result, markSaved);
      setResult(updated);
      setHistoryPersisted(true);
      await refresh();
      setStorageError("");
      setNotice(
        markSaved ? "이 기기에 저장했어요." : "생성 기록에 보관했어요.",
      );
    } catch (e) {
      setStorageError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function openRecord(record: IdeaRecord, from: View) {
    setResult(record);
    setInput({
      categoryId: record.categoryId,
      topic: record.topic,
      constraints: record.constraints,
    });
    setHistoryPersisted(true);
    setDetailFrom(from);
    go("detail");
  }
  async function login() {
    setError("");
    setAuthBusy(true);
    try {
      if (!navigator.onLine)
        throw new Error("구글 로그인에는 인터넷 연결이 필요해요.");
      const config = JSON.parse(firebaseConfig);
      if (!config.apiKey || !config.authDomain || !config.projectId)
        throw new Error(
          "Firebase 설정의 apiKey, authDomain, projectId를 확인해주세요.",
        );
      const appUrl =
          "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js",
        authUrl = "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
      const apps = await import(/* @vite-ignore */ appUrl),
        auths = await import(/* @vite-ignore */ authUrl);
      const app = apps.getApps().length
          ? apps.getApp()
          : apps.initializeApp(config),
        auth = auths.getAuth(app);
      await auths.setPersistence(auth, auths.inMemoryPersistence);
      authRef.current = { auth, auths };
      const res = await auths.signInWithPopup(
        auth,
        new auths.GoogleAuthProvider(),
      );
      setAccount({
        displayName: res.user.displayName || "",
        email: res.user.email || "",
      });
      try {
        localStorage.setItem("idea-note-firebase", firebaseConfig);
      } catch {}
    } catch (e) {
      setError(
        (e as Error).message ||
          "로그인하지 못했어요. 팝업 허용과 Firebase 설정을 확인해주세요.",
      );
    } finally {
      setAuthBusy(false);
    }
  }
  async function logout() {
    try {
      await authRef.current?.auths.signOut(authRef.current.auth);
      setAccount(null);
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해주세요.");
    }
  }
  function chooseTheme(next: Theme) {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem("idea-note-theme");
      else localStorage.setItem("idea-note-theme", next);
    } catch {}
  }
  const saved = records
    .filter((r) => r.savedAt)
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!));
  // The tab a view belongs to; detail pages stay under the list they came from.
  const tab: View =
    view === "result" ? "input" : view === "detail" ? detailFrom : view;
  const nav = [
    { id: "input", label: "새 아이디어" },
    { id: "saved", label: "저장함", count: saved.length },
    { id: "history", label: "기록", count: records.length },
    { id: "settings", label: "설정" },
  ] as const;
  const list = view === "saved" ? saved : records;
  return (
    <div className="app">
      <header className="masthead">
        <button className="wordmark" onClick={() => go("home")} disabled={busy}>
          아이디어 노트
        </button>
        {!online && (
          <span className="offline" role="status">
            <WifiOff size={15} aria-hidden="true" />
            오프라인
          </span>
        )}
        <nav className="tabs" aria-label="주 메뉴">
          {nav.map((item) => (
            <button
              key={item.id}
              disabled={busy}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => (item.id === "input" ? create() : go(item.id))}
            >
              <span className="tab-label">{item.label}</span>
              {"count" in item && <span className="tab-count">{item.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main ref={main} tabIndex={-1} className={"page page-" + view}>
        {view !== "home" && view !== "saved" && view !== "history" && view !== "settings" && (
          <button
            className="back"
            disabled={busy}
            onClick={() =>
              go(
                view === "detail"
                  ? detailFrom
                  : view === "result"
                    ? "input"
                    : "home",
              )
            }
          >
            {view === "detail"
              ? detailFrom === "saved" ? "저장함으로 돌아가기" : "기록으로 돌아가기"
              : view === "result"
                ? "조건으로 돌아가기"
                : "홈으로"}
          </button>
        )}

        {(notice || error || storageError) && (
          <div className="messages">
            {notice && (
              <div className="msg msg-ok" role="status">
                <span>{notice}</span>
                <button
                  className="icon-btn"
                  aria-label="알림 닫기"
                  onClick={() => setNotice("")}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            )}
            {error && (
              <div className="msg msg-error" role="alert">
                <span>{error}</span>
              </div>
            )}
            {storageError && (
              <div className="msg msg-error" role="alert">
                <span>{storageError}</span>
                <button className="link-btn" onClick={refresh}>
                  목록 다시 읽기
                </button>
              </div>
            )}
          </div>
        )}

        {view === "home" && (
          <>
            <section className="home">
              <div className="home-lead">
                <h1>
                  어떤 프로젝트를
                  <br />
                  만들어 볼까요?
                </h1>
                <p className="lede">
                  주제 하나와 조건 몇 줄을 적으면, 누구를 위한 것인지와 핵심
                  기능, 첫 실행 단계까지 정리한 초안을 받아요.
                </p>
                <button className="btn btn-primary btn-large" onClick={() => create()}>
                  {key ? "아이디어 만들기" : "Gemini 키 연결하기"}
                </button>
                <p className="hint">
                  {key
                    ? "Gemini 키가 이 페이지에 연결돼 있어요."
                    : "생성에는 Gemini API 키가 필요해요. 로그인은 하지 않아도 돼요."}
                </p>
              </div>
              <div className="home-side">
                <h2>이런 주제로 시작해 보세요</h2>
                <ul className="samples">
                  {samples.map((s) => (
                    <li key={s}>
                      <button onClick={() => create(s)}>{s}</button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
            <section className="shelf" aria-label="보관함">
              <button onClick={() => go("saved")}>
                <span className="shelf-name">저장한 아이디어</span>
                <span className="shelf-num">{saved.length}개</span>
              </button>
              <button onClick={() => go("history")}>
                <span className="shelf-name">생성 기록</span>
                <span className="shelf-num">{records.length}개</span>
              </button>
            </section>
            <p className="footnote">
              아이디어와 기록은 이 브라우저에만 보관돼요.{" "}
              {offlineReady
                ? "인터넷 없이도 다시 볼 수 있어요."
                : "온라인에서 한 번 열어두면 오프라인에서도 볼 수 있게 준비해요."}
            </p>
          </>
        )}

        {view === "input" && (
          <section className="split">
            <div className="split-lead">
              <h1>무엇을 만들고 싶나요?</h1>
              <p className="lede">
                조건이 구체적일수록 팀 상황에 맞는 아이디어가 나와요.
              </p>
            </div>
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                generate();
              }}
              className="sheet form"
            >
              <div className="field field-topic">
                <label htmlFor="topic">
                  주제 <span className="req">필수</span>
                </label>
                <input
                  id="topic"
                  value={input.topic}
                  onChange={(e) =>
                    setInput({ ...input, topic: e.target.value })
                  }
                  maxLength={200}
                  placeholder="예: 대학생의 자투리 시간을 활용하는 앱"
                  required
                  aria-describedby="topic-help"
                  aria-invalid={!!error && !input.topic.trim()}
                />
                <div className="field-foot" id="topic-help">
                  <span>해결하고 싶은 문제나 관심 있는 주제</span>
                  <span className="counter">{input.topic.length}/200</span>
                </div>
                {error && !input.topic.trim() && (
                  <p className="field-error">주제를 입력해주세요.</p>
                )}
              </div>
              <div className="field field-ruled">
                <label htmlFor="constraints">
                  조건 <span className="opt">선택</span>
                </label>
                <textarea
                  id="constraints"
                  value={input.constraints}
                  onChange={(e) =>
                    setInput({ ...input, constraints: e.target.value })
                  }
                  maxLength={1500}
                  rows={5}
                  placeholder="예: 2명이 4주 안에 만들 수 있는 웹앱, 비용은 최소로"
                  aria-describedby="constraints-help"
                />
                <div className="field-foot" id="constraints-help">
                  <span>대상, 기간, 인원, 예산 같은 제약</span>
                  <span className="counter">
                    {input.constraints.length.toLocaleString()}/1,500
                  </span>
                </div>
              </div>
              <p className="privacy">
                생성하면 주제와 조건이 Google Gemini로 전송돼요. 무료 등급
                데이터는 Google 서비스 개선에 쓰일 수 있으니 민감한 정보는 적지
                마세요.
              </p>
              <button
                className="btn btn-primary btn-large"
                type="submit"
                disabled={!online || busy}
              >
                아이디어 생성하기
              </button>
              {!online && (
                <p className="hint">인터넷에 연결되면 생성할 수 있어요.</p>
              )}
            </form>
          </section>
        )}

        {(view === "result" || view === "detail") && (
          <section className="column column-idea">
            {busy && (
              <div className="sheet loading" role="status">
                <LoaderCircle className="spin" size={28} aria-hidden="true" />
                <h1>아이디어를 만들고 있어요</h1>
                <p>
                  「{input.topic}」에 맞는 방향을 정리하는 중이에요. 최대 1분
                  정도 걸려요.
                </p>
                <p className="hint">
                  끝날 때까지 다른 화면으로 이동하거나 다시 생성할 수 없어요.
                </p>
              </div>
            )}
            {!busy && result && (
              <>
                <article
                  className={"sheet idea" + (view === "result" ? " fresh" : "")}
                  key={result.id}
                >
                  <p className="idea-state">
                    {result.savedAt ? "저장한 아이디어" : "저장하지 않은 아이디어"}
                  </p>
                  <h1 className="idea-title">
                    <span className="mark">{result.title}</span>
                  </h1>
                  <dl className="idea-input">
                    <div>
                      <dt>주제</dt>
                      <dd>{result.topic}</dd>
                    </div>
                    <div>
                      <dt>조건</dt>
                      <dd>{result.constraints || "지정한 조건 없음"}</dd>
                    </div>
                  </dl>
                  <div className="idea-body">
                    {sections(result.body).map((part, i) => (
                      <section key={i} className="idea-part">
                        {part.heading && (
                          <h2 className="idea-section">{part.heading}</h2>
                        )}
                        <p className="idea-text">{part.text}</p>
                      </section>
                    ))}
                  </div>
                  <p className="idea-meta">
                    {fmt(result.createdAt)}에 {result.modelId}로 생성한
                    초안이에요. 쓰기 전에 내용을 확인해주세요.
                  </p>
                </article>
                {!historyPersisted && (
                  <div className="msg msg-error" role="alert">
                    <span>생성 결과가 아직 기록에 보관되지 않았어요.</span>
                    <button
                      onClick={() => save(false)}
                      disabled={saving}
                      className="link-btn"
                    >
                      기록에 다시 보관
                    </button>
                  </div>
                )}
                <div className="actions">
                  {(view === "result" || detailFrom === "history") && (
                    <button
                      className="btn btn-primary"
                      onClick={() => save()}
                      disabled={saving || !!result.savedAt}
                    >
                      {saving && (
                        <LoaderCircle className="spin" size={17} aria-hidden="true" />
                      )}
                      {result.savedAt ? "기기에 저장됨" : "이 아이디어 저장"}
                    </button>
                  )}
                  {view === "result" && (
                    <button
                      className="btn"
                      onClick={generate}
                      disabled={!online || !historyPersisted}
                    >
                      같은 조건으로 다시 생성
                    </button>
                  )}
                  <button
                    className="btn"
                    disabled={view === "result" && !historyPersisted}
                    onClick={() => go("input")}
                  >
                    {view === "detail" ? "이 조건으로 새로 만들기" : "조건 수정"}
                  </button>
                  {result.savedAt && (
                    <button className="link-btn" onClick={() => go("saved")}>
                      저장함 보기
                    </button>
                  )}
                </div>
              </>
            )}
            {!busy && !result && (
              <div className="sheet empty">
                <h1>아이디어를 만들지 못했어요</h1>
                <p>
                  위 안내를 확인한 뒤 다시 시도해주세요. 입력한 주제와 조건은
                  그대로 남아 있어요.
                </p>
                <div className="actions">
                  <button
                    className="btn btn-primary"
                    onClick={generate}
                    disabled={!online}
                  >
                    다시 시도
                  </button>
                  <button className="btn" onClick={() => go("input")}>
                    조건 수정
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {(view === "saved" || view === "history") && (
          <section className="column column-wide">
            <h1>{view === "saved" ? "저장함" : "생성 기록"}</h1>
            <p className="lede">
              {view === "saved"
                ? `직접 저장한 아이디어 ${saved.length}개, 최근에 저장한 순서예요.`
                : `만든 아이디어 ${records.length}개, 저장하지 않은 것도 모두 남아 있어요.`}
            </p>
            {list.length === 0 ? (
              <div className="empty-list">
                <h2>
                  {view === "saved"
                    ? "아직 저장한 아이디어가 없어요"
                    : "아직 만든 아이디어가 없어요"}
                </h2>
                <p>
                  {view === "saved"
                    ? "결과 화면에서 ‘이 아이디어 저장’을 누르면 여기에 모여요."
                    : "아이디어를 하나 만들면 저장하지 않아도 여기에 남아요."}
                </p>
                <button className="btn btn-primary" onClick={() => create()}>
                  아이디어 만들기
                </button>
              </div>
            ) : (
              <ol className={"records records-" + view}>
                {list.map((r) => {
                  const when = view === "saved" ? r.savedAt! : r.createdAt;
                  return (
                    <li key={r.id}>
                      <button onClick={() => openRecord(r, view)}>
                        <time dateTime={when} className="rec-date">
                          <span>{day(when)}</span>
                          <span>{time(when)}</span>
                        </time>
                        <span className="rec-main">
                          <span className="rec-title">{r.title}</span>
                          <span className="rec-topic">{r.topic}</span>
                          <span className="rec-excerpt">
                            {excerpt(r.body)}
                          </span>
                        </span>
                        {view === "history" && r.savedAt && (
                          <span className="rec-flag">저장됨</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {view === "settings" && (
          <section className="column column-wide settings">
            <h1>설정</h1>
            <p className="lede">
              Gemini 키와 계정, 화면을 관리해요. 아이디어 기록은 이 기기에만
              남아요.
            </p>

            <section className="setting" aria-labelledby="s-gemini">
              <div className="setting-head">
                <h2 id="s-gemini">Gemini 연결</h2>
                <span className={"state" + (key ? " state-on" : "")}>
                  {key ? "키 입력됨" : "연결 필요"}
                </span>
              </div>
              <p>
                {MODEL} 모델로 온라인에서 아이디어를 만들어요. 키를 입력했다고
                사용 가능 여부가 확인되지는 않아요. 아이디어를 한 번 만들어
                보면 알 수 있어요.
              </p>
              <div className="field">
                <label htmlFor="api-key">Gemini API 키</label>
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="Google AI Studio에서 발급한 키"
                  maxLength={256}
                  aria-describedby="api-key-help"
                />
                <p className="field-foot" id="api-key-help">
                  키는 이 페이지의 메모리에만 있고, 새로고침하면 지워져요. 생성할
                  때 이 앱의 중계 서버를 거쳐 Google로 전달돼요.
                </p>
              </div>
              <div className="actions">
                <button
                  className="btn btn-primary"
                  disabled={!keyDraft.trim()}
                  onClick={() => {
                    setKey(keyDraft.trim());
                    setNotice(
                      "키를 연결했어요. 아이디어를 만들어 연결을 확인해보세요.",
                    );
                  }}
                >
                  키 연결
                </button>
                {key && (
                  <button
                    className="btn"
                    onClick={() => {
                      setKey("");
                      setKeyDraft("");
                      setNotice("키 연결을 해제했어요.");
                    }}
                  >
                    연결 해제
                  </button>
                )}
                <a
                  className="link-btn"
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  무료 API 키 발급받기 (새 탭)
                </a>
              </div>
              <p className="privacy">
                무료 이용 범위는 Google 프로젝트의 등급, 지역, 한도에 따라
                달라요. 과금을 피하려면 결제가 연결되지 않은 프로젝트의 키를
                쓰세요. 앱이 유료 모델로 바꾸는 일은 없어요.
              </p>
            </section>

            <section className="setting" aria-labelledby="s-account">
              <div className="setting-head">
                <h2 id="s-account">
                  구글 계정 <span className="opt">선택</span>
                </h2>
                <span className="state">
                  {account
                    ? account.displayName || account.email
                    : "로그인하지 않음"}
                </span>
              </div>
              <p>
                로그인하지 않아도 모든 기능을 쓸 수 있어요. 기록은 계정별로
                나뉘지 않고 다른 기기와 동기화되지 않아요. 로그인은 이 페이지를
                열어둔 동안만 유지돼요.
              </p>
              {account ? (
                <div className="actions">
                  <button className="btn" onClick={logout}>
                    로그아웃
                  </button>
                </div>
              ) : (
                <>
                  <details>
                    <summary>팀 Firebase 프로젝트 연결</summary>
                    <p>
                      Firebase에서 Google 로그인을 켜고 현재 도메인을 승인한 뒤,
                      웹 앱의 공개 설정 JSON을 붙여넣으세요. 설정은 이 기기에
                      보관돼요.
                    </p>
                    <div className="field">
                      <label htmlFor="firebase">Firebase 웹 앱 설정</label>
                      <textarea
                        id="firebase"
                        rows={4}
                        className="code"
                        value={firebaseConfig}
                        onChange={(e) => setFirebaseConfig(e.target.value)}
                        placeholder={
                          '{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'
                        }
                      />
                    </div>
                  </details>
                  <div className="actions">
                    <button
                      className="btn"
                      onClick={login}
                      disabled={authBusy || !firebaseConfig.trim() || !online}
                    >
                      {authBusy && (
                        <LoaderCircle size={17} className="spin" aria-hidden="true" />
                      )}
                      구글 로그인
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="setting" aria-labelledby="s-theme">
              <div className="setting-head">
                <h2 id="s-theme">화면</h2>
              </div>
              <fieldset className="segmented">
                <legend className="sr-only">화면 테마</legend>
                {(
                  [
                    ["system", "기기 설정 따르기"],
                    ["light", "밝게"],
                    ["dark", "어둡게"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="theme"
                      value={value}
                      checked={theme === value}
                      onChange={() => chooseTheme(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>
            </section>

            <section className="setting" aria-labelledby="s-device">
              <div className="setting-head">
                <h2 id="s-device">기기 보관과 문의</h2>
                <span className={"state" + (offlineReady ? " state-on" : "")}>
                  {offlineReady ? "오프라인 조회 준비됨" : "오프라인 조회 준비 중"}
                </span>
              </div>
              <p>
                {offlineReady
                  ? "인터넷 없이도 저장한 아이디어와 기록을 볼 수 있어요. "
                  : "온라인에서 이 페이지를 한 번 더 열면 오프라인 조회가 준비돼요. "}
                브라우저 데이터를 지우거나 다른 주소나 브라우저로 열면 기존 기록을
                가져올 수 없어요.
              </p>
              <details>
                <summary>팀 오픈채팅 주소 설정</summary>
                <div className="field">
                  <label htmlFor="contact">카카오톡 오픈채팅 URL</label>
                  <input
                    id="contact"
                    value={contactDraft}
                    onChange={(e) => setContactDraft(e.target.value)}
                    placeholder="https://open.kakao.com/o/..."
                  />
                </div>
                <div className="actions">
                  <button
                    className="btn"
                    onClick={() => {
                      if (!KAKAO.test(contactDraft)) {
                        setError("카카오톡 오픈채팅 주소를 확인해주세요.");
                        return;
                      }
                      try {
                        localStorage.setItem("idea-note-contact", contactDraft);
                        setContact(contactDraft);
                        setNotice("문의 주소를 저장했어요.");
                      } catch {
                        setError("설정을 저장하지 못했어요.");
                      }
                    }}
                  >
                    문의 주소 저장
                  </button>
                </div>
              </details>
              {contact ? (
                <a
                  className="link-btn"
                  href={KAKAO.test(contact) ? contact : undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  오픈채팅으로 문의하기 (새 탭)
                </a>
              ) : (
                <p className="hint">팀 문의 주소가 아직 등록되지 않았어요.</p>
              )}
              <p className="hint">
                문의와 로그인에는 인터넷이 필요해요. 아이디어 본문은 인증이나
                문의 서비스로 보내지 않아요.
              </p>
            </section>
          </section>
        )}
      </main>

      <footer className="colophon">무규규 팀의 아이디어 노트</footer>
    </div>
  );
}
