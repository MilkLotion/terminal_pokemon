// 해금과 진화. 저장과 시각을 받아 변경. 파일 쓰기는 호출자 소유
import { lineOf, nextOf, stageOf } from "./evo";
import { check, dayPartOf, evaluate, unlockRules } from "./unlocks";
import { SHOP } from "../shop/catalog";
import { SAVE_RULES } from "../save/rules";
import type { CommandResult, Pet, SaveV2 } from "../shared/types";

export function record(save: SaveV2, now: number, kind: string, fields: Record<string, unknown>): void {
  save.log.push({ at: now, kind, ...fields });
  save.log = save.log.slice(-SAVE_RULES.log.keep);
}

export function advance(save: SaveV2, now: number): string[] {
  if (!save.party.length) return [];
  const rules = unlockRules();
  const unlocked = evaluate(rules, { now, hour: new Date(now).getHours(), save });
  for (const species of unlocked) {
    const rule = rules[species]!;
    const points = rule.starter || (Object.keys(rule).length === 1 && rule.shop !== undefined) ? 0 : SHOP.rewards.unlock;
    save.unlocked.push(species);
    save.points += points;
    record(save, now, "unlock", { species, points });
  }
  const raw = save.acc.milestones;
  const milestones: Record<string, number> = raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0)) : {};
  save.acc.milestones = milestones;
  for (const pet of save.party) {
    if (nextOf(pet.species).length) continue;
    const key = `${pet.id}:${pet.since}:${pet.species}`;
    for (const threshold of SHOP.milestones) {
      if (pet.affinity < threshold || (milestones[key] ?? 0) >= threshold) continue;
      milestones[key] = threshold;
      save.points += SHOP.rewards.milestone;
      record(save, now, "milestone", { id: pet.id, threshold, points: SHOP.rewards.milestone });
    }
  }
  return unlocked;
}

export function evolutionOptions(save: SaveV2, id: string, now: number): { species: string; affinity: number; reason: string; ready: boolean }[] {
  const pet = save.party.find((p) => p.id === id);
  if (!pet) return [];
  return nextOf(pet.species).map((step) => {
    const rule = unlockRules()[step.to];
    const cond = rule?.evolve;
    const affinity = cond?.affinity ?? SHOP.evolutionAffinity[Math.min(stageOf(pet.species), SHOP.evolutionAffinity.length - 1)]!;
    const when = cond?.when ?? step.when;
    const hour = new Date(now).getHours();
    const reason = pet.everstone ? "everstone" : pet.affinity < affinity ? "affinity" : when && when !== dayPartOf(hour) ? "time" :
      rule && !check(rule, { now, hour, save }) ? "conditions" : "ok";
    return { species: step.to, affinity, reason, ready: reason === "ok" };
  });
}

export function evolve(save: SaveV2, id: string, species: unknown, now: number): CommandResult {
  const pet = save.party.find((p) => p.id === id);
  if (!pet) return { ok: false, reason: "no-pet" };
  const options = evolutionOptions(save, id, now);
  const selected = typeof species === "string" ? options.find((o) => o.species === species) : options.length === 1 ? options[0] : undefined;
  if (!selected) return { ok: false, reason: options.length ? "choose-evolution" : "no-evolution", options };
  if (!selected.ready) return { ok: false, reason: selected.reason };
  const from = pet.species;
  pet.species = selected.species;
  delete pet.look;
  pet.stage++;
  pet.evolved = [...new Set([...pet.evolved, from, pet.species])];
  if (!save.unlocked.includes(pet.species)) save.unlocked.push(pet.species);
  save.points += SHOP.rewards.evolve;
  record(save, now, "evolve", { id, from, species: pet.species, points: SHOP.rewards.evolve });
  return { ok: true, reason: "ok", id, species: pet.species };
}

export const looksFor = (save: SaveV2, pet: Pet): string[] => lineOf(pet.species).filter((s) => save.unlocked.includes(s));

export function setLook(save: SaveV2, id: string, args: Record<string, unknown>): CommandResult {
  const pet = save.party.find((p) => p.id === id);
  if (!pet) return { ok: false, reason: "no-pet" };
  if (args.shiny !== undefined && typeof args.shiny !== "boolean") return { ok: false, reason: "bad-value" };
  if (args.look !== undefined && (typeof args.look !== "string" || !looksFor(save, pet).includes(args.look))) return { ok: false, reason: "locked-look" };
  if (args.look === undefined && args.shiny === undefined) return { ok: false, reason: "bad-value" };
  if (args.shiny === true && !pet.shiny && !(save.inventory[`shiny:${id}`] ?? 0)) return { ok: false, reason: "locked-color" };
  if (pet.shiny) save.inventory[`shiny:${id}`] = 1;
  if (typeof args.look === "string") pet.look = args.look;
  if (typeof args.shiny === "boolean") pet.shiny = args.shiny;
  return { ok: true, reason: "ok", id };
}
