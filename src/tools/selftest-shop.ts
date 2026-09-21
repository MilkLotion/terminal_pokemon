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
import { createSaveParty } from "../main/party";
import { createCommands } from "../main/commands";
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-s4-"));
  const gameDir = path.join(dir, ".claude", "pokebuddy");
  const paths = { save: path.join(gameDir, "save.json"), saveLock: path.join(gameDir, "save.lock"), companionLock: path.join(gameDir, "companion.lock"), mailbox: path.join(gameDir, "mailbox") };
  const initial = fresh(); initial.points = 5000; initial.slots = 2; advance(initial, T); write(paths.save, initial);
  const party = createSaveParty({ paths, mode: "companion", savedWindows: () => ({}) });
  let artOk = false;
  let beforeArt: (() => void) | undefined;
  let changes = 0;
  const commands = createCommands({ mode: "companion", mailboxDir: paths.mailbox, party,
    stage: { poke: () => true, petIds: () => [], size: () => ({ w: 1, h: 1 }), visible: () => true },
    settings: { hidden: () => false, setHidden() {}, clickThrough: () => false, setClickThrough() {}, keepVisible: () => true, setKeepVisible() {} },
    quit() {}, prepareLook: async () => { beforeArt?.(); return artOk; }, onChanged: async () => { changes++; },
  });
  const purchase: Command = { cmd: "shop.buy", args: { item: "species", species: "pikachu" }, from: "cli" };
  try {
    const before = structuredClone(party.save());
    assert.equal((await commands.dispatcher.dispatch(purchase)).reason, "art-missing");
    assert.deepEqual(party.save(), before, "그림 실패 시 변경 없음");
    artOk = true;
    beforeArt = () => { party.save()!.slots = 1; };
    assert.equal((await commands.dispatcher.dispatch(purchase)).reason, "party-full", "그림 대기 후 최신 조건 검사");
    beforeArt = undefined; party.save()!.slots = 2;
    commands.setWriter(true);
    assert.ok((await send(paths.mailbox, purchase)).ok);
    assert.equal(read(paths.save, { repair: false }).state!.party.length, 2);
    assert.equal(changes, 1);
    const child = await promisify(execFile)(process.execPath, [path.resolve(__dirname, "../../bin/pokebuddy"), "game", "snapshot"], {
      windowsHide: true, env: { ...process.env, HOME: dir, USERPROFILE: dir },
    });
    const snapshot = JSON.parse(child.stdout);
    assert.equal(snapshot.party.length, 2, "실제 CLI → 임시 HOME mailbox 왕복");
    assert.equal(snapshot.party[0].affinity, 0);
    const foodBefore = party.save()!.inventory.berry ?? 0;
    const purchaseChild = await promisify(execFile)(process.execPath, [path.resolve(__dirname, "../../bin/pokebuddy"), "game", "shop.buy", "-", "item=berry"], {
      windowsHide: true, env: { ...process.env, HOME: dir, USERPROFILE: dir },
    });
    assert.equal(JSON.parse(purchaseChild.stdout).ok, true, "실제 CLI의 key=value 구매");
    assert.equal(party.save()!.inventory.berry, foodBefore + 1);
    const beforeExpired = structuredClone(party.save());
    assert.equal((await commands.dispatcher.dispatch({ cmd: "shop.buy", args: { item: "berry" }, from: "cli", at: Date.now() - 41_000 })).reason, "expired");
    assert.deepEqual(party.save(), beforeExpired, "오래된 요청은 포인트를 차감하지 않음");
    const beforeFailureChanges = changes;
    const diskBefore = fs.readFileSync(paths.save, "utf8");
    const stateBefore = structuredClone(party.save());
    fs.unlinkSync(paths.save); fs.mkdirSync(paths.save);
    const failed = await commands.dispatcher.dispatch({ cmd: "shop.buy", args: { item: "slot" }, from: "menu" });
    assert.equal(failed.reason, "save-failed");
    assert.deepEqual(party.save(), stateBefore, "저장 실패 시 포인트와 파티 복원");
    assert.equal(changes, beforeFailureChanges, "실패 시 무대 갱신 없음");
    assert.equal((await party.setShown("p1", false)).reason, "save-failed");
    assert.equal(party.save()!.party[0]!.shown, true, "숨기기 저장 실패 시 표시 상태 복원");
    fs.rmdirSync(paths.save); fs.writeFileSync(paths.save, diskBefore);
    const pet = party.save()!.party[0]!;
    const menu = gameMenu(party.save()!, () => {});
    assert.equal(menu.length, 3);
    assert.ok(petGameMenu(party.save()!, pet, () => {}).length >= 4);
    assert.ok((await commands.dispatcher.dispatch({ cmd: "snapshot", from: "cli" })).shop);
    party.save()!.slots = 3;
    beforeArt = () => { fs.writeFileSync(paths.saveLock, String(process.pid + 1000000)); };
    const beforeLost = structuredClone(party.save());
    assert.equal((await commands.dispatcher.dispatch(purchase)).reason, "not-writer");
    assert.deepEqual(party.save(), beforeLost, "그림 대기 중 잠금 상실 시 변경 없음");
    assert.equal((await commands.dispatcher.dispatch({ cmd: "shop.buy", args: { item: "berry" }, from: "cli" })).reason, "not-writer", "잠금을 잃은 서버는 자기 mailbox로 재전송하지 않음");
    fs.writeFileSync(paths.saveLock, String(process.pid));
  } finally {
    commands.stop(); party.stop(); fs.rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write("S4 통과: 해금·상한·구매·진화·색·먹이·저장·그림 실패·mailbox\n");
}
void main().catch((e) => { console.error(e); process.exitCode = 1; });
