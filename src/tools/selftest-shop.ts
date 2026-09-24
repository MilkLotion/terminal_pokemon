// S4 거래와 진행 검사. 실제 사용자 저장 접근 없음
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { advance, evolve, evolutionOptions, setLook } from "../dex/progress";
import { appearanceOf } from "../dex/appearance";
import { buy } from "../shop/core";
import { SHOP } from "../shop/catalog";
import { care } from "../state/core";
import { empty, emptyPet, normalize, read, write } from "../save/store";
import { createCommands } from "../main/commands";
import { createGame } from "../main/game-v3";
import { createV3Party } from "../main/party-v3";
import { begin } from "../party/starter";
import * as storeV3 from "../save/store-v3";
import { empty as emptyV3 } from "../save/v3";
import { send } from "../save/mailbox";
import { gameMenu, petGameMenu } from "../main/game-menu";
import type { Command, SaveV2 } from "../shared/types";

const T = new Date(2026, 8, 18, 12).getTime();
function fresh(species = "eevee"): SaveV2 {
  const save = empty(T);
  save.party = [emptyPet({ id: "p1", species, now: T })];
  save.unlocked = [species];
  return save;
}
function unchanged(save: SaveV2, run: () => { ok: boolean; reason: string }, reason: string): void {
  const before = structuredClone(save);
  assert.equal(run().reason, reason);
  assert.deepEqual(save, before, reason);
}

async function main(): Promise<void> {
  {
    const save = fresh();
    advance(save, T);
    assert.ok(save.unlocked.includes("snorlax") && save.unlocked.includes("pikachu"));
    assert.equal(save.points, 0, "무조건 해금은 보상 없음");
    const once = structuredClone(save);
    advance(save, T);
    assert.deepEqual(save, once, "해금 중복 없음");
    unchanged(save, () => buy(save, undefined, { item: "slot" }, T), "not-enough-points");
    unchanged(save, () => buy(save, undefined, { item: "species", species: "pikachu" }, T), "party-full");
    save.points = 2000;
    assert.ok(buy(save, undefined, { item: "slot" }, T).ok);
    assert.equal(save.points, 2000 - SHOP.slots[0]!);
    assert.ok(buy(save, undefined, { item: "species", species: "pikachu" }, T, () => 0).ok);
    assert.equal(save.party[1]!.id, "p2");
    while (save.slots < 6) assert.ok(buy(save, undefined, { item: "slot" }, T).ok);
    unchanged(save, () => buy(save, undefined, { item: "slot" }, T), "max-slots");
    unchanged(save, () => buy(save, "p1", { item: "mint", nature: "unknown" }, T), "bad-nature");
    assert.ok(buy(save, "p1", { item: "mint", nature: "jolly" }, T).ok);
    assert.equal(save.party[0]!.nature, "jolly");
    unchanged(save, () => buy(save, "p1", { item: "mint", nature: "jolly" }, T), "already-owned");
    unchanged(save, () => buy(save, undefined, { item: "species", species: "mewtwo" }, T), "locked-species");
  }
  {
    const save = fresh(); const pet = save.party[0]!;
    unchanged(save, () => evolve(save, "p1", "umbreon", T), "affinity");
    pet.affinity = 500;
    assert.equal(evolutionOptions(save, "p1", T).find((o) => o.species === "umbreon")!.reason, "time");
    unchanged(save, () => evolve(save, "p1", undefined, T), "choose-evolution");
    assert.ok(evolve(save, "p1", "umbreon", new Date(2026, 8, 18, 22).getTime()).ok);
    assert.equal(pet.species, "umbreon");
    assert.equal(pet.affinity, 500);
    assert.equal(pet.id, "p1");
    assert.equal(pet.stage, 1);
    assert.equal(save.points, SHOP.rewards.evolve);
    unchanged(save, () => evolve(save, "p1", "umbreon", T), "no-evolution");
    assert.ok(setLook(save, "p1", { look: "eevee" }).ok);
    assert.equal(pet.species, "umbreon");
    save.unlocked.push("pikachu");
    unchanged(save, () => setLook(save, "p1", { look: "pikachu" }), "locked-look");
    unchanged(save, () => setLook(save, "p1", { shiny: true }), "locked-color");
    save.points = 1000;
    assert.ok(buy(save, "p1", { item: "shiny" }, T).ok);
    assert.equal(appearanceOf(pet), "eevee:shiny");
    assert.ok(setLook(save, "p1", { shiny: false }).ok);
    assert.ok(setLook(save, "p1", { shiny: true }).ok);
    assert.equal(save.points, 1000 - SHOP.shiny);
    const restored = normalize(JSON.parse(JSON.stringify(save)))!;
    assert.equal(restored.party[0]!.shiny, true);
    assert.equal(restored.inventory["shiny:p1"], 1);
  }
  {
    const save = fresh("snorlax"); save.party[0]!.affinity = 1500;
    advance(save, T);
    assert.equal(save.points, SHOP.rewards.milestone * 2);
    const restored = normalize(JSON.parse(JSON.stringify(save)))!;
    advance(restored, T);
    assert.equal(restored.points, save.points, "재시작 후 단계 보상 중복 없음");
  }
  {
    const save = fresh(); save.points = 100; const pet = save.party[0]!;
    pet.hunger = 90;
    assert.ok(buy(save, undefined, { item: "berry" }, T).ok);
    assert.ok(care(save, "p1", "feed", T).ok);
    assert.equal(pet.hunger, 10);
    assert.equal(pet.affinity, 16);
    assert.equal(save.inventory.berry, 0);
    save.inventory.berry = 1;
    assert.equal(care(save, "p1", "feed", T + 1).reason, "cooldown");
    assert.equal(save.inventory.berry, 1, "거절된 밥은 먹이를 소비하지 않음");
  }
  // S4 메뉴는 저장 v2 모양을 그대로 읽는다. 앱은 관리 창을 쓰지만 이 함수는 남아 있다
  {
    const save = fresh(); save.points = 5000; save.slots = 2; advance(save, T);
    assert.equal(gameMenu(save, () => {}).length, 3);
    assert.ok(petGameMenu(save, save.party[0]!, () => {}).length >= 4);
  }

  // ── 실제 앱 경로 (저장 v3) — 명령이 거래 실행기를 거쳐 파일까지 간다 ──
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-v3-"));
  const gameDir = path.join(dir, ".claude", "pokebuddy");
  const paths = { save: path.join(gameDir, "save.json"), saveLock: path.join(gameDir, "save.lock"), companionLock: path.join(gameDir, "companion.lock"), mailbox: path.join(gameDir, "mailbox") };
  fs.mkdirSync(gameDir, { recursive: true });

  const seed = emptyV3(T);
  begin(seed, "charmander", T, () => 0);
  seed.pets[0]!.level = 16; // 레벨 조건을 채워 진화할 수 있게
  seed.points.balance = 5000;
  storeV3.write(paths.save, seed);

  const game = createGame({ file: paths.save, rand: () => 0 });
  const party = createV3Party({ game, paths, mode: "companion" });
  let artOk = false;
  let beforeArt: (() => void) | undefined;
  let changes = 0;
  const commands = createCommands({ mode: "companion", mailboxDir: paths.mailbox, party, game,
    stage: { poke: () => true, petIds: () => [], size: () => ({ w: 1, h: 1 }), visible: () => true },
    settings: { hidden: () => false, setHidden() {}, clickThrough: () => false, setClickThrough() {}, keepVisible: () => true, setKeepVisible() {} },
    quit() {}, prepareLook: async () => { beforeArt?.(); return artOk; }, onChanged: async () => { changes++; },
  });
  const evolveCmd: Command = { cmd: "evolve", target: "p1", from: "cli" };
  try {
    assert.ok(party.isWriter(), "잠금을 잡아 writer 로 시작");
    const before = structuredClone(party.save());
    assert.equal((await commands.dispatcher.dispatch(evolveCmd)).reason, "art-missing");
    assert.deepEqual(party.save(), before, "그림 실패 시 변경 없음");

    artOk = true;
    assert.ok((await commands.dispatcher.dispatch(evolveCmd)).ok, "그림을 받으면 진화한다");
    assert.equal(storeV3.read(paths.save, { repair: false }).state!.pets[0]!.species, "charmeleon", "진화가 디스크에 저장");
    assert.equal(changes, 1, "저장 뒤 무대 갱신");

    // mailbox 왕복 — CLI·확장의 요청이 writer 에 닿는다
    commands.setWriter(true);
    const bought = await send(paths.mailbox, { cmd: "shop.buy", target: "exp-candy-xs", from: "cli" });
    assert.ok(bought.ok, "mailbox → dispatcher → 실행기");
    assert.equal(storeV3.read(paths.save, { repair: false }).state!.bag["exp-candy-xs"], 1);

    // 실제 CLI → 임시 HOME mailbox 왕복
    const child = await promisify(execFile)(process.execPath, [path.resolve(__dirname, "../../bin/pokebuddy"), "game", "snapshot"], {
      windowsHide: true, env: { ...process.env, HOME: dir, USERPROFILE: dir },
    });
    const snapshot = JSON.parse(child.stdout);
    assert.equal(snapshot.pets.length, 1, "실제 CLI 가 저장 v3 스냅샷을 받는다");
    assert.equal(snapshot.points, party.save()!.points.balance);

    // 같은 요청 식별자는 한 번만 반영한다
    const once = await commands.dispatcher.dispatch({ cmd: "shop.buy", target: "exp-candy-xs", args: { reqId: "same" }, from: "cli" });
    const again = await commands.dispatcher.dispatch({ cmd: "shop.buy", target: "exp-candy-xs", args: { reqId: "same" }, from: "cli" });
    assert.ok(once.ok && again.ok);
    assert.equal(again.replayed, true, "두 번째는 재생");
    assert.equal(storeV3.read(paths.save, { repair: false }).state!.bag["exp-candy-xs"], 2, "한 번만 늘었다");

    // 저장에 닿지 못하면 실패로 답한다
    const beforeFailureChanges = changes;
    const diskBefore = fs.readFileSync(paths.save, "utf8");
    const stateBefore = structuredClone(party.save());
    fs.unlinkSync(paths.save); fs.mkdirSync(paths.save);
    const failed = await commands.dispatcher.dispatch({ cmd: "shop.buy", target: "party-slot", from: "menu" });
    assert.ok(!failed.ok, "저장 실패를 성공으로 응답하지 않음");
    assert.deepEqual(party.save(), stateBefore, "저장 실패 시 메모리 상태 그대로");
    assert.equal(changes, beforeFailureChanges, "실패 시 무대 갱신 없음");
    assert.ok(!(await party.setShown("p1", false)).ok, "숨기기도 성공으로 응답하지 않음");
    fs.rmdirSync(paths.save); fs.writeFileSync(paths.save, diskBefore);
    party.refresh();

    // 잠금을 잃으면 남의 저장에 쓰지 않는다. 자기 mailbox 로 되보내지도 않는다
    const beforeLost = structuredClone(party.save());
    fs.writeFileSync(paths.saveLock, String(process.pid + 1000000));
    assert.equal((await commands.dispatcher.dispatch({ cmd: "shop.buy", target: "exp-candy-xs", from: "cli" })).reason, "not-writer");
    assert.deepEqual(party.save(), beforeLost, "잠금 상실 시 변경 없음");
    fs.writeFileSync(paths.saveLock, String(process.pid));
  } finally {
    commands.stop(); party.stop(); fs.rmSync(dir, { recursive: true, force: true });
  }

  process.stdout.write("통과: v2 규칙(해금·상한·구매·진화·색·먹이) · v3 앱 경로(그림·mailbox·CLI·중복·저장 실패·잠금)\n");
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
