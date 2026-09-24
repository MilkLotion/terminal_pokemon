// 튜토리얼 상태 — 규칙은 docs/specs/s5.md "튜토리얼". 상태만 기록한다. 시작 조건과 문구는 화면이 가진다.
//
// 튜토리얼마다 미시작·진행 중·건너뜀·완료를 따로 둔다. 포인트 지급과 업적 수령은 여기와 별개로 움직인다.
// 건너뛰거나 마친 튜토리얼은 다시 띄우지 않는다. 사용법은 가이드북에서 본다.
import type { SaveV3, TutorialState } from "../shared/save-v3";

export type TutorialFailure = "bad-id" | "already";

export interface TutorialResult {
  ok: boolean;
  reason?: TutorialFailure;
  id?: string;
  state?: TutorialState;
  steps?: number;
}

// 끝난 것으로 보는 상태 — 다시 띄우지 않는다
const DONE: readonly TutorialState[] = ["skipped", "done"];

function set(save: SaveV3, id: string, state: TutorialState, steps?: number): TutorialResult {
  if (!id) return { ok: false, reason: "bad-id" };
  const row = save.tutorials[id];
  if (row && DONE.includes(row.state)) return { ok: false, reason: "already" };
  const next = { state, steps: steps ?? row?.steps ?? 0 };
  save.tutorials[id] = next;
  return { ok: true, id, state, steps: next.steps };
}

export const skip = (save: SaveV3, id: string): TutorialResult => set(save, id, "skipped");

export const done = (save: SaveV3, id: string, steps?: number): TutorialResult => set(save, id, "done", steps);

// 지금 띄워도 되는가 — 건너뛰었거나 마친 것은 다시 띄우지 않는다
export const canShow = (save: SaveV3, id: string): boolean => !DONE.includes(save.tutorials[id]?.state ?? "none");
