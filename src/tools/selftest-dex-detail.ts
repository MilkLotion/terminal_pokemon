// 도감 상세 자체 확인 — npm run build 뒤 node dist/tools/selftest-dex-detail.js
//
// 테스트 프레임워크 없이 assert 만. 한 종의 입수 방법·진화·알 행동 조건 문구를 본다.
// 계약은 docs/specs/s5.md "도감", 화면은 Figma Dex / Base 와 Dex / Detail / * 다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { empty } from "../save/v3";
import type { SaveV3 } from "../shared/save-v3";
import { dexDetail } from "../tx/dex-detail";

const T0 = new Date(2026, 8, 25, 10, 0, 0).getTime();

function seed(): SaveV3 {
  const s = empty(T0);
  s.dex.obtained = ["charmander"];
  s.dex.unlocked = ["charmander", "charmeleon", "charizard"];
  return s;
}

// (1) 획득한 첫 선택 후보 — 파이리
{
  const d = dexDetail(seed(), "charmander");
  assert.ok(d);
  assert.equal(d.name, "파이리");
  assert.equal(d.state, "obtained");
  assert.deepStrictEqual(d.types, ["불꽃"]);
  assert.equal(d.methods, "첫 선택 후보 · 랜덤알", "첫 선택 후보이고 해금했으니 랜덤알에서도 나온다");
  assert.equal(d.evolution, "Lv.16에서 리자드 · 진화는 개체 상세에서 직접");
  assert.equal(d.eggCondition, "없음");
  assert.equal(d.gimmick, "없음");
  process.stdout.write("(1) 획득 · 첫 선택 후보와 진화 조건  ok\n");
}

// (2) 해금만 한 진화 종 — 리자드는 파이리에서 진화한다
{
  const d = dexDetail(seed(), "charmeleon");
  assert.ok(d);
  assert.equal(d.state, "unlocked");
  assert.equal(d.owned, 0);
  assert.equal(d.methods, "파이리에서 진화 · 랜덤알");
  assert.equal(d.evolution, "Lv.36에서 리자몽 · 진화는 개체 상세에서 직접");
  process.stdout.write("(2) 해금 · 앞 단계에서 진화  ok\n");
}

// (3) 최종 단계 — 더 진화하지 않는다
{
  const d = dexDetail(seed(), "charizard");
  assert.ok(d);
  assert.equal(d.evolution, "더 진화하지 않아요");
  process.stdout.write("(3) 최종 단계  ok\n");
}

// (4) 미해금 화석 종 — 이름·타입·진화는 숨기고 입수 방법은 보인다
{
  const d = dexDetail(seed(), "omanyte");
  assert.ok(d);
  assert.equal(d.state, "locked");
  assert.equal(d.name, "???");
  assert.deepStrictEqual(d.types, []);
  assert.equal(d.methods, "태고의돌", "해금 전이라 랜덤알은 붙지 않는다");
  assert.equal(d.evolution, "해금하면 보여요");
  process.stdout.write("(4) 미해금 · 태고의돌  ok\n");
}

// (5) 알 행동 조건 종 — 발견 전은 힌트, 발견 뒤는 조건 문구
{
  const s = seed();
  const before = dexDetail(s, "arcanine");
  assert.ok(before);
  assert.ok(before.methods.includes("알 행동 조건"), before.methods);
  assert.equal(before.eggCondition, "미발견 · 알을 돌보는 방법에 따라 나올 수 있어요");
  s.dex.discovered.arcanine = "pat-3";
  const after = dexDetail(s, "arcanine");
  assert.equal(after?.eggCondition, "발견 · 쓰다듬기만 3~7회");
  process.stdout.write("(5) 알 행동 조건 · 발견 전후  ok\n");
}

// (6) 경로가 하나도 없는 미해금 종 — 획득 방법 준비 중
{
  const d = dexDetail(seed(), "cosmog");
  assert.ok(d);
  assert.equal(d.methods, "획득 방법 준비 중");
  process.stdout.write("(6) 획득 방법 준비 중  ok\n");
}

// (7) 상점 종 — 해금 전에는 "해금 후"를 붙인다. 모르는 종은 null
{
  const d = dexDetail(seed(), "snorlax");
  assert.ok(d?.methods.includes("상점 구매 800P(해금 후)"), d?.methods);
  assert.equal(dexDetail(seed(), "없는종"), null);
  process.stdout.write("(7) 상점 종과 모르는 종  ok\n");
}

process.stdout.write("selftest-dex-detail: 통과 (획득·해금·최종·미해금·알 조건·경로 없음·상점)\n");
