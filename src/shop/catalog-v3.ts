// 상점 상품 목록 v3 — 가격은 docs/specs/balance.md 가격표. 값은 한 곳에서만 가진다.
//
//   알          data/eggs.json 의 price
//   진화용 도구  data/evo-items.json 의 종류 공통 가격 (SHOP_V3_RULES.evoItemPrice)
//   그 밖 도구   data/items.json 의 price. null 이면 팔지 않는다
//   파티 칸     SHOP_V3_RULES.slotPrices — 첫 칸과 둘째 칸의 값이 다르다
//   종 지정     data/unlocks.json 의 shop 가격. 해금한 종만 산다
// 값을 두 곳에 적지 않는다. 그래야 가격이 어긋나지 않는다.
// 기존 S4 의 src/shop/catalog.ts 와 별개다. 그쪽은 v2 경로가 계속 쓴다.
import { isMetaKey, loadJson, type DexOptions } from "../dex/data.js";
import { SHOP_V3_RULES } from "../save/rules.js";

export type ProductKind = "egg" | "tool" | "party-slot" | "species";

export interface Product {
  id: string;
  ko: string;
  price: number;
  kind: ProductKind;
  ref: string; // 알 종류 · 도구 식별자 · 종 슬러그
}

interface EggEntry {
  ko: string;
  price: number;
}

interface ItemEntry {
  ko: string;
  price: number | null;
}

interface EvoItemEntry {
  ko: string;
}

interface UnlockEntry {
  shop?: number;
}

const eggs = (opts?: DexOptions): Record<string, EggEntry> => loadJson<Record<string, EggEntry>>("eggs.json", opts);
const items = (opts?: DexOptions): Record<string, ItemEntry> => loadJson<Record<string, ItemEntry>>("items.json", opts);
const evoItems = (opts?: DexOptions): Record<string, EvoItemEntry> => loadJson<Record<string, EvoItemEntry>>("evo-items.json", opts);
const unlocks = (opts?: DexOptions): Record<string, UnlockEntry> => loadJson<Record<string, UnlockEntry>>("unlocks.json", opts);

// 도구 하나의 가격. 팔지 않으면 null
export function toolPrice(id: string, opts?: DexOptions): number | null {
  if (isMetaKey(id)) return null;
  const item = items(opts)[id];
  if (item) return item.price;
  return evoItems(opts)[id] ? SHOP_V3_RULES.evoItemPrice : null;
}

export function toolName(id: string, opts?: DexOptions): string | null {
  if (isMetaKey(id)) return null;
  return items(opts)[id]?.ko ?? evoItems(opts)[id]?.ko ?? null;
}

// 파티 칸 하나의 가격. 이미 산 칸 수로 값이 달라진다. 더 살 수 없으면 null
export function slotPrice(bought: number): number | null {
  return SHOP_V3_RULES.slotPrices[bought] ?? null;
}

// 종 지정 구매 가격. 상점에서 팔지 않는 종이면 null
export function speciesPrice(slug: string, opts?: DexOptions): number | null {
  return unlocks(opts)[slug]?.shop ?? null;
}

export function eggPrice(kind: string, opts?: DexOptions): number | null {
  if (isMetaKey(kind)) return null;
  return eggs(opts)[kind]?.price ?? null;
}

export function eggName(kind: string, opts?: DexOptions): string | null {
  if (isMetaKey(kind)) return null;
  return eggs(opts)[kind]?.ko ?? null;
}

// 알에서 나올 수 있는 종. `unlocked` 이면 해금한 종에서 뽑는다는 뜻이라 여기서는 빈 배열
export function eggPool(kind: string, opts?: DexOptions): string[] | null {
  const raw = loadJson<Record<string, { pool?: unknown }>>("eggs.json", opts)[kind]?.pool;
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : null;
}

// 상품 하나를 찾는다. 알 · 도구 · 종 순서로 본다
export function find(id: string, opts?: DexOptions): Product | null {
  const price = eggPrice(id, opts);
  if (price !== null) return { id, ko: eggName(id, opts) ?? id, price, kind: "egg", ref: id };

  const tool = toolPrice(id, opts);
  if (tool !== null) return { id, ko: toolName(id, opts) ?? id, price: tool, kind: "tool", ref: id };

  const species = speciesPrice(id, opts);
  if (species !== null) return { id, ko: id, price: species, kind: "species", ref: id };

  return null;
}
