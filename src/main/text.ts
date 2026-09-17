// 화면 문구·이름의 typed facade — lib/i18n.js · lib/names.js(S2 유지 · S5 에 이식).
// 메뉴·트레이는 슬러그가 아니라 "피카츄" 를 보인다. 성격 이름은 data/natures.json 의 name (한국어·영어) — 언어 파일에 따로 두지 않는다
import { nature as natureOf } from "../dex/natures";
import { unlockRules } from "../dex/unlocks";
import { STATE_RULES } from "../state/rules";
import type { Lang, NatureId, Pet } from "../shared/types";

interface I18nModule {
  t(key: string, vars?: Record<string, unknown>): string;
  langOf(config?: { lang?: unknown }, env?: NodeJS.ProcessEnv): Lang;
  setLang(next: string): Lang;
  getLang(): Lang;
  moodWord(mood: number): string;
  untilWord(nextAt: number, now?: number): string;
  DEFAULT_LANG: Lang;
  LANGS: string[];
}
interface NamesModule {
  petName(slug: string, lang?: Lang): string;
  hasName(slug: string): boolean;
}

const i18n = require("../../lib/i18n.js") as I18nModule;
const names = require("../../lib/names.js") as NamesModule;

// 문구 — {이름} 자리에 vars 를 채운다. 없는 키는 한국어 → 키 이름 순으로 떨어져 화면이 비지 않는다
export const t = (key: string, vars?: Record<string, unknown>): string => i18n.t(key, vars);
export const langOf = (config?: { lang?: unknown }, env?: NodeJS.ProcessEnv): Lang => i18n.langOf(config, env);
export const setLang = (next: string): Lang => i18n.setLang(next);
export const getLang = (): Lang => i18n.getLang();
export const moodWord = (mood: number): string => i18n.moodWord(mood);
export const untilWord = (nextAt: number, now?: number): string => i18n.untilWord(nextAt, now);

// 종의 화면 이름 — 표에 없는 이름은 슬러그 그대로
export const petName = (slug: string, lang: Lang = getLang()): string => names.petName(slug, lang);

// 성격의 화면 이름 — 모르는 id 는 그대로 보여 무엇이 빠졌는지 드러나게
export const natureName = (id: NatureId | string, lang: Lang = getLang()): string => natureOf(id)?.name[lang] ?? String(id);

// 마리의 화면 이름 — 별명이 있으면 별명, 없으면 종 이름
export const petLabel = (pet: { nick: string | null; species: string }, lang: Lang = getLang()): string =>
  pet.nick ?? petName(pet.species, lang);

// 가장 필요한 상태 한 가지 — 배고픔, 낮은 기분, 다음 진화 순서
export function stateLine(pet: Pet): string {
  if (pet.hunger >= STATE_RULES.hungryAt) return t("state.hungry");
  if (pet.mood < 40) return t("state.mood", { mood: moodWord(pet.mood) });
  const thresholds = Object.values(unlockRules()).flatMap((r) => r.evolve?.from === pet.species ? [r.evolve.affinity] : []);
  if (thresholds.length && !pet.everstone) return t("state.evolution", { n: Math.max(0, Math.ceil(Math.min(...thresholds) - pet.affinity)) });
  return t("state.mood", { mood: moodWord(pet.mood) });
}
