// 실기 확인 전용 — 지정 HOME 아래 .claude/pokebuddy/save.json 을 v2 로 만든다 (마리 수만큼, 집은 60px 씩 벌림 또는 --same-home 이면 전부 기본값)
//   node dist/tools/dev-save.js <HOME> <종>[,<종>…] [--same-home]
// slots = 마리 수, SAVE_RULES.slots.max 로 가둔다 (넘는 마리는 자른다). 진짜 ~/.claude/pokebuddy/ 는 건드리지 않는다 — HOME 을 꼭 준다
import fs from "node:fs";
import path from "node:path";
import { randomNature } from "../dex/natures";
import { SAVE_RULES } from "../save/rules";
import * as store from "../save/store";
import type { SaveV2 } from "../shared/types";

export interface DevSaveOptions {
  sameHome?: boolean;
  now?: number;
  rng?: () => number;
  spreadPx?: number; // 마리마다 왼쪽으로 벌리는 간격
}

export const DEV_SAVE_RULES = { spreadPx: 60 };

// HOME → save.json 경로 (config.js PATHS 와 같은 규칙)
export const devSaveFile = (home: string): string => path.join(home, ".claude", "pokebuddy", "save.json");

export function devSaveState(speciesList: string[], opts: DevSaveOptions = {}): SaveV2 {
  const now = opts.now ?? Date.now();
  const rng = opts.rng ?? Math.random;
  const spread = opts.spreadPx ?? DEV_SAVE_RULES.spreadPx;
  const list = speciesList.filter(Boolean).slice(0, SAVE_RULES.slots.max);
  const save = store.empty(now);
  list.forEach((species, i) => {
    const pet = store.emptyPet({ id: `p${i + 1}`, species, now, nature: randomNature(rng).id });
    if (!opts.sameHome) pet.home = { dx: SAVE_RULES.pet.home.dx - spread * i, dy: SAVE_RULES.pet.home.dy };
    save.party.push(pet);
    if (!save.unlocked.includes(species)) save.unlocked.push(species);
  });
  save.slots = Math.max(SAVE_RULES.slots.min, Math.min(list.length, SAVE_RULES.slots.max));
  return save;
}

export function devSave(home: string, speciesList: string[], opts: DevSaveOptions = {}): { file: string; save: SaveV2 } {
  const file = devSaveFile(home);
  const save = devSaveState(speciesList, opts);
  if (!store.write(file, save)) throw new Error(`쓰지 못함: ${file}`);
  return { file, save };
}

function main(argv: string[]): void {
  const args = argv.filter((a) => !a.startsWith("--"));
  const sameHome = argv.includes("--same-home");
  const [home, species] = args;
  if (!home || !species) {
    process.stderr.write("사용법: node dist/tools/dev-save.js <HOME> <종>[,<종>…] [--same-home]\n");
    process.exit(2);
  }
  const { file, save } = devSave(path.resolve(home), species.split(","), { sameHome });
  process.stdout.write(`${file}\n${save.party.map((p) => `${p.id} ${p.species} ${p.nature} home=${p.home.dx},${p.home.dy}`).join("\n")}\nslots=${save.slots}\n`);
  if (!fs.existsSync(path.join(path.resolve(home), ".claude", "pokebuddy", "pmd"))) {
    process.stderr.write("참고: pmd 캐시가 없다 — 실기에서 그림을 네트워크로 받는다 (~/.claude/pokebuddy/pmd/*.zip 을 복사해 두면 빠르다)\n");
  }
}

if (require.main === module) main(process.argv.slice(2));
