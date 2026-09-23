// 알 열기 — 규칙은 docs/specs/s5.md "알". 준비가 끝난 알을 사용자가 직접 열 때 부른다.
//
// 하는 일은 넷이다. 결과 판정, 개체 생성, 배치, 도감 기록.
// 배치는 빈 파티 칸에 숨김으로 넣는다. 칸이 없으면 박스로 보낸다.
// 조건으로 나온 종은 해금되지 않았을 수 있다. 그때는 해금 기록도 함께 남긴다.
// 무작위는 받아서 쓴다 — 자체 검사가 결과를 정할 수 있어야 한다.
import { putPet } from "../box/slots.js";
import { randomNature } from "../dex/natures.js";
import type { DexOptions } from "../dex/data";
import { SAVE_V3_RULES } from "../save/rules.js";
import { localDate } from "../shared/clock.js";
import type { PetV3, SaveV3 } from "../shared/save-v3";
import { decide, type Rand } from "./hatch.js";

export type OpenFailure = "no-egg" | "not-ready" | "no-candidate";

export interface OpenResult {
  ok: boolean;
  reason?: OpenFailure;
  petId?: string;
  species?: string;
  shiny?: boolean;
  slotIndex?: number; // 파티에 들어갔으면 칸 번호
  toBox?: boolean; // 파티가 가득 차 박스로 갔다
  conditionId?: string | null; // 조건으로 정해졌으면 그 식별자
}

// 다음 개체 식별자 — 기존 `p숫자` 중 가장 큰 수 다음
export function nextPetId(save: SaveV3): string {
  let max = 0;
  for (const p of save.pets) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `p${max + 1}`;
}

export function open(save: SaveV3, eggId: string, now: number, rand: Rand, opts?: DexOptions): OpenResult {
  const i = save.eggs.findIndex((e) => e.id === eggId);
  if (i < 0) return { ok: false, reason: "no-egg" };
  const egg = save.eggs[i];
  if (!egg) return { ok: false, reason: "no-egg" };
  if (!egg.ready) return { ok: false, reason: "not-ready" };

  const result = decide(egg.actions, egg.candidates, rand, opts);
  if (!result) return { ok: false, reason: "no-candidate" };

  const id = nextPetId(save);
  const date = localDate(now);
  const pet: PetV3 = {
    id,
    species: result.species,
    shiny: result.shiny,
    nature: randomNature(rand, opts).id,
    size: 2,
    level: SAVE_V3_RULES.pet.level,
    exp: SAVE_V3_RULES.pet.exp,
    affinity: SAVE_V3_RULES.pet.affinity,
    affinityProgressMs: 0,
    fullness: SAVE_V3_RULES.pet.fullness,
    fullnessProgressMs: 0,
    mood: SAVE_V3_RULES.pet.mood,
    feedCooldownMs: 0,
    buffs: [],
    home: { dx: -24, dy: -60 },
    since: now,
    stage: 0,
    evolved: [],
    daily: { date, gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  };
  save.pets.push(pet);

  // 배치 — 빈 파티 칸에 숨김으로. 없으면 박스로
  const slotIndex = save.party.slots.findIndex((s) => s.state === "empty");
  let toBox = false;
  if (slotIndex >= 0) {
    save.party.slots[slotIndex] = { state: "pokemon", petId: id, hidden: true };
  } else {
    putPet(save.boxes, id);
    toBox = true;
  }

  // 도감 — 조건으로 나온 종은 해금 기록이 없을 수 있다
  if (!save.dex.unlocked.includes(result.species)) save.dex.unlocked.push(result.species);
  if (!save.dex.obtained.includes(result.species)) save.dex.obtained.push(result.species);
  if (result.shiny && !save.dex.shinyObtained.includes(result.species)) save.dex.shinyObtained.push(result.species);
  if (result.conditionId) save.dex.discovered[result.species] = result.conditionId;

  save.eggs.splice(i, 1);
  return {
    ok: true,
    petId: id,
    species: result.species,
    shiny: result.shiny,
    slotIndex: slotIndex >= 0 ? slotIndex : undefined,
    toBox,
    conditionId: result.conditionId,
  };
}
