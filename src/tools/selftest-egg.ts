// 알 돌봄·조건·부화 자체 확인 — npm run build 뒤 node dist/tools/selftest-egg.js
//
// 테스트 프레임워크 없이 assert 만. 무작위는 정해진 값을 넣어 결과를 고정한다.
// 계약은 docs/specs/s5.md "알"과 "알 행동 조건", 표는 data/egg-conditions.json 이다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { care } from "../egg/care";
import { matchCondition, speciesOf, textOf } from "../egg/conditions";
import { decide, pickWeighted, RANK_WEIGHT } from "../egg/hatch";
import { nextPetId, open } from "../egg/open";
import { EGG_V3_RULES } from "../save/rules";
import { empty } from "../save/v3";
import type { EggV3, SaveV3 } from "../shared/save-v3";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime();
const MIN = 60_000;

const egg = (over: Partial<EggV3> = {}): EggV3 => ({
  id: "e1",
  kind: "random",
  boughtAt: T0,
  remainMs: EGG_V3_RULES.readyMs,
  ready: false,
  candidates: ["charmander", "squirtle"],
  careCooldownMs: 0,
  actions: { pat: 0, song: 0 },
  ...over,
});

function seed(e: Partial<EggV3> = {}): SaveV3 {
  const s = empty(T0);
  s.eggs.push(egg(e));
  return s;
}

// 정해진 값을 차례로 돌려주는 가짜 무작위
const fixed = (...values: number[]): (() => number) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
};

// (1) 돌봄은 30초를 줄이고 쿨타임을 건다
{
  const e = egg();
  const res = care(e, "pat");
  assert.equal(res.ok, true);
  assert.equal(res.shortenedMs, EGG_V3_RULES.careShortenMs);
  assert.equal(e.remainMs, EGG_V3_RULES.readyMs - EGG_V3_RULES.careShortenMs);
  assert.equal(e.actions.pat, 1);
  assert.equal(e.careCooldownMs, EGG_V3_RULES.careCooldownMs);
  const again = care(e, "pat");
  assert.equal(again.ok, false);
  assert.equal(again.reason, "cooldown", "쿨타임 중에는 거절한다");
  assert.equal(e.actions.pat, 1, "횟수도 늘지 않는다");
  process.stdout.write("(1) 돌봄 · 30초 단축과 쿨타임  ok\n");
}

// (2) 남은 시간은 0 아래로 내려가지 않고, 0 이면 준비 완료다
{
  const e = egg({ remainMs: 10_000 });
  const res = care(e, "song");
  assert.equal(e.remainMs, 0);
  assert.equal(e.ready, true);
  assert.equal(res.shortenedMs, 10_000, "남은 만큼만 줄인다");
  process.stdout.write("(2) 돌봄 · 0 에서 멈추고 준비 완료  ok\n");
}

// (3) 준비가 끝난 뒤에도 조건은 계속 쌓인다
{
  const e = egg({ remainMs: 0, ready: true });
  assert.equal(care(e, "song").ok, true);
  assert.equal(e.actions.song, 1);
  assert.equal(e.remainMs, 0);
  process.stdout.write("(3) 준비 완료 뒤에도 조건 누적  ok\n");
}

// (4) 조건 판정 — 구간이 겹치지 않고 빈틈이 있다
{
  assert.equal(matchCondition({ pat: 0, song: 0 }), "none");
  assert.equal(matchCondition({ pat: 5, song: 0 }), "pat-3");
  assert.equal(matchCondition({ pat: 9, song: 0 }), "pat-8");
  assert.equal(matchCondition({ pat: 0, song: 4 }), "song-3");
  assert.equal(matchCondition({ pat: 0, song: 12 }), "song-8");
  assert.equal(matchCondition({ pat: 4, song: 4 }), "both-3");
  assert.equal(matchCondition({ pat: 9, song: 9 }), "both-8");
  assert.equal(matchCondition({ pat: 10, song: 4 }), null, "어디에도 맞지 않는 조합");
  assert.equal(matchCondition({ pat: 1, song: 0 }), null, "3회에 못 미치면 조건이 아니다");
  process.stdout.write("(4) 조건 판정 · 구간과 빈틈  ok\n");
}

// (5) 조건마다 대상 종이 있고 문구가 있다
{
  const ids = ["pat-3", "pat-8", "song-3", "song-8", "both-3", "both-8", "none"];
  for (const id of ids) {
    assert.ok(speciesOf(id).length >= 3, `${id} 은 종이 셋 이상`);
    assert.ok((textOf(id) ?? "").length > 0, `${id} 은 문구가 있다`);
  }
  assert.equal(speciesOf("both-8").length, 10, "600족 열 종");
  assert.equal(speciesOf("없는조건").length, 0);
  process.stdout.write("(5) 조건별 대상 종과 문구  ok\n");
}

// (6) 난이도 가중치 — 흔한 쪽이 먼저 뽑힌다
{
  assert.equal(RANK_WEIGHT[1], 100);
  assert.equal(RANK_WEIGHT[5], 1);
  // charmander 는 1등급, tyranitar 는 4등급. 가중치는 100 대 5
  assert.equal(pickWeighted(["charmander", "tyranitar"], fixed(0)), "charmander");
  assert.equal(pickWeighted(["charmander", "tyranitar"], fixed(0.99)), "tyranitar");
  assert.equal(pickWeighted([], fixed(0)), null);
  process.stdout.write("(6) 난이도 가중치 추첨  ok\n");
}

// (7) 조건을 채우면 후보 범위를 넘어선다
{
  const withCondition = decide({ pat: 9, song: 9 }, ["charmander"], fixed(0, 0.5));
  assert.ok(withCondition);
  assert.ok(speciesOf("both-8").includes(withCondition.species), "600족에서 나온다");
  assert.equal(withCondition.conditionId, "both-8");
  const plain = decide({ pat: 1, song: 0 }, ["charmander"], fixed(0, 0.5));
  assert.equal(plain?.species, "charmander", "조건이 없으면 알의 후보에서");
  assert.equal(plain?.conditionId, null);
  process.stdout.write("(7) 조건은 후보 범위를 넘어선다  ok\n");
}

// (8) 이로치는 따로 뽑는다
{
  const shiny = decide({ pat: 0, song: 0 }, ["charmander"], fixed(0, 0.0001));
  assert.equal(shiny?.shiny, true);
  const plain = decide({ pat: 0, song: 0 }, ["charmander"], fixed(0, 0.5));
  assert.equal(plain?.shiny, false);
  process.stdout.write("(8) 이로치 추첨  ok\n");
}

// (9) 열기 — 개체가 생기고 빈 파티 칸에 숨김으로 들어간다
{
  const s = seed({ remainMs: 0, ready: true, actions: { pat: 0, song: 0 } });
  const res = open(s, "e1", T0, fixed(0, 0.5, 0.5));
  assert.equal(res.ok, true);
  assert.equal(s.pets.length, 1);
  assert.equal(s.pets[0]?.id, "p1");
  assert.equal(s.pets[0]?.level, 1);
  const slot = s.party.slots[res.slotIndex ?? -1];
  assert.equal(slot?.state, "pokemon");
  assert.equal(slot?.hidden, true, "숨김으로 들어간다");
  assert.equal(s.eggs.length, 0, "알은 사라진다");
  assert.ok(s.dex.obtained.includes(res.species ?? ""), "도감에 획득 기록");
  assert.ok(s.dex.unlocked.includes(res.species ?? ""), "해금 기록도 남는다");
  process.stdout.write("(9) 열기 · 개체 생성과 숨김 배치  ok\n");
}

// (10) 열기 — 파티가 가득 차면 박스로 간다
{
  const s = seed({ remainMs: 0, ready: true });
  for (let i = 0; i < s.party.slots.length; i++) s.party.slots[i] = { state: "locked", unlockBy: "shop" };
  const res = open(s, "e1", T0, fixed(0, 0.5, 0.5));
  assert.equal(res.ok, true);
  assert.equal(res.toBox, true);
  assert.ok(s.boxes[0]?.slots.includes(res.petId ?? ""), "박스 첫 칸으로");
  process.stdout.write("(10) 열기 · 자리가 없으면 박스로  ok\n");
}

// (11) 열기 — 조건으로 나온 종은 발견을 기록한다
{
  const s = seed({ remainMs: 0, ready: true, actions: { pat: 9, song: 9 } });
  const res = open(s, "e1", T0, fixed(0, 0.5, 0.5));
  assert.equal(res.ok, true);
  assert.equal(res.conditionId, "both-8");
  assert.equal(s.dex.discovered[res.species ?? ""], "both-8", "발견한 조건을 적는다");
  process.stdout.write("(11) 열기 · 조건 발견 기록  ok\n");
}

// (12) 열기 — 준비가 안 됐거나 없는 알은 거절한다
{
  const s = seed();
  assert.equal(open(s, "e1", T0, fixed(0)).reason, "not-ready");
  assert.equal(open(s, "없는알", T0, fixed(0)).reason, "no-egg");
  assert.equal(s.pets.length, 0, "개체를 만들지 않는다");
  process.stdout.write("(12) 열기 · 준비 전과 없는 알 거절  ok\n");
}

// (13) 개체 식별자는 이어서 붙는다
{
  const s = empty(T0);
  assert.equal(nextPetId(s), "p1");
  s.pets.push({ id: "p7" } as never);
  assert.equal(nextPetId(s), "p8");
  process.stdout.write("(13) 개체 식별자 이어 붙이기  ok\n");
}

process.stdout.write("selftest-egg: 통과 (돌봄·조건·가중치·부화)\n");
