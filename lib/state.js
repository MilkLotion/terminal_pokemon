// 펫(main.js)과 진단 도구(bin/pkmon-status)가 똑같은 판정을 쓰도록 공통 부분만 모은 곳
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
function parentMap() {
  const parent = new Map();
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }"],
      // 펫은 콘솔이 없는 GUI 프로세스다 — 숨기지 않으면 부를 때마다 PowerShell 창이 번쩍 뜬다
      { encoding: "utf8", windowsHide: true },
    );
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) parent.set(Number(m[1]), Number(m[2]));
    }
    return parent;
  }
  const out = execFileSync("ps", ["-Ao", "pid=,ppid="], { encoding: "utf8" });
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (m) parent.set(Number(m[1]), Number(m[2]));
  }
  return parent;
}

// 조상 번호들 — 가까운 것부터. 터미널 탭을 맞히고, 창 주인을 찾는 데 쓴다
function ancestorPids(from = process.pid) {
  try {
    const parent = parentMap();
    const chain = [];
    let pid = from;
    for (let i = 0; i < 40 && pid > 1; i++) {
      chain.push(pid);
      pid = parent.get(pid) || 0;
    }
    return chain;
  } catch {
    return [];
  }
}

// 체인을 터미널 셸에서 자른 집합. 그 위(IDE 프로세스·launchd)는 같은 창의 다른 탭과 공유하므로,
// 끝까지 쓰면 남의 터미널 기록까지 내 것으로 잡힌다
function pidsUpTo(chain, termPid) {
  if (!termPid) return new Set(chain); // 터미널 번호를 모름 — 래퍼 없이 실행된 경우
  const cut = chain.indexOf(termPid);
  return new Set(cut >= 0 ? chain.slice(0, cut + 1) : [termPid]);
}

function myPidsFor(termPid, from = process.pid) {
  return pidsUpTo(ancestorPids(from), termPid);
}

// 터미널 셸 번호를 확장 기록으로 바로잡는다 — 조상 중 어느 창의 터미널 목록에 든 가장 가까운 번호가 진짜 탭이다.
// pkmon 이 넘긴 번호(부모 프로세스)는 사이에 무엇이 끼면 틀린다: 셸 안에서 bash 를 한 번 더 띄운 경우,
// Git Bash 의 런처, Volta·Scoop 같은 실행 파일 심. 틀리면 활성 탭 번호가 내 체인에 없어 펫이 영영 숨는다.
// 원격 창(SSH·WSL·컨테이너)의 번호는 다른 컴퓨터·네임스페이스의 것이라 대조하지 않는다.
// 반환: 찾은 번호, 못 찾으면 null (펫 자신 chain[0] 은 보지 않는다)
function terminalFromRecords(chain, records) {
  const listed = new Set(records.filter((r) => !r.remote).flatMap((r) => (Array.isArray(r.terminals) ? r.terminals : [])));
  const found = chain.slice(1).find((pid) => listed.has(pid));
  return found == null ? null : found;
}

// 창 목록에서 내 터미널을 띄운 프로그램을 찾는다. 앱 이름 표가 필요 없다.
//
// 두 방향을 본다.
//  1) 창 주인이 내 조상인 경우 — VS Code·cmux·iTerm2·Warp·Windows Terminal 등 대부분
//  2) 창 주인이 내 조상의 자손인 경우 — Windows 고전 콘솔이 여기 해당한다.
//     conhost.exe 가 창을 갖는데 그건 cmd.exe 의 "자식"이라 1) 로는 안 걸린다
// 2) 는 프로세스 표를 다시 읽어야 해서 비싸므로 1) 이 실패할 때만 쓴다
function ownerPidOf(chain, windows) {
  const owners = new Set(windows.map((w) => w.pid).filter((p) => typeof p === "number"));
  const direct = chain.find((pid) => owners.has(pid));
  if (direct != null) return direct;

  const mine = new Set(chain);
  let parent;
  try {
    parent = parentMap();
  } catch {
    return null;
  }
  for (const pid of owners) {
    let cur = pid;
    for (let i = 0; i < 40 && cur > 1; i++) {
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

// 내 터미널의 상태와 마지막 프롬프트 시각(초) — 기록이 없으면 { state: "idle", promptAt: null }
function sessionInfo(stateDir, myPids, matchCwd) {
  try {
    const files = fs
      .readdirSync(stateDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(stateDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of files) {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!stateIsMine(record, myPids, matchCwd)) continue;
      return { state: resolveState(record), promptAt: Number(record.promptAt) || null };
    }
  } catch {
    // 폴더 없음·파손 — 기본값
  }
  return { state: "idle", promptAt: null };
}

module.exports = {
  WINDOW_STALE_SEC,
  STALE_SEC,
  pidAlive,
  ancestorPids,
  myPidsFor,
  pidsUpTo,
  terminalFromRecords,
  ownerPidOf,
  readWindowRecords,
  myRecord,
  tabAxis,
  stateIsMine,
  resolveState,
  sessionInfo,
};
