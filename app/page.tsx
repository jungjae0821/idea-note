"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Feather,
  Home,
  Leaf,
  LoaderCircle,
  Plus,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { CATEGORY, MODEL, type IdeaInput, type IdeaRecord } from "../lib/idea";
import { listHistory, putRecord } from "../lib/storage";
type View =
  "home" | "input" | "result" | "saved" | "history" | "detail" | "settings";
const initial: IdeaInput = { categoryId: CATEGORY, topic: "", constraints: "" };
const fmt = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
const samples = [
  "대학생의 자투리 시간을 활용하는 앱",
  "동네에서 시작하는 친환경 프로젝트",
  "혼자 사는 사람을 위한 작은 서비스",
];
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
  const saved = records
    .filter((r) => r.savedAt)
    .sort((a, b) => b.savedAt!.localeCompare(a.savedAt!));
  const headings: Record<View, string> = {
    home: "나의 작업 공간",
    input: "아이디어 만들기",
    result: "생성 결과",
    saved: "저장한 아이디어",
    history: "생성 기록",
    detail: "아이디어 상세",
    settings: "준비 · 설정",
  };
  const nav = [
    { id: "home", label: "홈", Icon: Home },
    { id: "input", label: "아이디어 만들기", Icon: Sparkles },
    { id: "saved", label: "저장한 아이디어", Icon: Bookmark },
    { id: "history", label: "생성 기록", Icon: Clock3 },
  ] as const;
  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")} disabled={busy}>
          <span className="brand-icon">
            <Feather size={23} />
          </span>
          <span>
            아이디어 노트<small>생각을 시작하는 작은 공간</small>
          </span>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="주 메뉴">
          {nav.map(({ id, label, Icon }) => (
            <button
              key={id}
              disabled={busy}
              className={
                "nav-item " +
                (view === id || (id === "input" && view === "result")
                  ? "active"
                  : "")
              }
              onClick={() => (id === "input" ? create() : go(id))}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "saved" && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <Leaf size={19} />
            <strong>당신의 생각은, 이 기기에.</strong>
            <p>
              아이디어와 기록은 브라우저에
              <br />
              보관돼요. 계정 동기화는 없어요.
            </p>
          </div>
          <button
            className={"nav-item " + (view === "settings" ? "active" : "")}
            disabled={busy}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            준비 · 설정
          </button>
          <div className="team">
            무규규 <span>IDEA NOTE / 01</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>{headings[view]}</span>
          <div className={"network " + (!online ? "offline" : "")}>
            {online ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{online ? "온라인" : "오프라인"}</span>
            <span className="dot-separator">·</span>
            <span>기기 저장</span>
            <button
              className="mobile-settings"
              disabled={busy}
              aria-label="준비 및 설정"
              onClick={() => go("settings")}
            >
              <Settings size={16} />
            </button>
          </div>
        </header>
        <main ref={main} tabIndex={-1}>
          {view !== "home" && (
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
              <ArrowLeft size={16} />{" "}
              {view === "detail"
                ? "목록으로"
                : view === "result"
                  ? "조건으로 돌아가기"
                  : "홈으로"}
            </button>
          )}
          {notice && (
            <div className="notice" role="status">
              <Check size={17} />
              {notice}
              <button aria-label="알림 닫기" onClick={() => setNotice("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {storageError && (
            <div className="error" role="alert">
              {storageError}
              <button className="text-button" onClick={refresh}>
                목록 다시 읽기
              </button>
            </div>
          )}
          {view === "home" && (
            <>
              <section className="intro">
                <div className="eyebrow">
                  <span /> A LITTLE SPACE FOR BIG IDEAS
                </div>
                <h1>
                  떠오르지 않을 때,
                  <br />
                  <em>생각의 첫 줄</em>을 함께.
                </h1>
                <p>
                  막연한 주제에 작은 조건을 더해보세요.
                  <br />
                  하나의 생각이 실행 가능한 아이디어가 될 수 있어요.
                </p>
              </section>
              <section className="hero-card">
                <div className="hero-copy">
                  <span className="pill">
                    <span className={key ? "status-dot ready" : "status-dot"} />
                    {key
                      ? "Gemini 키 입력됨"
                      : "처음이라면, Gemini부터 연결해요"}
                  </span>
                  <h2>
                    어떤 아이디어를
                    <br />
                    만들어볼까요?
                  </h2>
                  <p>주제 입력부터 생성, 저장까지 한곳에서.</p>
                  <button className="primary" onClick={() => create()}>
                    {" "}
                    {key ? <Sparkles size={18} /> : <Plus size={18} />}{" "}
                    {key ? "아이디어 만들기" : "Gemini 연결하고 시작하기"}
                    <ArrowRight size={18} />
                  </button>
                  <small>
                    생성에는 인터넷이 필요해요 · 로그인 없이 이용 가능
                  </small>
                </div>
                <div className="note-art" aria-hidden="true">
                  <div className="art-orbit" />
                  <span className="art-spark spark-one">✦</span>
                  <span className="art-spark spark-two">✧</span>
                  <div className="paper back-paper" />
                  <div className="paper front-paper">
                    <span className="paper-tag">MY NEXT IDEA</span>
                    <div className="sketch-bulb">
                      <Sparkles size={44} strokeWidth={1.25} />
                    </div>
                    <i />
                    <i />
                    <i className="short" />
                    <div className="paper-bottom">
                      <span>작은 생각, 새로운 시작</span>
                      <Feather size={17} />
                    </div>
                  </div>
                  <div className="art-leaf">
                    <Leaf size={30} />
                  </div>
                </div>
              </section>
              <div className="section-title">
                <h2>나의 아이디어 보관함</h2>
                <span>생각이 쌓이는 곳</span>
              </div>
              <div className="overview">
                <button onClick={() => go("saved")}>
                  <span className="tile-icon">
                    <Bookmark size={21} />
                  </span>
                  <div>
                    <strong>
                      저장한 아이디어 <b>{saved.length}</b>
                    </strong>
                    <p>다시 꺼내보고 싶은 생각들</p>
                  </div>
                  <ArrowRight size={18} />
                </button>
                <button onClick={() => go("history")}>
                  <span className="tile-icon sand">
                    <Clock3 size={21} />
                  </span>
                  <div>
                    <strong>
                      생성 기록 <b>{records.length}</b>
                    </strong>
                    <p>저장하지 않은 결과도 여기에</p>
                  </div>
                  <ArrowRight size={18} />
                </button>
              </div>
              <div className="section-title">
                <h2>이런 주제로 시작해보세요</h2>
                <span>프로젝트 아이디어</span>
              </div>
              <div className="suggestions">
                {samples.map((s, i) => (
                  <button key={s} onClick={() => create(s)}>
                    <span>0{i + 1}</span>
                    {s}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
              <div className="footnote">
                <Leaf size={14} /> 저장한 아이디어는{" "}
                {offlineReady
                  ? "인터넷 없이도 다시 볼 수 있어요."
                  : "이 기기에 보관돼요. 온라인으로 한 번 열어두면 오프라인 조회를 준비해요."}
              </div>
            </>
          )}
          {view === "input" && (
            <section className="narrow">
              <div className="eyebrow">01 / CREATE</div>
              <h1>
                생각의 씨앗을
                <br />
                남겨주세요.
              </h1>
              <p className="subtitle">
                구체적인 조건일수록, 더 잘 맞는 아이디어를 얻을 수 있어요.
              </p>
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  generate();
                }}
                className="panel form-panel"
              >
                <span className="category">
                  <Leaf size={14} /> 프로젝트 아이디어
                </span>
                <label htmlFor="topic">
                  어떤 아이디어가 필요한가요? <span>*</span>
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
                <small id="topic-help">
                  해결하고 싶은 문제나 관심 있는 주제를 적어주세요.{" "}
                  {input.topic.length}/200
                </small>
                {error && !input.topic.trim() && <p className="field-error">주제를 입력해주세요.</p>}
                <label htmlFor="constraints">
                  원하는 조건 <span className="optional">선택</span>
                </label>
                <textarea
                  id="constraints"
                  value={input.constraints}
                  onChange={(e) =>
                    setInput({ ...input, constraints: e.target.value })
                  }
                  maxLength={1500}
                  rows={5}
                  placeholder="예: 대학생 대상, 2명이 4주 안에 만들 수 있는 웹앱. 비용은 최소화하고 싶어요."
                />
                <small>{input.constraints.length}/1,500</small>
                <div className="privacy-note">
                  <CircleHelp size={17} />
                  <span>
                    생성 시 주제와 조건을 Google Gemini로 전송해요. 무료 등급
                    데이터는 Google 서비스 개선에 사용될 수 있으니 민감한 정보는
                    입력하지 마세요.
                  </span>
                </div>
                <button
                  className="primary wide"
                  type="submit"
                  disabled={!online || busy}
                >
                  <Sparkles size={18} />
                  아이디어 생성하기
                  <ArrowRight size={17} />
                </button>
              </form>
            </section>
          )}
          {(view === "result" || view === "detail") && (
            <section className="narrow">
              <div className="eyebrow">
                {view === "detail" ? "YOUR IDEA" : "02 / YOUR NEXT IDEA"}
              </div>
              <h1>
                {busy
                  ? "생각을 구체화하고 있어요."
                  : view === "detail"
                    ? "다시 꺼내본 생각."
                    : result ? "새로운 생각이 도착했어요." : "생성을 다시 시도해볼까요?"}
              </h1>
              {busy && (
                <div className="panel loading" role="status">
                  <LoaderCircle className="spin" size={35} />
                  <h2>아이디어를 만들고 있어요</h2>
                  <p>
                    주제와 조건을 바탕으로 실행할 수 있는 방향을 찾고 있어요.
                    <br />
                    최대 60초 정도 기다려주세요.
                  </p>
                  <div className="shimmer" />
                  <div className="shimmer short" />
                  <small>
                    완료될 때까지 화면 이동과 중복 생성을 잠시 막아요.
                  </small>
                </div>
              )}
              {!busy && result && (
                <>
                  <article className="panel result-paper">
                    <div className="result-meta">
                      <span className="category">프로젝트 아이디어</span>
                      {result.savedAt && (
                        <span className="saved-badge">
                          <Bookmark size={13} />
                          저장됨
                        </span>
                      )}
                    </div>
                    <h2>{result.title}</h2>
                    <div className="input-summary">
                      <p>
                        <strong>주제</strong>
                        {result.topic}
                      </p>
                      <p>
                        <strong>조건</strong>
                        {result.constraints || "지정한 조건 없음"}
                      </p>
                    </div>
                    <div className="idea-body">{result.body}</div>
                    <div className="result-date">
                      {fmt(result.createdAt)} 생성 · {result.modelId}
                    </div>
                  </article>
                  <p className="ai-caption">
                    <Sparkles size={14} />
                    AI가 생성한 초안입니다. 활용 전 내용을 확인해주세요.
                  </p>
                  {!historyPersisted && (
                    <div className="error" role="alert">
                      생성 결과가 아직 기록에 보관되지 않았어요.
                      <button
                        onClick={() => save(false)}
                        disabled={saving}
                        className="text-button"
                      >
                        기록 저장 재시도
                      </button>
                    </div>
                  )}
                  <div className="actions">
                    {(view === "result" || detailFrom === "history") && (
                      <button
                        className="primary"
                        onClick={() => save()}
                        disabled={saving || !!result.savedAt}
                      >
                        {saving ? (
                          <LoaderCircle className="spin" size={17} />
                        ) : result.savedAt ? (
                          <Check size={17} />
                        ) : (
                          <Bookmark size={17} />
                        )}{" "}
                        {result.savedAt ? "기기에 저장됨" : "이 결과 저장"}
                      </button>
                    )}
                    {result.savedAt && (
                      <button className="secondary" onClick={() => go("saved")}>
                        저장 목록 보기
                        <ArrowRight size={16} />
                      </button>
                    )}
                    {view === "result" && (
                      <button
                        className="secondary"
                        onClick={generate}
                        disabled={!online || !historyPersisted}
                      >
                        다시 생성
                      </button>
                    )}
                    <button
                      className="secondary"
                      disabled={view === "result" && !historyPersisted}
                      onClick={() => go("input")}
                    >
                      {view === "detail"
                        ? "이 조건으로 새로 만들기"
                        : "조건 수정"}
                    </button>
                  </div>
                </>
              )}
              {!busy && !result && (
                <div className="panel empty">
                  <Sparkles size={32} />
                  <h2>이번에는 결과를 만들지 못했어요</h2>
                  <p>입력한 내용은 그대로 남아 있어요.</p>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={generate}
                      disabled={!online}
                    >
                      다시 시도
                    </button>
                    <button className="secondary" onClick={() => go("input")}>
                      조건 수정
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
          {(view === "saved" || view === "history") && (
            <section>
              <div className="eyebrow">
                {view === "saved" ? "COLLECTION" : "TIMELINE"}
              </div>
              <h1>
                {headings[view]}
                <span className="title-count">
                  {view === "saved" ? saved.length : records.length}
                </span>
              </h1>
              <p className="subtitle">
                {view === "saved"
                  ? "마음에 담아둔 생각을 다시 펼쳐보세요."
                  : "저장하지 않은 성공 결과도 모두 여기에 남아요."}
              </p>
              {(view === "saved" ? saved : records).length === 0 ? (
                <div className="panel empty">
                  <span className="empty-icon">
                    {view === "saved" ? (
                      <Bookmark size={29} />
                    ) : (
                      <Clock3 size={29} />
                    )}
                  </span>
                  <h2>
                    {view === "saved"
                      ? "아직 저장한 아이디어가 없어요"
                      : "아직 생성 기록이 없어요"}
                  </h2>
                  <p>첫 번째 생각을 만드는 것부터 시작해볼까요?</p>
                  <button className="primary" onClick={() => create()}>
                    <Plus size={17} />
                    아이디어 만들기
                  </button>
                </div>
              ) : (
                <div className="record-list">
                  {(view === "saved" ? saved : records).map((r) => (
                    <button
                      key={r.id}
                      className="record-row"
                      onClick={() => openRecord(r, view)}
                    >
                      <span className="tile-icon">
                        {view === "saved" ? (
                          <Bookmark size={20} />
                        ) : (
                          <Clock3 size={20} />
                        )}
                      </span>
                      <div>
                        <small>
                          {fmt(view === "saved" ? r.savedAt! : r.createdAt)}{" "}
                          {view === "history" && r.savedAt ? " · 저장됨" : ""}
                        </small>
                        <h2>{r.title}</h2>
                        <p>
                          {r.topic} · {r.body.slice(0, 90)}
                        </p>
                      </div>
                      <ChevronRight size={20} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
          {view === "settings" && (
            <section className="narrow">
              <div className="eyebrow">MAKE YOURSELF AT HOME</div>
              <h1>시작할 준비.</h1>
              <p className="subtitle">
                Gemini 연결과 계정을 관리하세요. 기록은 이 기기에 남아요.
              </p>
              <div className="panel settings-panel">
                <div className="panel-heading">
                  <span className="tile-icon">
                    <Sparkles size={21} />
                  </span>
                  <div>
                    <h2>Gemini 연결</h2>
                    <p>{MODEL} · 무료 등급 지원</p>
                  </div>
                  <span className={"pill " + (key ? "connected" : "")}>
                    {key ? "키 입력됨" : "연결 필요"}
                  </span>
                </div>
                <p>
                  Gemini API는 온라인으로 아이디어를 만들어요. 로컬 모델 설치는
                  필요하지 않아요. 키 입력만으로 사용 가능 여부가 검증되지는
                  않아요.
                </p>
                <label htmlFor="api-key">Gemini API 키</label>
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="Google AI Studio에서 발급한 API 키"
                  maxLength={256}
                />
                <small>
                  키는 현재 페이지의 메모리에만 보관하며, 새로고침하면 지워져요.
                  생성 시 이 앱의 중계 서버를 통해 Google에 전달돼요.
                </small>
                <div className="actions">
                  <button
                    className="primary"
                    disabled={!keyDraft.trim()}
                    onClick={() => {
                      setKey(keyDraft.trim());
                      setNotice(
                        "키를 현재 페이지에 연결했어요. 아이디어를 만들어 연결을 확인해보세요.",
                      );
                    }}
                  >
                    키 연결하기
                    <Check size={16} />
                  </button>
                  {key && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setKey("");
                        setKeyDraft("");
                        setNotice("API 키 연결을 해제했어요.");
                      }}
                    >
                      연결 해제
                    </button>
                  )}
                  <a
                    className="text-link"
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noreferrer"
                  >
                    무료 API 키 발급 ↗
                  </a>
                </div>
                <div className="privacy-note">
                  <CircleHelp size={17} />
                  <span>
                    무료 이용은 Google 프로젝트의 등급·지역·한도에 따라 달라요.
                    과금을 피하려면 결제가 연결되지 않은 무료 프로젝트의 키를
                    사용하세요. 앱은 유료 모델로 자동 전환하지 않아요.
                  </span>
                </div>
              </div>
              <div className="panel settings-panel">
                <div className="panel-heading">
                  <span className="tile-icon sand">
                    <Home size={20} />
                  </span>
                  <div>
                    <h2>
                      구글 계정 <span className="optional">선택</span>
                    </h2>
                    <p>
                      {account
                        ? account.displayName || account.email
                        : "로그인하지 않음"}
                    </p>
                  </div>
                </div>
                <p>
                  로그인 없이 생성·저장·조회할 수 있어요. 기록은 계정별로
                  분리되지 않으며 다른 기기와 동기화되지 않아요. 로그인은 현재
                  페이지에서만 유지돼요.
                </p>
                {account ? (
                  <button className="secondary" onClick={logout}>
                    로그아웃
                  </button>
                ) : (
                  <>
                    <details>
                      <summary>팀 Firebase 프로젝트 연결</summary>
                      <p>
                        Firebase에서 Google 제공업체를 활성화하고 현재 도메인을
                        승인한 뒤, 웹 앱의 공개 설정 JSON을 붙여넣으세요. 설정은
                        이 기기에 보관돼요.
                      </p>
                      <label htmlFor="firebase">Firebase 웹 앱 설정</label>
                      <textarea
                        id="firebase"
                        rows={4}
                        value={firebaseConfig}
                        onChange={(e) => setFirebaseConfig(e.target.value)}
                        placeholder={
                          '{"apiKey":"...","authDomain":"...","projectId":"...","appId":"..."}'
                        }
                      />
                    </details>
                    <button
                      className="secondary"
                      onClick={login}
                      disabled={authBusy || !firebaseConfig.trim() || !online}
                    >
                      {authBusy && <LoaderCircle size={17} className="spin" />}
                      구글 로그인
                    </button>
                  </>
                )}
              </div>
              <div className="panel settings-panel">
                <h2>기기 보관 · 문의</h2>
                <p>
                  {offlineReady
                    ? "오프라인 조회 준비 완료"
                    : "오프라인 조회 준비 중 · 온라인에서 페이지를 한 번 더 열어주세요."}
                  <br />
                  브라우저 데이터를 지우거나 다른 주소·브라우저로 열면 기존
                  기록을 가져올 수 없어요.
                </p>
                <details>
                  <summary>팀 오픈채팅 주소 설정</summary>
                  <label htmlFor="contact">카카오톡 오픈채팅 URL</label>
                  <input
                    id="contact"
                    value={contactDraft}
                    onChange={(e) => setContactDraft(e.target.value)}
                    placeholder="https://open.kakao.com/o/..."
                  />
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        !/^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/.test(
                          contactDraft,
                        )
                      ) {
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
                </details>
                {contact ? (
                  <a
                    className="text-link"
                    href={
                      /^https:\/\/open\.kakao\.com\/o\/[a-zA-Z0-9]+$/.test(
                        contact,
                      )
                        ? contact
                        : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    오픈채팅 문의 ↗
                  </a>
                ) : (
                  <small>팀 문의 주소가 아직 등록되지 않았어요.</small>
                )}
                <small>
                  문의와 로그인에는 인터넷 연결이 필요해요. 아이디어 본문은
                  인증·문의 서비스로 보내지 않아요.
                </small>
              </div>
            </section>
          )}
          <footer>
            IDEA NOTE <span>작은 생각이, 다음 시작이 되도록.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
