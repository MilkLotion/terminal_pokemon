// 펫(main.js)과 진단 도구(bin/termimon-status)가 똑같은 판정을 쓰도록 공통 부분만 모은 곳
// 로직이 두 벌이 되면 진단이 실제와 다른 답을 낸다 — 그래서 여기 한 곳에만 둔다
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const WINDOW_STALE_SEC = 120; // 창 기록이 이만큼 멈추면 죽은 것으로 (1차 판정은 hostPid 생존)
const STALE_SEC = 600; // 작업 중·기다림이 이만큼 갱신 없으면 대기로 — Esc 중단 시 Stop 훅이 안 온다

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM"; // 남의 소유 프로세스 — 살아 있다
  }
}

// pid → 부모 pid 표. 기동 시 한 번만 쓰므로 비용은 문제되지 않는다
// 실행 파일 이름도 함께 담는다 (parent.names) — 창 주인 찾기가 셸(explorer)에서 멈추고,
// 세션 주인(CLI LLM)을 그 사이에 낀 명령 셸(bash 등)과 가르는 데 쓴다.
// Windows 는 실행 파일 경로도 담는다 (parent.paths) — 끊긴 Git Bash 체인을 이을 ps.exe 를 찾는 데 쓴다 (msysParent)
function parentMap() {
  const parent = new Map();
  parent.names = new Map();
  if (process.platform === "win32") {
    parent.paths = new Map();
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath | ForEach-Object { \"$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)|$($_.ExecutablePath)\" }",
      ],
      // 펫은 콘솔이 없는 GUI 프로세스다 — 숨기지 않으면 부를 때마다 PowerShell 창이 번쩍 뜬다
      { encoding: "utf8", windowsHide: true, timeout: 15000 },
    );
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\|(\d+)\|([^|]*)\|(.*)$/);
      if (!m) continue;
      parent.set(Number(m[1]), Number(m[2]));
      parent.names.set(Number(m[1]), m[3]);
      if (m[4]) parent.paths.set(Number(m[1]), m[4]);
    }
    return parent;
  }
  // comm 은 경로라 공백이 들어갈 수 있다 (…/Code Helper) — 앞의 두 숫자 뒤는 통째로 이름
  const out = execFileSync("ps", ["-Ao", "pid=,ppid=,comm="], { encoding: "utf8" });
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s*(.*)$/);
    if (!m) continue;
    parent.set(Number(m[1]), Number(m[2]));
    parent.names.set(Number(m[1]), m[3]);
  }
  return parent;
}

// 조상 번호들 — 가까운 것부터. 터미널 탭을 맞히고, 창 주인을 찾는 데 쓴다
// parent 를 주면 프로세스 표를 다시 읽지 않는다 (이름까지 같은 표로 봐야 할 때)
// 부모가 이미 끝나 체인이 끊기면 Git Bash 가 기억하는 부모로 이어 본다 (msysParent).
// 여러 번 끊길 수 있다 — sh 래퍼를 timeout 같은 MSYS 명령이 한 번 더 감싸면 그 명령도 부모가 끊겨 있다
function ancestorPids(from = process.pid, parent = null) {
  try {
    if (!parent) parent = parentMap();
    const chain = [];
    let msys; // MSYS 프로세스 표 — 처음 끊긴 곳에서 한 번만 읽는다
    let pid = from;
    for (let i = 0; i < 40 && pid > 1; i++) {
      chain.push(pid);
      let next = parent.get(pid) || 0;
      // 끊긴 곳이 MSYS 프로세스일 때만 — 체인 꼭대기(explorer 의 끝난 부모)마다 ps.exe 를 돌리지 않게
      if (!parent.has(next) && isMsysProcess(pid, parent)) {
        if (msys === undefined) msys = msysTable(chain, parent);
        const up = msys && msysParent(chain, msys, parent);
        if (up != null) next = up;
      }
      pid = next;
    }
    return chain;
  } catch {
    return [];
  }
}

// Git Bash(MSYS) 가 셸 스크립트를 실행하면 Windows 쪽 부모 관계가 끊긴다.
// 예: Git Bash 탭에서 npm 의 codex(sh 스크립트)를 실행하면
//   Windows 표  node(codex.js) → sh.exe → (이미 끝난 중간 프로세스)          — 터미널에 닿지 않는다
//   MSYS 표     node(codex.js) → bash(Git\usr\bin) → bash(Git\bin, 터미널 탭)  — MSYS 는 자기 번호로 부모를 기억한다
// 체인의 MSYS 프로세스 옆 ps.exe 로 MSYS 표를 읽고(msysTable), 체인의 어느 프로세스든 MSYS 부모가
// 체인 밖에 살아 있으면 그 번호를 돌려준다(msysParent). 못 찾으면 null — Git Bash 가 끼지 않은 체인
// MSYS 프로세스 — 실행 파일 옆에 msys-2.0.dll 이 있다 (Git\usr\bin\sh.exe·bash.exe 등). 그 폴더를 돌려준다
function msysDirOf(pid, parent) {
  const file = parent.paths && parent.paths.get(pid);
  if (!file) return null;
  const dir = path.dirname(file);
  return fs.existsSync(path.join(dir, "msys-2.0.dll")) ? dir : null;
}
const isMsysProcess = (pid, parent) => msysDirOf(pid, parent) != null;

// 반환: { byMsys, byWin } — 못 읽으면 null
function msysTable(chain, parent) {
  const dir = chain.map((pid) => msysDirOf(pid, parent)).find((d) => d && fs.existsSync(path.join(d, "ps.exe")));
  if (!dir) return null;
  let out;
  try {
    out = execFileSync(path.join(dir, "ps.exe"), ["-l"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
  } catch {
    return null;
  }
  // PID PPID PGID WINPID TTY … — 맨 앞에 상태 글자(I·S·O)가 붙는 줄이 있다
  const byMsys = new Map();
  const byWin = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/^\s*[A-Z]?\s*(\d+)\s+(\d+)\s+\d+\s+(\d+)\s/);
    if (!m) continue;
    const row = { msys: Number(m[1]), ppid: Number(m[2]), win: Number(m[3]) };
    byMsys.set(row.msys, row);
    byWin.set(row.win, row);
  }
  return { byMsys, byWin };
}

function msysParent(chain, table, parent) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const me = table.byWin.get(chain[i]);
    const up = me && table.byMsys.get(me.ppid);
    if (up && !chain.includes(up.win) && parent.has(up.win)) return up.win;
  }
  return null;
}

// 체인을 터미널 셸에서 자른 집합. 그 위(IDE 프로세스·launchd)는 같은 창의 다른 탭과 공유하므로,
// 끝까지 쓰면 남의 터미널 기록까지 내 것으로 잡힌다
function pidsUpTo(chain, termPid) {
  if (!termPid) return new Set(chain); // 터미널 번호를 모름 — termimon 없이 실행된 경우 (npm start)
  const cut = chain.indexOf(termPid);
  return new Set(cut >= 0 ? chain.slice(0, cut + 1) : [termPid]);
}

function myPidsFor(termPid, from = process.pid) {
  return pidsUpTo(ancestorPids(from), termPid);
}

// 터미널 셸 번호를 확장 기록으로 바로잡는다 — 조상 중 어느 창의 터미널 목록에 든 가장 가까운 번호가 진짜 탭이다.
// termimon 이 넘긴 번호(부모 프로세스)는 사이에 무엇이 끼면 틀린다: 셸 안에서 bash 를 한 번 더 띄운 경우,
// Git Bash 의 런처, Volta·Scoop 같은 실행 파일 심. 틀리면 활성 탭 번호가 내 체인에 없어 펫이 영영 숨는다.
// 원격 창(SSH·WSL·컨테이너)의 번호는 다른 컴퓨터·네임스페이스의 것이라 대조하지 않는다.
// 반환: 찾은 번호, 못 찾으면 null (펫 자신 chain[0] 은 보지 않는다)
function terminalFromRecords(chain, records) {
  const listed = new Set(records.filter((r) => !r.remote).flatMap((r) => (Array.isArray(r.terminals) ? r.terminals : [])));
  const found = chain.slice(1).find((pid) => listed.has(pid));
  return found == null ? null : found;
}

// 명령을 받아 실행만 하는 프로세스 — 세션 주인을 찾을 때 건너뛴다.
// CLI LLM 은 ! 명령을 셸로 돌리고(claude 는 bash, codex·gemini 는 Windows 에서 PowerShell),
// Windows Git Bash 는 셸 한 겹이 bash.exe 여러 개로 보인다
const COMMAND_SHELLS = new Set([
  "sh", "bash", "zsh", "fish", "dash", "ksh", "mksh", "tcsh", "csh", "nu", "xonsh", "elvish",
  "cmd", "powershell", "pwsh", "env", "sandbox-exec", "winpty",
]);
// "/bin/zsh" · "-zsh"(로그인 셸) · "bash.exe" → 소문자 이름만
const isCommandShell = (name) =>
  COMMAND_SHELLS.has(String(name || "").split(/[\\/]/).pop().replace(/^-/, "").replace(/\.exe$/i, "").toLowerCase());

// 이 명령을 실행한 세션 — { host, term }
//   host  펫이 따라 살고 죽을 프로세스 (CLI LLM). 셸에서 바로 쳤으면 null
//   term  터미널 탭의 셸 — 첫 추정이다. 확장 기록이 있으면 terminalFromRecords 로 바로잡는다
//
// 셸을 건너뛰고 셸이 아닌 프로세스가 이어지는 구간을 본다. 그 위에 다시 셸이 있으면 "셸에서 띄운 프로그램이
// 셸을 거쳐 우리를 불렀다" — 그 구간이 세션이다. 위에 셸이 없으면 그건 터미널 프로그램 쪽이고
// (VS Code·Terminal 의 login·Windows Terminal) 셸에서 바로 친 것이다.
// 구간은 여러 겹일 수 있다 — codex 는 node(codex.js) → codex.exe, gemini 는 node 가 자기 자신을 자식으로 다시 띄운다.
// 수명은 가장 바깥 것을 따른다. 안쪽에는 명령 하나 동안만 사는 도우미가 끼기도 한다
//   claude 안의 !termimon   termimon → bash… → claude → bash(터미널) → Code                  host=claude
//   codex 안의 !termimon    termimon → pwsh → codex.exe → node(codex.js) → pwsh(터미널)      host=node(codex.js)
//   셸에서 바로 termimon    termimon → bash(터미널) → Code                                   host=null  term=bash(터미널)
// 앱 이름 표를 두지 않는다 — 네이티브든 npm(node)이든, 처음 보는 CLI 든 같은 규칙으로 잡힌다
function sessionAnchor(chain, names) {
  const shell = (pid) => isCommandShell(names && names.get(pid));
  const at = chain.findIndex((pid, i) => i > 0 && !shell(pid));
  if (at < 0) return { host: null, term: chain.length > 1 ? chain[chain.length - 1] : null };
  const end = chain.findIndex((pid, i) => i > at && shell(pid));
  if (end >= 0) return { host: chain[end - 1], term: chain[end] };
  // 셸을 거치지 않고 곧바로 불렸으면(작업 실행기 등) 부른 쪽을 따라 산다
  if (at === 1) return { host: chain[1], term: null };
  return { host: null, term: chain[at - 1] };
}

// 창 목록에서 내 터미널을 띄운 프로그램을 찾는다. 앱 이름 표가 필요 없다.
//
// 두 방향을 본다.
//  1) 창 주인이 내 조상인 경우 — VS Code·cmux·iTerm2·Warp·Windows Terminal 등 대부분
//  2) 창 주인이 내 조상의 자손인 경우 — Windows 고전 콘솔이 여기 해당한다.
//     conhost.exe 가 창을 갖는데 그건 cmd.exe 의 "자식"이라 1) 로는 안 걸린다
// 2) 는 프로세스 표를 다시 읽어야 해서 비싸므로 1) 이 실패할 때만, deep 일 때만 쓴다
//    (Windows 는 PowerShell 로 읽어 수백 ms 동안 호출한 쪽을 멈춘다 — 펫은 매 폴링 부르지 않는다)
//
// 펫 자신(chain[0])은 보지 않는다 — 펫 창도 크기에 따라 목록에 들어온다.
// 체인은 Windows 셸(explorer)에서 자른다. explorer 는 시작 메뉴·작업 표시줄로 띄운 모든 프로그램의 조상이라,
// 체인이 거기까지 올라왔다는 건 터미널 창 주인을 조상에서 못 찾았다는 뜻이다 (기본 터미널로 Windows Terminal 이
// 넘겨받은 셸 등). 자르지 않으면 1) 은 파일 탐색기·바탕화면 창을, 2) 는 탐색기로 띄운 아무 앱 창이나 잡는다
const SHELL_PROCESSES = new Set(["explorer"]);
const isShell = (name) => SHELL_PROCESSES.has(String(name || "").toLowerCase().replace(/\.exe$/, ""));

function ownerPidOf(chain, windows, { deep = true } = {}) {
  const appOf = new Map(windows.map((w) => [w.pid, w.app]));
  const below = (names) => {
    const at = chain.findIndex((pid, i) => i > 0 && (isShell(appOf.get(pid)) || isShell(names && names.get(pid))));
    return chain.slice(1, at >= 0 ? at : chain.length);
  };
  const owners = new Set(windows.map((w) => w.pid).filter((p) => typeof p === "number"));
  const direct = below(null).find((pid) => owners.has(pid));
  if (direct != null) return direct;
  if (!deep) return null;

  let parent;
  try {
    parent = parentMap();
  } catch {
    return null;
  }
  const mine = new Set(below(parent.names));
  for (const pid of owners) {
    let cur = pid;
    for (let i = 0; i < 40 && cur > 1; i++) {
      if (cur === chain[0]) break; // 펫 자신이나 펫이 띄운 헬퍼의 창 — 올라가면 펫의 부모(내 조상)에 닿는다
      if (mine.has(cur)) return pid;
      cur = parent.get(cur) || 0;
    }
  }
  return null;
}

// 창마다 확장이 적는 기록 — 살아 있는 것만 최신순으로
function readWindowRecords(dir) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => /\.json$/.test(f));
  } catch {
    return []; // 디렉터리 없음 = 확장 미설치
  }
  const now = Date.now() / 1000;
  const out = [];
  for (const name of names) {
    let rec;
    try {
      rec = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue; // 파손·쓰는 중 — 이 파일만 건너뛴다 (전체 스캔을 날리지 않는다)
    }
    if (!rec || typeof rec.at !== "number" || !Array.isArray(rec.terminals)) continue;
    if (rec.at > now + 5) continue; // 시계가 앞선 손상 기록 — 영원히 신선해 보이는 것을 막는다
    if (rec.hostPid ? !pidAlive(rec.hostPid) : now - rec.at > WINDOW_STALE_SEC) continue;
    out.push(rec);
  }
  return out.sort((a, b) => b.at - a.at);
}

// 내 터미널이 들어 있는 창 기록
function myRecord(records, myPids) {
  return records.find((rec) => rec.terminals.some((pid) => myPids.has(pid))) || null;
}

// 탭 축 — 내 터미널 탭이 그 창의 활성 탭인가. null 이면 확장이 없어 알 수 없음
function tabAxis(rec, myPids) {
  if (!rec) return null;
  return rec.activeTerminal != null && myPids.has(rec.activeTerminal);
}

// 훅이 남긴 세션 상태 기록이 내 터미널 것인지
function stateIsMine(record, myPids, matchCwd) {
  if (Array.isArray(record.ancestors) && record.ancestors.length) {
    return record.ancestors.some((pid) => myPids.has(pid));
  }
  if (matchCwd && record.cwd) return record.cwd === matchCwd;
  return true;
}

// 기록 하나를 지금 보여야 할 상태로 환산
function resolveState(record) {
  const age = Date.now() / 1000 - (record.at || 0);
  let state = record.state || "idle";
  if (record.hold != null && age >= record.hold) state = record.then || "idle";
  if ((state === "running" || state === "waiting") && age > STALE_SEC) state = "idle";
  return state;
}

// 펫이 따를 상태와 마지막 프롬프트 시각(초) — 기록이 없으면 { state: "idle", promptAt: null }
//   hostPid       펫을 부른 CLI. 알면 그 CLI 가 남긴 기록만 고른다 — 같은 터미널 탭의 다른 세션(먼저 끝난 CLI, CLI 안에서
//                 띄운 CLI)과 섞이지 않게. 훅이 없는 CLI 면 기록이 없어 대기(idle)다. 조상을 못 적은 기록만 작업 폴더로 가린다
//   terminalOnly  셸에서 바로 띄운 펫 — CLI 상태를 따르지 않고 늘 대기(기본 동작만). 같은 터미널에서 나중에 켠 CLI 에
//                 반응하지 않게 한다. CLI 상태는 그 CLI 안에서 !termimon 으로 띄운 펫만 따른다
// 둘 다 없으면(termimon 없이 npm start 로 직접 띄움) 내 터미널 셸이 조상에 있는 기록을 고른다
function sessionInfo(stateDir, { myPids, matchCwd = null, hostPid = null, terminalOnly = false }) {
  if (terminalOnly) return { state: "idle", promptAt: null };
  const records = [];
  try {
    const files = fs
      .readdirSync(stateDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(stateDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of files) {
      try {
        records.push(JSON.parse(fs.readFileSync(file, "utf8")));
      } catch {
        // 쓰는 중·파손 — 이 파일만 건너뛴다
      }
    }
  } catch {
    // 폴더 없음 — 기본값
  }
  const hasAncestors = (r) => Array.isArray(r.ancestors) && r.ancestors.length > 0;
  const record = hostPid
    ? records.find((r) => (hasAncestors(r) ? r.ancestors.includes(hostPid) : stateIsMine(r, myPids, matchCwd)))
    : records.find((r) => stateIsMine(r, myPids, matchCwd));
  if (!record) return { state: "idle", promptAt: null };
  return { state: resolveState(record), promptAt: Number(record.promptAt) || null };
}

module.exports = {
  WINDOW_STALE_SEC,
  STALE_SEC,
  pidAlive,
  parentMap,
  ancestorPids,
  myPidsFor,
  pidsUpTo,
  terminalFromRecords,
  isCommandShell,
  sessionAnchor,
  ownerPidOf,
  readWindowRecords,
  myRecord,
  tabAxis,
  stateIsMine,
  resolveState,
  sessionInfo,
};
