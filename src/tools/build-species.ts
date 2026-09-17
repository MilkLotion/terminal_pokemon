// 종 프로필 기본값(data/species.defaults.json)을 만든다 — 개발용, 네트워크 필요. 배포 패키지에는 결과 JSON 만 들어간다.
//
//   npm run build && node dist/tools/build-species.js   (npm run data:build 가 네 빌드를 차례로 돈다)
//
// 출처: PokeAPI 저장소의 CSV (https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
//   pokemon.csv             포켓몬 번호 → 종 번호 · 키 · 몸무게(hg) · 기본 폼 여부
//   pokemon_species.csv     종 번호 → 전설(is_legendary) · 환상(is_mythical)
//   pokemon_stats.csv       포켓몬 번호 → 종족값 (stats.csv 의 speed 만 쓴다)
//   pokemon_types.csv       포켓몬 번호 → 타입 (types.csv 로 이름)
//   pokemon_form_types.csv  폼 고유 타입 (아르세우스 폼처럼 폼마다 타입이 다른 것)
//   pokemon_forms.csv       폼 식별자(arceus-bug · burmy-sandy) → 포켓몬 번호
// 우리 도감표(lib/dex.json)의 슬러그 1089개마다 프로필 하나. `-3d` 는 같은 종이라 떼고 본다.
//
// 슬러그 → 포켓몬 번호 잇기 (차례로 시도)
//   1. pokemon.csv 의 identifier          pikachu · rotom-wash · raichu-alola
//   2. pokemon_forms.csv 의 identifier    arceus-bug · deerling-autumn (폼만 따로 있고 포켓몬은 하나)
//   3. pokemon_species.csv 의 identifier  deoxys · lycanroc (도감은 종 이름, PokeAPI 기본 폼은 deoxys-normal) → 기본 폼
//   못 이으면 DEFAULT 로 채우고 개수를 출력한다
//
// ── 규칙표 ─────────────────────────────────────────────────────────────────────
// 백분위(pct)는 이어진 종들 안에서 0~1. 같은 값은 같은 백분위 (중앙 순위). 소수 둘째 자리로 반올림
// | 필드          | 규칙                                                                      |
// |---------------|---------------------------------------------------------------------------|
// | baseSpeed     | 종족값 speed 그대로                                                       |
// | weightKg      | pokemon.csv weight(hg) / 10                                               |
// | affinityRate  | 1.0. 전설·환상은 0.8 (귀한 종은 천천히). 가벼운 종(≤10kg)·3단계 사슬의 끝은 조정 없이 1.0 |
// | hungerRate    | 0.7 + 0.6 × 체중pct (무거우면 빨리) + (스피드pct − 0.5) × 0.2 (±0.1)      |
// | sleepiness    | 0.7 + 0.6 × 체중pct                                                      |
// | moodBase      | 60 + 타입별 MOOD 합, 55~65 로 자른다                                       |
// | moodSwing     | 스피드pct ≥ 0.8 → 1.2 · < 0.2 → 0.8 · 나머지 1.0                            |
// | likes         | 타입별 LIKES — 두 타입이면 둘(중복 제거). 표에 없는 타입은 food              |
import path from "node:path";
import type { Like } from "../shared/types";
import { DATA_DIR, csv, must, readDex, runBuild, writeLineJson } from "./pokeapi-csv";

const OUT = path.join(DATA_DIR, "species.defaults.json");

export const RULES = {
  affinity: { base: 1.0, rare: 0.8 },
  hunger: { min: 0.7, span: 0.6, speedSwing: 0.2 },
  sleepiness: { min: 0.7, span: 0.6 },
  mood: { base: 60, min: 55, max: 65 },
  swing: { fast: 0.8, slow: 0.2, high: 1.2, low: 0.8, mid: 1.0 },
};

// 타입 → 기분 기준값 보정
export const MOOD: Readonly<Record<string, number>> = {
  fairy: 5, normal: 5, electric: 3, grass: 2, water: 2, fire: 2, flying: 2, bug: 1,
  ice: -1, rock: -2, steel: -2, poison: -3, ghost: -5, dark: -5,
};

// 타입 → 무엇에 더 반응하나
export const LIKES: Readonly<Record<string, Like>> = {
  electric: "work", steel: "work", psychic: "work",
  normal: "play", fairy: "play", fighting: "play",
  water: "company", grass: "company", bug: "company",
};

// 저장되는 프로필 한 줄 — SpeciesProfile 에서 slug 를 뺀 것 (slug 는 키). 못 이은 종은 weightKg·baseSpeed 가 없다
interface StoredProfile {
  dex: number;
  types: string[];
  baseSpeed?: number;
  weightKg?: number;
  affinityRate: number;
  hungerRate: number;
  sleepiness: number;
  moodBase: number;
  moodSwing: number;
  likes: Like[];
}

// 못 이은 슬러그의 값
export const DEFAULT: Readonly<Omit<StoredProfile, "dex">> = { affinityRate: 1.0, hungerRate: 1.0, sleepiness: 1.0, moodBase: 60, moodSwing: 1.0, likes: ["play"], types: [] };

// 1차에 모은 원자료 — 못 이은 슬러그는 null
interface RawProfile {
  weightKg: number;
  baseSpeed: number;
  types: string[];
  rare: boolean;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

// 값 목록 → (값 → 백분위 0~1). 같은 값은 중앙 순위를 나눠 쓴다
export function percentiles(values: number[]): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const map = new Map<number, number>();
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && sorted[j + 1] === sorted[i]) j += 1;
    map.set(must(sorted[i], "정렬값"), n <= 1 ? 0.5 : (i + j) / 2 / (n - 1));
    i = j + 1;
  }
  return map;
}

function likesOf(types: string[]): Like[] {
  const out: Like[] = [];
  for (const t of types) {
    const like = LIKES[t] ?? "food";
    if (!out.includes(like)) out.push(like);
  }
  return out.length ? out : ["food"];
}

function moodOf(types: string[]): number {
  const sum = types.reduce((acc, t) => acc + (MOOD[t] ?? 0), 0);
  return Math.min(RULES.mood.max, Math.max(RULES.mood.min, RULES.mood.base + sum));
}

export async function build(): Promise<void> {
  const dex = readDex();
  const [pokemonRows, speciesRows, statRows, statNames, typeRows, typeNames, formRows, formTypeRows] = await Promise.all([
    csv("pokemon.csv", ["id", "identifier", "species_id", "weight", "is_default"]),
    csv("pokemon_species.csv", ["id", "identifier", "is_legendary", "is_mythical"]),
    csv("pokemon_stats.csv", ["pokemon_id", "stat_id", "base_stat"]),
    csv("stats.csv", ["id", "identifier"]),
    csv("pokemon_types.csv", ["pokemon_id", "type_id", "slot"]),
    csv("types.csv", ["id", "identifier"]),
    csv("pokemon_forms.csv", ["id", "identifier", "pokemon_id"]),
    csv("pokemon_form_types.csv", ["pokemon_form_id", "type_id", "slot"]),
  ]);
  type PokemonRow = (typeof pokemonRows)[number];
  type FormRow = (typeof formRows)[number];

  const speedStat = statNames.find((r) => r.identifier === "speed");
  if (!speedStat) throw new Error("stats.csv 에 speed 가 없다");
  const typeName = new Map(typeNames.map((r) => [r.id, r.identifier]));

  const pokemonById = new Map(pokemonRows.map((r) => [r.id, r]));
  const pokemonByName = new Map(pokemonRows.map((r) => [r.identifier, r]));
  const defaultOfSpecies = new Map<string, PokemonRow>();
  for (const r of pokemonRows) if (r.is_default === "1") defaultOfSpecies.set(r.species_id, r);
  const speciesByName = new Map(speciesRows.map((r) => [r.identifier, r]));
  const speciesById = new Map(speciesRows.map((r) => [r.id, r]));
  const formByName = new Map(formRows.map((r) => [r.identifier, r]));

  const speedOf = new Map<string, number>();
  for (const r of statRows) if (r.stat_id === speedStat.id) speedOf.set(r.pokemon_id, Number(r.base_stat));

  // 슬롯 순서대로 타입 이름 — 모르는 타입 번호는 undefined 로 끼고 뒤에서 걸러 낸다
  const typesOfPokemon = new Map<string, (string | undefined)[]>();
  for (const r of typeRows) {
    const list = typesOfPokemon.get(r.pokemon_id) ?? [];
    list[Number(r.slot) - 1] = typeName.get(r.type_id);
    typesOfPokemon.set(r.pokemon_id, list);
  }
  const typesOfForm = new Map<string, (string | undefined)[]>();
  for (const r of formTypeRows) {
    const list = typesOfForm.get(r.pokemon_form_id) ?? [];
    list[Number(r.slot) - 1] = typeName.get(r.type_id);
    typesOfForm.set(r.pokemon_form_id, list);
  }

  // 슬러그 → { pokemon, form? }
  const resolve = (key: string): { pokemon: PokemonRow | undefined; form?: FormRow } | null => {
    const pk = pokemonByName.get(key);
    if (pk) return { pokemon: pk, form: formByName.get(key) };
    const form = formByName.get(key);
    if (form) return { pokemon: pokemonById.get(form.pokemon_id), form };
    const sp = speciesByName.get(key);
    if (sp) return { pokemon: defaultOfSpecies.get(sp.id) };
    return null;
  };

  // 1차: 원자료 모으기
  const raw = new Map<string, RawProfile | null>();
  const missing: string[] = [];
  for (const slug of Object.keys(dex).sort()) {
    const key = slug.replace(/-3d$/, "");
    if (raw.has(key)) continue;
    const hit = resolve(key);
    if (!hit || !hit.pokemon) {
      missing.push(key);
      raw.set(key, null);
      continue;
    }
    const { pokemon, form } = hit;
    const sp = speciesById.get(pokemon.species_id);
    const types = (form && typesOfForm.get(form.id)) || typesOfPokemon.get(pokemon.id) || [];
    raw.set(key, {
      weightKg: Number(pokemon.weight) / 10,
      baseSpeed: speedOf.get(pokemon.id) ?? 0,
      types: types.filter((t): t is string => Boolean(t)),
      rare: sp ? sp.is_legendary === "1" || sp.is_mythical === "1" : false,
    });
  }

  // 2차: 백분위
  const matched = [...raw.values()].filter((r): r is RawProfile => r !== null);
  const weightPct = percentiles(matched.map((r) => r.weightKg));
  const speedPct = percentiles(matched.map((r) => r.baseSpeed));

  // 3차: 프로필
  const out: Record<string, StoredProfile> = {};
  for (const [key, r] of raw) {
    const dexNo = dex[key] ?? dex[`${key}-3d`] ?? 0;
    if (!r) {
      out[key] = { dex: dexNo, ...DEFAULT };
      continue;
    }
    const w = must(weightPct.get(r.weightKg), `체중 백분위 ${key}`);
    const s = must(speedPct.get(r.baseSpeed), `스피드 백분위 ${key}`);
    out[key] = {
      dex: dexNo,
      types: r.types,
      baseSpeed: r.baseSpeed,
      weightKg: r.weightKg,
      affinityRate: r.rare ? RULES.affinity.rare : RULES.affinity.base,
      hungerRate: round2(RULES.hunger.min + RULES.hunger.span * w + (s - 0.5) * RULES.hunger.speedSwing),
      sleepiness: round2(RULES.sleepiness.min + RULES.sleepiness.span * w),
      moodBase: moodOf(r.types),
      moodSwing: s >= RULES.swing.fast ? RULES.swing.high : s < RULES.swing.slow ? RULES.swing.low : RULES.swing.mid,
      likes: likesOf(r.types),
    };
  }

  // 한 종 한 줄 — diff 를 읽을 수 있게
  writeLineJson(OUT, out);
  process.stdout.write(`종 프로필: ${OUT} — ${Object.keys(out).length}종\n`);
  process.stdout.write(`못 이은 슬러그 ${missing.length}${missing.length ? `: ${missing.slice(0, 30).join(", ")}${missing.length > 30 ? " …" : ""}` : ""}\n`);
  const rare = Object.values(out).filter((p) => p.affinityRate === RULES.affinity.rare).length;
  process.stdout.write(`전설·환상 ${rare}종 (affinityRate ${RULES.affinity.rare})\n`);
  for (const k of ["pikachu", "eevee", "squirtle", "snorlax", "mewtwo"]) if (out[k]) process.stdout.write(`  ${k} ${JSON.stringify(out[k])}\n`);
}

if (require.main === module) runBuild(build);
