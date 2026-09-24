// 업적과 튜토리얼 자체 확인 — npm run build 뒤 node dist/tools/selftest-achievement.js
//
// 테스트 프레임워크 없이 assert 만. 조건은 코드가, 이름과 보상은 data/achievements.json 이 가진다.
// 계약은 docs/specs/s5.md "파티 칸과 업적", "튜토리얼" 이다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { claim, defs, evaluate, isAchieved } from "../achievement/core";
import { empty } from "../save/v3";
import type { PetV3, SaveV3 } from "../shared/save-v3";
import { canShow, done, skip } from "../tutorial/core";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime();

const pet = (over: Partial<PetV3> = {}): PetV3 => ({
  id: "p1", species: "charmander", shiny: false, nature: "hardy", size: 2,
  level: 1, exp: 0, affinity: 0, affinityProgressMs: 0, fullness: 100, fullnessProgressMs: 0,
  mood: 60, feedCooldownMs: 0, playCooldownMs: 0, playWindowMs: 0, playStreak: 0,
  buffs: [], home: { dx: -24, dy: -60 }, since: T0, stage: 0, evolved: [],
  daily: { date: "2026-09-24", gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  ...over,
});

// 첫 개체 하나가 첫 칸에 숨겨져 있다
function seed(): SaveV3 {
  const s = empty(T0);
  s.pets.push(pet({ id: "p1" }));
  s.pets.push(pet({ id: "p2", species: "squirtle" }));
  s.starterPetId = "p1";
  s.party.slots[0] = { state: "pokemon", petId: "p1", hidden: true };
  s.party.slots[1] = { state: "pokemon", petId: "p2", hidden: true };
  return s;
}

// (1) 업적 두 개가 이름과 보상을 가진다
{
  const list = defs();
  assert.equal(list.length, 2);
  assert.deepStrictEqual(list.map(([id]) => id).sort(), ["show-two", "starter-final"]);
  for (const [, def] of list) {
    assert.ok(def.ko.length > 0);
    assert.equal(def.reward, "party-slot");
  }
  process.stdout.write("(1) 업적 목록과 보상  ok\n");
}

// (2) 두 마리 꺼내기 — 숨긴 채 배치만 한 것은 아니다
{
  const s = seed();
  assert.equal(isAchieved(s, "show-two"), false, "둘 다 숨겼으면 아니다");
  const slot0 = s.party.slots[0];
  if (slot0) slot0.hidden = false;
  assert.equal(isAchieved(s, "show-two"), false, "한 마리로는 아니다");
  const slot1 = s.party.slots[1];
  if (slot1) slot1.hidden = false;
  assert.equal(isAchieved(s, "show-two"), true);
  process.stdout.write("(2) 두 마리 꺼내기 조건  ok\n");
}

// (3) 달성은 한 번 기록하면 되돌리지 않는다
{
  const s = seed();
  for (const x of s.party.slots) if (x.state === "pokemon") x.hidden = false;
  assert.deepStrictEqual(evaluate(s, T0), ["show-two"], "이번에 달성한 것을 돌려준다");
  assert.equal(s.achievements["show-two"]?.achievedAt, T0);
  assert.deepStrictEqual(evaluate(s, T0 + 1000), [], "두 번 알리지 않는다");
  for (const x of s.party.slots) if (x.state === "pokemon") x.hidden = true;
  evaluate(s, T0 + 2000);
  assert.equal(s.achievements["show-two"]?.achievedAt, T0, "다시 숨겨도 달성은 남는다");
  process.stdout.write("(3) 달성 기록은 되돌리지 않는다  ok\n");
}

// (4) 첫 포켓몬 최종 진화 — 진화하지 않았으면 아니다
{
  const s = seed();
  assert.equal(isAchieved(s, "starter-final"), false, "파이리는 최종이 아니다");
  const starter = s.pets[0];
  if (starter) {
    starter.species = "charizard";
    starter.evolved = ["charmander", "charmeleon"];
  }
  assert.equal(isAchieved(s, "starter-final"), true, "리자몽은 최종이다");
  process.stdout.write("(4) 첫 포켓몬 최종 진화 조건  ok\n");
}

// (5) 진화하지 않은 단독 종은 최종으로 보지 않는다
{
  const s = seed();
  const starter = s.pets[0];
  if (starter) starter.species = "lapras"; // 진화가 없는 종
  assert.equal(isAchieved(s, "starter-final"), false, "한 번도 진화하지 않았다");
  process.stdout.write("(5) 진화 없이 최종으로 보지 않는다  ok\n");
}

// (6) 첫 개체가 아닌 개체의 진화는 세지 않는다
{
  const s = seed();
  const other = s.pets[1];
  if (other) {
    other.species = "blastoise";
    other.evolved = ["squirtle", "wartortle"];
  }
  assert.equal(isAchieved(s, "starter-final"), false, "첫 개체가 아니다");
  process.stdout.write("(6) 첫 개체만 센다  ok\n");
}

// (7) 보상 수령 — 업적당 한 번, 잠긴 칸 하나를 연다
{
  const s = seed();
  for (const x of s.party.slots) if (x.state === "pokemon") x.hidden = false;
  evaluate(s, T0);
  const before = s.party.slots.filter((x) => x.state === "locked" && x.unlockBy === "achievement").length;
  const res = claim(s, "show-two", T0);
  assert.equal(res.ok, true);
  const after = s.party.slots.filter((x) => x.state === "locked" && x.unlockBy === "achievement").length;
  assert.equal(after, before - 1, "업적 칸 하나가 열렸다");
  assert.equal(s.party.slots[res.slotIndex ?? -1]?.state, "empty");
  assert.equal(claim(s, "show-two", T0).reason, "already-claimed");
  process.stdout.write("(7) 보상 수령 · 한 번만  ok\n");
}

// (8) 달성하지 않았거나 없는 업적은 못 받는다
{
  const s = seed();
  assert.equal(claim(s, "show-two", T0).reason, "not-achieved");
  assert.equal(claim(s, "없는업적", T0).reason, "no-achievement");
  process.stdout.write("(8) 미달성과 없는 업적  ok\n");
}

// (9) 업적 칸이 남지 않으면 받을 수 없다
{
  const s = seed();
  for (const x of s.party.slots) if (x.state === "pokemon") x.hidden = false;
  evaluate(s, T0);
  for (let i = 0; i < s.party.slots.length; i++) {
    const x = s.party.slots[i];
    if (x?.state === "locked" && x.unlockBy === "achievement") s.party.slots[i] = { state: "empty" };
  }
  assert.equal(claim(s, "show-two", T0).reason, "no-locked-slot");
  process.stdout.write("(9) 열 칸이 없으면 거절  ok\n");
}

// (10) 튜토리얼 — 건너뛰거나 마치면 다시 띄우지 않는다
{
  const s = seed();
  assert.equal(canShow(s, "shop"), true, "처음에는 띄운다");
  assert.equal(skip(s, "shop").ok, true);
  assert.equal(s.tutorials.shop?.state, "skipped");
  assert.equal(canShow(s, "shop"), false);
  assert.equal(skip(s, "shop").reason, "already", "두 번 기록하지 않는다");
  assert.equal(done(s, "shop").reason, "already");

  assert.equal(done(s, "hatch", 2).ok, true);
  assert.equal(s.tutorials.hatch?.state, "done");
  assert.equal(s.tutorials.hatch?.steps, 2, "끝낸 단계 수를 남긴다");
  assert.equal(skip(s, "").reason, "bad-id");
  process.stdout.write("(10) 튜토리얼 상태 기록  ok\n");
}

process.stdout.write("selftest-achievement: 통과 (업적 조건·수령·튜토리얼)\n");
