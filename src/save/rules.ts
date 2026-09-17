// 저장·통로의 규칙표 — 스키마 기본값과 파일 통로의 시간. "숫자는 모듈마다 규칙표 하나" (design.md 모듈 규칙)
//
// 게임 숫자(친밀도·기분·쿨다운)는 여기 없다 — state 모듈의 규칙표에. 여기는 save.json 의 모양을 채우는 기본값과
// 파일 IO 의 재시도·TTL 만. 숫자는 전부 자리표시자 — 써 보며 고친다.
// 성격·에이전트·보낸 이 목록은 타입(shared/types.ts)의 유니언을 런타임에 검사하기 위한 사본 —
//   [리팩토링 대상] data/natures.json 이 생기면 성격 목록은 dex 모듈이 소유하고 여기서는 빌려 쓴다
import type { AgentName, CommandSource, NatureId } from "../shared/types.js";

export const SAVE_RULES = {
  version: 2 as const, // save.json 스키마 버전 (v). 1 은 읽어서 이전한다
  slots: { min: 1, max: 5 }, // 무대 슬롯 — 처음 1, 최대 5 (design.md 상점)
  log: { keep: 200 }, // 기록 — 최근 건수만 남긴다
  // 새 마리·빠진 필드의 기본값
  pet: {
    hunger: 30, // 0~100, 높으면 배고프다 [스펙 미확정]
    mood: 60, // 시작 기분 (1판 RULES.mood.start) [스펙 미확정]
    size: 2, // 도트 배율 — config.js dotSize 기본과 같다
    home: { dx: -24, dy: -60 }, // 따라가는 창 오른쪽 아래 기준 — config.js anchorDx·anchorDy 기본과 같다
    nature: "hardy" as NatureId, // 성격을 모르는 마리(v1 이전·값 파손)에 붙이는 중립 성격 — 축이 전부 0
  },
  range: { min: 0, max: 100 }, // hunger · mood 의 범위
  // 파일 통로의 시간 (1판 economy RULES.io 에서 옮김)
  io: {
    writeRetries: 3, // Windows 는 읽는 쪽이 열고 있으면 rename 이 막힌다 — 잠깐 뒤 다시
    writeRetryMs: 50,
    mailboxPollMs: 5_000, // fs.watch 보강 폴링
    resultTtlMs: 60_000, // 안 가져간 .result.json 청소
    requestTtlMs: 60_000, // 이보다 오래된 요청은 처리하지 않고 지운다 — 죽은 writer 가 남긴 며칠 전 밥을 주지 않게
    sendTimeoutMs: 2_000, // 보낸 쪽이 결과를 기다리는 시간 (CLI 가 2초 기다려 출력)
    sendPollMs: 100,
  },
};

// 원작 25개 성격 — shared/types.ts NatureId 와 같은 목록. 저장 파일의 값 검증용
export const NATURE_IDS: readonly NatureId[] = [
  "hardy", "lonely", "brave", "adamant", "naughty",
  "bold", "docile", "relaxed", "impish", "lax",
  "timid", "hasty", "serious", "jolly", "naive",
  "modest", "mild", "quiet", "bashful", "rash",
  "calm", "gentle", "sassy", "careful", "quirky",
];

export const AGENT_NAMES: readonly AgentName[] = ["claude", "codex", "gemini"];

export const COMMAND_SOURCES: readonly CommandSource[] = ["menu", "tray", "settings", "cli", "vscode", "pet"];

export const isNatureId = (v: unknown): v is NatureId => typeof v === "string" && (NATURE_IDS as readonly string[]).includes(v);
export const isAgentName = (v: unknown): v is AgentName => typeof v === "string" && (AGENT_NAMES as readonly string[]).includes(v);
export const isCommandSource = (v: unknown): v is CommandSource =>
  typeof v === "string" && (COMMAND_SOURCES as readonly string[]).includes(v);
