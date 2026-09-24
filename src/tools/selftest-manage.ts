// 관리 창이 쓰는 길 자체 확인 — npm run build 뒤 node dist/tools/selftest-manage.js
//
// Electron 없이 확인한다. 창은 `src/main/game-v3.ts` 하나만 부르므로 그것을 직접 부른다.
// 임시 폴더에 실제 저장 파일을 만들고, 스냅샷을 읽고 명령을 보낸 뒤 다시 읽는다.
// 계약은 docs/specs/modules.md 의 명령 계약과 `src/shared/manage.d.ts` 다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGame } from "../main/game-v3";
import { SAVE_V3_RULES } from "../save/rules";
import * as storeV3 from "../save/store-v3";
import { empty } from "../save/v3";
import type { SaveV3 } from "../shared/save-v3";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime();
const HOUR = 3_600_000;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-manage-"));
const file = path.join(root, "save-v3.json");

function seed(): SaveV3 {
  const s = empty(T0);
  s.points.balance = 340;
  s.pets.push({
    id: "p1", species: "pikachu", shiny: false, nature: "hardy", size: 2,
    level: 12, exp: 2000, affinity: 80, affinityProgressMs: 0, fullness: 55, fullnessProgressMs: 0,
    mood: 60, feedCooldownMs: 0, playCooldownMs: 0, playWindowMs: 0, playStreak: 0,
    buffs: [], home: { dx: -24, dy: -60 }, since: T0, stage: 0, evolved: [],
    daily: { date: "2026-09-24", gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  });
  s.starterPetId = "p1";
  s.party.slots[0] = { state: "pokemon", petId: "p1", hidden: true };
  return s;
}

try {
  let now = T0;
  const game = createGame({ file, now: () => now, rand: () => 0.5 });

  // (1) 저장이 없으면 스냅샷도 없다
  assert.equal(game.view(), null, "저장이 없으면 null");
  assert.equal(game.tick(), null);
  process.stdout.write("(1) 저장 없음  ok\n");

  assert.equal(storeV3.write(file, seed()), true);

  // (2) 스냅샷은 화면이 바로 쓸 값을 준다
  {
    const v = game.view();
    assert.ok(v);
    assert.equal(v.points, 340);
    const pet = v.party.slots[0]?.pet;
    assert.equal(pet?.name, "피카츄", "슬러그가 아니라 이름");
    assert.equal(pet?.hidden, true);
    assert.equal(pet?.zone, "normal", "만복도 55 는 보통");
    assert.equal(v.party.shown, 0);
    assert.equal(v.party.usable, SAVE_V3_RULES.party.openAtStart);
    process.stdout.write("(2) 스냅샷 값  ok\n");
  }

  // 조작 하나마다 새 식별자를 붙인다. 화면이 하는 것과 같다
  let seq = 0;
  const click = (cmd: string, target: string): ReturnType<typeof game.send> =>
    game.send({ cmd, target, args: { reqId: `ui:${++seq}` } }, "settings");

  // (3) 명령을 보내면 저장이 바뀌고 다음 스냅샷에 보인다
  {
    const reply = click("party.show", "p1");
    assert.equal(reply.ok, true);
    assert.equal(reply.reason, "ok");
    const v = game.view();
    assert.equal(v?.party.slots[0]?.pet?.hidden, false, "꺼낸 상태가 보인다");
    assert.equal(v?.party.shown, 1);
    process.stdout.write("(3) 명령 · 꺼내기  ok\n");
  }

  // (4) 규칙에 걸리면 이유가 그대로 온다
  {
    const reply = click("party.show", "p1");
    assert.equal(reply.ok, false);
    assert.equal(reply.reason, "already");
    // 같은 식별자로 다시 보내면 한 번만 반영한다
    const once = game.send({ cmd: "party.hide", target: "p1", args: { reqId: "same" } }, "settings");
    const again = game.send({ cmd: "party.hide", target: "p1", args: { reqId: "same" } }, "settings");
    assert.equal(once.ok, true);
    assert.equal(again.ok, true);
    assert.equal(again.replayed, true, "두 번째는 재생");
    assert.equal(click("party.show", "p1").ok, true, "다시 꺼낸다");
    process.stdout.write("(4) 실패 이유와 중복 방지  ok\n");
  }

  // (5) 틱은 멈췄던 시간을 한 번에 적용한다
  {
    now = T0 + 2 * HOUR;
    const events = game.tick();
    assert.ok(events);
    const v = game.view();
    assert.equal(v?.party.slots[0]?.pet?.fullness, 55 - 60 < 0 ? 0 : 55 - 60, "2시간에 60 감소, 0 에서 멈춘다");
    assert.ok(v && v.points > 340, "포인트가 쌓였다");
    assert.ok(events.hungerEnter.length >= 1, "배고픔 구간 진입을 알린다");
    process.stdout.write("(5) 틱 · 멈췄던 시간 적용  ok\n");
  }

  // (6) 밥을 주면 만복도가 오르고 쿨타임이 화면 값으로 온다
  {
    const reply = game.send({ cmd: "feed", target: "p1" }, "settings");
    assert.equal(reply.ok, true);
    const pet = game.view()?.party.slots[0]?.pet;
    assert.equal(pet?.fullness, 20, "0 에서 20 으로");
    assert.equal(pet?.feedReady, false);
    assert.equal(pet?.feedInSec, SAVE_V3_RULES.feedCooldownMs / 1000, "남은 쿨타임을 초로");
    process.stdout.write("(6) 밥 주기와 쿨타임 표시  ok\n");
  }

  // (7) 놀아주면 중첩이 화면 값에 실린다
  {
    assert.equal(game.send({ cmd: "play", target: "p1" }, "settings").ok, true);
    const pet = game.view()?.party.slots[0]?.pet;
    assert.equal(pet?.playStreak, 1);
    assert.equal(pet?.longPlay, false);
    assert.equal(pet?.playReady, false);
    process.stdout.write("(7) 놀아주기 중첩 표시  ok\n");
  }

  // (8) 박스에 보관하면 파티 칸이 빈다
  {
    assert.equal(game.send({ cmd: "party.keep", target: "p1" }, "settings").ok, true);
    const v = game.view();
    assert.equal(v?.party.slots[0]?.state, "empty");
    assert.equal(v?.boxes[0]?.used, 1, "박스로 갔다");
    process.stdout.write("(8) 박스 보관  ok\n");
  }

  // (9) 모르는 명령은 이유를 돌려주고 저장을 건드리지 않는다
  {
    const before = JSON.stringify(game.read());
    const reply = game.send({ cmd: "없는명령", target: "p1" }, "settings");
    assert.equal(reply.ok, false);
    assert.equal(reply.reason, "unknown-command");
    assert.equal(JSON.stringify(game.read()), before, "저장이 그대로");
    process.stdout.write("(9) 모르는 명령  ok\n");
  }

  process.stdout.write("selftest-manage: 통과 (스냅샷·명령·틱·실패)\n");
} finally {
  try {
    fs.rmSync(root, { recursive: true, force: true });
  } catch {
    // 지우지 못해도 검사 결과는 그대로다
  }
}
