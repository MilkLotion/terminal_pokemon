// 명령 이름 → 도메인 처리 — 계약은 docs/specs/modules.md "명령 계약".
//
// 처리기는 사본만 고치고 성공 여부를 돌려준다. 저장은 거래 실행기가 한다.
// 도메인 규칙은 각 모듈(src/party 등)에 두고 여기서는 인자를 풀어 넘기기만 한다.
import { setHidden, shownCount } from "../party/visibility.js";
import type { TxHandler } from "./executor";

const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

const petIdOf = (args: unknown): string | null => {
  if (!isObj(args)) return null;
  const id = args.petId;
  return typeof id === "string" && id ? id : null;
};

// 표시·숨김 — 칸의 hidden 하나만 바꾼다
const visibility = (hidden: boolean): TxHandler => (draft, args) => {
  const petId = petIdOf(args);
  if (!petId) return { ok: false, reason: "bad-args" };
  const res = setHidden(draft.party.slots, petId, hidden);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { petId, hidden, shown: shownCount(draft.party.slots) } };
};

export const HANDLERS: Record<string, TxHandler> = {
  "party.show": visibility(false),
  "party.hide": visibility(true),
};
