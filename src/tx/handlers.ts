// 명령 이름 → 도메인 처리 — 계약은 docs/specs/modules.md "명령 계약".
//
// 처리기는 사본만 고치고 성공 여부를 돌려준다. 저장은 거래 실행기가 한다.
// 도메인 규칙은 각 모듈(src/party 등)에 두고 여기서는 인자를 풀어 넘기기만 한다.
import { use } from "../bag/use.js";
import { care, isCareAction } from "../egg/care.js";
import { open } from "../egg/open.js";
import { keep, place, swap } from "../party/placement.js";
import { setHidden, shownCount } from "../party/visibility.js";
import { buy } from "../shop/buy.js";
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

// ── 알 ─────────────────────────────────────────────────────────────────────────

const eggIdOf = (args: unknown): string | null => {
  if (!isObj(args)) return null;
  const id = args.eggId;
  return typeof id === "string" && id ? id : null;
};

// 돌봄 — 준비 시간을 줄이고 행동 조건을 쌓는다
const careHandler: TxHandler = (draft, args) => {
  const eggId = eggIdOf(args);
  const action = isObj(args) ? args.action : null;
  if (!eggId || !isCareAction(action)) return { ok: false, reason: "bad-args" };
  const egg = draft.eggs.find((e) => e.id === eggId);
  if (!egg) return { ok: false, reason: "no-egg" };
  const res = care(egg, action);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return { ok: true, result: { eggId, action, shortenedMs: res.shortenedMs, remainMs: res.remainMs, ready: res.ready } };
};

// 열기 — 결과 판정, 개체 생성, 배치, 도감 기록을 한 거래로 묶는다
const openHandler: TxHandler = (draft, args, ctx) => {
  const eggId = eggIdOf(args);
  if (!eggId) return { ok: false, reason: "bad-args" };
  const res = open(draft, eggId, ctx.now, ctx.rand);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return {
    ok: true,
    result: { petId: res.petId, species: res.species, shiny: res.shiny, slotIndex: res.slotIndex, toBox: res.toBox, conditionId: res.conditionId },
  };
};

HANDLERS["egg.care"] = careHandler;
HANDLERS["egg.open"] = openHandler;

// ── 상점 ───────────────────────────────────────────────────────────────────────

// 구매 — 검사와 반영을 한 거래로 묶는다. 하나라도 걸리면 아무것도 바꾸지 않는다
const buyHandler: TxHandler = (draft, args, ctx) => {
  if (!isObj(args)) return { ok: false, reason: "bad-args" };
  const productId = typeof args.productId === "string" ? args.productId : "";
  if (!productId) return { ok: false, reason: "bad-args" };
  const res = buy(draft, productId, ctx.now, ctx.rand);
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return {
    ok: true,
    result: { productId, spent: res.spent, balance: res.balance, eggId: res.eggId, petId: res.petId, slotIndex: res.slotIndex, toBox: res.toBox },
  };
};

HANDLERS["shop.buy"] = buyHandler;

// ── 가방 ───────────────────────────────────────────────────────────────────────

// 도구 사용 — 대상 개체에 효과를 적용하고 하나를 차감한다
const useHandler: TxHandler = (draft, args) => {
  if (!isObj(args)) return { ok: false, reason: "bad-args" };
  const itemId = typeof args.itemId === "string" ? args.itemId : "";
  const petId = petIdOf(args);
  if (!itemId || !petId) return { ok: false, reason: "bad-args" };
  const nature = typeof args.nature === "string" ? args.nature : undefined;
  const res = use(draft, itemId, petId, { nature });
  if (!res.ok) return { ok: false, reason: res.reason ?? "failed" };
  return {
    ok: true,
    result: { itemId, petId, left: res.left, level: res.level, exp: res.exp, fullness: res.fullness, nature: res.nature, shiny: res.shiny },
  };
};

HANDLERS["bag.use"] = useHandler;
