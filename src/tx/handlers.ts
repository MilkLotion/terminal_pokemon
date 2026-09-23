// 명령 이름 → 도메인 처리 — 계약은 docs/specs/modules.md "명령 계약".
//
// 처리기는 사본만 고치고 성공 여부를 돌려준다. 저장은 거래 실행기가 한다.
// 도메인 규칙은 각 모듈(src/party 등)에 두고 여기서는 인자를 풀어 넘기기만 한다.
import { keep, place, swap } from "../party/placement.js";
import { setHidden, shownCount } from "../party/visibility.js";
import type { TxHandler } from "./executor";

const isObj = (v: unknown): v is Record<string, unknown> => v != null && typeof v === "object" && !Array.isArray(v);

const petIdOf = (args: unknown): string | null => {
  if (!isObj(args)) return null;
  const id = args.petId;
  return typeof id === "string" && id ? id : null;
};

const slotOf = (args: unknown): number | null => {
  if (!isObj(args)) return null;
  const i = args.slotIndex;
  return typeof i === "number" && Number.isInteger(i) && i >= 0 ? i : null;
};

// 표시·숨김 — 칸의 hidden 하나만 바꾼다
const visibility = (hidden: boolean): TxHandler => (draft, args) => {
  const petId = petIdOf(args);
  if (!petId) return { ok: false, reason: "bad-args" };
  const res = setHidden(draft.party.slots, petId, hidden);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { petId, hidden, shown: shownCount(draft.party.slots) } };
};

// 박스 개체를 빈 파티 칸에 — 칸을 지정하지 않으면 앞의 빈 칸에 넣는다
const placeHandler: TxHandler = (draft, args) => {
  const petId = petIdOf(args);
  if (!petId) return { ok: false, reason: "bad-args" };
  const res = place(draft, petId, slotOf(args) ?? undefined);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { petId, slotIndex: res.slotIndex, hidden: true } };
};

// 파티 칸의 개체와 박스 개체를 한 번에 맞바꾼다
const swapHandler: TxHandler = (draft, args) => {
  const petId = petIdOf(args);
  const slotIndex = slotOf(args);
  if (!petId || slotIndex == null) return { ok: false, reason: "bad-args" };
  const res = swap(draft, slotIndex, petId);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { petId, slotIndex: res.slotIndex, movedOut: res.movedOut, hidden: true } };
};

// 파티 개체를 박스에 보관한다
const keepHandler: TxHandler = (draft, args) => {
  const petId = petIdOf(args);
  if (!petId) return { ok: false, reason: "bad-args" };
  const res = keep(draft, petId);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { petId, slotIndex: res.slotIndex } };
};

export const HANDLERS: Record<string, TxHandler> = {
  "party.show": visibility(false),
  "party.hide": visibility(true),
  "party.place": placeHandler,
  "party.swap": swapHandler,
  "party.keep": keepHandler,
};
