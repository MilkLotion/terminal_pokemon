// 상점 구매 — 규칙은 docs/specs/s5.md "상점", 가격은 docs/specs/balance.md
//
// 한 거래로 검사와 반영을 묶는다. 하나라도 걸리면 아무것도 바꾸지 않는다.
//   알      돌보미집에 빈 칸이 있어야 한다. 사면 바로 들어가고 준비 시간이 시작된다
//   도구    가방에 쌓는다. 칸 수 제한은 없다
//   파티 칸 상점으로 여는 칸이 남아 있어야 한다. 값은 순서마다 다르다
//   종      해금한 종만 산다. 새 개체는 빈 파티 칸에 숨김으로, 없으면 박스로
// 순수 함수이며 저장을 쓰지 않는다. 저장은 거래 실행기가 한다.
import { putPet } from "../box/slots.js";
import type { DexOptions } from "../dex/data";
import { randomNature } from "../dex/natures.js";
import { nextPetId } from "../egg/open.js";
import type { Rand } from "../egg/hatch";
import { EGG_V3_RULES, SAVE_V3_RULES } from "../save/rules.js";
import { localDate } from "../shared/clock.js";
import type { EggV3, PetV3, SaveV3 } from "../shared/save-v3";
import { eggPool, find, slotPrice } from "./catalog-v3.js";

export type BuyFailure =
  | "no-product" // 그런 상품이 없다
  | "not-enough" // 포인트가 모자라다
  | "daycare-full" // 돌보미집이 가득 찼다
  | "no-locked-slot" // 상점으로 열 칸이 남지 않았다
  | "not-unlocked"; // 해금하지 않은 종이다

export interface BuyResult {
  ok: boolean;
  reason?: BuyFailure;
  spent?: number;
  balance?: number;
  eggId?: string;
  petId?: string;
  slotIndex?: number;
  toBox?: boolean;
}

// 다음 알 식별자 — 기존 `e숫자` 중 가장 큰 수 다음
export function nextEggId(save: SaveV3): string {
  let max = 0;
  for (const e of save.eggs) {
    const m = /^e(\d+)$/.exec(e.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `e${max + 1}`;
}

// 상점으로 이미 연 칸 수 — 남은 잠긴 칸으로 센다
const boughtSlots = (save: SaveV3): number =>
  SAVE_V3_RULES.party.shopUnlock - save.party.slots.filter((s) => s.state === "locked" && s.unlockBy === "shop").length;

// 새 개체를 파티나 박스에 넣는다
function placeNew(save: SaveV3, petId: string): { slotIndex?: number; toBox: boolean } {
  const i = save.party.slots.findIndex((s) => s.state === "empty");
  if (i >= 0) {
    save.party.slots[i] = { state: "pokemon", petId, hidden: true };
    return { slotIndex: i, toBox: false };
  }
  putPet(save.boxes, petId);
  return { toBox: true };
}

export function buy(save: SaveV3, productId: string, now: number, rand: Rand, opts?: DexOptions): BuyResult {
  const slot = productId === "party-slot";
  const product = slot ? null : find(productId, opts);
  const price = slot ? slotPrice(boughtSlots(save)) : product?.price ?? null;

  if (price === null) return { ok: false, reason: slot ? "no-locked-slot" : "no-product" };
  if (save.points.balance < price) return { ok: false, reason: "not-enough" };

  // 검사 — 값을 바꾸기 전에 모두 본다
  if (product?.kind === "egg" && save.eggs.length >= EGG_V3_RULES.maxEggs) return { ok: false, reason: "daycare-full" };
  if (product?.kind === "species" && !save.dex.unlocked.includes(product.ref)) return { ok: false, reason: "not-unlocked" };

  save.points.balance -= price;
  const done: BuyResult = { ok: true, spent: price, balance: save.points.balance };

  if (slot) {
    const i = save.party.slots.findIndex((s) => s.state === "locked" && s.unlockBy === "shop");
    if (i >= 0) save.party.slots[i] = { state: "empty" };
    return { ...done, slotIndex: i };
  }

  if (product?.kind === "egg") {
    const egg: EggV3 = {
      id: nextEggId(save),
      kind: product.ref,
      boughtAt: now,
      remainMs: EGG_V3_RULES.readyMs,
      ready: false,
      candidates: eggPool(product.ref, opts) ?? [...save.dex.unlocked],
      careCooldownMs: 0,
      actions: { pat: 0, song: 0 },
    };
    save.eggs.push(egg);
    return { ...done, eggId: egg.id };
  }

  if (product?.kind === "tool") {
    save.bag[product.ref] = (save.bag[product.ref] ?? 0) + 1;
    return done;
  }

  // 종 지정 구매 — 새 개체를 만든다
  const id = nextPetId(save);
  const pet: PetV3 = {
    id,
    species: product?.ref ?? productId,
    shiny: false,
    nature: randomNature(rand, opts).id,
    size: 2,
    level: SAVE_V3_RULES.pet.level,
    exp: SAVE_V3_RULES.pet.exp,
    affinity: SAVE_V3_RULES.pet.affinity,
    affinityProgressMs: 0,
    fullness: SAVE_V3_RULES.pet.fullness,
    fullnessProgressMs: 0,
    mood: SAVE_V3_RULES.pet.mood,
    feedCooldownMs: 0, playCooldownMs: 0, playWindowMs: 0, playStreak: 0,
    buffs: [],
    home: { dx: -24, dy: -60 },
    since: now,
    stage: 0,
    evolved: [],
    daily: { date: localDate(now), gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  };
  save.pets.push(pet);
  if (!save.dex.obtained.includes(pet.species)) save.dex.obtained.push(pet.species);
  const where = placeNew(save, id);
  return { ...done, petId: id, ...where };
}
