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

// 주어진 프로세스의 조상 번호들 — 중간에 tmux·중첩 셸이 있어도 터미널 탭을 맞히기 위해
function ancestorPids(from = process.pid) {
  try {
    const out = execFileSync("ps", ["-Ao", "pid=,ppid="], { encoding: "utf8" });
    const parent = new Map();
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (m) parent.set(Number(m[1]), Number(m[2]));
    }
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

// 내 터미널로 볼 프로세스 번호 집합. 기동 시 한 번만 구한다 — 래퍼가 끝나면 부모 관계가 끊긴다
// 체인을 터미널 셸에서 잘라야 한다. 그 위(IDE 프로세스·launchd)는 같은 창의 다른 탭과 공유하므로,
// 끝까지 쓰면 남의 터미널 기록까지 내 것으로 잡힌다
function myPidsFor(termPid, from = process.pid) {
  const chain = ancestorPids(from);
  if (!termPid) return new Set(chain); // 터미널 번호를 모름 — 래퍼 없이 실행된 경우
  const cut = chain.indexOf(termPid);
  return new Set(cut >= 0 ? chain.slice(0, cut + 1) : [termPid]);
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

// 내 터미널의 현재 상태 — 없으면 idle
function sessionState(stateDir, myPids, matchCwd) {
  try {
    const files = fs
      .readdirSync(stateDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(stateDir, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const file of files) {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!stateIsMine(record, myPids, matchCwd)) continue;
      return resolveState(record);
    }
  } catch {
    // 폴더 없음·파손 — 기본값
  }
  return "idle";
}

module.exports = {
  WINDOW_STALE_SEC,
  STALE_SEC,
  pidAlive,
  ancestorPids,
  myPidsFor,
  readWindowRecords,
  myRecord,
  tabAxis,
  stateIsMine,
  resolveState,
  sessionState,
};
