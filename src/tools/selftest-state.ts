// 가짜 시계로 날짜·상한·재실행·토큰 공백·숨긴 마리·돌봄 검증. 실제 저장 접근 없음
import assert from "node:assert/strict";
import { empty, emptyPet, normalize } from "../save/store";
import { care, createStateEngine } from "../state/core";
import { STATE_RULES as R } from "../state/rules";
import type { StateInput } from "../state/types";
import type { SaveV2 } from "../shared/types";
import { axesOf, axesAt, NEUTRAL_AXES, QUIRK_RULES } from "../dex/natures";
import { paramsFor, NEUTRAL_PARAMS } from "../motion/params";
import { createBrain } from "../motion/brain";
import { MOTION_RULES } from "../motion/rules";

const T = new Date(2026, 8, 17, 10).getTime();
const make = (): SaveV2 => {
  const save = empty(T);
  save.slots = 2;
  // 모르는 종은 중립 프로필 — 데이터 표의 조정과 테스트 분리
  save.party = [emptyPet({ id: "a", species: "test-neutral", now: T }), emptyPet({ id: "b", species: "test-neutral", now: T })];
  return save;
};
const input = (now: number, tokens = 0): StateInput => ({ now, shown: ["a", "b"], agent: "idle", tokenWork: true, usages: [{ sessionId: "session", cli: "claude", at: now, usage: { in: tokens, out: 0, cacheRead: 0, cacheWrite: 0 } }] });
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);

assert.deepEqual(paramsFor(NEUTRAL_AXES), NEUTRAL_PARAMS);
assert.ok(paramsFor(axesOf("jolly")).paceScale > paramsFor(axesOf("brave")).paceScale);
{
  const variants = new Set<string>();
  for (let t = T; t < T + QUIRK_RULES.periodMs * 2; t += 1000) variants.add(JSON.stringify(axesAt("quirky", "a", t)));
  assert.ok(variants.size >= 3, "변덕은 잠깐 다른 축으로 바뀌고 중립으로 돌아옴");
  assert.deepEqual(axesAt("hardy", "a", T), NEUTRAL_AXES);
  const walk = (pull: number, cursor = false) => {
    const brain = createBrain({ have: new Set(["Idle", "Walk"]), durOf: () => 100, rng: () => 0.5, pulls: { socialPull: cursor ? 0 : pull, cursorPull: cursor ? pull : 0 },
      rules: { ...MOTION_RULES, RHYTHM: { ...MOTION_RULES.RHYTHM, idle: { ...MOTION_RULES.RHYTHM.idle, pause: [0, 0] } } } });
    let x = 0;
    for (let i = 0; i <= 25; i++) x = brain.tick({ now: T + i * 40, activeAt: T, agent: "idle", visible: true, box: { minX: -500, maxX: 500, minY: -200, maxY: 200 }, company: cursor ? [] : [{ x: 300, y: 0 }], cursor: cursor ? { x: 300, y: 0 } : null }).roam.x;
    return x;
  };
  assert.ok(walk(1) > 0 && walk(-1) < 0, "사교성에 따라 다가가거나 멀어짐");
  assert.ok(walk(1, true) > 0 && walk(-1, true) < 0, "대담함에 따라 커서를 쫓거나 피함");
}

{
  const save = make(), engine = createStateEngine();
  const hunger = save.party[0]!.hunger;
  engine.tick(save, input(T, 10000));
  for (let n = 1; n <= 3600; n++) engine.tick(save, input(T + n * 1000, 10000));
  near(save.party[0]!.affinity, 6);
  near(save.party[0]!.hunger, hunger + 10);
  near(save.totals.presenceMs, R.hourMs);
  assert.equal(save.totals.tokens, 0, "첫 누적량은 기준점");
  engine.tick(save, { ...input(T + R.hourMs + 1000, 11000), usages: [] });
  engine.tick(save, input(T + R.hourMs + 2000, 11000));
  assert.equal(save.totals.tokens, 1000, "기록 공백 뒤 새 토큰만 적립");
  const before = save.party[0]!.affinity;
  const restarted = createStateEngine();
  restarted.tick(save, input(T + R.hourMs * 4, 999999));
  assert.equal(save.party[0]!.affinity, before, "꺼 둔 시간·토큰 미적립");
}
{
  const save = make(), engine = createStateEngine();
  engine.tick(save, input(T));
  engine.tick(save, { ...input(T + 1000, 10000), shown: ["a"] });
  near(save.party[0]!.daily.work, 10);
  assert.equal(save.party[1]!.affinity, 0, "숨긴 마리 보상 없음");
  assert.ok(save.party[1]!.hunger > 0, "숨겨도 상태 진행");
  assert.equal(save.points, 1);
  engine.tick(save, input(T + 2000, 10000000));
  assert.equal(save.points, 50, "토큰 포인트 하루 상한");
  assert.equal(save.party[0]!.daily.gained, 200);
  assert.equal(save.party[1]!.daily.gained, 200);
  const mood = save.party[0]!.mood;
  engine.tick(save, { ...input(T + 3000, 10000000), agent: "failed" });
  const failedMood = save.party[0]!.mood;
  assert.ok(failedMood < mood);
  engine.tick(save, { ...input(T + 4000, 10000000), agent: "failed" });
  assert.equal(save.party[0]!.mood, failedMood, "실패 한 번만 반영");
  engine.tick(save, { ...input(T + 5000, 10000000), agent: "waving" });
  engine.tick(save, { ...input(T + 6000, 10000000), agent: "waving" });
  assert.equal(save.totals.turns, 1);
}
{
  const a = make(), b = make(), ea = createStateEngine(), eb = createStateEngine();
  ea.tick(a, input(T)); eb.tick(b, input(T));
  for (let n = 1; n <= 3600; n++) {
    ea.tick(a, { ...input(T + n * 1000), agent: "running", tokenWork: false });
    eb.tick(b, { ...input(T + n * 1000), agent: "running", tokenWork: true });
  }
  near(a.party[0]!.affinity, 18);
  near(b.party[0]!.affinity, 6);
  assert.equal(a.totals.workMs, R.hourMs);
}
{
  const save = make(), engine = createStateEngine();
  const pet = save.party[0]!;
  pet.hunger = 80;
  assert.equal(care(save, "a", "feed", T).ok, true);
  assert.equal(pet.hunger, 40);
  assert.equal(care(save, "a", "feed", T + 1).reason, "cooldown");
  assert.equal(care(save, "a", "play", T).ok, true);
  assert.equal(save.totals.days, 1);
  assert.equal(save.points, 2, "첫 교감 보상 한 번");
  const next = new Date(2026, 8, 18, 10).getTime();
  engine.tick(save, input(T));
  engine.tick(save, input(next));
  assert.equal(care(save, "a", "play", next).ok, true);
  assert.equal(save.daily.streak, 2);
  assert.equal(save.points, 6);
  assert.equal(pet.daily.plays, 1);
  const skipped = new Date(2026, 8, 20, 10).getTime();
  assert.equal(care(save, "a", "play", skipped).ok, true);
  assert.equal(save.daily.streak, 1, "교감일 공백이면 스트릭 초기화");
  for (let n = 0; n < 10; n++) assert.equal(care(save, "a", "poke", skipped).ok, true);
  assert.equal(care(save, "a", "poke", skipped).reason, "daily-cap");
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(save))), save, "저장 정규화 왕복");
}
process.stdout.write("selftest-state: 통과 (성격·시간·토큰·상한·실패·턴·숨김·재실행·돌봄·날짜·스트릭)\n");
