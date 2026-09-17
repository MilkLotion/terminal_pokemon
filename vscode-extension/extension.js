// 이 VS Code 창의 상태를 창마다 자기 파일 하나에 기록하고, 이 창의 펫을 띄운다
//   ~/.claude/pokebuddy/windows/<sessionId>-<확장호스트PID>.json
// 펫은 이 기록으로 "내 터미널 탭이 지금 활성인가"(세션 펫) · "이 창의 활성 터미널은 누구인가"(창 펫)를 판단한다.
// 어느 창이 화면 맨 앞인지는 펫이 OS 에 직접 묻는다 — 그건 파일로 주고받지 않는다.
//
// 창 펫 — 창마다 Electron 을 하나 직접 띄운다 (pokebuddy setup 이 적어 둔 ~/.claude/pokebuddy/cli.json 의 경로로).
//   PATH 를 쓰지 않는다: Dock 으로 띄운 VS Code 의 확장 호스트는 npm 전역 폴더가 PATH 에 없고 Node 버전도 다르다.
//   펫에는 이 확장 호스트의 pid 를 넘긴다 — 펫이 그걸로 자기 창 기록을 찾고, 이 프로세스가 끝나면 함께 끝난다.
//   독립 동반자(pokebuddy companion)가 떠 있으면 띄우지 않는다 — 그 한 마리가 모든 창을 따른다. 동반자가 내려가면 되살린다
const vscode = require("vscode");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HOME = path.join(os.homedir(), ".claude", "pokebuddy");
const WINDOWS_DIR = path.join(HOME, "windows");
const CLI_FILE = path.join(HOME, "cli.json"); // { electron, project, version } — pokebuddy setup 이 적는다
const LOCK_FILE = path.join(HOME, "companion.lock"); // 독립 동반자의 pid
const PETS_DIR = path.join(os.tmpdir(), "pokebuddy-pets"); // 창 펫의 pid 파일 w-<호스트 pid>-<펫 pid>.pid (config.js windowPetFile)
const STALE_SEC = 600; // 이보다 오래된 남의 창 기록은 청소 대상
const HEARTBEAT_MS = 10_000;
// 이 호스트가 살아 있는 동안 펫을 띄워 보는 최대 횟수 — 그림을 못 받아 곧바로 끝나는 펫(exit 3)을 10초마다 다시 띄우지 않게
const MAX_LAUNCHES = 3;

// 파일명에 쓸 수 없는 문자를 막는다 — sessionId 형식은 계약으로 보장된 값이 아니다
const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, "");
const MY_FILE = path.join(WINDOWS_DIR, `${safe(vscode.env.sessionId)}-${process.pid}.json`);

let lastAt = 0; // 비동기 완료 순서가 뒤집혀 낡은 내용이 덮어쓰는 것을 막는다
let launches = 0; // 이 호스트에서 펫을 띄운 횟수
let stopped = false; // 사용자가 "이 창의 펫 내리기"를 골랐다 — 다시 띄우기 명령 전까지 심장박동이 되살리지 않는다
let warnedMissing = false; // 실행 파일이 없다는 알림은 한 번만

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
      hostPid: process.pid, // 펫이 "이 창이 아직 살아 있나"를 확인하고, 창 펫이 자기 창 기록을 찾는 데 쓴다
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

// ── 창 펫 띄우기

const autoLaunch = () => vscode.workspace.getConfiguration("pokebuddy").get("autoLaunch", true);

function readCli() {
  try {
    const data = JSON.parse(fs.readFileSync(CLI_FILE, "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null; // setup 을 아직 안 했다
  }
}

// 독립 동반자가 살아 있나 — 파일 존재가 아니라 안에 적힌 pid 의 생존으로 본다 (크래시가 남긴 lock 에 막히지 않게)
function companionAlive() {
  try {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8").split("\n")[0]);
    return pid > 0 && alive(pid);
  } catch {
    return false;
  }
}

// 이 창(호스트)의 펫 pid 파일들 — 살아 있는 것만
function myPetFiles() {
  try {
    return fs
      .readdirSync(PETS_DIR)
      .map((f) => ({ f, m: f.match(/^w-(\d+)-(\d+)\.pid$/) }))
      .filter(({ m }) => m && Number(m[1]) === process.pid && alive(Number(m[2])))
      .map(({ f }) => path.join(PETS_DIR, f));
  } catch {
    return [];
  }
}

// 펫을 띄운다. manual 이면(명령 팔레트) 왜 안 띄웠는지 알린다 — 자동 경로는 조용히 넘어간다
function launch({ manual = false } = {}) {
  const tell = (msg) => manual && vscode.window.showInformationMessage(msg);
  const cli = readCli();
  if (!cli || !cli.electron || !cli.project) {
    tell("pokebuddy 가 설치되지 않았다 — 터미널에서 npm install -g pokebuddy 뒤 pokebuddy setup");
    return false;
  }
  if (!fs.existsSync(cli.electron) || !fs.existsSync(cli.project)) {
    // nvm 정리 등으로 경로가 사라졌다 — setup 을 다시 돌려야 한다. 자동 경로에서는 한 번만 알린다
    if (manual || !warnedMissing) {
      warnedMissing = true;
      vscode.window.showWarningMessage(`pokebuddy 실행 파일이 없다 (${cli.electron}) — 터미널에서 pokebuddy setup 을 다시 실행`);
    }
    return false;
  }
  if (companionAlive()) {
    tell("독립 동반자가 이미 모든 창을 따르고 있다 — 창 펫을 쓰려면 pokebuddy companion stop");
    return false;
  }
  if (myPetFiles().length) {
    tell("이 창의 펫이 이미 떠 있다");
    return false;
  }
  if (!manual && launches >= MAX_LAUNCHES) return false;
  launches += 1;
  const env = {
    ...process.env,
    POKEBUDDY_MODE: "window",
    POKEBUDDY_HOST_PID: String(process.pid),
    // 창 주인(VS Code 메인)을 찾는 조상 — 확장 호스트의 부모가 메인이다. 펫이 스스로 구하면 부모 관계가 끊겨 있다
    POKEBUDDY_ANCESTORS: `${process.pid},${process.ppid}`,
  };
  try {
    // 출력을 물려주지 않고 따로 띄운다 — 이 호스트가 끝나도 펫은 스스로(hostPid 사망) 끝난다
    const child = spawn(cli.electron, [cli.project], { env, detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

// 이 창의 펫을 내린다 — pid 파일을 지우면 펫이 보고 스스로 끝난다. 다시 띄우기 명령 전까지 되살리지 않는다
function stop({ manual = false } = {}) {
  stopped = true;
  const files = myPetFiles();
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch {
      // 이미 없다
    }
  }
  if (manual) vscode.window.showInformationMessage(files.length ? "이 창의 펫을 내렸다" : "이 창에 떠 있는 펫이 없다");
}

// 심장박동마다 — 자동 띄우기가 켜져 있고, 내리라고 한 적 없고, 동반자도 내 펫도 없으면 띄운다.
// 독립 동반자가 내려간 뒤 창 펫이 돌아오는 길이고, 크래시로 남은 lock 은 pid 생존으로 걸러진다
function ensurePet() {
  if (!autoLaunch() || stopped) return;
  launch();
}

function activate(context) {
  fs.mkdirSync(WINDOWS_DIR, { recursive: true });
  sweep();
  // 첫 기록이 나간 뒤에 펫을 띄운다 — 펫은 뜨자마자 hostPid 로 자기 창 기록을 찾는다
  write().then(() => ensurePet());
  const heartbeat = setInterval(() => {
    write();
    ensurePet();
  }, HEARTBEAT_MS);
  context.subscriptions.push(
    { dispose: () => clearInterval(heartbeat) },
    vscode.window.onDidChangeActiveTerminal(() => write()),
    vscode.window.onDidOpenTerminal(() => write()),
    vscode.window.onDidCloseTerminal(() => write()),
    vscode.window.onDidChangeWindowState(() => write()), // blur 도 여기서 기록된다
    vscode.commands.registerCommand("pokebuddy.launch", () => {
      stopped = false;
      launches = 0; // 사용자가 직접 청했다 — 자동 횟수 상한을 다시 준다
      if (launch({ manual: true })) vscode.window.showInformationMessage("이 창에 펫을 띄운다");
    }),
    vscode.commands.registerCommand("pokebuddy.stop", () => stop({ manual: true })),
  );
}

function deactivate() {
  // 펫은 이 호스트가 끝나는 것(hostPid 사망)과 기록이 사라지는 것 둘 다 보고 끝난다 — 따로 죽이지 않는다
  try {
    fs.unlinkSync(MY_FILE);
  } catch {
    // 이미 없으면 그만
  }
}

module.exports = { activate, deactivate };
