// 가격과 진행 보상의 단일 원본
import { loadJson } from "../dex/data";

export interface ShopRules {
  slots: number[];
  mint: number;
  berry: number;
  shiny: number;
  rewards: { unlock: number; evolve: number; milestone: number };
  milestones: number[];
  evolutionAffinity: number[];
}

export const SHOP = loadJson<ShopRules>("shop.json");
