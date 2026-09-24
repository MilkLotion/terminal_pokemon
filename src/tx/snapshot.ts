// 화면이 읽는 모양 — 계약은 docs/specs/modules.md 의 `settings:snapshot`, 화면은 Figma `05 · Screens`
//
// 저장을 그대로 넘기지 않는다. 화면이 바로 그릴 수 있는 값으로 바꿔서 넘긴다.
//   슬러그 대신 한국어 이름, ms 대신 초·분 정수, 만복도 값 대신 구간 이름
// 모양은 src/shared/manage.d.ts 가 가진다. 렌더러와 같은 타입을 본다.
// 저장을 쓰지 않는다. 읽기만 한다.
// 시간 표기는 반올림한다. 저장은 ms 정수로 두고 화면만 사람이 읽는 단위로 본다 (docs/specs/modules.md "저장 시점")
import { defs } from "../achievement/core.js";
import { EGG_V3_RULES, SAVE_V3_RULES } from "../save/rules.js";
import { growthOf, progressTo } from "../dex/growth.js";
import { profile } from "../dex/species.js";
import { itemOf } from "../bag/use.js";
import { eggName } from "../shop/catalog-v3.js";
import { zoneOf } from "../state/time-v3.js";
import { natureName, petName, typeName } from "../main/text.js";
import type { AchievementView, BagItemView, BoxView, EggView, PetView, SlotView, Snapshot } from "../shared/manage";
import { nameOfItem, shopList } from "./lists.js";
import type { PetV3, SaveV3 } from "../shared/save-v3";

// 보상 종류 → 화면 문구. 종류가 하나뿐이라 표로 둔다
const REWARD_WORD: Record<string, string> = { "party-slot": "파티 칸 +1" };

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
    types: profile(pet.species).types.map((t) => typeName(t)),
    nature: natureName(pet.nature),
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
    .map(([id, count]) => ({ id, name: itemOf(id)?.ko ?? nameOfItem(id), count }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const achievements: AchievementView[] = defs().map(([id, def]) => {
    const row = save.achievements[id];
    return {
      id,
      name: def.ko,
      desc: def.desc,
      reward: REWARD_WORD[def.reward] ?? def.reward,
      state: row?.claimedAt != null ? "claimed" : row?.achievedAt != null ? "achieved" : "locked",
    };
  });

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
    shop: shopList(save),
    achievements: {
      total: claimed.filter((a) => a.achievedAt != null).length,
      unclaimed: claimed.filter((a) => a.achievedAt != null && a.claimedAt == null).length,
      list: achievements,
    },
    settings: {
      language: save.settings.language,
      startOnLogin: save.settings.startOnLogin,
      sound: save.settings.sound,
      sleepAfterMin: save.settings.sleepAfterMin,
      playArea: save.settings.playArea.mode,
      hasRegion: save.settings.playArea.rect != null,
    },
  };
}
