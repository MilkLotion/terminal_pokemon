// 배너 하나의 문구 — 제목, 대상, `바로가기` 목적지 (Figma `Notification Banner` `338:732`)
//
// 부화 배너는 결과 포켓몬을, 진화 배너는 결과 종을 보이지 않는다 (docs/specs/ui-components.md C-19)
import { defOf } from "../achievement/core.js";
import { petName, t } from "../main/text.js";
import type { BannerView } from "../shared/manage";
import type { SaveV3 } from "../shared/save-v3";
import { parseKey } from "./queue.js";

// 대상이 이미 사라졌으면 null — 부른 쪽은 그 배너를 건너뛴다
export function bannerOf(save: SaveV3, key: string): BannerView | null {
  const k = parseKey(key);
  if (!k) return null;
  const go = t("banner.go");
  if (k.kind === "hatch") {
    const at = save.eggs.findIndex((e) => e.id === k.target);
    if (at < 0) return null;
    return { key, kind: "hatch", title: t("banner.hatch"), target: t("banner.egg", { n: at + 1 }), go, route: { to: "daycare" } };
  }
  if (k.kind === "evolve") {
    const pet = save.pets.find((p) => p.id === k.target);
    if (!pet) return null;
    return { key, kind: "evolve", title: t("banner.evolve"), target: `${petName(pet.species)} Lv.${pet.level}`, go, route: { to: "pet", petId: pet.id } };
  }
  const def = defOf(k.target);
  if (!def) return null;
  return { key, kind: "achievement", title: t("banner.achievement"), target: def.ko, go, route: { to: "achievements", id: k.target } };
}
