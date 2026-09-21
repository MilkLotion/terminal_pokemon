// 구매는 검증 뒤 적용. 그림 확인과 파일 쓰기는 명령 처리기 소유
import { randomNature } from "../dex/natures";
import { profile } from "../dex/species";
import { unlockRules } from "../dex/unlocks";
import { record } from "../dex/progress";
import { emptyPet } from "../save/store";
import { SAVE_RULES, isNatureId } from "../save/rules";
import type { CommandResult, SaveV2 } from "../shared/types";
import { SHOP } from "./catalog";

export function speciesForSale(save: SaveV2): { species: string; price: number }[] {
  const rules = unlockRules();
  return save.unlocked.flatMap((species) => {
    const rule = rules[species];
    return rule && (!rule.evolve || rule.shop !== undefined) ? [{ species, price: rule.shop ?? 0 }] : [];
  });
}

export function buy(save: SaveV2, id: string | undefined, args: Record<string, unknown>, now: number, rng = Math.random): CommandResult {
  const item = args.item;
  const pet = save.party.find((p) => p.id === id);
  let price: number;
  let apply: () => void;
  if (item === "slot") {
    if (save.slots >= SAVE_RULES.slots.max) return { ok: false, reason: "max-slots" };
    price = SHOP.slots[save.slots - 1]!;
    apply = () => { save.slots++; };
  } else if (item === "species") {
    const entry = speciesForSale(save).find((e) => e.species === args.species);
    if (!entry) return { ok: false, reason: "locked-species" };
    if (save.party.length >= save.slots) return { ok: false, reason: "party-full" };
    price = entry.price;
    apply = () => {
      let n = 1;
      while (save.party.some((p) => p.id === `p${n}`)) n++;
      const added = emptyPet({ id: `p${n}`, species: entry.species, now, nature: randomNature(rng).id });
      added.mood = profile(entry.species).moodBase;
      save.party.push(added);
    };
  } else if (item === "berry") {
    price = SHOP.berry;
    apply = () => { save.inventory.berry = (save.inventory.berry ?? 0) + 1; };
  } else if (item === "mint" || item === "shiny") {
    if (!pet) return { ok: false, reason: "no-pet" };
    if (item === "mint" && !isNatureId(args.nature)) return { ok: false, reason: "bad-nature" };
    if ((item === "mint" && pet.nature === args.nature) ||
        (item === "shiny" && (pet.shiny || save.inventory[`shiny:${pet.id}`]))) return { ok: false, reason: "already-owned" };
    price = SHOP[item];
    apply = () => {
      if (item === "mint" && isNatureId(args.nature)) pet.nature = args.nature;
      if (item === "shiny") { pet.shiny = true; save.inventory[`shiny:${pet.id}`] = 1; }
    };
  } else return { ok: false, reason: "unknown-item" };
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: "bad-price" };
  if (save.points < price) return { ok: false, reason: "not-enough-points", price };
  apply();
  save.points -= price;
  record(save, now, "buy", { item, id, price, species: args.species });
  return { ok: true, reason: "ok", item, price };
}
