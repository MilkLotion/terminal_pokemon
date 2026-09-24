// 설정 한 항목 바꾸기 — 규칙은 docs/specs/s5.md "설정과 연결"
//
// 한 번에 한 항목만 바꾼다. 어떤 항목인지와 허용 값을 여기가 모두 가진다.
// 화면은 무엇을 보여 줄지만 정하고 값 검사는 하지 않는다. 허용 밖의 값이면 저장을 바꾸지 않는다.
// 놀이공간의 영역 좌표는 여기서 다루지 않는다. 영역 그리기는 다른 창이 맡는다.
import type { SaveV3 } from "../shared/save-v3";

export type SettingKey = "language" | "startOnLogin" | "sound" | "sleepAfterMin" | "playArea";

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

const KEYS: readonly SettingKey[] = ["language", "startOnLogin", "sound", "sleepAfterMin", "playArea"];

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
  // 놀이공간은 방식만 바꾼다. 그려 둔 영역은 지우지 않는다 — 화면 전체로 갔다가 돌아와도 그대로다
  if (!SETTING_CHOICES.playArea.some((v) => v === value)) return { ok: false, reason: "bad-value" };
  s.playArea = { mode: value as "full" | "region", rect: s.playArea.rect };
  return { ok: true, key, value };
}
