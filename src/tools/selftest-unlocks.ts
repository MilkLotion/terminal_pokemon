// 해금 사슬 자체 확인 — npm run build 뒤 node dist/tools/selftest-unlocks.js
//
// 지금 데이터로도 반드시 참이어야 하는 것만 막는다. 얻을 수 없는 종 목록(전설·환상 등)은 check-unlocks 가 알리기만 한다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { reach } from "../dex/reach";
import { starters, unlockByRules, unlockRules } from "../dex/unlocks";
import { begin } from "../party/starter";
import { randomPool } from "../shop/buy";
import { empty } from "../save/v3";
import { dexList } from "../tx/lists";

const r = reach();
const rules = unlockRules();
const dexSlugs = new Set(dexList(empty(0)).map((e) => e.slug));

// (1) 첫 선택 후보는 모두 얻을 수 있다 — 첫 실행 선택과 랜덤알
for (const s of starters(rules)) assert.ok(r.obtainable.has(s), `첫 선택 후보 ${s}`);
process.stdout.write(`(1) 첫 선택 후보 ${starters(rules).length}종 도달  ok\n`);

// (2) 진화 규칙의 출발 종과 대상 종은 도감에 있는 종이다 — 오타·옛 이름이 사슬을 끊지 않게
for (const [slug, rule] of Object.entries(rules)) {
  if (slug.startsWith("_")) continue;
  assert.ok(dexSlugs.has(slug) || slug.includes("-"), `규칙의 종 ${slug}`);
  if (rule.evolve) assert.ok(dexSlugs.has(rule.evolve.from) || rule.evolve.from.includes("-"), `${slug} 의 출발 종 ${rule.evolve.from}`);
}
process.stdout.write("(2) 규칙의 종 이름  ok\n");

// (3) 첫 선택 후보에서 이어지는 진화 사슬은 끝까지 얻을 수 있다 (파이리 → 리자드 → 리자몽)
for (const s of ["charmander", "charmeleon", "charizard", "pikachu", "raichu", "eevee", "umbreon"]) assert.ok(r.obtainable.has(s), s);
process.stdout.write("(3) 첫 선택 후보의 진화 사슬  ok\n");

// (4) 첫 선택 직후 — 다른 후보와 기본형이 해금되고, 진화·조건·전설 종은 아직이다 (2026-09-25 사용자 결정 "처음부터 해금")
const save = empty(0);
assert.ok(begin(save, "charmander", 0, () => 0.5).ok);
const fresh = unlockByRules(save, 0);
for (const s of ["bulbasaur", "pikachu", "rattata", "pichu", "snorlax"]) assert.ok(save.dex.unlocked.includes(s), `해금 ${s}`);
for (const s of ["charmeleon", "ditto", "lapras", "chansey", "mewtwo"]) assert.ok(!save.dex.unlocked.includes(s), `아직 ${s}`);
assert.ok(fresh.length > 400 && !fresh.includes("charmander"), "고른 종은 이미 해금돼 있어 새 목록에 없다");
assert.deepStrictEqual(unlockByRules(save, 0), [], "두 번 불러도 더하지 않는다");
process.stdout.write(`(4) 첫 선택 직후 해금 ${save.dex.unlocked.length}종  ok\n`);

// (5) 랜덤알 후보 — 상점 종(잠만보)과 진화 전용 종은 빠진다
const pool = randomPool(save);
assert.ok(pool.includes("rattata") && !pool.includes("snorlax") && !pool.includes("charmeleon"));
process.stdout.write(`(5) 랜덤알 후보 ${pool.length}종  ok\n`);

// (6) 조건 규칙 — 파티 3마리면 메타몽, 작업 100시간이면 라프라스, 연속 14일이면 럭키
save.party.slots.forEach((slot, i) => {
  if (i < 3) Object.assign(slot, { state: "pokemon", petId: `p${i}` });
});
save.totals.workMs = 100 * 3600_000;
save.daily.streak = 14;
const later = unlockByRules(save, 0);
for (const s of ["ditto", "lapras", "chansey"]) assert.ok(later.includes(s), `조건 해금 ${s}`);
process.stdout.write("(6) 파티·작업·연속 교감 조건  ok\n");

process.stdout.write(`selftest-unlocks: 통과 (첫 선택 후보·규칙 이름·진화 사슬·첫 선택 직후 해금·랜덤알 후보·조건 규칙) — 참고: 얻을 수 있는 종 ${[...dexSlugs].filter((s) => r.obtainable.has(s)).length}/${dexSlugs.size}\n`);
