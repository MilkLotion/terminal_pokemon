#!/usr/bin/env node

// 펫 상태 기록 — 훅 이벤트를 세션별 상태 파일로 남김 (terminal_pkmon 의 펫이 읽음)
// - 펫을 쓰지 않으면(~/.claude/pkmon 폴더 없음) 즉시 종료
// - 조상 프로세스(훅 → claude → 터미널 셸)를 함께 적어, 펫이 자기 터미널 세션만 따라가게 함
// - stdout 출력 없음: SessionStart·UserPromptSubmit 의 stdout 은 대화 컨텍스트로 들어감

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const PKMON_DIR = path.join(os.homedir(), ".claude", "pkmon");
const STATE_DIR = path.join(PKMON_DIR, "state");
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 이벤트 → 펫 동작. hold 가 있으면 그 초 동안 보여준 뒤 then 으로 전환
const EVENT_STATES = {
  SessionStart: { state: "waving", hold: 6, then: "idle" },
  UserPromptSubmit: { state: "running" },
  PreToolUse: { state: "running" },
  PermissionRequest: { state: "waiting" },
  PostToolUseFailure: { state: "failed", hold: 6, then: "running" },
  StopFailure: { state: "failed", hold: 10, then: "idle" },
  // 응답 완료는 waving — review 줄은 프레임 6개 중 서로 다른 그림이 3개뿐이라 멈춘 것처럼 보인다
  Stop: { state: "waving", hold: 4, then: "idle" },
};

// 이 훅을 띄운 조상 프로세스 목록 — 훅 → claude → 터미널 셸 순으로 올라간다
// 펫 오버레이가 자기 터미널 셸 번호가 이 목록에 있는지로 "내 세션"을 가린다
function ancestorPids() {
  if (process.platform === "win32") return [];
  try {
    const out = execFileSync("ps", ["-Ao", "pid=,ppid="], { encoding: "utf8", timeout: 2000 });
    const parent = new Map();
    for (const line of out.split("\n")) {
      const [pid, ppid] = line.trim().split(/\s+/).map(Number);
      if (pid) parent.set(pid, ppid);
    }
    const chain = [];
    let cur = process.pid;
    for (let depth = 0; depth < 12; depth++) {
      cur = parent.get(cur);
      if (!cur || cur <= 1) break;
      chain.push(cur);
    }
    return chain;
  } catch {
    return [];
  }
}

function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function pruneOldStates() {
  // 7일 넘은 세션 상태 파일 정리 — SessionStart 때만 실행
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(STATE_DIR)) {
      const file = path.join(STATE_DIR, name);
      if (now - fs.statSync(file).mtimeMs > STATE_TTL_MS) fs.unlinkSync(file);
    }
  } catch {
    // 정리 실패는 무시
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    // 펫을 한 번도 설정한 적 없으면(~/.claude/pkmon 없음) 아무것도 하지 않음
    if (!fs.existsSync(PKMON_DIR)) return process.exit(0);

    const data = JSON.parse(input);
    const event = data.hook_event_name;
    const mapping = EVENT_STATES[event];
    const sessionId = String(data.session_id || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!mapping || !sessionId) return process.exit(0);

    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (event === "SessionStart") pruneOldStates();

    const file = path.join(STATE_DIR, `${sessionId}.json`);
    const now = Date.now() / 1000;
    // cwd·조상 프로세스 기록 — 펫 오버레이가 자기 터미널의 세션만 따라가는 데 씀
    let record = { ...mapping, event, at: now, cwd: data.cwd || "", ancestors: ancestorPids() };

    // 실패 표시 중에 바로 다음 도구 호출이 와도 실패 동작을 끝까지 보여줌 — 전환 대상만 갱신
    const prev = readState(file);
    if (mapping.state === "running" && prev && prev.state === "failed" && prev.hold && now - prev.at < prev.hold) {
      record = { ...prev, then: "running" };
    }
    // 마지막 프롬프트 시각은 이어 간다 — 뒤따르는 도구 호출·응답 완료 기록이 덮어쓰면 사라진다.
    // 펫이 "사용자가 마지막으로 뭔가 한 때"를 알아야 3분 뒤에 잠든다
    record.promptAt = event === "UserPromptSubmit" ? now : prev && prev.promptAt;

    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
  } catch {
    // 상태 기록 실패는 무시 — 작업 흐름을 막지 않음
  }
  process.exit(0);
});
