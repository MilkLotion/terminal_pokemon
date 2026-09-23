// 거래 실행기 자체 확인 — npm run build 뒤 node dist/tools/selftest-tx.js
//
// 테스트 프레임워크 없이 assert 만. 파일을 만들지 않는다 — 읽기·쓰기·시계를 가짜로 넣는다.
// 계약은 docs/specs/modules.md "거래 실행기"다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { SAVE_V3_RULES } from "../save/rules";
import { empty } from "../save/v3";
import type { SaveV3 } from "../shared/save-v3";
import { createExecutor, type TxHandler, type TxPorts } from "../tx/executor";
import { HANDLERS } from "../tx/handlers";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime();

// 개체 하나가 첫 칸에 보이는 상태로 시작한다
function seed(): SaveV3 {
  const s = empty(T0);
  s.pets.push({
    id: "p1", species: "charmander", shiny: false, nature: "hardy", size: 2,
    level: 1, exp: 0, affinity: 0, fullness: 100, mood: 60, feedCooldownMs: 0, buffs: [],
    home: { dx: -24, dy: -60 }, since: T0, stage: 0, evolved: [],
    daily: { date: "2026-09-24", gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  });
  s.party.slots[0] = { state: "pokemon", petId: "p1", hidden: false };
  return s;
}

interface Fake {
  ports: TxPorts;
  writes: number;
  fail: boolean;
  state: SaveV3;
}

function fake(state: SaveV3, now = T0): Fake {
  const f: Fake = {
    state,
    writes: 0,
    fail: false,
    ports: {
      read: () => f.state,
      write: (s) => {
        if (f.fail) return false;
        f.state = s;
        f.writes += 1;
        return true;
      },
      now: () => now,
    },
  };
  return f;
}

// (1) 성공하면 저장이 한 번 바뀌고 요청 기록이 남는다
{
  const f = fake(seed());
  const tx = createExecutor(f.ports, HANDLERS);
  const res = tx.run({ id: "r1", name: "party.hide", args: { petId: "p1" } });
  assert.equal(res.ok, true);
  assert.equal(f.writes, 1);
  assert.equal(f.state.party.slots[0]?.hidden, true);
  assert.equal(f.state.tx.length, 1);
  assert.equal(f.state.tx[0]?.id, "r1");
  assert.equal(f.state.savedAt, T0);
  process.stdout.write("(1) 성공 · 한 번 쓰고 요청을 기록한다  ok\n");
}

// (2) 같은 요청 ID 를 다시 보내도 한 번만 반영한다
{
  const f = fake(seed());
  const tx = createExecutor(f.ports, HANDLERS);
  const first = tx.run({ id: "r1", name: "party.hide", args: { petId: "p1" } });
  const again = tx.run({ id: "r1", name: "party.hide", args: { petId: "p1" } });
  assert.equal(first.ok, true);
  assert.ok(again.ok && again.replayed, "두 번째는 재생이다");
  assert.deepStrictEqual(again.ok && again.result, first.ok && first.result, "저장된 결과를 그대로 돌려준다");
  assert.equal(f.writes, 1, "쓰기는 한 번뿐");
  process.stdout.write("(2) 중복 요청 · 결과를 그대로 돌려준다  ok\n");
}

// (3) 규칙에 걸리면 아무 상태도 바꾸지 않는다
{
  const f = fake(seed());
  const tx = createExecutor(f.ports, HANDLERS);
  const res = tx.run({ id: "r1", name: "party.show", args: { petId: "p1" } });
  assert.equal(res.ok, false);
  assert.equal(res.ok === false && res.reason, "already", "이미 보이는 개체");
  assert.equal(f.writes, 0);
  assert.equal(f.state.tx.length, 0, "실패한 요청은 기록하지 않는다");
  const gone = tx.run({ id: "r2", name: "party.hide", args: { petId: "없는개체" } });
  assert.equal(gone.ok === false && gone.reason, "no-slot");
  assert.equal(f.writes, 0);
  process.stdout.write("(3) 실패 · 상태를 그대로 둔다  ok\n");
}

// (4) 모르는 명령과 빈 저장
{
  const f = fake(seed());
  const tx = createExecutor(f.ports, HANDLERS);
  assert.equal(tx.run({ id: "r1", name: "없는명령" }).ok, false);
  const none = createExecutor({ read: () => null, write: () => true, now: () => T0 }, HANDLERS);
  const res = none.run({ id: "r1", name: "party.hide", args: { petId: "p1" } });
  assert.equal(res.ok === false && res.reason, "no-save");
  process.stdout.write("(4) 모르는 명령과 빈 저장  ok\n");
}

// (5) 저장 실패가 이어지면 안내 조건이 선다
{
  const f = fake(seed());
  f.fail = true;
  const tx = createExecutor(f.ports, HANDLERS);
  for (let i = 0; i < SAVE_V3_RULES.saveFailNotifyAfter; i++) {
    const res = tx.run({ id: `r${i}`, name: "party.hide", args: { petId: "p1" } });
    assert.equal(res.ok === false && res.reason, "save-failed");
  }
  assert.equal(tx.saveFailStreak(), SAVE_V3_RULES.saveFailNotifyAfter);
  assert.equal(tx.shouldNotifySaveFail(), true);
  f.fail = false;
  assert.equal(tx.run({ id: "ok", name: "party.hide", args: { petId: "p1" } }).ok, true);
  assert.equal(tx.saveFailStreak(), 0, "성공하면 이어진 실패가 풀린다");
  process.stdout.write("(5) 저장 실패 · 이어지면 안내 조건  ok\n");
}

// (6) 처리기가 사본만 고친다 — 실패해도 원본이 더럽혀지지 않는다
{
  const f = fake(seed());
  const dirty: TxHandler = (draft) => {
    draft.points.balance = 9999;
    return { ok: false, reason: "규칙실패" };
  };
  const tx = createExecutor(f.ports, { dirty });
  const res = tx.run({ id: "r1", name: "dirty" });
  assert.equal(res.ok, false);
  assert.equal(f.state.points.balance, 0, "원본은 그대로");
  process.stdout.write("(6) 사본 격리 · 실패가 원본을 건드리지 않는다  ok\n");
}

// (7) 요청 기록은 최근 건수를 넘지 않는다
{
  const s = seed();
  const { keep } = SAVE_V3_RULES.tx;
  for (let i = 0; i < keep + 20; i++) s.tx.push({ id: `old${i}`, at: T0 - SAVE_V3_RULES.tx.ttlMs - 1000, result: null });
  const f = fake(s);
  const tx = createExecutor(f.ports, HANDLERS);
  assert.equal(tx.run({ id: "new", name: "party.hide", args: { petId: "p1" } }).ok, true);
  assert.equal(f.state.tx.length, keep, "오래된 기록은 최근 건수까지만 남는다");
  assert.equal(f.state.tx.at(-1)?.id, "new");
  process.stdout.write("(7) 요청 기록 · 최근 건수까지만  ok\n");
}

process.stdout.write("selftest-tx: 통과 (성공·중복·실패·격리·기록)\n");
