// 해금 판정 — data/unlocks.json 의 규칙 하나를 세상(저장 + 시각)에 대 본다 (design.md "도감 · 해금")
//
// 조건 종류마다 함수 하나. 규칙에 적힌 조건은 전부 만족해야 한다. 판정은 순수 — 저장을 바꾸지 않는다
//   starter  표시다 — 항상 참 (첫 실행 선택 화면에 나온다)
//   evolve   `from` 종을 가진 마리 중 친밀도가 임계 이상인 마리가 있다. `when` 은 지금 시간대
//   shop     가격이다, 문턱이 아니다 — 항상 참. 해금된 뒤 상점에 이 값으로 나온다 (priceOf). 포인트 검사는 상점 모듈이
//   party    파티 마리 수 ≥ count
//   work     에이전트와 함께 일한 누적 시간 totals.workMs ≥ hours
//   streak   연속 교감 일수 daily.streak ≥ days
//   bond     `of` 종을 가진 마리의 친밀도 ≥ affinity
//   time     지금 시간대 = day | night
//   event    오늘(로컬) = "MM-DD"
// 시간대는 RULES.night — 18시부터 다음날 6시 전까지 night [스펙 미확정]

import { localDate } from "../shared/clock";
import type { DayPart, Pet, UnlockRule, World } from "../shared/types";
import { isMetaKey, loadJson, normalizeSlug, type DexOptions } from "./data";

export const RULES = {
  night: { from: 18, to: 6 }, // from 이상 또는 to 미만이면 night
};

export type UnlockRules = Record<string, UnlockRule>;

export const dayPartOf = (hour: number): DayPart => (hour >= RULES.night.from || hour < RULES.night.to ? "night" : "day");

// 그 종을 가진 마리들 — 슬러그는 정규화해 비교
const petsOf = (species: string, party: Pet[]): Pet[] => {
  const key = normalizeSlug(species);
  return party.filter((p) => normalizeSlug(p.species) === key);
};

// ── 조건별 판정 ────────────────────────────────────────────────────────────────
export const checkStarter = (_flag: true, _world: World): boolean => true;

export function checkEvolve(cond: NonNullable<UnlockRule["evolve"]>, world: World): boolean {
  if (cond.when && dayPartOf(world.hour) !== cond.when) return false;
  return petsOf(cond.from, world.save.party).some((p) => p.affinity >= cond.affinity);
}

export const checkShop = (_price: number, _world: World): boolean => true;

export const checkParty = (cond: NonNullable<UnlockRule["party"]>, world: World): boolean => world.save.party.length >= cond.count;

export const checkWork = (cond: NonNullable<UnlockRule["work"]>, world: World): boolean => world.save.totals.workMs >= cond.hours * 3600_000;

export const checkStreak = (cond: NonNullable<UnlockRule["streak"]>, world: World): boolean => world.save.daily.streak >= cond.days;

export const checkBond = (cond: NonNullable<UnlockRule["bond"]>, world: World): boolean =>
  petsOf(cond.of, world.save.party).some((p) => p.affinity >= cond.affinity);

export const checkTime = (part: DayPart, world: World): boolean => dayPartOf(world.hour) === part;

export const checkEvent = (cond: NonNullable<UnlockRule["event"]>, world: World): boolean => localDate(world.now).slice(5) === cond.date;

// ── 규칙 하나 ──────────────────────────────────────────────────────────────────
// 적힌 조건 전부 만족. 아는 조건이 하나도 없는 규칙(빈 객체)은 거짓 — 해금 길이 없는 것으로 본다
export function check(rule: UnlockRule, world: World): boolean {
  let seen = 0;
  const need = (ok: boolean): boolean => {
    seen += 1;
    return ok;
  };
  if (rule.starter !== undefined && !need(checkStarter(rule.starter, world))) return false;
  if (rule.evolve !== undefined && !need(checkEvolve(rule.evolve, world))) return false;
  if (rule.shop !== undefined && !need(checkShop(rule.shop, world))) return false;
  if (rule.party !== undefined && !need(checkParty(rule.party, world))) return false;
  if (rule.work !== undefined && !need(checkWork(rule.work, world))) return false;
  if (rule.streak !== undefined && !need(checkStreak(rule.streak, world))) return false;
  if (rule.bond !== undefined && !need(checkBond(rule.bond, world))) return false;
  if (rule.time !== undefined && !need(checkTime(rule.time, world))) return false;
  if (rule.event !== undefined && !need(checkEvent(rule.event, world))) return false;
  return seen > 0;
}

// 새로 해금될 슬러그 — 규칙을 만족하고 아직 save.unlocked 에 없는 것. 규칙 표의 순서대로
export function evaluate(rules: UnlockRules, world: World): string[] {
  const done = new Set(world.save.unlocked.map(normalizeSlug));
  const out: string[] = [];
  for (const [slug, rule] of Object.entries(rules)) {
    if (isMetaKey(slug) || done.has(normalizeSlug(slug))) continue;
    if (check(rule, world)) out.push(slug);
  }
  return out;
}

// 첫 실행 선택 화면에 나오는 종
export const starters = (rules: UnlockRules): string[] =>
  Object.entries(rules)
    .filter(([slug, rule]) => !isMetaKey(slug) && rule.starter === true)
    .map(([slug]) => slug);

// 상점 가격 — 없으면 null (해금되면 무료 획득 목록에)
export const priceOf = (rule: UnlockRule): number | null => (typeof rule.shop === "number" ? rule.shop : null);

// 그 규칙으로 지금 진화할 마리들 — evolve 조건이 참일 때 커맨드 처리기가 종을 바꿀 대상
export function evolvers(rule: UnlockRule, world: World): Pet[] {
  const cond = rule.evolve;
  if (!cond || !check(rule, world)) return [];
  return petsOf(cond.from, world.save.party).filter((p) => p.affinity >= cond.affinity);
}

// data/unlocks.json 전부
export const unlockRules = (opts?: DexOptions): UnlockRules => loadJson<UnlockRules>("unlocks.json", opts);
