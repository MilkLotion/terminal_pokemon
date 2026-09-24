// 저장 v3 의 빈 상태·정규화·v2 이전 자체 확인 — npm run build 뒤 node dist/tools/selftest-save-v3.js
//
// 테스트 프레임워크 없이 assert 만. 앞쪽은 값만으로, 뒤쪽 파일 통로는 임시 폴더에서 확인한다.
// 계약은 docs/specs/modules.md "저장 구조"와 "V2 → V3 변환 규칙"이다.
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrate, verify } from "../save/migrate-v3";
import * as store from "../save/store";
import * as storeV3 from "../save/store-v3";
import { SAVE_V3_RULES } from "../save/rules";
import { empty, normalize } from "../save/v3";
import type { Pet, SaveV2 } from "../shared/types";

const T0 = new Date(2026, 8, 24, 10, 0, 0).getTime(); // 2026-09-24 10:00 로컬
const TODAY = "2026-09-24";

const v2Pet = (over: Partial<Pet> = {}): Pet => ({
  id: "p1",
  species: "charmander",
  shiny: false,
  nature: "hardy",
  nick: null,
  size: 2,
  shown: true,
  home: { dx: -24, dy: -60 },
  hunger: 30,
  mood: 60,
  affinity: 40,
  stage: 0,
  since: T0 - 60_000,
  fedAt: null,
  playedAt: null,
  daily: { date: TODAY, gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
  evolved: [],
  ...over,
});

const v2Save = (over: Partial<SaveV2> = {}): SaveV2 => ({
  v: 2,
  points: 120,
  slots: 2,
  party: [v2Pet()],
  daily: { date: TODAY, streak: 3, interacted: true },
  totals: { workMs: 0, presenceMs: 0, tokens: 0, turns: 0, days: 1, fed: 2, played: 1 },
  agents: {},
  unlocked: ["charmander", "squirtle"],
  inventory: { berry: 3, "shiny:p1": 1 },
  acc: {},
  log: [],
  ...over,
});

// (1) 빈 저장 — 파티는 두 칸이 열려 있고 나머지는 잠겨 있다
{
  const s = empty(T0);
  assert.equal(s.v, 3);
  assert.equal(s.party.slots.length, SAVE_V3_RULES.party.total);
  const open = s.party.slots.filter((x) => x.state === "empty").length;
  const shop = s.party.slots.filter((x) => x.state === "locked" && x.unlockBy === "shop").length;
  const ach = s.party.slots.filter((x) => x.state === "locked" && x.unlockBy === "achievement").length;
  assert.equal(open, SAVE_V3_RULES.party.openAtStart, "시작은 두 칸");
  assert.equal(shop, SAVE_V3_RULES.party.shopUnlock, "상점으로 여는 칸");
  assert.equal(ach, SAVE_V3_RULES.party.total - SAVE_V3_RULES.party.openAtStart - SAVE_V3_RULES.party.shopUnlock, "업적으로 여는 칸");
  assert.equal(s.boxes.length, 1);
  assert.equal(s.boxes[0]?.slots.length, SAVE_V3_RULES.box.size);
  process.stdout.write("(1) 빈 저장 · 파티 칸 구성  ok\n");
}

// (2) 이전 — 배고픔이 만복도로 뒤집히고 표시 상태가 숨김으로 뒤집힌다
{
  const src = v2Save({ party: [v2Pet({ hunger: 30, shown: true }), v2Pet({ id: "p2", species: "squirtle", hunger: 80, shown: false, affinity: 10 })] });
  const { save, failed } = migrate(src, T0);
  assert.deepStrictEqual(failed, [], "검사를 모두 통과");
  assert.ok(save);
  assert.equal(save.pets.length, 2);
  assert.equal(save.pets[0]?.fullness, 70, "fullness = 100 − hunger");
  assert.equal(save.pets[1]?.fullness, 20);
  const s0 = save.party.slots[0];
  const s1 = save.party.slots[1];
  assert.equal(s0?.state, "pokemon");
  assert.equal(s0?.hidden, false, "shown 이면 숨김이 아니다");
  assert.equal(s1?.hidden, true, "shown 이 아니면 숨김이다");
  assert.equal(save.points.balance, 120);
  assert.deepStrictEqual(save.dex.unlocked, ["charmander", "squirtle"]);
  assert.deepStrictEqual(save.dex.obtained.sort(), ["charmander", "squirtle"]);
  process.stdout.write("(2) 이전 · 만복도와 숨김 뒤집기  ok\n");
}

// (3) 이전 — 이로치 권리는 가방이 아니라 legacy 로, 도구는 가방으로
{
  const { save } = migrate(v2Save(), T0);
  assert.ok(save);
  assert.equal(save.bag.berry, undefined, "v2 이름 그대로 남기지 않는다");
  assert.equal(save.bag["premium-food"], 3, "berry 는 프리미엄먹이의 옛 이름이다");
  assert.equal(save.bag["shiny:p1"], undefined, "이로치 권리는 도구가 아니다");
  assert.equal(save.legacy["shiny:p1"], 1, "legacy 에 보존한다");
  process.stdout.write("(3) 이전 · 이로치 권리 보존  ok\n");
}

// (4) 이전 — 칸 수보다 많은 개체는 박스로 간다
{
  const party = [v2Pet(), v2Pet({ id: "p2" }), v2Pet({ id: "p3" })];
  const { save, failed } = migrate(v2Save({ party, slots: 2 }), T0);
  assert.deepStrictEqual(failed, []);
  assert.ok(save);
  const inParty = save.party.slots.filter((s) => s.state === "pokemon").map((s) => s.petId);
  assert.deepStrictEqual(inParty, ["p1", "p2"], "열린 칸까지만 파티에 둔다");
  assert.equal(save.boxes[0]?.slots[0], "p3", "남은 개체는 박스 첫 칸으로");
  process.stdout.write("(4) 이전 · 칸을 넘는 개체는 박스로  ok\n");
}

// (5) 이전 — 밥 쿨타임은 남은 시간으로 바뀐다
{
  const half = SAVE_V3_RULES.feedCooldownMs / 2;
  const { save } = migrate(v2Save({ party: [v2Pet({ fedAt: T0 - half })] }), T0);
  assert.ok(save);
  assert.equal(save.pets[0]?.feedCooldownMs, half, "지난 만큼 뺀 남은 시간");
  const done = migrate(v2Save({ party: [v2Pet({ fedAt: T0 - SAVE_V3_RULES.feedCooldownMs * 2 })] }), T0);
  assert.equal(done.save?.pets[0]?.feedCooldownMs, 0, "다 지났으면 0");
  process.stdout.write("(5) 이전 · 쿨타임을 남은 시간으로  ok\n");
}

// (6) 검사 — 값이 어긋나면 결과를 버린다
{
  const src = v2Save();
  const { save } = migrate(src, T0);
  assert.ok(save);
  const broken = { ...save, points: { ...save.points, balance: 0 } };
  const checks = verify(src, broken);
  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  assert.deepStrictEqual(failed, ["포인트"], "어긋난 검사 이름을 돌려준다");
  process.stdout.write("(6) 검사 · 어긋나면 이름을 돌려준다  ok\n");
}

// (7) 정규화 — 없는 개체를 가리키는 칸과 중복 개체를 정리한다
{
  const base = empty(T0);
  const raw = {
    ...base,
    pets: [
      { id: "p1", species: "pikachu", affinity: 200, fullness: -5, level: 0 },
      { id: "p1", species: "pikachu" }, // 중복은 버린다
      { species: "eevee" }, // 식별자가 없으면 버린다
    ],
    party: { slots: [{ state: "pokemon", petId: "ghost" }, { state: "pokemon", petId: "p1", hidden: true }] },
    tx: [{ id: "t1", at: T0, result: { ok: true } }],
  };
  const s = normalize(raw, T0);
  assert.ok(s);
  assert.equal(s.pets.length, 1, "중복과 뼈대 아닌 개체는 버린다");
  assert.equal(s.pets[0]?.affinity, 100, "친밀도는 100 을 넘지 않는다");
  assert.equal(s.pets[0]?.fullness, 0, "만복도는 0 아래로 내려가지 않는다");
  assert.equal(s.pets[0]?.level, 1, "레벨은 1 부터");
  assert.equal(s.party.slots[0]?.state, "empty", "없는 개체를 가리키면 빈 칸");
  assert.equal(s.party.slots[1]?.petId, "p1");
  assert.equal(s.tx.length, 1);
  process.stdout.write("(7) 정규화 · 어긋난 참조와 범위 정리  ok\n");
}

// (8) 정규화 — v 가 3 이 아니면 받지 않는다
{
  assert.equal(normalize({ ...empty(T0), v: 2 }, T0), null);
  assert.equal(normalize(null, T0), null);
  assert.equal(normalize("x", T0), null);
  process.stdout.write("(8) 정규화 · 뼈대가 아니면 null  ok\n");
}

process.stdout.write("selftest-save-v3: 통과 (빈 저장·이전·검사·정규화)\n");

// ── 파일 통로 ──────────────────────────────────────────────────────────────────
// 여기부터는 임시 폴더에서 실제 파일로 확인한다. 끝나면 지운다
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-v3-"));
  try {
    // (9) 없는 파일
    {
      const res = storeV3.read(path.join(root, "none.json"));
      assert.equal(res.state, null);
      assert.equal(res.corrupted, false);
      process.stdout.write("(9) 파일 없음  ok\n");
    }

    // (10) v3 파일은 그대로 읽는다
    {
      const file = path.join(root, "v3.json");
      const s = empty(T0);
      s.points.balance = 77;
      assert.equal(storeV3.write(file, s), true);
      const res = storeV3.read(file);
      assert.ok(res.state);
      assert.equal(res.migrated, false);
      assert.equal(res.state.points.balance, 77);
      process.stdout.write("(10) v3 읽기·쓰기  ok\n");
    }

    // (11) v2 파일은 백업하고 v3 으로 옮긴다
    {
      const file = path.join(root, "v2.json");
      const src = v2Save();
      assert.equal(store.write(file, src), true);
      const res = storeV3.read(file);
      assert.ok(res.state, "이전 결과가 있다");
      assert.equal(res.migrated, true);
      assert.equal(res.state.v, 3);
      assert.equal(res.state.points.balance, 120);
      assert.ok(fs.existsSync(storeV3.backupName(file)), "원본을 백업한다");
      const backup = JSON.parse(fs.readFileSync(storeV3.backupName(file), "utf8")) as { v: number };
      assert.equal(backup.v, 2, "백업은 v2 그대로");
      // 파일은 v3 으로 바뀌었다 — 다시 읽어도 옮기지 않는다
      const again = storeV3.read(file);
      assert.equal(again.migrated, false);
      assert.equal(again.state?.v, 3);
      process.stdout.write("(11) v2 이전 · 백업 후 교체  ok\n");
    }

    // (12) 파손 파일은 .bak 으로 옮긴다
    {
      const file = path.join(root, "broken.json");
      fs.writeFileSync(file, "{ 이건 JSON 이 아니다");
      const res = storeV3.read(file);
      assert.equal(res.state, null);
      assert.equal(res.corrupted, true);
      assert.ok(fs.existsSync(`${file}.bak`), "파손 파일을 격리한다");
      process.stdout.write("(12) 파손 격리  ok\n");
    }

    // (13) 읽기 전용은 파손 파일을 손대지 않는다
    {
      const file = path.join(root, "broken2.json");
      fs.writeFileSync(file, "깨진 내용");
      const res = storeV3.read(file, { repair: false });
      assert.equal(res.corrupted, true);
      assert.ok(fs.existsSync(file), "원본이 남아 있다");
      assert.equal(fs.existsSync(`${file}.bak`), false);
      process.stdout.write("(13) 읽기 전용은 격리하지 않는다  ok\n");
    }

    // (14) 읽기 전용은 v2 파일을 바꾸지 않는다. 옮긴 값만 돌려준다
    {
      const file = path.join(root, "v2-reader.json");
      assert.equal(store.write(file, v2Save()), true);
      const before = fs.readFileSync(file, "utf8");
      const res = storeV3.read(file, { repair: false });
      assert.equal(res.state?.v, 3, "옮긴 값을 돌려준다");
      assert.equal(fs.readFileSync(file, "utf8"), before, "파일은 v2 그대로");
      assert.equal(fs.existsSync(storeV3.backupName(file)), false, "백업도 만들지 않는다");
      process.stdout.write("(14) 읽기 전용은 v2 를 교체하지 않는다  ok\n");
    }
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // 지우지 못해도 검사 결과는 그대로다
    }
  }
}

process.stdout.write("selftest-save-v3: 파일 통로 통과 (없음·v3·v2 이전·파손)\n");
