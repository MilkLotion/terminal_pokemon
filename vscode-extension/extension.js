// 이 VS Code 창의 상태를 창마다 자기 파일 하나에 기록한다
//   ~/.claude/pokebuddy/windows/<sessionId>-<확장호스트PID>.json
// 펫은 이 기록으로 "내 터미널 탭이 지금 활성인가"만 판단한다.
// 어느 창이 화면 맨 앞인지는 펫이 OS 에 직접 묻는다 — 그건 파일로 주고받지 않는다.
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const WINDOWS_DIR = path.join(os.homedir(), ".claude", "pokebuddy", "windows");
const STALE_SEC = 600; // 이보다 오래된 남의 창 기록은 청소 대상
const HEARTBEAT_MS = 10_000;

// 파일명에 쓸 수 없는 문자를 막는다 — sessionId 형식은 계약으로 보장된 값이 아니다
const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "");
const MY_FILE = path.join(WINDOWS_DIR, `${safe(vscode.env.sessionId)}-${process.pid}.json`);

let lastAt = 0; // 비동기 완료 순서가 뒤집혀 낡은 내용이 덮어쓰는 것을 막는다

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // 남의 소유 프로세스 — 살아 있다
  }
}

async function write() {
  try {
    // at 은 await 이전에 찍는다 — 이벤트 발생 시각이어야 순서 비교가 맞는다
    const at = Date.now() / 1000;
    const focused = vscode.window.state.focused;
    const terminal = vscode.window.activeTerminal;

    const activeTerminal = terminal ? await terminal.processId.catch(() => null) : null;
    const terminals = (
      await Promise.all(vscode.window.terminals.map((t) => Promise.resolve(t.processId).catch(() => null)))
    ).filter((p) => typeof p === "number");

    if (at < lastAt) return; // 더 최근 기록이 이미 나갔다
    lastAt = at;

    fs.mkdirSync(WINDOWS_DIR, { recursive: true });
    const payload = {
      v: 2,
      windowId: vscode.env.sessionId,
      hostPid: process.pid, // 펫이 "이 창이 아직 살아 있나"를 확인하는 데 쓴다
      remote: vscode.env.remoteName || null,
      activeTerminal: typeof activeTerminal === "number" ? activeTerminal : null,
      terminals,
      focused, // 포커스가 없어도 false 로 반드시 기록한다 — 안 쓰면 "뒤에 있음"과 "죽음"이 구분되지 않는다
      at,
    };
    const tmp = `${MY_FILE}.tmp`;
    // Windows 는 읽는 쪽이 파일을 열고 있으면 rename 이 막힌다 — 잠깐 뒤 다시 시도
    for (let i = 0; i < 3; i++) {
      try {
        fs.writeFileSync(tmp, JSON.stringify(payload));
        fs.renameSync(tmp, MY_FILE);
        return;
      } catch (e) {
        if (i === 2 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  } catch {
    // 기록 실패는 무시 — 펫은 탭 구분 없이 동작한다
  }
}

// 죽은 창이 남긴 기록 청소 — 강제 종료되면 deactivate 가 불리지 않는다
function sweep() {
  try {
    const now = Date.now() / 1000;
    for (const name of fs.readdirSync(WINDOWS_DIR)) {
      const file = path.join(WINDOWS_DIR, name);
      if (name.endsWith(".tmp")) {
        fs.unlinkSync(file);
        continue;
      }
      if (!name.endsWith(".json") || file === MY_FILE) continue;
      let rec;
      try {
        rec = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        fs.unlinkSync(file); // 파손 파일
        continue;
      }
      const dead = rec.hostPid ? !alive(rec.hostPid) : now - (rec.at || 0) > STALE_SEC;
      if (dead) fs.unlinkSync(file);
    }
  } catch {
    // 청소 실패는 무시
  }
}

function activate(context) {
  fs.mkdirSync(WINDOWS_DIR, { recursive: true });
  sweep();
  write();
  const heartbeat = setInterval(write, HEARTBEAT_MS);
  context.subscriptions.push(
    { dispose: () => clearInterval(heartbeat) },
    vscode.window.onDidChangeActiveTerminal(() => write()),
    vscode.window.onDidOpenTerminal(() => write()),
    vscode.window.onDidCloseTerminal(() => write()),
    vscode.window.onDidChangeWindowState(() => write()), // blur 도 여기서 기록된다
  );
}

function deactivate() {
  try {
    fs.unlinkSync(MY_FILE);
  } catch {
    // 이미 없으면 그만
  }
}

module.exports = { activate, deactivate };
