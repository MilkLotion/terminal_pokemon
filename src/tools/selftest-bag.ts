// 레벨 곡선과 가방 도구 사용 자체 확인 — npm run build 뒤 node dist/tools/selftest-bag.js
//
// 테스트 프레임워크 없이 assert 만. 파일을 만들지 않는다 — 값만으로 확인한다.
// 곡선은 원작 경험치 타입 6종의 100레벨 누적값으로 맞춘다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { use } from "../bag/use";
import { expForLevel, growthOf, levelFor, MAX_LEVEL, progressTo } from "../dex/growth";
import { BAG_V3_RULES, SAVE_V3_RULES } from "../save/rules";
import { empty } from "../save/v3";
import type { PetV3, SaveV3 } from "../shared/save-v3";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime();

const pet = (over: Partial<PetV3> = {}): PetV3 => ({
  id: "p1", species: "charmander", shiny: false, nature: "hardy", size: 2,
  level: 1, exp: 0, affinity: 0, affinityProgressMs: 0, fullness: 100, fullnessProgressMs: 0,
  mood: 60, feedCooldownMs: 0, buffs: [], home: { dx: -24, dy: -60 }, since: T0, stage: 0, evolved: [],
  daily: { date: "2026-09-24", gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  ...over,
});

function seed(over: Partial<PetV3> = {}, bag: Record<string, number> = {}): SaveV3 {
  const s = empty(T0);
  s.pets.push(pet(over));
  s.bag = { ...bag };
  return s;
}

// (1) 100레벨 누적 경험치가 원작과 같다
{
  assert.equal(expForLevel("fast", 100), 800_000);
  assert.equal(expForLevel("medium-fast", 100), 1_000_000);
  assert.equal(expForLevel("medium-slow", 100), 1_059_860);
  assert.equal(expForLevel("slow", 100), 1_250_000);
  assert.equal(expForLevel("erratic", 100), 600_000);
  assert.equal(expForLevel("fluctuating", 100), 1_640_000);
  process.stdout.write("(1) 곡선 · 100레벨 누적값  ok\n");
}

// (2) 레벨 1 은 0 이고 곡선은 늘 오른다
{
  const rates = ["fast", "medium-fast", "medium-slow", "slow", "erratic", "fluctuating"] as const;
  for (const r of rates) {
    assert.equal(expForLevel(r, 1), 0, `${r} 레벨 1`);
    let prev = -1;
    for (let x = 1; x <= MAX_LEVEL; x++) {
      const v = expForLevel(r, x);
      assert.ok(v > prev, `${r} 레벨 ${x} 이 앞보다 크다`);
      prev = v;
    }
  }
  process.stdout.write("(2) 곡선 · 단조 증가  ok\n");
}

// (3) 누적 경험치로 레벨을 읽는다
{
  assert.equal(levelFor("medium-fast", 0), 1);
  assert.equal(levelFor("medium-fast", 7), 1, "레벨 2 는 8 부터");
  assert.equal(levelFor("medium-fast", 8), 2);
  assert.equal(levelFor("medium-fast", 1_000_000), 100);
  assert.equal(levelFor("medium-fast", 9_999_999), 100, "100 을 넘지 않는다");
  const p = progressTo("medium-fast", 8 + (27 - 8) / 2);
  assert.equal(p.level, 2);
  assert.equal(p.percent, 50, "레벨 2 에서 3 으로 절반");
  process.stdout.write("(3) 경험치로 레벨 읽기  ok\n");
}

// (4) 종의 경험치 타입을 데이터에서 읽는다
{
  assert.equal(growthOf("charmander"), "medium-slow", "1세대 스타터는 보통 느림");
  assert.equal(growthOf("pikachu"), "medium-fast");
  assert.equal(growthOf("없는종"), "medium-fast", "모르면 보통 빠름");
  process.stdout.write("(4) 종별 경험치 타입  ok\n");
}

// (5) 기본먹이는 무료이며 가방에서 차감하지 않는다
{
  const s = seed({ fullness: 50 });
  const res = use(s, "basic-food", "p1");
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.fullness, 70, "만복도 +20");
  assert.equal(s.pets[0]?.feedCooldownMs, SAVE_V3_RULES.feedCooldownMs);
  assert.equal(s.pets[0]?.affinity, BAG_V3_RULES.feedAffinity);
  assert.equal(s.bag["basic-food"], undefined, "재고를 세지 않는다");
  const again = use(s, "basic-food", "p1");
  assert.equal(again.reason, "cooldown", "쿨타임 중에는 거절");
  process.stdout.write("(5) 기본먹이 · 무료와 쿨타임  ok\n");
}

// (6) 만복도가 가득이면 거절한다
{
  const s = seed({ fullness: 100 });
  assert.equal(use(s, "basic-food", "p1").reason, "full");
  process.stdout.write("(6) 만복도 가득  ok\n");
}

// (7) 프리미엄먹이는 가득 채우고 버프를 건다
{
  const s = seed({ fullness: 10 }, { "premium-food": 2 });
  const res = use(s, "premium-food", "p1");
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.fullness, 100);
  assert.equal(s.pets[0]?.buffs[0]?.kind, "premium-food");
  assert.equal(s.pets[0]?.buffs[0]?.remainMs, BAG_V3_RULES.buffMs["premium-food"]);
  assert.equal(s.bag["premium-food"], 1, "하나 줄었다");
  process.stdout.write("(7) 프리미엄먹이 · 가득과 버프  ok\n");
}

// (8) 장난감은 오래 놀아주기 버프를 건다. 다시 쓰면 갱신한다
{
  const s = seed({ buffs: [{ kind: "long-play", remainMs: 1000 }] }, { toy: 1 });
  const res = use(s, "toy", "p1");
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.buffs.length, 1, "겹쳐 쌓지 않는다");
  assert.equal(s.pets[0]?.buffs[0]?.remainMs, BAG_V3_RULES.buffMs["long-play"], "남은 시간을 기본값으로 바꾼다");
  assert.equal(s.bag.toy, undefined, "다 쓰면 가방에서 사라진다");
  assert.equal(use(s, "toy", "p1").reason, "none-left");
  process.stdout.write("(8) 장난감 · 버프 갱신과 소진  ok\n");
}

// (9) 경험사탕은 경험치를 올리고 레벨을 다시 읽는다
{
  const s = seed({}, { "exp-candy-m": 1 });
  const res = use(s, "exp-candy-m", "p1");
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.exp, 3000);
  assert.equal(s.pets[0]?.level, levelFor("medium-slow", 3000), "종의 곡선으로 읽는다");
  assert.ok((s.pets[0]?.level ?? 0) > 1);
  process.stdout.write("(9) 경험사탕 · 레벨 재계산  ok\n");
}

// (10) 이상한사탕은 레벨을 1 올리고 진행을 0 으로 둔다
{
  const s = seed({ level: 5, exp: expForLevel("medium-slow", 5) + 500 }, { "rare-candy": 1 });
  const res = use(s, "rare-candy", "p1");
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.level, 6);
  assert.equal(s.pets[0]?.exp, expForLevel("medium-slow", 6), "새 레벨의 진행은 0");
  process.stdout.write("(10) 이상한사탕 · 레벨 +1  ok\n");
}

// (11) 최대 레벨이면 사탕을 거절한다
{
  const s = seed({ level: 100, exp: expForLevel("medium-slow", 100) }, { "rare-candy": 1, "exp-candy-xl": 1 });
  assert.equal(use(s, "rare-candy", "p1").reason, "max-level");
  assert.equal(use(s, "exp-candy-xl", "p1").reason, "max-level");
  assert.equal(s.bag["rare-candy"], 1, "쓰지 않았으니 그대로");
  process.stdout.write("(11) 최대 레벨 거절  ok\n");
}

// (12) 민트는 성격을 바꾼다
{
  const s = seed({ nature: "hardy" }, { mint: 1 });
  assert.equal(use(s, "mint", "p1", { nature: "없는성격" }).reason, "bad-nature");
  assert.equal(use(s, "mint", "p1", { nature: "hardy" }).reason, "already");
  const res = use(s, "mint", "p1", { nature: "brave" });
  assert.equal(res.ok, true);
  assert.equal(s.pets[0]?.nature, "brave");
  process.stdout.write("(12) 민트 · 성격 변경  ok\n");
}

// (13) 약 두 개는 이로치를 오간다. 도감 기록은 남는다
{
  const s = seed({}, { "shiny-potion": 1, "normal-potion": 1 });
  assert.equal(use(s, "normal-potion", "p1").reason, "already", "이미 일반색");
  assert.equal(use(s, "shiny-potion", "p1").ok, true);
  assert.equal(s.pets[0]?.shiny, true);
  assert.ok(s.dex.shinyObtained.includes("charmander"), "도감에 이로치 획득");
  assert.equal(use(s, "normal-potion", "p1").ok, true);
  assert.equal(s.pets[0]?.shiny, false);
  assert.ok(s.dex.shinyObtained.includes("charmander"), "되돌려도 기록은 남는다");
  process.stdout.write("(13) 이로치 약 · 오가고 기록은 보존  ok\n");
}

// (14) 없는 도구와 없는 개체
{
  const s = seed({}, { mint: 1 });
  assert.equal(use(s, "없는도구", "p1").reason, "no-item");
  assert.equal(use(s, "mint", "없는개체").reason, "no-pet");
  assert.equal(use(s, "_comment", "p1").reason, "no-item", "메모 키는 도구가 아니다");
  process.stdout.write("(14) 없는 도구와 개체  ok\n");
}

process.stdout.write("selftest-bag: 통과 (곡선·먹이·버프·사탕·민트·약)\n");
