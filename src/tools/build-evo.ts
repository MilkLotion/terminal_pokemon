// 진화 사슬(data/evo.json)을 만든다 — 개발용, 네트워크 필요. 배포 패키지에는 결과 JSON 만 들어간다.
//
//   npm run build && node dist/tools/build-evo.js   (npm run data:build 가 네 빌드를 차례로 돈다)
//
// 출처: PokeAPI 저장소의 CSV (https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv)
//   pokemon_species.csv     종 번호 · 식별자 · evolves_from_species_id
//   pokemon_evolution.csv   진화 조건 — time_of_day 만 쓴다 (day · night)
//   pokemon.csv             종의 기본 폼 식별자 (종 식별자가 도감에 없을 때 대신)
//
// 결과: { "<slug>": [{ "to": "<slug>", "when"?: "day" | "night" }] }
//   - 종 단위. 폼 슬러그(raichu-alola · rotom-wash)는 사슬에 넣지 않는다 — 기본 종만
//   - 슬러그는 lib/dex.json 에 있는 것만. 종 식별자(deoxys)가 도감에 있으면 그것, 없으면 기본 폼 식별자(deoxys-normal)
//   - when 은 그 종으로의 진화 조건 행들이 전부 같은 시간대일 때만 적는다 (루가루암처럼 폼마다 다르면 생략).
//     dusk · full-moon 같은 다른 값은 시간대 없음으로 본다
//   - 부모가 도감에 없으면 그 간선은 버린다 (사슬이 끊긴 채 남지 않게 개수를 출력)
import path from "node:path";
import type { DayPart } from "../shared/types";
import { DATA_DIR, csv, readDex, runBuild, writeLineJson } from "./pokeapi-csv";

const OUT = path.join(DATA_DIR, "evo.json");
const DAY_PARTS = new Set<string>(["day", "night"] satisfies DayPart[]);

// 간선 하나 — src/dex/evo.ts EvoStep 과 같은 모양 (빌드가 만들고 dex 가 읽는다)
export interface EvoEdge {
  to: string;
  when?: DayPart;
}

export type EvoTable = Record<string, EvoEdge[]>;

export async function build(): Promise<void> {
  const dex = readDex();
  const [speciesRows, evoRows, pokemonRows] = await Promise.all([
    csv("pokemon_species.csv", ["id", "identifier", "evolves_from_species_id"]),
    csv("pokemon_evolution.csv", ["evolved_species_id", "time_of_day"]),
    csv("pokemon.csv", ["species_id", "identifier", "is_default"]),
  ]);
  type SpeciesRow = (typeof speciesRows)[number];

  const defaultOfSpecies = new Map<string, string>();
  for (const r of pokemonRows) if (r.is_default === "1") defaultOfSpecies.set(r.species_id, r.identifier);

  // 종 번호 → 도감 슬러그 (없으면 null)
  const slugOf = (sp: SpeciesRow): string | null => {
    if (dex[sp.identifier] != null) return sp.identifier;
    const def = defaultOfSpecies.get(sp.id);
    if (def && dex[def] != null) return def;
    return null;
  };

  // 진화 대상 종 번호 → 시간대 (행마다 모아 하나로 합칠 수 있을 때만)
  const whenOf = new Map<string, string[]>();
  for (const r of evoRows) {
    const list = whenOf.get(r.evolved_species_id) ?? [];
    list.push(DAY_PARTS.has(r.time_of_day) ? r.time_of_day : "");
    whenOf.set(r.evolved_species_id, list);
  }
  const pickWhen = (speciesId: string): DayPart | undefined => {
    const uniq = [...new Set(whenOf.get(speciesId) ?? [])];
    const only = uniq[0];
    return uniq.length === 1 && only && DAY_PARTS.has(only) ? (only as DayPart) : undefined;
  };

  const byId = new Map(speciesRows.map((r) => [r.id, r]));
  const out: EvoTable = {};
  let edges = 0;
  const dropped: string[] = [];
  for (const sp of speciesRows.sort((a, b) => Number(a.id) - Number(b.id))) {
    if (!sp.evolves_from_species_id) continue;
    const parent = byId.get(sp.evolves_from_species_id);
    const from = parent ? slugOf(parent) : null;
    const to = slugOf(sp);
    if (!from || !to) {
      dropped.push(`${parent?.identifier ?? "?"}→${sp.identifier}`);
      continue;
    }
    const step: EvoEdge = { to };
    const when = pickWhen(sp.id);
    if (when) step.when = when;
    (out[from] ??= []).push(step);
    edges += 1;
  }

  const sorted: EvoTable = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k] ?? []]));
  writeLineJson(OUT, sorted);
  process.stdout.write(`진화 사슬: ${OUT} — 부모 ${Object.keys(sorted).length}종 · 간선 ${edges}\n`);
  process.stdout.write(`도감에 없어 버린 간선 ${dropped.length}${dropped.length ? `: ${dropped.slice(0, 20).join(", ")}${dropped.length > 20 ? " …" : ""}` : ""}\n`);
  const timed = Object.values(sorted).flat().filter((s) => s.when);
  process.stdout.write(`시간대 있는 간선 ${timed.length}: ${timed.map((s) => `${s.to}(${s.when})`).join(" · ")}\n`);
  if (sorted.eevee) process.stdout.write(`  eevee → ${sorted.eevee.map((s) => s.to).join(" ")}\n`);
}

if (require.main === module) runBuild(build);
