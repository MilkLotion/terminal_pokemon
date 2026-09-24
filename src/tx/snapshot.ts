// 화면이 읽는 모양 — 계약은 docs/specs/modules.md 의 `settings:snapshot`, 화면은 Figma `05 · Screens`
//
// 저장을 그대로 넘기지 않는다. 화면이 바로 그릴 수 있는 값으로 바꿔서 넘긴다.
//   슬러그 대신 한국어 이름, ms 대신 초·분 정수, 만복도 값 대신 구간 이름
// 저장을 쓰지 않는다. 읽기만 한다.
// 시간 표기는 반올림한다. 저장은 ms 정수로 두고 화면만 사람이 읽는 단위로 본다 (docs/specs/modules.md "저장 시점")
import { EGG_V3_RULES, SAVE_V3_RULES } from "../save/rules.js";
import { growthOf, progressTo } from "../dex/growth.js";
import { profile } from "../dex/species.js";
import { itemOf } from "../bag/use.js";
import { eggName } from "../shop/catalog-v3.js";
import { zoneOf, type FullnessZone } from "../state/time-v3.js";
import { petName } from "../main/text.js";
import type { PetV3, SaveV3 } from "../shared/save-v3";

export interface PetView {
  id: string;
  species: string;
  name: string; // 화면에 보이는 종 이름
  shiny: boolean;
  level: number;
  percentToNext: number; // 다음 레벨까지 백분율
  types: string[];
  nature: string;
  affinity: number;
  fullness: number;
  zone: FullnessZone; // 만복도 구간 — 화면의 상태 표시
  hidden: boolean;
  feedReady: boolean; // 밥 주기 쿨타임이 끝났다
  feedInSec: number; // 남은 쿨타임 초
  playReady: boolean; // 놀아주기 쿨타임이 끝났다
  playStreak: number; // 이어서 놀아준 횟수
  longPlay: boolean; // 오래 놀아주기 상태다
  buffs: { kind: string; remainMin: number }[];
}

export interface SlotView {
  index: number;
  state: "pokemon" | "empty" | "locked";
  unlockBy?: "shop" | "achievement";
  pet?: PetView;
}

export interface EggView {
  id: string;
  kind: string;
  name: string; // 랜덤알 · 태고의돌
  ready: boolean;
  remainSec: number;
  percent: number; // 준비 진행 백분율
  careReady: boolean;
  actions: { pat: number; song: number };
}

export interface BoxView {
  id: string;
  name: string;
  used: number;
  size: number;
  slots: (PetView | null)[];
}

export interface BagItemView {
  id: string;
  name: string;
  count: number;
}

export interface Snapshot {
  points: number;
  party: { slots: SlotView[]; shown: number; usable: number };
  boxes: BoxView[];
  eggs: { list: EggView[]; used: number; size: number };
  bag: BagItemView[];
  dex: { unlocked: number; obtained: number; shiny: number };
  achievements: { total: number; unclaimed: number };
}

const sec = (ms: number): number => Math.round(ms / 1000);
const min = (ms: number): number => Math.round(ms / 60_000);

// 알 준비 시간의 진행 백분율 — 남은 시간만 저장하므로 전체는 규칙표에서 온다
const eggPercent = (remainMs: number, readyMs: number): number =>
  readyMs <= 0 ? 100 : Math.min(100, Math.max(0, Math.round(((readyMs - remainMs) / readyMs) * 100)));

export function petView(pet: PetV3, hidden: boolean): PetView {
  const rate = growthOf(pet.species);
  const { percent } = progressTo(rate, pet.exp);
  return {
    id: pet.id,
    species: pet.species,
    name: petName(pet.species),
    shiny: pet.shiny,
    level: pet.level,
    percentToNext: percent,
    types: profile(pet.species).types,
    nature: pet.nature,
    affinity: pet.affinity,
    fullness: pet.fullness,
    zone: zoneOf(pet.fullness),
    hidden,
    feedReady: pet.feedCooldownMs <= 0,
    feedInSec: sec(pet.feedCooldownMs),
    playReady: pet.playCooldownMs <= 0,
    playStreak: pet.playStreak,
    longPlay: pet.buffs.some((b) => b.kind === "long-play" && b.remainMs > 0),
    buffs: pet.buffs.map((b) => ({ kind: b.kind, remainMin: min(b.remainMs) })),
  };
}

// 전체 준비 시간과 칸 수는 규칙표에서 온다. 시험에서 다른 값을 꽂을 수 있게 받을 수도 있다
export function snapshot(
  save: SaveV3,
  eggReadyMs: number = EGG_V3_RULES.readyMs,
  boxSize: number = SAVE_V3_RULES.box.size,
  maxEggs: number = EGG_V3_RULES.maxEggs,
): Snapshot {
  const byId = new Map(save.pets.map((p) => [p.id, p]));

  const slots: SlotView[] = save.party.slots.map((s, index) => {
    if (s.state !== "pokemon" || !s.petId) return { index, state: s.state, unlockBy: s.unlockBy };
    const pet = byId.get(s.petId);
    if (!pet) return { index, state: "empty" };
    return { index, state: "pokemon", pet: petView(pet, s.hidden === true) };
  });

  const boxes: BoxView[] = save.boxes.map((b) => ({
    id: b.id,
    name: b.name,
    used: b.slots.filter((x) => x !== null).length,
    size: boxSize,
    slots: b.slots.map((id) => {
      const pet = id ? byId.get(id) : undefined;
      return pet ? petView(pet, true) : null;
    }),
  }));

  const eggs: EggView[] = save.eggs.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: eggName(e.kind) ?? e.kind,
    ready: e.ready,
    remainSec: sec(e.remainMs),
    percent: eggPercent(e.remainMs, eggReadyMs),
    careReady: e.careCooldownMs <= 0,
    actions: { ...e.actions },
  }));

  const bag: BagItemView[] = Object.entries(save.bag)
    .filter(([, n]) => n > 0)
    .map(([id, count]) => ({ id, name: itemOf(id)?.ko ?? id, count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const claimed = Object.values(save.achievements);
  return {
    points: save.points.balance,
    party: {
      slots,
      shown: slots.filter((s) => s.pet && !s.pet.hidden).length,
      usable: slots.filter((s) => s.state !== "locked").length,
    },
    boxes,
    eggs: { list: eggs, used: eggs.length, size: maxEggs },
    bag,
    dex: { unlocked: save.dex.unlocked.length, obtained: save.dex.obtained.length, shiny: save.dex.shinyObtained.length },
    achievements: {
      total: claimed.filter((a) => a.achievedAt != null).length,
      unclaimed: claimed.filter((a) => a.achievedAt != null && a.claimedAt == null).length,
    },
  };
}
