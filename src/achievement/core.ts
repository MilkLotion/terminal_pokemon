// 업적 달성 판정과 보상 수령 — 규칙은 docs/specs/s5.md "파티 칸과 업적", 이름과 보상은 data/achievements.json
//
// 조건은 코드가 판정한다. 업적마다 보는 것이 달라서 데이터로 적을 수 없다.
//   show-two        파티의 두 마리를 동시에 꺼냈다. 숨긴 채 배치만 한 것은 아니다
//   starter-final   첫 선택으로 만난 개체가 더 갈 곳이 없는 종이 됐다
// 달성은 한 번 기록하면 되돌리지 않는다. 두 마리를 다시 숨겨도 달성은 남는다.
// 보상은 업적창에서 사용자가 직접 받는다. 업적당 한 번만 받는다.
import { loadJson, isMetaKey, type DexOptions } from "../dex/data.js";
import { nextOf } from "../dex/evo.js";
import type { SaveV3 } from "../shared/save-v3";

export interface AchievementDef {
  ko: string;
  desc: string;
  reward: "party-slot";
}

export type ClaimFailure = "no-achievement" | "not-achieved" | "already-claimed" | "no-locked-slot";

export interface ClaimResult {
  ok: boolean;
  reason?: ClaimFailure;
  id?: string;
  slotIndex?: number;
}

const table = (opts?: DexOptions): Record<string, AchievementDef> => loadJson<Record<string, AchievementDef>>("achievements.json", opts);

export const defs = (opts?: DexOptions): [string, AchievementDef][] =>
  Object.entries(table(opts)).filter(([id]) => !isMetaKey(id));

export const defOf = (id: string, opts?: DexOptions): AchievementDef | null => (isMetaKey(id) ? null : table(opts)[id] ?? null);

// 지금 꺼내 놓은 개체 수 — 숨긴 개체는 세지 않는다
const shownCount = (save: SaveV3): number =>
  save.party.slots.filter((s) => s.state === "pokemon" && s.petId && s.hidden !== true).length;

// 첫 개체가 최종 진화까지 갔는가 — 더 갈 곳이 없으면 최종이다
function starterIsFinal(save: SaveV3, opts?: DexOptions): boolean {
  const id = save.starterPetId;
  if (!id) return false;
  const pet = save.pets.find((p) => p.id === id);
  if (!pet) return false;
  if (!pet.evolved.length) return false; // 한 번도 진화하지 않았으면 최종이 아니다
  return nextOf(pet.species, opts).length === 0;
}

// 업적 하나의 조건을 지금 채웠는가
export function isAchieved(save: SaveV3, id: string, opts?: DexOptions): boolean {
  if (id === "show-two") return shownCount(save) >= 2;
  if (id === "starter-final") return starterIsFinal(save, opts);
  return false;
}

// 달성을 기록한다. 이번에 새로 달성한 업적을 돌려준다 — 배너가 쓴다
export function evaluate(save: SaveV3, now: number, opts?: DexOptions): string[] {
  const fresh: string[] = [];
  for (const [id] of defs(opts)) {
    const row = save.achievements[id];
    if (row?.achievedAt != null) continue; // 한 번 달성하면 되돌리지 않는다
    if (!isAchieved(save, id, opts)) continue;
    save.achievements[id] = { achievedAt: now, claimedAt: row?.claimedAt ?? null };
    fresh.push(id);
  }
  return fresh;
}

// 보상 수령 — 업적당 한 번. 파티 칸 보상은 업적으로 여는 잠긴 칸 하나를 연다
export function claim(save: SaveV3, id: string, now: number, opts?: DexOptions): ClaimResult {
  const def = defOf(id, opts);
  if (!def) return { ok: false, reason: "no-achievement" };
  const row = save.achievements[id];
  if (!row || row.achievedAt == null) return { ok: false, reason: "not-achieved" };
  if (row.claimedAt != null) return { ok: false, reason: "already-claimed" };

  const i = save.party.slots.findIndex((s) => s.state === "locked" && s.unlockBy === "achievement");
  if (i < 0) return { ok: false, reason: "no-locked-slot" };
  save.party.slots[i] = { state: "empty" };
  save.achievements[id] = { achievedAt: row.achievedAt, claimedAt: now };
  return { ok: true, id, slotIndex: i };
}
