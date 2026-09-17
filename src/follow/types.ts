// 창 추적·에이전트 판정 모듈의 타입 — lib/follow.js · lib/state.js · 헬퍼 출력 · 확장/훅 기록의 모양
import type { AgentState, Usage } from "../shared/types";

// 헬퍼(winbounds)가 주는 창 하나 — DIP 로 바꾼 뒤의 값 (Windows 물리 좌표 변환은 메인이 한다)
export interface HelperWindow {
  app: string;
  pid: number;
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fake?: boolean; // 화면 작업 영역으로 만든 가짜 target
}
export interface HelperInfo {
  frontmost?: string;
  frontPid?: number;
  frontId?: number;
  windows: HelperWindow[];
}

// 확장이 창마다 적는 기록 (windows/*.json)
export interface WindowRecord {
  at: number;
  hostPid?: number;
  focused?: boolean;
  activeTerminal?: number | null;
  terminals: number[];
  remote?: boolean;
}

// 훅이 세션마다 적는 기록 (state/*.json)
export interface StateRecord {
  at?: number;
  cli?: string;
  state?: AgentState;
  hold?: number;
  then?: AgentState;
  promptAt?: number;
  ancestors?: number[];
  cwd?: string;
  usage?: Usage;
}

// 펫 자신을 가리는 표식 — 맨 앞 창 판정에서 자기 창·다른 펫 창을 뺀다
export interface SelfMark {
  pid: number;
  appNames: Set<string>;
}

export type HostKind = "vscode" | "hook" | "known";
export interface HostInfo {
  kind: HostKind;
  rec: WindowRecord | null;
  pids: number[];
  frontIsHost: boolean;
}

export interface StateInfo {
  state: AgentState;
  promptAt: number | null;
  tokenWork?: boolean;
}

// 헬퍼 실행 명령 — Electron 을 모른다. serve 는 줄 단위로 계속 답하는 방식(Windows ps1 -Serve)
export interface HelperCommand {
  cmd: string;
  args: string[];
  serve?: boolean;
}
export interface LineHelper {
  query(cb: (err: Error | null, line?: string) => void): void;
  stop(): void;
}

// pid → 부모 pid. names 는 pid → 프로세스 이름, paths 는 실행 경로(있을 때만)
export interface ParentMap extends Map<number, number> {
  names: Map<number, string>;
  paths?: Map<number, string>;
}

// ── 아래는 이식(S2 단위 A)에서 덧붙인 보조 타입 — 위 이름은 그대로 ──────────────

// sessionAnchor 의 결과 — host 는 펫이 따라 살고 죽을 프로세스(CLI LLM), term 은 터미널 탭의 셸. 모르면 null
export interface SessionAnchor {
  host: number | null;
  term: number | null;
}

// ownerPidOf 옵션 — deep 은 프로세스 표까지 읽는 깊은 탐색, parent 를 주면 표를 다시 읽지 않는다 (시험용 주입)
export interface OwnerPidOptions {
  deep?: boolean;
  parent?: ParentMap | null;
}

// sessionInfo 옵션 — 세션 펫이 따를 훅 기록을 고르는 기준 (state.ts sessionInfo 주석 참고)
export interface SessionInfoOptions {
  myPids: Set<number>;
  matchCwd?: string | null;
  hostPid?: number | null;
  terminalOnly?: boolean;
}

// createLineHelper 옵션 — timeoutMs 는 답 한 줄, startTimeoutMs 는 막 띄운 헬퍼의 첫 답
export interface LineHelperOptions {
  timeoutMs?: number;
  startTimeoutMs?: number;
}

// queryHelper 콜백 — 헬퍼 표준 출력 한 덩이(JSON 한 줄). 실패면 err
export type HelperReply = (err: Error | null, stdout?: string) => void;
