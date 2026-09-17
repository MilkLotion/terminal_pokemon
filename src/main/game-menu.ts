// S4 조작 메뉴. S5 설정창도 같은 명령을 사용
import type { MenuItemConstructorOptions as Item } from "electron";
import type { Command, Pet, SaveV2 } from "../shared/types";
import { natures } from "../dex/natures";
import { evolutionOptions, looksFor } from "../dex/progress";
import { speciesForSale } from "../shop/core";
import { SHOP } from "../shop/catalog";
import { natureName, petLabel, petName, t } from "./text";

type Run = (command: Command) => void;
const priced = (label: string, price: number) => `${label} · ${price} P`;

export function gameMenu(save: SaveV2, run: Run): Item[] {
  const purchase = (label: string, price: number, args: Record<string, unknown>, target?: string, enabled = true): Item => ({
    label: priced(label, price), enabled: enabled && save.points >= price,
    click: () => run({ cmd: "shop.buy", args, target, from: "menu" }),
  });
  const slotPrice = SHOP.slots[save.slots - 1];
  const shop: Item[] = [
    { label: t("game.points", { n: save.points }), enabled: false },
    purchase(t("game.slot"), slotPrice ?? 0, { item: "slot" }, undefined, slotPrice !== undefined),
    purchase(t("game.berry", { n: save.inventory.berry ?? 0 }), SHOP.berry, { item: "berry" }),
    { label: t("game.species"), submenu: speciesForSale(save).map((entry) => purchase(petName(entry.species), entry.price, { item: "species", species: entry.species }, undefined, save.party.length < save.slots)) },
  ];
  return [
    { label: t("game.shop"), submenu: shop },
    { label: t("game.party"), submenu: save.party.map((pet) => ({ label: petLabel(pet), submenu: petGameMenu(save, pet, run) })) },
    { label: t("game.dex", { n: save.unlocked.length }), submenu: save.unlocked.map((slug) => ({ label: petName(slug), enabled: false })) },
  ];
}

export function petGameMenu(save: SaveV2, pet: Pet, run: Run): Item[] {
  const command = (cmd: Command["cmd"], args?: Record<string, unknown>) => run({ cmd, target: pet.id, args, from: "menu" });
  const ready = evolutionOptions(save, pet.id, Date.now()).filter((o) => o.ready);
  const mint: Item[] = natures().map((n) => ({ label: natureName(n.id), enabled: pet.nature !== n.id && save.points >= SHOP.mint, click: () => command("shop.buy", { item: "mint", nature: n.id }) }));
  const ownsColor = pet.shiny || !!save.inventory[`shiny:${pet.id}`];
  const ownsStone = pet.everstone || !!save.inventory[`everstone:${pet.id}`];
  return [
    ...(ready.length ? [{ label: t("game.evolve"), submenu: ready.map((o) => ({ label: petName(o.species), click: () => command("evolve", { species: o.species }) })) }] : []),
    { label: t("game.look"), submenu: looksFor(save, pet).map((look) => ({ label: petName(look), type: "radio", checked: (pet.look ?? pet.species) === look, click: () => command("pet.look", { look }) })) },
    { label: priced(t("game.mint"), SHOP.mint), submenu: mint },
    { label: ownsStone ? t("game.everstone") : priced(t("game.everstone"), SHOP.everstone), type: "checkbox", checked: pet.everstone,
      enabled: ownsStone || save.points >= SHOP.everstone,
      click: () => ownsStone ? command("pet.set", { everstone: !pet.everstone }) : command("shop.buy", { item: "everstone" }) },
    { label: ownsColor ? t("game.shiny") : priced(t("game.shiny"), SHOP.shiny), type: "checkbox", checked: pet.shiny,
      enabled: ownsColor || save.points >= SHOP.shiny,
      click: () => ownsColor ? command("pet.look", { shiny: !pet.shiny }) : command("shop.buy", { item: "shiny" }) },
    { label: t("game.shown"), type: "checkbox", checked: pet.shown, click: () => command(pet.shown ? "party.hide" : "party.show") },
  ];
}
