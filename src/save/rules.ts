// 저장·통로의 규칙표 — 스키마 기본값과 파일 통로의 시간. "숫자는 모듈마다 규칙표 하나" (design.md 모듈 규칙)
//
// 게임 숫자(친밀도·기분·쿨다운)는 여기 없다 — state 모듈의 규칙표에. 여기는 save.json 의 모양을 채우는 기본값과
// 파일 IO 의 재시도·TTL 만. 숫자는 전부 자리표시자 — 써 보며 고친다.
// 성격 검증은 dex가 소유. 에이전트·보낸 이 목록은 공유 타입의 런타임 검사
import type { AgentName, CommandSource, NatureId } from "../shared/types.js";
import { isNatureId as dexNatureId } from "../dex/natures";

export const SAVE_RULES = {
  version: 2 as const, // save.json 스키마 버전 (v). 1 은 읽어서 이전한다
  slots: { min: 1, max: 6 }, // 파티 칸 — 처음 1, 최대 6, 원작 파티 여섯 칸 (design.md 상점)
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

export const AGENT_NAMES: readonly AgentName[] = ["claude", "codex", "gemini"];

export const COMMAND_SOURCES: readonly CommandSource[] = ["menu", "tray", "settings", "cli", "vscode", "pet"];

export const isNatureId = (v: unknown): v is NatureId => typeof v === "string" && dexNatureId(v);
export const isAgentName = (v: unknown): v is AgentName => typeof v === "string" && (AGENT_NAMES as readonly string[]).includes(v);
export const isCommandSource = (v: unknown): v is CommandSource =>
  typeof v === "string" && (COMMAND_SOURCES as readonly string[]).includes(v);

// 저장 v3 의 기본값 — 계약은 docs/specs/modules.md "저장 구조". 게임 숫자는 docs/specs/balance.md 를 따른다
export const SAVE_V3_RULES = {
  version: 3 as const,
  party: {
    total: 6, // 파티 칸은 항상 여섯이다. 열림·빈 칸·잠김으로 상태를 나눈다
    openAtStart: 2, // 첫 선택을 마치면 두 칸으로 시작한다
    shopUnlock: 2, // 상점에서 살 수 있는 칸 수
  },
  box: { size: 30, firstName: "박스 1" },
  pet: {
    level: 1,
    exp: 0,
    affinity: 0,
    fullness: 100, // 새 개체는 배부른 상태로 시작한다
    mood: 60,
  },
  feedCooldownMs: 10 * 60_000, // 밥 주기 쿨타임 10분. 기본먹이와 프리미엄먹이가 함께 쓴다
  eggCareCooldownMs: 60_000, // 알 돌봄 인정 간격 1분
  tx: { keep: 200, ttlMs: 24 * 60 * 60_000 }, // 최근 200건 또는 24시간 중 큰 쪽을 남긴다
  saveEveryMs: 30_000, // 시간에 따른 값의 주기 저장
  saveFailNotifyAfter: 3, // 이만큼 이어서 실패하면 관리 창 상태 안내에 남긴다
};
