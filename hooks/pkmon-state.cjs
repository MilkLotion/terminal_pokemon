#!/usr/bin/env node

// 펫 상태 기록 — CLI LLM(claude·codex·gemini)의 훅 이벤트를 세션별 상태 파일로 남김 (terminal_pkmon 의 펫이 읽음)
// - 펫을 쓰지 않으면(~/.claude/pkmon 폴더 없음) 즉시 종료
// - 조상 프로세스(훅 → CLI → 터미널 셸)를 함께 적어, 펫이 자기 터미널 세션만 따라가게 함
// - stdout·stderr 출력 없음: claude 는 SessionStart·UserPromptSubmit 의 stdout 을 대화 컨텍스트로 넣고,
//   gemini 는 stdout(비면 stderr)을 훅 결과로 읽는다
// - codex·gemini 는 훅이 끝나길 기다린다 — 빨리 끝내야 CLI 가 느려지지 않는다
//
// 등록한 CLI 는 인자로 받는다 (node pkmon-state.cjs --cli gemini). 없으면 claude — 예전 등록은 인자가 없다

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const PKMON_DIR = path.join(os.homedir(), ".claude", "pkmon");
const STATE_DIR = path.join(PKMON_DIR, "state");
const STATE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const cliArg = process.argv.indexOf("--cli");
const CLI = cliArg > 0 && process.argv[cliArg + 1] ? process.argv[cliArg + 1] : "claude";

// 도구 결과가 실패인가 — CLI 마다 모양이 달라 흔한 필드만 본다. 모르는 모양이면 실패로 치지 않는다
//   gemini AfterTool  tool_response.error
//   codex PostToolUse tool_response 형식이 정해져 있지 않다 (스키마가 아무 값) — 종료 코드·오류 표시가 있을 때만
function toolFailed(data) {
  const r = data.tool_response;
  if (!r || typeof r !== "object") return false;
  if (r.error) return true;
  if (r.success === false || r.is_error === true || r.isError === true) return true;
  const code = r.exit_code ?? r.exitCode;
  return typeof code === "number" && code !== 0;
}

// 이벤트 → 펫 동작. hold 가 있으면 그 초 동안 보여준 뒤 then 으로 전환.
// 함수면 입력을 보고 고른다 (null 이면 기록하지 않음). 이름이 같은 claude·codex 이벤트는 뜻도 같다
const FAILED_TOOL = { state: "failed", hold: 6, then: "running" };
// 응답 완료는 waving — review 줄은 프레임 6개 중 서로 다른 그림이 3개뿐이라 멈춘 것처럼 보인다
const TURN_DONE = { state: "waving", hold: 4, then: "idle" };
const EVENT_STATES = {
  // claude · codex
  SessionStart: { state: "waving", hold: 6, then: "idle" },
  UserPromptSubmit: { state: "running", prompt: true },
  PreToolUse: { state: "running" },
  PermissionRequest: { state: "waiting" },
  PostToolUse: (data) => (toolFailed(data) ? FAILED_TOOL : { state: "running" }), // codex (claude 는 PostToolUseFailure)
  PostToolUseFailure: FAILED_TOOL, // claude
  Stop: TURN_DONE,
  StopFailure: { state: "failed", hold: 10, then: "idle" }, // claude
  Interrupt: { state: "idle" }, // codex — 사용자가 턴을 멈춤
  SessionEnd: { state: "idle" }, // codex · gemini
  // gemini
  BeforeAgent: { state: "running", prompt: true },
  AfterTool: (data) => (toolFailed(data) ? FAILED_TOOL : { state: "running" }),
  Notification: (data) => (data.notification_type === "ToolPermission" ? { state: "waiting" } : null),
  AfterAgent: TURN_DONE,
};

// 이 훅을 띄운 조상 프로세스 목록 — 훅 → (셸) → CLI → 터미널 셸 순으로 올라간다
// 펫 오버레이가 자기 터미널 셸 번호가 이 목록에 있는지로 "내 세션"을 가린다.
// 비어 있으면 펫은 작업 폴더(cwd)로만 가려서, 같은 폴더를 연 두 터미널의 상태가 섞인다
function ancestorPids() {
  try {
    // Windows 에는 ps 가 없다 — PowerShell 로 프로세스 표를 읽는다 (수백 ms, 그래서 세션마다 한 번만 부른다)
    const out =
      process.platform === "win32"
        ? execFileSync(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              "Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId | ForEach-Object { \"$($_.ProcessId) $($_.ParentProcessId)\" }",
            ],
            { encoding: "utf8", timeout: 4000, windowsHide: true },
          )
        : execFileSync("ps", ["-Ao", "pid=,ppid="], { encoding: "utf8", timeout: 2000 });
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
    const entry = Object.hasOwn(EVENT_STATES, event) ? EVENT_STATES[event] : null;
    const mapping = typeof entry === "function" ? entry(data) : entry;
    const sessionId = String(data.session_id || "").replace(/[^A-Za-z0-9_-]/g, "");
    if (!mapping || !sessionId) return process.exit(0);

    fs.mkdirSync(STATE_DIR, { recursive: true });
    if (event === "SessionStart") pruneOldStates();

    const file = path.join(STATE_DIR, `${sessionId}.json`);
    const now = Date.now() / 1000;
    const prev = readState(file);
    // 조상은 한 세션 안에서 바뀌지 않는다. Windows 는 구하는 데 PowerShell 을 띄워야 해서, 도구를 쓸 때마다
    // 부르지 않고 세션 시작(재개 포함 — 다른 터미널에서 이어 열 수 있다) 때 구한 것을 이어 쓴다
    const known = prev && Array.isArray(prev.ancestors) && prev.ancestors.length ? prev.ancestors : null;
    const ancestors = process.platform === "win32" && event !== "SessionStart" && known ? known : ancestorPids();
    const { prompt, ...shown } = mapping;
    // cwd·조상 프로세스 기록 — 펫 오버레이가 자기 터미널의 세션만 따라가는 데 씀
    let record = { ...shown, cli: CLI, event, at: now, cwd: data.cwd || "", ancestors };

    // 실패 표시 중에 바로 다음 도구 호출이 와도 실패 동작을 끝까지 보여줌 — 전환 대상만 갱신
    if (shown.state === "running" && prev && prev.state === "failed" && prev.hold && now - prev.at < prev.hold) {
      record = { ...prev, then: "running" };
    }
    // 마지막 프롬프트 시각은 이어 간다 — 뒤따르는 도구 호출·응답 완료 기록이 덮어쓰면 사라진다.
    // 펫이 "사용자가 마지막으로 뭔가 한 때"를 알아야 3분 뒤에 잠든다
    record.promptAt = prompt ? now : prev && prev.promptAt;

    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record));
    fs.renameSync(tmp, file);
  } catch {
    // 상태 기록 실패는 무시 — 작업 흐름을 막지 않음
  }
  process.exit(0);
});
