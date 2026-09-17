// 게임 코어 진입점 — createGame 하나. 메뉴·트레이·CLI·확장은 이 객체만 본다 (design.md "메뉴와 코어")
//
// 두 역할 중 하나로 산다
//   writer  save.lock 을 잡은 프로세스. 메모리의 state 가 진실이고 바뀔 때 save.json 에 쓴다. mailbox 요청도 여기가 처리
//   reader  lock 을 못 잡은 펫·CLI. 파일을 다시 읽어 snapshot 을 만들고, 행위는 mailbox 로 writer 에 넘긴다
// writer:true 로 만들면 잡아 보고, 못 잡으면 reader 로 시작해 매 tick 다시 잡아 본다 — 앞의 writer 가 끝나면 자연히 이어받는다.
// 독립 펫 우선 같은 우선순위는 부르는 쪽(main.js)이 resign()·claim() 으로 정한다
//
// 매 tick 파일을 쓰지 않는다 — 누적기(10분·1분이 차기 전)만 움직인 틱은 메모리에만 두고(dirty), 값이 바뀌거나 close 때 쓴다
const fs = require("fs");
const path = require("path");
const economy = require("./economy");
const save = require("./save");
const writer = require("./writer");
const mailbox = require("./mailbox");

const { RULES } = economy;
const MAILBOX_CMDS = new Set(["feed", "play", "poke", "switch", "snapshot"]);
const ACTS = new Set(["feed", "play", "poke", "switch", "evolve"]);

// paths   { save, mailbox, saveLock } — config.js PATHS 를 그대로 넘기면 된다
// writer  true 면 lock 을 잡아 본다. false 면 읽기 전용 (CLI status 등)
// now     시계 — 시험에서 주입한다. mailbox 는 다른 프로세스와 견주므로 실제 시계를 쓴다
// log     디버그 출력 함수 (없으면 조용히)
// from    mailbox 요청에 적는 보낸 이 (cli · vscode · pet)
function createGame({ paths, writer: wantWriter = true, now = Date.now, log = null, from = "pet" } = {}) {
  if (!paths || !paths.save || !paths.mailbox || !paths.saveLock) throw new Error("createGame: paths.save·mailbox·saveLock 이 필요하다");

  let state = null; // writer 일 때의 진실
  let corrupted = false; // 마지막 읽기에서 파손을 만나 .bak 으로 옮겼다
  let amWriter = false;
  let dirty = false; // 메모리가 파일보다 새롭다 (누적기만) — close·다음 쓰기 때 내려간다
  let lastTickAt = null;
  let lastAgent = null;
  let server = null; // mailbox.serve
  let readerWatch = null; // 읽기 전용의 파일 감시
  let cache = { key: null, state: null, corrupted: false }; // 읽기 전용 캐시 — mtime·크기가 같으면 다시 파싱하지 않는다
  const listeners = new Set();
  let closed = false;

  const snapshotOf = (s, extra) => (s ? { ...economy.view(s, now()), writer: amWriter, corrupted, ...extra } : null);

  function emit() {
    if (!listeners.size) return;
    const snap = snapshot();
    for (const cb of listeners) {
      try {
        cb(snap);
      } catch (e) {
        log?.({ game: "listener-error", error: String(e && e.message) });
      }
    }
  }

  // ── writer 쪽 ──────────────────────────────────────────────────────────────

  function load() {
    const r = save.read(paths.save, { repair: true });
    state = r.state;
    corrupted = r.corrupted === true;
    if (corrupted) log?.({ game: "save-corrupted", movedTo: `${paths.save}.bak` });
  }

  function persist() {
    if (!amWriter || !state) return false;
    const ok = save.write(paths.save, state);
    if (ok) dirty = false;
    else log?.({ game: "save-write-failed" });
    emit();
    return ok;
  }

  // writer 가 직접 처리하는 행위 — mailbox 로 들어온 요청도 여기로 온다
  function actLocal(kind, args) {
    if (!state || !economy.activePet(state)) return { ok: false, kind, reason: state ? "no-pet" : "no-save" };
    const at = now();
    let r;
    if (kind === "switch") r = economy.switchPet(state, at, String(args.key ?? args.pet ?? ""));
    else if (kind === "feed" || kind === "play" || kind === "poke") r = economy.interact(state, at, kind);
    else return { ok: false, kind, reason: "unknown-cmd" };
    if (r.state !== state) {
      state = r.state;
      persist();
    }
    return r.result;
  }

  function handleMail(cmd, args) {
    if (!MAILBOX_CMDS.has(cmd)) return { ok: false, kind: cmd, reason: "unknown-cmd" };
    if (cmd === "snapshot") return { ok: true, kind: cmd, reason: "ok", snapshot: snapshot() };
    return actLocal(cmd, args && typeof args === "object" ? args : {});
  }

  function startServer() {
    if (server) return;
    server = mailbox.serve(paths.mailbox, handleMail, { log });
  }

  function stopServer() {
    server?.close();
    server = null;
  }

  // ── reader 쪽 ──────────────────────────────────────────────────────────────

  function readCached() {
    let key = null;
    try {
      const st = fs.statSync(paths.save);
      key = `${st.mtimeMs}:${st.size}`;
    } catch {
      cache = { key: null, state: null, corrupted: false };
      return cache;
    }
    if (cache.key === key) return cache;
    const r = save.read(paths.save, { repair: false }); // 읽기 전용은 파손 파일을 옮기지 않는다 — writer 의 일
    if (r.reason === "unreadable") return cache; // 잠김 — 지난 값을 그대로
    cache = { key, state: r.state, corrupted: r.corrupted === true };
    return cache;
  }

  // save.json 이 있는 폴더를 본다 — 파일을 직접 보면 rename 뒤 끊긴다. 이름이 맞는 이벤트만
  function startReader() {
    if (readerWatch) return;
    const dir = path.dirname(paths.save);
    const base = path.basename(paths.save);
    let pending = false;
    let watcher = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      watcher = fs.watch(dir, (_event, filename) => {
        if (pending || closed) return;
        if (filename && filename !== base) return;
        pending = true;
        setImmediate(() => {
          pending = false;
          if (!closed && !amWriter) emit();
        });
      });
      watcher.on("error", () => {
        // 폴더가 사라졌다 — snapshot 은 부를 때마다 파일을 읽으니 값은 맞다. 알림만 끊긴다
      });
    } catch {
      watcher = null;
    }
    readerWatch = {
      close() {
        try {
          watcher?.close();
        } catch {
          // 이미 닫혔다
        }
      },
    };
  }

  function stopReader() {
    readerWatch?.close();
    readerWatch = null;
  }

  // ── 역할 전환 ──────────────────────────────────────────────────────────────

  // writer 가 되어 본다 — 성공하면 파일을 진실로 다시 읽고 mailbox 를 연다
  function claim() {
    if (closed) return false;
    if (amWriter && writer.isMine(paths.saveLock)) return true;
    const r = writer.claim(paths.saveLock);
    if (!r.ok) {
      if (amWriter) resign(); // 들고 있던 줄 알았는데 남이 가졌다
      return false;
    }
    if (amWriter) return true; // lock 파일만 사라졌던 것 — 다시 적었고 메모리 상태가 여전히 진실
    amWriter = true;
    stopReader();
    load();
    startServer();
    lastTickAt = null;
    lastAgent = null;
    emit();
    return true;
  }

  // writer 를 그만둔다 — 남은 것을 쓰고 lock 을 놓고 읽기 전용으로. 다른 펫(독립 펫)에 자리를 내줄 때
  function resign() {
    if (amWriter) {
      if (dirty) save.write(paths.save, state);
      stopServer();
      writer.release(paths.saveLock);
    }
    amWriter = false;
    state = null;
    dirty = false;
    if (!closed) startReader();
  }

  // ── 밖에 내는 것 ──────────────────────────────────────────────────────────

  const hasSave = () => {
    try {
      return fs.statSync(paths.save).isFile();
    } catch {
      return false;
    }
  };

  // 스타터로 시작 — writer 만. 이미 파티가 있으면 exists
  function start(slug) {
    if (!amWriter) return { ok: false, kind: "start", reason: "not-writer" };
    if (state && Object.keys(state.party).length) return { ok: false, kind: "start", reason: "exists" };
    const r = economy.start(null, now(), slug);
    if (!r.result.ok) return r.result;
    state = r.state;
    corrupted = false;
    persist();
    return r.result;
  }

  // 한 틱 — 10초마다, 그리고 에이전트 상태가 바뀐 순간에도 부른다 (waving 은 4초만 머물러 10초 틱으로는 놓친다)
  //   at       시각(ms). 기본 now()
  //   visible  펫이 보이는가
  //   agent    lib/state 가 준 상태 문자열 — idle · running · waiting · waving · failed
  function tick(at = now(), { visible = false, agent = "idle" } = {}) {
    if (closed) return { ok: false, reason: "closed" };
    if (!amWriter) {
      if (wantWriter) claim(); // 앞의 writer 가 끝났으면 이어받는다
      if (!amWriter) return { ok: false, reason: "not-writer" };
    } else if (!writer.isMine(paths.saveLock) && !claim()) {
      return { ok: false, reason: "not-writer" };
    }
    const elapsed = lastTickAt == null ? 0 : Math.min(Math.max(0, at - lastTickAt), RULES.io.maxElapsedMs);
    const prevAgent = lastAgent == null ? agent : lastAgent;
    lastTickAt = at;
    lastAgent = agent;
    if (!state) return { ok: false, reason: "no-save" };
    const r = economy.tick(state, at, { elapsed, visible, agent, prevAgent });
    if (r.state !== state) {
      state = r.state;
      if (r.result.changed) persist();
      else dirty = true;
    }
    return r.result;
  }

  // 행위 — feed · play · poke · switch(key) · evolve(M3 자리). writer 가 아니면 mailbox 로 넘긴다. 항상 Promise
  async function act(kind, args = {}) {
    const a = typeof args === "string" ? { key: args } : args && typeof args === "object" ? args : {};
    if (!ACTS.has(kind)) return { ok: false, kind, reason: "unknown-cmd" };
    if (kind === "evolve") return { ok: false, kind, reason: "not-yet" };
    if (closed) return { ok: false, kind, reason: "closed" };
    if (amWriter) return actLocal(kind, a);
    return mailbox.send(paths.mailbox, kind, a, { from });
  }

  // 메뉴·설정창·status 가 읽는 값 — 저장이 없으면 null
  function snapshot() {
    if (amWriter) return snapshotOf(state);
    const c = readCached();
    return c.state ? snapshotOf(c.state, { corrupted: c.corrupted }) : null;
  }

  // 저장이 바뀔 때 — writer 는 쓸 때, 읽기 전용은 파일 감시로. 해제 함수를 돌려준다
  function onChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function close() {
    if (closed) return;
    if (amWriter) {
      if (dirty && state) save.write(paths.save, state);
      stopServer();
      writer.release(paths.saveLock);
      amWriter = false;
    }
    stopReader();
    listeners.clear();
    closed = true;
  }

  if (wantWriter) claim();
  if (!amWriter) startReader();

  return {
    hasSave,
    start,
    tick,
    act,
    snapshot,
    onChange,
    close,
    claim,
    resign,
    isWriter: () => amWriter,
    get corrupted() {
      return amWriter ? corrupted : readCached().corrupted;
    },
  };
}

module.exports = { createGame, RULES, STARTERS: economy.STARTERS };
