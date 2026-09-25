// 설정 한 항목 바꾸기 — 규칙은 docs/specs/s5.md "설정과 연결"
//
// 한 번에 한 항목만 바꾼다. 어떤 항목인지와 허용 값을 여기가 모두 가진다.
// 화면은 무엇을 보여 줄지만 정하고 값 검사는 하지 않는다. 허용 밖의 값이면 저장을 바꾸지 않는다.
// 놀이공간 영역(`playRegion`)은 영역 그리기 창이 적용할 때 보낸다. 영역과 `region` 방식을 한 번에 바꾼다.
import type { SaveV3 } from "../shared/save-v3";

export type SettingKey = "language" | "startOnLogin" | "sound" | "sleepAfterMin" | "playArea" | "playRegion";

export type SettingFailure = "bad-args" | "bad-value";

export interface SetResult {
  ok: boolean;
  reason?: SettingFailure;
  key?: SettingKey;
  value?: unknown;
}

// 화면이 고를 수 있는 값. 하나뿐인 출처다
export const SETTING_CHOICES = {
  language: ["ko", "en"],
  sleepAfterMin: [3, 5, 10, 15, 0], // 0 은 잠들지 않음
  playArea: ["full", "region"],
} as const;

const KEYS: readonly SettingKey[] = ["language", "startOnLogin", "sound", "sleepAfterMin", "playArea", "playRegion"];

// 놀이공간 영역의 최소 크기 (화면 좌표 DIP). 스펙 미확정이라 2026-09-25 구현에서 정했다 (docs/work/game-runtime/record.md "놀이공간·설정의 설계")
export const REGION_MIN = { w: 240, h: 160 } as const;

// 영역 값 검사 — 유한한 수 넷, 최소 크기 이상. 정수로 반올림해 돌려준다
export function regionOf(value: unknown): { x: number; y: number; w: number; h: number } | null {
  if (value == null || typeof value !== "object") return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (![x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const rect = { x: Math.round(x as number), y: Math.round(y as number), w: Math.round(w as number), h: Math.round(h as number) };
  return rect.w >= REGION_MIN.w && rect.h >= REGION_MIN.h ? rect : null;
}

export const isSettingKey = (v: unknown): v is SettingKey => typeof v === "string" && KEYS.includes(v as SettingKey);

export function setSetting(save: SaveV3, key: SettingKey, value: unknown): SetResult {
  const s = save.settings;
  if (key === "startOnLogin" || key === "sound") {
    if (typeof value !== "boolean") return { ok: false, reason: "bad-value" };
    s[key] = value;
    return { ok: true, key, value };
  }
  if (key === "language") {
    if (!SETTING_CHOICES.language.some((v) => v === value)) return { ok: false, reason: "bad-value" };
    s.language = value as string;
    return { ok: true, key, value };
  }
  if (key === "sleepAfterMin") {
    if (!SETTING_CHOICES.sleepAfterMin.some((v) => v === value)) return { ok: false, reason: "bad-value" };
    s.sleepAfterMin = value as number;
    return { ok: true, key, value };
  }
  if (key === "playRegion") {
    const rect = regionOf(value);
    if (!rect) return { ok: false, reason: "bad-value" };
    s.playArea = { mode: "region", rect };
    return { ok: true, key, value: rect };
  }
  // 놀이공간은 방식만 바꾼다. 그려 둔 영역은 지우지 않는다 — 화면 전체로 갔다가 돌아와도 그대로다
  if (!SETTING_CHOICES.playArea.some((v) => v === value)) return { ok: false, reason: "bad-value" };
  s.playArea = { mode: value as "full" | "region", rect: s.playArea.rect };
  return { ok: true, key, value };
}
