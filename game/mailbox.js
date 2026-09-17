// 명령 통로 — mailbox/ 폴더의 파일 하나 = 요청 하나 (config.js PATHS.mailbox)
//
// 소켓·IPC 서버 없이 파일로만 (저장소 원칙). CLI·확장·읽기 전용 펫이 요청을 두고, writer 펫이 처리해 회신한다.
//   요청  <시각>-<pid>-<cmd>.json          { cmd, args, from, at }   — tmp 에 쓰고 rename (반쪽 파일을 읽지 않게)
//   회신  <시각>-<pid>-<cmd>.result.json   처리 결과 그대로          — 보낸 쪽이 받으면 지운다
// writer 는 fs.watch (main.js watchRecords 의 pending 디바운스) + 5초 폴링 보강으로 폴더를 본다.
// 파손 요청은 지운다. 60초 넘은 회신은 청소한다. 60초 넘은 요청도 처리하지 않고 지운다 — 죽은 writer 가 남긴 어제의 밥을 주지 않게
// 시각은 여기서만 실제 시계(Date.now) — 다른 프로세스가 쓴 at·mtime 과 견주므로 주입한 시계를 쓰면 어긋난다
const fs = require("fs");
const path = require("path");
const { RULES } = require("./economy");
const { writeAtomic } = require("./save");

const REQUEST = /^(\d+)-(\d+)-([A-Za-z][\w-]*)\.json$/;
const RESULT = /\.result\.json$/;
const CMD = /^[A-Za-z][\w-]*$/;

const requestName = (at, pid, cmd) => `${at}-${pid}-${cmd}.json`;
const resultName = (name) => name.replace(/\.json$/, ".result.json");

function unlinkQuiet(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // 이미 없다
  }
}

// 요청을 두고 결과를 기다린다 — { ok, ... } 또는 { ok:false, reason:"timeout" }. 절대 throw 하지 않는다
//   from  누가 보냈나 (cli · vscode · pet) — writer 가 기록·디버그에 쓴다
function send(dir, cmd, args = {}, { timeoutMs = RULES.io.sendTimeoutMs, pollMs = RULES.io.sendPollMs, from = "unknown" } = {}) {
  return new Promise((resolve) => {
    if (!CMD.test(String(cmd))) return resolve({ ok: false, kind: String(cmd), reason: "bad-cmd" });
    const at = Date.now();
    const name = requestName(at, process.pid, cmd);
    const file = path.join(dir, name);
    const resultFile = path.join(dir, resultName(name));
    if (!writeAtomic(file, { cmd, args, from, at })) return resolve({ ok: false, kind: cmd, reason: "send-failed" });

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(timer);
      resolve(value);
    };
    const poll = setInterval(() => {
      let data;
      try {
        data = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      } catch {
        return; // 아직 없다 · 쓰는 중
      }
      unlinkQuiet(resultFile);
      finish(data && typeof data === "object" ? data : { ok: false, kind: cmd, reason: "bad-result" });
    }, pollMs);
    const timer = setTimeout(() => {
      unlinkQuiet(file); // 요청 회수 — writer 가 없거나 늦다. 나중에 처리돼 밥이 두 번 가지 않게
      finish({ ok: false, kind: cmd, reason: "timeout" });
    }, timeoutMs);
  });
}

// 폴더를 지켜보며 요청을 처리한다 — handle(cmd, args, meta) 의 반환(값 또는 Promise)이 회신이 된다.
// 돌려주는 { scan, close } — close 는 감시·폴링을 멈춘다
function serve(dir, handle, { log = null } = {}) {
  let closed = false;
  let busy = false;
  let again = false;
  let pending = false;

  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // 폴더를 못 만들면 폴링이 매번 빈손 — 조용히
  }

  async function handleRequest(name) {
    const file = path.join(dir, name);
    let req;
    try {
      req = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      unlinkQuiet(file); // 파손 — 지운다
      return;
    }
    unlinkQuiet(file); // 먼저 지운다 — 처리 중 다시 스캔돼도 두 번 하지 않게
    if (!req || typeof req.cmd !== "string") return;
    if (typeof req.at === "number" && Date.now() - req.at > RULES.io.requestTtlMs) return; // 오래된 요청은 버린다
    let result;
    try {
      result = await handle(req.cmd, req.args == null ? {} : req.args, { from: req.from, at: req.at, name });
    } catch (e) {
      log?.({ mailbox: "handle-error", cmd: req.cmd, error: String(e && e.message) });
      result = { ok: false, kind: req.cmd, reason: "error" };
    }
    writeAtomic(path.join(dir, resultName(name)), result == null ? { ok: false, kind: req.cmd, reason: "no-result" } : result);
  }

  function sweepResult(name) {
    const file = path.join(dir, name);
    try {
      if (Date.now() - fs.statSync(file).mtimeMs > RULES.io.resultTtlMs) fs.unlinkSync(file);
    } catch {
      // 사이에 가져갔다
    }
  }

  async function scan() {
    if (closed) return;
    if (busy) {
      again = true; // 처리 중 새 요청이 왔다 — 끝나고 한 번 더
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        let names = [];
        try {
          names = fs.readdirSync(dir).sort();
        } catch {
          names = [];
        }
        for (const name of names) {
          if (closed) break;
          if (RESULT.test(name)) sweepResult(name);
          else if (REQUEST.test(name)) await handleRequest(name);
        }
      } while (again && !closed);
    } catch (e) {
      log?.({ mailbox: "scan-error", error: String(e && e.message) });
    } finally {
      busy = false;
    }
  }

  // tmp+rename 은 이벤트를 여러 번 낸다 — 한 틱으로 묶는다 (main.js watchRecords)
  const onEvent = () => {
    if (pending || closed) return;
    pending = true;
    setImmediate(() => {
      pending = false;
      scan();
    });
  };
  let watcher = null;
  try {
    watcher = fs.watch(dir, onEvent);
    watcher.on("error", () => {
      // 폴더가 사라졌다 — 폴링이 이어 간다
    });
  } catch {
    watcher = null;
  }
  const timer = setInterval(scan, RULES.io.mailboxPollMs);
  scan(); // 떠 있는 동안 쌓인 요청부터

  return {
    scan,
    close() {
      closed = true;
      clearInterval(timer);
      try {
        watcher?.close();
      } catch {
        // 이미 닫혔다
      }
    },
  };
}

module.exports = { send, serve, requestName, resultName, REQUEST, RESULT };
