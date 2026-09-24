// 무대(src/main) 자체 확인 — node 만으로, Electron 없이. npm run build 뒤 node dist/tools/selftest-stage.js
//
// 순수 부분만: layout(집·자리·산책 범위·가두기·무대 교집합) · art.zoomOf · party(shownOf 상한 · 집 1회 이전 · 첫 실행 · v1 사본 · writer/reader) ·
// menus(항목 순서·라벨 키) · anchor 상태기(가짜 헬퍼로 2회 연속 확정 · 표시 디바운스) · 계약 타입 대입(StageState↔AgentState · StageFrame 표본).
// 임시 폴더에서만 돌고 끝나면 지운다 — 사용자의 ~/.claude/pokebuddy/ 는 건드리지 않는다. 끝에 "통과 (N건)"
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ANCHOR_RULES, createAnchor, type AnchorUpdate } from "../main/anchor";
import { ART_RULES, zoomOf } from "../main/art";
import { STAGE_RULES, clampInStage, homeOf, homeSpot, isDefaultHome, petSpot, roamBox, stackShift, stageOf, toLocal } from "../main/layout";
import { petLine, petMenu, trayMenu } from "../main/menus";
import { PARTY_RULES, backupV1, createSaveParty, migrateHomes, nextPetId, shownOf, starterInto } from "../main/party";
import { readSavedWindows } from "../main/paths";
import { t } from "../main/text";
import { SAVE_RULES } from "../save/rules";
import * as store from "../save/store";
import * as writer from "../save/writer";
import type { LookSheets, PointerMsg, StageFrame, StageState } from "../shared/stage";
import type { AgentState, Mode, Pet, SaveV2 } from "../shared/types";
import { devSaveState } from "./dev-save";
import { createStage } from "../main/stage";
import type { Look, ArtLoader } from "../main/art";
import type { StageWindow } from "../main/stage-window";
import type { PartyPet } from "../main/party";
import { createCommands } from "../main/commands";
import { createGame } from "../main/game-v3";
import { createV3Party } from "../main/party-v3";
import { begin } from "../party/starter";
import * as storeV3 from "../save/store-v3";
import { empty as emptyV3 } from "../save/v3";
import { send } from "../save/mailbox";

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
let passed = 0;
const ok = (cond: unknown, what: string): void => {
  assert.ok(cond, what);
  passed += 1;
};
const eq = <T>(a: T, b: T, what: string): void => {
  assert.deepStrictEqual(a, b, `${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  passed += 1;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(check: () => boolean, ms = 3000, step = 20): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await sleep(step);
  }
  return check();
}
function spawnIdle(): { pid: number; kill: () => void } {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  assert.ok(child.pid, "자식 pid");
  return { pid: child.pid, kill: () => child.kill() };
}

const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-stage-"));
const tmpDir = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const pathsIn = (dir: string) => ({
  save: path.join(dir, "save.json"),
  saveLock: path.join(dir, "save.lock"),
  mailbox: path.join(dir, "mailbox"),
  companionLock: path.join(dir, "companion.lock"),
});

// ── 계약 타입 대입 — 컴파일이 곧 검사. 런타임은 표본이 모양을 지키는지만 ─────────
const agentState: AgentState = "waving";
const stageState: StageState = agentState;
const back: AgentState = stageState;
const frame: StageFrame = { at: T0, state: back, pets: [{ id: "p1", look: "eevee", zoom: 3, x: 10, y: 20, play: { anim: "Walk", row: 2, mode: "loop", rate: 1 }, held: false }] };
const sheets: LookSheets = { look: "eevee", cell: { w: 48, h: 56 }, body: { w: 40, h: 56 }, anims: { Idle: { fw: 40, fh: 56, rows: 8, frames: [{ x: 0, ms: 200 }], dataUrl: "data:image/png;base64," } }, clips: { idle: { anim: "Idle", mode: "loop", row: 0 } } };
const pointer: PointerMsg = { type: "drag", id: "p1", x: 1, y: 2 };
ok(frame.pets[0]?.play?.mode === "loop" && sheets.clips.idle?.anim === "Idle" && pointer.type === "drag", "계약 표본 대입");

// ── layout ────────────────────────────────────────────────────────────────────
{
  const body = { w: 40, h: 56 };
  const stage = { w: 800, h: 600 };
  const anchor = { x: 0, y: 0, w: 800, h: 600 };
  const home = { dx: -24, dy: -60 };
  eq(homeSpot(home, body, anchor, stage), { x: 736, y: 484 }, "homeSpot 기본 집 = 창 오른쪽 아래 기준");
  eq(homeSpot({ dx: 500, dy: 500 }, body, anchor, stage), { x: 760, y: 544 }, "homeSpot 집이 밖 → 가둔 자리가 집");
  eq(homeSpot(home, body, anchor, { w: 30, h: 30 }), { x: 0, y: 0 }, "homeSpot 몸이 무대보다 크면 좌상단");
  eq(roamBox({ x: 0, y: 0 }, body, { w: 30, h: 30 }), { minX: 0, maxX: 0, minY: 0, maxY: 0 }, "roamBox 몸이 크면 [0,0] — 걷지 않는다");
  eq(roamBox({ x: 736, y: 484 }, body, stage), { minX: -736, maxX: 24, minY: -484, maxY: 60 }, "roamBox 집 기준 범위");
  eq(petSpot(home, { x: 100, y: 100 }, body, anchor, stage), { x: 760, y: 544 }, "petSpot 산책도 무대 안에");
  eq(clampInStage(-5, 999, body, stage), { x: 0, y: 544 }, "clampInStage");
  const spot = homeSpot(home, body, anchor, stage);
  eq(homeOf(spot, body, anchor), home, "homeOf 는 homeSpot 의 역함수 (안에 있을 때)");
  const shift = stackShift(body, 1, "session");
  eq(shift, Math.round(40 * STAGE_RULES.stackRatio), "stackShift 세션 순번 1");
  eq(stackShift(body, 0, "companion"), shift, "stackShift 동반자는 한 칸 더");
  eq(stackShift(body, 0, "window"), 0, "stackShift 창 펫 순번 0 은 0");
  const shifted = homeSpot(home, body, anchor, stage, shift);
  eq(shifted.x, spot.x - shift, "shift 만큼 왼콍");
  eq(homeOf(shifted, body, anchor, shift), home, "저장 때 shift 를 더해 상쇄");
  // 무대 ≠ 창 — 창이 왼쪽으로 100 나가 있으면 anchor 가 음수에서 시작한다
  eq(homeSpot(home, body, { x: -100, y: 0, w: 800, h: 600 }, { w: 700, h: 600 }), { x: 636, y: 484 }, "anchor 가 무대 밖에서 시작해도 창 기준");
  eq(stageOf({ x: 100, y: 100, w: 800, h: 600 }, { x: 0, y: 0, w: 500, h: 500 }), { x: 100, y: 100, w: 400, h: 400 }, "stageOf 교집합");
  eq(stageOf({ x: 1000, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 500, h: 500 }), null, "stageOf 겹치지 않으면 null");
  eq(toLocal({ x: 100, y: 100, w: 800, h: 600 }, { x: 100, y: 100, w: 400, h: 400 }), { x: 0, y: 0, w: 800, h: 600 }, "toLocal");
  ok(isDefaultHome({ ...SAVE_RULES.pet.home }) && !isDefaultHome({ dx: 0, dy: 0 }), "isDefaultHome");
}

// ── art.zoomOf ────────────────────────────────────────────────────────────────
{
  eq(zoomOf(3, { w: 40, h: 56 }), 3, "zoomOf 원하는 배율");
  eq(zoomOf(100, { w: 40, h: 56 }), Math.min(Math.floor(ART_RULES.maxBody.w / 40), Math.floor(ART_RULES.maxBody.h / 56)), "zoomOf 몸 상한으로 가둔다");
  eq(zoomOf(0, { w: 40, h: 56 }), ART_RULES.defaultZoom, "zoomOf 0 → 기본");
  eq(zoomOf(0.4, { w: 40, h: 56 }), ART_RULES.defaultZoom, "zoomOf 0 으로 반올림되면 기본 (옛 pmd-load 와 같다)");
  eq(zoomOf(1.2, { w: 40, h: 56 }), 1, "zoomOf 반올림 · 1 아래로 안 간다");
  eq(zoomOf(4, { w: 0, h: 0 }), 4, "zoomOf 몸을 모르면 원하는 값");
}

// ── party 순수 부분 ────────────────────────────────────────────────────────────
{
  const many = devSaveState(["a", "b", "c", "d", "e", "f", "g", "h"], { now: T0, rng: () => 0 });
  const raw: SaveV2 = { ...store.empty(T0), slots: 99, party: ["a", "b", "c", "d", "e", "f", "g", "h"].map((s, i) => store.emptyPet({ id: `p${i + 1}`, species: s, now: T0 })) };
  eq(shownOf(raw).length, SAVE_RULES.slots.max, "shownOf 는 규칙표 상한을 넘지 않는다 (8마리 파티)");
  eq(many.party.length, SAVE_RULES.slots.max, "dev-save 도 상한으로 자른다");
  eq(shownOf({ ...raw, slots: 2 }).length, 2, "shownOf 는 slots 만큼");
  const hidden = { ...raw, slots: 3 };
  hidden.party[0]!.shown = false;
  eq(shownOf(hidden).map((p) => p.id), ["p2", "p3", "p4"], "shownOf 는 shown 만, 파티 순서");

  const save = store.empty(T0);
  const p1 = store.emptyPet({ id: "p1", species: "eevee", now: T0 });
  const p2 = store.emptyPet({ id: "p2", species: "pikachu", now: T0 });
  const p3 = store.emptyPet({ id: "p3", species: "squirtle", now: T0 });
  p2.home = { dx: -1, dy: -2 };
  save.party.push(p1, p2, p3);
  const windows = { "companion:eevee": { dx: -516, dy: -1088 }, "w:pikachu": { dx: 5, dy: 5 }, "w:squirtle": { dx: 7, dy: 7 }, "companion:squirtle": { dx: 9, dy: 9 } };
  eq(migrateHomes(save, windows, "companion"), 2, "migrateHomes 기본값인 마리만");
  eq(p1.home, { dx: -516, dy: -1088 }, "migrateHomes eevee ← companion 키");
  eq(p2.home, { dx: -1, dy: -2 }, "migrateHomes 기본값이 아니면 안 건드림");
  eq(p3.home, { dx: 9, dy: 9 }, "migrateHomes companion 모드는 companion 키 먼저");
  const s2 = store.empty(T0);
  s2.party.push(store.emptyPet({ id: "p1", species: "squirtle", now: T0 }));
  migrateHomes(s2, windows, "window");
  eq(s2.party[0]!.home, { dx: 7, dy: 7 }, "migrateHomes window 모드는 w: 키 먼저");
  eq(migrateHomes(save, windows, "companion"), 0, "migrateHomes 두 번째는 바꿀 것 없음 (1회)");

  eq(nextPetId([]), "p1", "nextPetId 빈 파티");
  eq(nextPetId([p1, p3]), "p2", "nextPetId 빈 번호");
  const fresh = store.empty(T0);
  const starter = starterInto(fresh, "eevee", T0, () => 0);
  eq([starter.id, starter.species, starter.nature], ["p1", "eevee", "hardy"], "starterInto rng 0 → 첫 성격");
  ok(fresh.unlocked.includes("eevee"), "starterInto 는 종을 해금 목록에");

  const cfg = path.join(tmpDir("cfg"), "config.json");
  fs.writeFileSync(cfg, JSON.stringify({ slug: "pikachu", windows: { "eevee#0": { dx: -1, dy: -2 }, bad: { dx: "x" }, "w:eevee": { dx: 3, dy: 4 } } }));
  eq(readSavedWindows(cfg), { "eevee#0": { dx: -1, dy: -2 }, "w:eevee": { dx: 3, dy: 4 } }, "readSavedWindows 숫자 쌍만");
  eq(readSavedWindows(path.join(tmpRoot, "none.json")), {}, "readSavedWindows 파일 없음 → 빈 표");
}

// ── menus ──────────────────────────────────────────────────────────────────────
{
  let hid = 0;
  let quit = 0;
  let ghost = 0;
  let opened = 0;
  const act = { toggleHidden: () => void (hid += 1), quit: () => void (quit += 1), toggleGhost: () => void (ghost += 1), openConfig: () => void (opened += 1) };
  const menu = petMenu({ name: "이브이", nature: "용감", hidden: false }, act);
  eq(menu.map((m) => m.label ?? m.type), [t("menu.pet", { name: "이브이", nature: "용감" }), "separator", t("menu.hide"), "separator", t("menu.quit")], "petMenu 순서·라벨");
  ok(menu[0]?.enabled === false, "petMenu 첫 줄은 비활성");
  eq(petMenu({ name: "이브이", nature: "용감", hidden: true }, act)[2]?.label, t("menu.show"), "petMenu 숨긴 상태면 다시 보이기");
  eq(petLine({ name: "이브이", nature: null }), "이브이", "petLine 성격 없으면 이름만");
  (menu[2]!.click as () => void)();
  (menu[4]!.click as () => void)();
  eq([hid, quit], [1, 1], "petMenu 클릭이 동작을 부른다");
  const tray = trayMenu({ name: "이브이", hidden: false, ghost: true }, act);
  eq(tray.map((m) => m.label ?? m.type), ["이브이", "separator", t("menu.hide"), t("menu.ghost"), t("menu.openConfig"), "separator", t("menu.quit")], "trayMenu 순서·라벨");
  ok(tray[3]?.type === "checkbox" && tray[3]?.checked === true, "trayMenu 고스트 체크");
  (tray[3]!.click as () => void)();
  (tray[4]!.click as () => void)();
  eq([ghost, opened], [1, 1], "trayMenu 클릭이 동작을 부른다");
}

// ── party — 파일 · writer/reader · v1 사본 · 첫 실행 ───────────────────────────
async function partyTests(): Promise<void> {
  const noWindows = () => ({});
  // writer — v2 파일을 읽고 setHome 이 파일에 내려간다
  {
    const p = pathsIn(tmpDir("writer"));
    store.write(p.save, devSaveState(["eevee", "pikachu"], { now: T0, rng: () => 0 }));
    const party = createSaveParty({ paths: p, mode: "companion", savedWindows: noWindows, now: () => T0 });
    ok(party.isWriter(), "writer 가 됐다");
    eq(party.pets().map((x) => x.id), ["p1", "p2"], "writer 가 파티를 읽었다");
    eq(party.pets()[0]?.nature, "hardy", "성격이 실렸다");
    ok(!party.needsStarter(), "파티가 있으면 첫 실행 아님");
    party.setHome("p1", { dx: -10, dy: -20 });
    const disk = store.read(p.save, { repair: false }).state!;
    eq(disk.party[0]!.home, { dx: -10, dy: -20 }, "setHome 이 파일에 내려갔다");
    eq(disk.party[1]!.home, devSaveState(["eevee", "pikachu"], { now: T0 }).party[1]!.home, "다른 마리의 집은 그대로");
    const shown = await party.setShown("p2", false);
    ok(shown.ok && !store.read(p.save, { repair: false }).state!.party[1]!.shown, "setShown 이 파일에 내려갔다");
    eq(party.pets().length, 1, "숨긴 마리는 pets 에서 빠진다");
    party.stop();
    eq(writer.readOwner(p.saveLock), null, "stop 이 잠금을 놓는다");
  }
  // v1 — 처음 다시 쓸 때 save.v1.json 사본, 한 번만. 집 1회 이전
  {
    const p = pathsIn(tmpDir("v1"));
    const v1 = { v: 1, active: "eevee#1", points: 3, party: { "eevee#1": { species: "eevee", since: T0, affinity: 5 } }, daily: { date: "2026-09-17", streak: 2 } };
    fs.writeFileSync(p.save, JSON.stringify(v1));
    const party = createSaveParty({ paths: p, mode: "companion", savedWindows: () => ({ "companion:eevee": { dx: -516, dy: -1088 } }), now: () => T0 });
    const bak = p.save.replace(/\.json$/, "") + PARTY_RULES.v1Backup;
    ok(fs.existsSync(bak), "v1 사본 save.v1.json 이 생겼다");
    eq(JSON.parse(fs.readFileSync(bak, "utf8")).v, 1, "사본은 v1 그대로");
    eq(JSON.parse(fs.readFileSync(p.save, "utf8")).v, 2, "원본은 v2 로 다시 썼다");
    eq(party.pets()[0]?.home, { dx: -516, dy: -1088 }, "config.json 의 1판 집이 Pet.home 으로 이전됐다");
    party.stop();
    fs.writeFileSync(bak, "marker");
    fs.writeFileSync(p.save, JSON.stringify(v1));
    createSaveParty({ paths: p, mode: "companion", savedWindows: noWindows, now: () => T0 }).stop();
    eq(fs.readFileSync(bak, "utf8"), "marker", "사본은 덮지 않는다 (한 번만)");
    ok(!backupV1(p.save), "v2 파일은 v1 이 아니다");
  }
  // reader — 살아 있는 남이 잠금을 쥐면 파일만 읽고, setHome 은 메모리에만
  {
    const p = pathsIn(tmpDir("reader"));
    const idle = spawnIdle();
    try {
      fs.writeFileSync(p.saveLock, `${idle.pid}\n`);
      store.write(p.save, devSaveState(["eevee", "pikachu"], { now: T0, rng: () => 0 }));
      const party = createSaveParty({ paths: p, mode: "window", savedWindows: noWindows, now: () => T0 });
      ok(!party.isWriter(), "잠금이 남의 것이면 reader");
      eq(party.pets().length, 2, "reader 도 파일을 읽는다");
      ok(!party.needsStarter(), "reader 는 첫 실행을 맡지 않는다");
      party.setHome("p1", { dx: -99, dy: -99 });
      eq(party.pets()[0]?.home, { dx: -99, dy: -99 }, "reader setHome 은 메모리에");
      eq(store.read(p.save, { repair: false }).state!.party[0]!.home.dx, SAVE_RULES.pet.home.dx, "reader 는 파일을 쓰지 않는다");
      // writer(다른 프로세스 흉내)가 파일을 바꾸면 감시가 읽는다
      let changes = 0;
      party.onChange(() => void (changes += 1));
      await sleep(50);
      store.write(p.save, devSaveState(["eevee", "pikachu", "squirtle"], { now: T0 + 1000, rng: () => 0 }));
      ok(await waitFor(() => party.pets().length === 3), "reader 가 파일 변화를 감시로 읽었다");
      ok(changes >= 1, "onChange 가 불렸다");
      party.stop();
      eq(writer.readOwner(p.saveLock), idle.pid, "reader 는 남의 잠금을 건드리지 않는다");
    } finally {
      idle.kill();
    }
  }
  // 첫 실행 — 파일 없음 → writer → begin(스타터)
  {
    const p = pathsIn(tmpDir("first"));
    const party = createSaveParty({ paths: p, mode: "companion", savedWindows: noWindows, now: () => T0, rng: () => 0.5 });
    ok(party.isWriter() && party.needsStarter(), "파일이 없으면 writer 이고 첫 실행");
    eq(party.pets(), [], "첫 실행 전에는 빈 파티");
    ok(party.begin("eevee"), "begin 이 스타터로 시작한다");
    ok(!party.needsStarter(), "begin 뒤에는 첫 실행 아님");
    const disk = store.read(p.save, { repair: false }).state!;
    eq([disk.party.length, disk.party[0]!.species, disk.slots], [1, "eevee", SAVE_RULES.slots.min], "첫 실행 저장 모양");
    ok(disk.unlocked.includes("eevee"), "스타터는 해금 목록에");
    ok(!party.begin("pikachu"), "두 번째 begin 은 거절");
    party.stop();
  }
}

async function stageRuntimeTests(): Promise<void> {
  let now = T0;
  const sent: string[] = [];
  const looks = new Map<string, Look>();
  const art: ArtLoader = {
    async loadLook(look) {
      if (!looks.has(look)) {
        const sheet = sheets.anims.Idle!;
        const bundle = { ...sheets, look, anims: { Idle: sheet, Walk: sheet, Eat: sheet, Hop: sheet } };
        looks.set(look, { look, sheets: bundle, art: { ...bundle, kind: "pmd", zoom: 2, work: {}, workOnly: [], credits: [], dex: "1", from: "test" } });
      }
      return looks.get(look)!;
    },
    cached: (look) => looks.get(look) ?? null,
  };
  const win = { sendSheets: (s: LookSheets) => sent.push(s.look), sendInit() {}, sendFrame() {}, sendClickThrough() {}, hoverTick() {}, setPassing() {} } as unknown as StageWindow;
  const stage = createStage({ mode: "companion", index: 0, buddyMode: "on", timeScale: 1, window: win, art, ghost: () => false, cursor: () => ({ x: 100, y: 100 }), onDrop() {}, onClick() {}, onMenu() {}, onArtMissing() { throw new Error("그림 누락"); }, now: () => now });
  const pet: PartyPet = { id: "p1", species: "eevee", look: "eevee", size: 2, nature: "hardy", home: { dx: -24, dy: -60 }, shown: true, nick: null };
  stage.setStage({ x: 0, y: 0, w: 800, h: 600 }, { w: 800, h: 600 }, false);
  stage.setVisible(true);
  await stage.setParty([pet]);
  stage.tick();
  eq(stage.lastFrame()?.pets[0]?.look, "eevee", "무대가 첫 그림을 사용");
  stage.pointer({ type: "grab", id: "p1", x: 0, y: 0 });
  await stage.setParty([{ ...pet, species: "umbreon", look: "umbreon" }]);
  stage.tick();
  eq(stage.lastFrame()?.pets[0]?.look, "umbreon", "같은 id 의 그림 교체 반영");
  eq(stage.heldId(), null, "그림 교체 중 들고 있던 상태 해제");
  eq(sent, ["eevee", "umbreon"], "교체된 시트를 전송");
  const oldX = stage.lastFrame()!.pets[0]!.x;
  stage.care("p1", "feed");
  for (let n = 0; n < 20; n++) { now += 40; stage.tick(); }
  ok(stage.lastFrame()!.pets[0]!.x < oldX, "먹이 쪽으로 걸어감");
  ok(stage.lastFrame()!.pets[0]!.berry, "먹이 좌표가 프레임에 있음");
  for (let n = 0; n < 90; n++) { now += 40; stage.tick(); }
  ok(!stage.lastFrame()!.pets[0]!.berry, "먹은 뒤 열매 제거");
  stage.care("p1", "play");
  const before = stage.lastFrame()!.pets[0]!.x;
  for (let n = 0; n < 25; n++) { now += 40; stage.tick(); }
  ok(stage.lastFrame()!.pets[0]!.x < before, "놀기는 커서를 따라감");
  stage.setVisible(false);
  stage.setVisible(true);
  now += 40; stage.tick();
  ok(stage.lastFrame()!.pets[0]!.x >= 0, "숨김 후에도 무대 안에 있음");
  await stage.setParty([]);
  stage.tick();
  eq(stage.petIds(), [], "빈 파티에서 무대 제거");

  const overlap = createStage({ mode: "companion", index: 0, buddyMode: "off", timeScale: 1, window: win, art, ghost: () => false,
    onDrop() {}, onClick() {}, onMenu() {}, onArtMissing() { throw new Error("그림 누락"); }, now: () => now });
  overlap.setStage({ x: 0, y: 0, w: 800, h: 600 }, { w: 800, h: 600 }, false);
  overlap.setVisible(true);
  const six = Array.from({ length: 6 }, (_, n) => ({ ...pet, id: `p${n + 1}` }));
  await overlap.setParty(six);
  overlap.tick();
  const positions = () => overlap.lastFrame()!.pets.map((p) => [p.x, p.y]);
  const same = positions();
  ok(same.every((p) => p[0] === same[0]![0] && p[1] === same[0]![1]), "시작 시 여섯 마리가 겹쳐도 밀리지 않음");
  for (let i = 0; i < 100; i++) { now += 40; overlap.tick(); }
  eq(positions(), same, "반복 틱에서 겹친 마리 위치 유지");
  overlap.pointer({ type: "grab", id: "p1", x: 0, y: 0 });
  overlap.pointer({ type: "drag", id: "p1", x: same[0]![0]!, y: same[0]![1]! });
  overlap.tick();
  eq(overlap.lastFrame()!.pets.map((p) => p.id), six.map((p) => p.id), "드래그가 그리는 순서를 바꾸지 않음");
  overlap.pointer({ type: "drop", id: "p1", x: 0, y: 0 });
  overlap.tick();
  eq(positions(), same, "겹친 위치에 놓아도 밀리지 않음");
  await overlap.setParty([...six].reverse());
  overlap.tick();
  eq(overlap.petIds(), six.map((p) => p.id), "목록 재정렬은 소환 순서를 바꾸지 않음");
  await overlap.setParty(six.map((p) => p.id === "p1" ? { ...p, look: "umbreon", species: "umbreon" } : p));
  overlap.tick();
  eq(overlap.petIds(), six.map((p) => p.id), "진화 그림 교체 후 소환 순서 유지");
  overlap.celebrate("p1"); overlap.tick();
  ok(overlap.lastFrame()!.pets[0]!.evolution, "진화 연출 시작");
  now += 1300; overlap.tick();
  ok(!overlap.lastFrame()!.pets[0]!.evolution, "진화 연출 종료");
  await overlap.setParty(six.slice(1));
  await overlap.setParty(six);
  overlap.tick();
  eq(overlap.petIds(), ["p2", "p3", "p4", "p5", "p6", "p1"], "숨긴 마리를 다시 소환하면 맨 앞에 표시");
  overlap.setStage({ x: 0, y: 0, w: 60, h: 60 }, { w: 60, h: 60 }, false);
  overlap.tick();
  ok(positions().every(([x, y]) => x! >= 0 && y! >= 0 && x! <= 60 && y! <= 60), "겹침 허용 후에도 화면 경계 유지");

  const paths = pathsIn(tmpDir("lost-writer"));
  store.write(paths.save, devSaveState(["eevee"], { now: T0 }));
  const party = createSaveParty({ paths, mode: "companion", savedWindows: () => ({}) });
  const other = spawnIdle();
  try {
    fs.writeFileSync(paths.saveLock, String(other.pid));
    ok(!party.isWriter(), "잠금 상실을 즉시 인식");
    const original = fs.readFileSync(paths.save, "utf8");
    party.save()!.points = 999;
    ok(!party.persist(), "잠금을 잃은 프로세스의 쓰기 거절");
    eq(fs.readFileSync(paths.save, "utf8"), original, "다른 writer 의 저장을 덮지 않음");
  } finally { party.stop(); other.kill(); }

  // v2 저장을 처음 열면 v3 으로 옮긴다. 원본은 옆에 남고 무대는 그대로 돈다
  {
    const migPaths = pathsIn(tmpDir("migrate-v3"));
    const legacy = devSaveState(["eevee", "pikachu"], { now: T0 });
    legacy.party[0]!.nick = "뽀야";
    legacy.party[0]!.look = "eevee-starter";
    legacy.points = 1234;
    store.write(migPaths.save, legacy);
    const migGame = createGame({ file: migPaths.save });
    const migParty = createV3Party({ game: migGame, paths: migPaths, mode: "companion" });
    try {
      const moved = storeV3.read(migPaths.save, { repair: false }).state!;
      eq(moved.pets.length, 2, "두 마리가 그대로 옮겨진다");
      eq(moved.points.balance, 1234, "포인트가 그대로");
      ok(fs.existsSync(storeV3.backupName(migPaths.save)), "원본을 옆에 남긴다");
      ok(!migParty.needsStarter(), "이미 개체가 있으면 첫 선택을 묻지 않는다");
      eq(migParty.pets().map((p) => p.id), ["p1", "p2"], "무대에 두 마리");
      // 별명·모습은 쓰지 않는다. 실제 종의 이름과 그림이다 (docs/specs/s5.md). 옛 값은 legacy 에 남는다
      eq(migParty.pets()[0]!.nick, null, "별명을 보이지 않는다");
      eq(migParty.pets()[0]!.look, "eevee", "고른 모습이 아니라 종의 그림");
      eq(moved.legacy["nick:p1"], "뽀야", "별명은 legacy 에 보존");
      eq(moved.legacy["look:p1"], "eevee-starter", "모습도 legacy 에 보존");
    } finally { migParty.stop(); }
  }

  // 명령 왕복 (저장 v3) — mailbox → dispatcher → 거래 실행기 → 파일
  const commandPaths = pathsIn(tmpDir("care-commands"));
  const seed = emptyV3(T0);
  begin(seed, "eevee", T0, () => 0);
  seed.pets[0]!.fullness = 40;
  storeV3.write(commandPaths.save, seed);
  const game = createGame({ file: commandPaths.save, rand: () => 0 });
  const source = createV3Party({ game, paths: commandPaths, mode: "companion" });
  let animations = 0;
  const commands = createCommands({ mode: "companion", mailboxDir: commandPaths.mailbox, party: source, game,
    stage: { poke: () => true, care: () => void animations++, petIds: () => ["p1"], size: () => ({ w: 800, h: 600 }), visible: () => true },
    settings: { hidden: () => false, setHidden() {}, clickThrough: () => false, setClickThrough() {}, keepVisible: () => true, setKeepVisible() {} }, quit() {},
  });
  try {
    ok(source.isWriter(), "잠금을 잡아 writer 로 시작");
    commands.setWriter(true);
    const fed = await send(commandPaths.mailbox, { cmd: "feed", target: "p1", from: "cli" });
    ok(fed.ok, "mailbox → dispatcher → 실행기 → 저장 왕복");
    eq(storeV3.read(commandPaths.save, { repair: false }).state!.pets[0]!.fullness, 60, "밥 효과가 디스크에 저장");
    eq(animations, 1, "저장 성공 뒤 연출 요청");
    const again = await commands.dispatcher.dispatch({ cmd: "feed", target: "p1", from: "menu" });
    eq(again.reason, "cooldown", "중복 밥 거절");
    eq(animations, 1, "거절된 명령은 연출하지 않음");

    // 포켓몬 클릭은 놀아주기다. 쿨타임이면 무대 반응만으로 끝난다
    const clicked = await commands.click("p1");
    ok(clicked.ok, "클릭이 놀아주기로 저장된다");
    eq(storeV3.read(commandPaths.save, { repair: false }).state!.pets[0]!.playStreak, 1, "놀아주기 중첩 1");
    eq(animations, 2, "놀아주기 연출");
    eq((await commands.click("p1")).reason, "cooldown", "쿨타임의 클릭은 놀아주지 않는다");
    eq(animations, 2, "쿨타임이면 놀이 연출이 없다");

    // 모습 선택은 제거된 기능이다
    eq((await commands.dispatcher.dispatch({ cmd: "pet.look", target: "p1", args: { look: "eevee" }, from: "cli" })).reason, "removed", "pet.look 은 제거됐다고 답한다");

    const old = structuredClone(source.save());
    // 저장 경로를 디렉터리로 바꿔 파일에 닿지 못하는 상황 재현 — 임시 폴더 안에서만
    fs.unlinkSync(commandPaths.save);
    fs.mkdirSync(commandPaths.save);
    // 놀아주기는 위의 클릭으로 쿨타임이다. 규칙에 걸리지 않는 명령으로 저장 실패만 본다
    const failed = await commands.dispatcher.dispatch({ cmd: "settings.set", target: "sound", args: { value: false }, from: "menu" });
    ok(!failed.ok, "저장에 닿지 못하면 성공으로 응답하지 않음");
    eq(animations, 2, "저장 실패 시 연출하지 않음");
    const moved = await commands.dispatcher.dispatch({ cmd: "pet.set", target: "p1", args: { home: { dx: -123, dy: -45 } }, from: "cli" });
    ok(!moved.ok, "위치 저장 실패를 성공으로 응답하지 않음");
    eq(source.save(), old, "저장 실패는 메모리 상태를 바꾸지 않는다");
  } finally { commands.stop(); source.stop(); }
}

// ── anchor — 가짜 헬퍼로 상태기 (Windows 는 셸 스크립트를 execFile 로 못 돌려 건너뛴다) ──
async function anchorTests(): Promise<void> {
  if (process.platform === "win32") {
    out("anchor: win32 — 가짜 헬퍼 스크립트를 건너뛴다");
    return;
  }
  const dir = tmpDir("anchor");
  const helper = path.join(dir, "fake-winbounds");
  const win = { app: "Fake", pid: 424242, id: 77, x: 10, y: 20, w: 800, h: 600 };
  fs.writeFileSync(helper, `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({ frontmost: "Fake", frontPid: 424242, windows: [win] })}'\n`, { mode: 0o755 });
  const env = { ...process.env, POKEBUDDY_WINBOUNDS: helper };
  const runtime = (mode: Mode) => ({
    mode, termPid: null, hostPid: null, session: null, ancestors: [424242], matchCwd: null, index: 0, anchorApp: null,
    windowsDir: path.join(dir, "windows"), debug: false, buddyTimeScale: 1,
  });
  const fakeArea = { id: -1, pid: 0, app: "", x: 0, y: 0, w: 1440, h: 900, fake: true as const };
  const make = (mode: Mode, flags: { userHidden: boolean; keepVisible: boolean; held: boolean }, updates: AnchorUpdate[]) => {
    let quits = 0;
    const anchor = createAnchor({
      mode, runtime: runtime(mode), paths: { state: path.join(dir, "state"), project: dir }, self: { pid: process.pid, appNames: new Set(["electron"]) }, env,
      host: { platform: "darwin", now: Date.now, toDip: (w) => w, offScreen: () => false, workArea: () => fakeArea, quit: () => void (quits += 1), quitting: () => false },
      flags: () => flags, onUpdate: (u) => updates.push(u), onFocus: () => {}, log: null,
    });
    return { anchor, quits: () => quits };
  };
  const pollOnce = async (anchor: { poll(): void }, updates: AnchorUpdate[]): Promise<AnchorUpdate> => {
    const n = updates.length;
    anchor.poll();
    ok(await waitFor(() => updates.length > n), "헬퍼 답이 왔다");
    return updates[updates.length - 1]!;
  };
  // 세션 펫 — 조상(424242)이 창 주인 → 첫 폴링은 후보, 둘째에 확정. 표시도 2회 연속 뒤
  {
    const updates: AnchorUpdate[] = [];
    const flags = { userHidden: false, keepVisible: false, held: false };
    const { anchor } = make("session", flags, updates);
    const u1 = await pollOnce(anchor, updates);
    eq([u1.target?.id, u1.visible, u1.placeId, u1.frontIsMine], [77, false, 77, true], "1회: 창은 찾았지만 표시는 아직 (VISIBLE_CONFIRM)");
    const u2 = await pollOnce(anchor, updates);
    eq([u2.target?.id, u2.visible, u2.placeId], [77, true, 77], `2회: 앵커 확정(CAPTURE_CONFIRM=${ANCHOR_RULES.captureConfirm}) · 표시`);
    eq(anchor.currentInfo(), { state: "idle", promptAt: null }, "훅 기록이 없으면 대기");
    flags.userHidden = true;
    await pollOnce(anchor, updates);
    const u3 = await pollOnce(anchor, updates);
    eq(u3.visible, false, "직접 숨김은 2회 뒤 숨는다");
    flags.held = true;
    flags.userHidden = false;
    await pollOnce(anchor, updates);
    const u4 = await pollOnce(anchor, updates);
    eq(u4.visible, false, "들고 있는 동안은 판정 보류 — 직전 상태 유지");
    anchor.stop();
  }
  // 동반자 — 맨 앞 창이 터미널 호스트가 아니면(모르는 앱) 작업 영역(가짜 창)에 남고 늘 보인다
  {
    const updates: AnchorUpdate[] = [];
    const { anchor } = make("companion", { userHidden: false, keepVisible: false, held: false }, updates);
    await pollOnce(anchor, updates);
    const u = await pollOnce(anchor, updates);
    eq([u.target?.fake, u.visible, u.placeId, u.frontIsMine], [true, true, null, true], "동반자: 호스트 없음 → 가짜 창 · 늘 보임 · 늘 위");
    anchor.stop();
  }
  // 동반자 — 훅 기록이 그 창 주인을 조상으로 가지면 호스트 (b) → 그 창을 따른다
  {
    const stateDir = tmpDir("anchor/state");
    fs.writeFileSync(path.join(stateDir, "s.json"), JSON.stringify({ at: Date.now() / 1000, state: "running", ancestors: [424242], promptAt: 1 }));
    const updates: AnchorUpdate[] = [];
    const { anchor } = make("companion", { userHidden: false, keepVisible: false, held: false }, updates);
    await pollOnce(anchor, updates);
    const u = await pollOnce(anchor, updates);
    eq([u.target?.id, u.visible], [77, true], "동반자: 훅 기록으로 호스트를 알아 그 창을 따른다");
    eq(anchor.currentInfo().state, "running", "그 창의 세션 상태를 따른다");
    anchor.stop();
    fs.rmSync(path.join(stateDir, "s.json"));
  }
}

(async () => {
  try {
    await partyTests();
    await stageRuntimeTests();
    await anchorTests();
    out(`통과 (${passed}건)`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
})();
