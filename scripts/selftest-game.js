#!/usr/bin/env node

// 게임 코어 자체 확인 — node scripts/selftest-game.js
//
// 테스트 프레임워크 없이 assert 만. 임시 폴더에서만 돌고 끝나면 지운다 — 사용자의 ~/.claude/pokebuddy/save.json 은 건드리지 않는다.
// 시각은 주입한다 — 하루 넘김·쿨다운·상한·스트릭·기분을 몇 ms 안에 확인한다. mailbox·lock 만 실제 프로세스·파일로 확인
// 끝에 "통과" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const economy = require("../game/economy");
const save = require("../game/save");
const writer = require("../game/writer");
const mailbox = require("../game/mailbox");
const { createGame } = require("../game/index");

const { RULES } = economy;
const MIN = 60_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 8, 17, 10, 0, 0).getTime(); // 2026-09-17 10:00 로컬

const out = (line) => process.stdout.write(`${line}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, ms = 3000, step = 20) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (check()) return true;
    await sleep(step);
  }
  return check();
}

// 살아 있는 다른 프로세스 — lock 이 "살아 있는 pid" 를 가리는지 볼 때 쓴다
function spawnIdle() {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  const exited = new Promise((r) => child.on("exit", r));
  return { pid: child.pid, kill: () => child.kill(), exited };
}

// 이미 끝난 pid — 잠깐 떠서 바로 끝나는 프로세스의 pid
async function deadPid() {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore", windowsHide: true });
  await new Promise((r) => child.on("exit", r));
  return child.pid;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-"));
const tmpDir = (name) => {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const pathsIn = (dir) => ({ save: path.join(dir, "save.json"), saveLock: path.join(dir, "save.lock"), mailbox: path.join(dir, "mailbox") });

const affinityOf = (s) => economy.activePet(s).affinity;
const moodOf = (s) => economy.activePet(s).mood;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── economy ────────────────────────────────────────────────────────────────

test("economy: 시작·교감·쿨다운·횟수", () => {
  const bad = economy.start(null, T0, "mewtwo");
  assert.strictEqual(bad.result.reason, "not-starter");
  let { state: s, result } = economy.start(null, T0, "eevee");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(s.active, "eevee#1");
  assert.strictEqual(s.party["eevee#1"].species, "eevee");
  assert.strictEqual(s.party["eevee#1"].mood, RULES.mood.start);
  assert.strictEqual(economy.start(s, T0, "pikachu").result.reason, "exists");
  const original = structuredClone(s);

  // 밥 — 첫 교감 보너스 5 × streak 1
  ({ state: s, result } = economy.interact(s, T0, "feed"));
  assert.deepStrictEqual(original, economy.start(null, T0, "eevee").state, "들어온 state 를 건드리지 않는다");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.gained, RULES.sources.feed.gain);
  assert.strictEqual(result.bonus, RULES.streak.perDay);
  assert.strictEqual(s.points, RULES.streak.perDay);
  assert.strictEqual(moodOf(s), RULES.mood.start + RULES.mood.feed);
  assert.strictEqual(result.nextAt, T0 + RULES.sources.feed.cooldown);

  // 쿨다운 안 — 실패, 다음 시각
  ({ state: s, result } = economy.interact(s, T0 + HOUR, "feed"));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "cooldown");
  assert.strictEqual(result.nextAt, T0 + RULES.sources.feed.cooldown);
  assert.strictEqual(s.daily.feeds, 1);

  // 놀기 — 두 번째 교감이라 보너스 없음
  ({ state: s, result } = economy.interact(s, T0 + MIN, "play"));
  assert.strictEqual(result.gained, RULES.sources.play.gain);
  assert.strictEqual(result.bonus, 0);
  assert.strictEqual(economy.interact(s, T0 + 2 * MIN, "play").result.reason, "cooldown");
  ({ state: s, result } = economy.interact(s, T0 + MIN + RULES.sources.play.cooldown, "play"));
  assert.strictEqual(result.ok, true);

  // 찌르기 — 하루 10회
  let t = T0 + 5 * MIN;
  for (let i = 0; i < RULES.sources.poke.dailyCount; i++) {
    ({ state: s, result } = economy.interact(s, (t += 1000), "poke"));
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.left, RULES.sources.poke.dailyCount - i - 1);
  }
  ({ state: s, result } = economy.interact(s, (t += 1000), "poke"));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "daily-count");
  assert.strictEqual(s.daily.pokes, RULES.sources.poke.dailyCount);
  assert.strictEqual(affinityOf(s), 15 + 10 + 10 + 10);
  assert.strictEqual(economy.interact(s, t, "dance").result.reason, "unknown-cmd");
  assert.strictEqual(s.log.at(-1).kind, "poke");
});

test("economy: 하루 총량 150 — 넘으면 기분만", () => {
  let { state: s } = economy.start(null, T0, "charmander");
  let r;
  let t = T0;
  // 켜 두기 — 10분씩 40번 → 30 에서 멈춘다
  for (let i = 0; i < 40; i++) {
    r = economy.accrue(s, (t += 10 * MIN), "presence", 10 * MIN);
    s = r.state;
  }
  assert.strictEqual(s.daily.presence, RULES.sources.presence.dailyPoints);
  // 함께 일하기 — 1분씩 70번 → 60
  for (let i = 0; i < 70; i++) s = economy.accrue(s, (t += MIN), "work", MIN).state;
  assert.strictEqual(s.daily.work, RULES.sources.work.dailyPoints);
  // 턴 — 25번 → 20회 × 2
  for (let i = 0; i < 25; i++) s = economy.turn(s, (t += 1000)).state;
  assert.strictEqual(s.daily.turns, RULES.sources.turn.dailyCount);
  assert.strictEqual(s.daily.gained, 30 + 60 + 40);
  // 밥 15 → 145, 놀기 10 중 5 만 (capped), 찌르기는 0 — 기분만
  s = economy.interact(s, (t += 1000), "feed").state;
  assert.strictEqual(s.daily.gained, 145);
  r = economy.interact(s, (t += 1000), "play");
  s = r.state;
  assert.strictEqual(r.result.ok, true);
  assert.strictEqual(r.result.gained, 5);
  assert.strictEqual(r.result.capped, true);
  assert.strictEqual(r.result.reason, "ok");
  const moodBefore = moodOf(s);
  r = economy.interact(s, (t += 1000), "poke");
  s = r.state;
  assert.strictEqual(r.result.ok, true);
  assert.strictEqual(r.result.gained, 0);
  assert.strictEqual(r.result.reason, "daily-cap");
  assert.strictEqual(moodOf(s), moodBefore + RULES.mood.poke);
  assert.strictEqual(s.daily.gained, RULES.dailyCap);
  assert.strictEqual(affinityOf(s), RULES.dailyCap);
  // 시간 원천도 더는 오르지 않는다
  r = economy.turn(s, (t += 1000));
  assert.strictEqual(r.result.gained, 0);
});

test("economy: 하루 넘김·스트릭·첫 교감 보너스", () => {
  let { state: s } = economy.start(null, T0, "squirtle");
  s = economy.interact(s, T0, "feed").state; // 오늘 교감
  assert.strictEqual(s.daily.streak, 1);

  // 다음 날 — 어제 교감했으니 streak 2, daily 비움
  let r = economy.tick(s, T0 + DAY, { elapsed: 0 });
  s = r.state;
  assert.strictEqual(r.result.rolled, true);
  assert.strictEqual(r.result.changed, true);
  assert.strictEqual(s.daily.date, economy.localDate(T0 + DAY));
  assert.strictEqual(s.daily.gained, 0);
  assert.strictEqual(s.daily.feeds, 0);
  assert.strictEqual(s.daily.streak, 2);
  assert.strictEqual(s.log.at(-1).kind, "day");
  r = economy.interact(s, T0 + DAY, "feed"); // 쿨다운은 진작 지났다
  s = r.state;
  assert.strictEqual(r.result.bonus, RULES.streak.perDay * 2);

  // 하루 건너뜀 — streak 1
  r = economy.tick(s, T0 + 3 * DAY, { elapsed: 0 });
  s = r.state;
  assert.strictEqual(s.daily.streak, 1);
  // 어제 교감 없이 넘김 — streak 1
  r = economy.tick(s, T0 + 4 * DAY, { elapsed: 0 });
  s = r.state;
  assert.strictEqual(s.daily.streak, 1);
  // 같은 날 다시 틱 — 리셋 없음, 같은 참조
  r = economy.tick(s, T0 + 4 * DAY + HOUR, { elapsed: 0 });
  assert.strictEqual(r.result.rolled, false);
  assert.strictEqual(r.state, s);

  // 보너스 상한 30
  s.daily.streak = 10;
  r = economy.interact(s, T0 + 4 * DAY + HOUR, "poke");
  assert.strictEqual(r.result.bonus, RULES.streak.cap);

  // view 는 writer 가 틱을 안 돌렸어도 새 날로 보여 준다
  const v = economy.view(s, T0 + 5 * DAY);
  assert.strictEqual(v.daily.gained, 0);
  assert.strictEqual(v.daily.date, economy.localDate(T0 + 5 * DAY));
  assert.strictEqual(s.daily.date, economy.localDate(T0 + 4 * DAY), "view 는 state 를 바꾸지 않는다");
  // 자정 경계 — 23:59:59 와 00:00:00
  const midnight = new Date(2026, 8, 18, 0, 0, 0).getTime();
  assert.notStrictEqual(economy.localDate(midnight - 1), economy.localDate(midnight));
  assert.strictEqual(economy.yesterdayOf(midnight), economy.localDate(midnight - 1));
});

test("economy: 기분 — 방치·실패 상한·클램프, 친밀도는 안 줄어든다", () => {
  let { state: s } = economy.start(null, T0, "bulbasaur");
  const startMood = moodOf(s);
  let t = T0;
  let r;
  // 안 보이면 방치가 흐르지 않는다
  for (let i = 0; i < 12; i++) s = economy.tick(s, (t += 10 * MIN), { elapsed: 10 * MIN, visible: false }).state;
  assert.strictEqual(moodOf(s), startMood);
  // 보이는 2시간 → −2 (10초 틱으로 쪼개도 같다)
  for (let i = 0; i < 720; i++) s = economy.tick(s, (t += 10_000), { elapsed: 10_000, visible: true }).state;
  assert.strictEqual(moodOf(s), startMood - 2);
  assert.strictEqual(s.daily.presence, 12, "보이는 2시간 = 켜 두기 +12");
  // 돌봄이 방치 시계를 되돌린다
  s = economy.tick(s, (t += 30 * MIN), { elapsed: 30 * MIN, visible: true }).state;
  s = economy.interact(s, t, "feed").state;
  assert.strictEqual(s.acc.neglectMs, 0);

  // 실패 — 한 시간에 −10 까지
  const m0 = moodOf(s);
  r = economy.tick(s, (t += 1000), { agent: "failed", prevAgent: "running" });
  s = r.state;
  assert.strictEqual(r.result.failed, true);
  assert.strictEqual(moodOf(s), m0 - RULES.mood.failed);
  r = economy.tick(s, (t += 1000), { agent: "failed", prevAgent: "failed" }); // 머무는 동안은 다시 빼지 않는다
  assert.strictEqual(r.result.failed, false);
  s = economy.tick(s, (t += 1000), { agent: "running", prevAgent: "failed" }).state;
  s = economy.tick(s, (t += 1000), { agent: "failed", prevAgent: "running" }).state;
  assert.strictEqual(moodOf(s), m0 - 2 * RULES.mood.failed);
  s = economy.tick(s, (t += 1000), { agent: "running", prevAgent: "failed" }).state;
  r = economy.tick(s, (t += 1000), { agent: "failed", prevAgent: "running" });
  s = r.state;
  assert.strictEqual(r.result.failed, false, "시간당 상한");
  assert.strictEqual(moodOf(s), m0 - RULES.mood.failedWindowCap);
  s = economy.tick(s, (t += HOUR + 5000), { agent: "running", prevAgent: "failed" }).state;
  r = economy.tick(s, (t += 1000), { agent: "failed", prevAgent: "running" });
  s = r.state;
  assert.strictEqual(r.result.failed, true, "한 시간 지나면 다시");

  // 클램프
  economy.activePet(s).mood = 98;
  s = economy.interact(s, (t += RULES.sources.feed.cooldown), "feed").state;
  assert.strictEqual(moodOf(s), RULES.mood.max);
  economy.activePet(s).mood = 1;
  for (let i = 0; i < 3; i++) {
    s = economy.tick(s, (t += 1000), { agent: "running", prevAgent: "idle" }).state;
    s = economy.tick(s, (t += 2 * HOUR), { agent: "failed", prevAgent: "running" }).state;
  }
  assert.strictEqual(moodOf(s), RULES.mood.min);

  // 친밀도는 어떤 경로로도 줄지 않았다
  const before = affinityOf(s);
  s = economy.tick(s, (t += DAY), { elapsed: 0, visible: true, agent: "failed", prevAgent: "running" }).state;
  assert.ok(affinityOf(s) >= before);
});

test("economy: 턴 전환·시간 원천은 보일 때만·단계 준비", () => {
  let { state: s } = economy.start(null, T0, "pikachu");
  let t = T0;
  let r = economy.tick(s, (t += 1000), { agent: "waving", prevAgent: "running" });
  s = r.state;
  assert.strictEqual(r.result.turn, true);
  assert.strictEqual(r.result.gained, RULES.sources.turn.gain);
  r = economy.tick(s, (t += 1000), { agent: "waving", prevAgent: "waving" });
  assert.strictEqual(r.result.turn, false);
  assert.strictEqual(r.result.gained, 0);
  // 안 보이면 running 이어도 work 가 쌓이지 않는다
  for (let i = 0; i < 6; i++) s = economy.tick(s, (t += 10_000), { elapsed: 10_000, visible: false, agent: "running" }).state;
  assert.strictEqual(s.daily.work, 0);
  for (let i = 0; i < 6; i++) s = economy.tick(s, (t += 10_000), { elapsed: 10_000, visible: true, agent: "running" }).state;
  assert.strictEqual(s.daily.work, 1);
  assert.strictEqual(s.acc.workMs, 0);
  // 단계 준비
  const pet = economy.activePet(s);
  assert.strictEqual(economy.nextThreshold(pet), RULES.stages[0]);
  pet.affinity = RULES.stages[0] - 1;
  assert.strictEqual(economy.stageReady(pet), false);
  pet.affinity = RULES.stages[0];
  assert.strictEqual(economy.stageReady(pet), true);
  pet.everstone = true;
  assert.strictEqual(economy.stageReady(pet), false);
  pet.everstone = false;
  pet.stage = 1;
  assert.strictEqual(economy.nextThreshold(pet), RULES.stages[1]);
  assert.strictEqual(economy.stageReady(pet), false);
  pet.stage = 2;
  assert.strictEqual(economy.nextThreshold(pet), null);
  assert.strictEqual(economy.stageReady(pet), false);
  const v = economy.view(s, t);
  assert.strictEqual(v.active.key, "pikachu#1");
  assert.strictEqual(v.party.length, 1);
  assert.strictEqual(v.daily.cap, RULES.dailyCap);
  // 바꾸기
  s.party["eevee#1"] = economy.newPet("eevee", t);
  r = economy.switchPet(s, t, "eevee#1");
  assert.strictEqual(r.result.ok, true);
  assert.strictEqual(r.state.active, "eevee#1");
  assert.strictEqual(economy.switchPet(s, t, "mew#1").result.reason, "unknown-pet");
  assert.strictEqual(economy.petKeyFor(s, "eevee"), "eevee#2");
});

// ── save ───────────────────────────────────────────────────────────────────

test("save: 왕복·파손 → .bak·log 200", () => {
  const dir = tmpDir("save");
  const file = path.join(dir, "save.json");
  assert.deepStrictEqual(save.read(file), { state: null, corrupted: false });
  let { state: s } = economy.start(null, T0, "eevee");
  for (let i = 0; i < 250; i++) economy.pushLog(s, { at: T0 + i, kind: "poke", i });
  assert.strictEqual(s.log.length, RULES.log.keep);
  assert.strictEqual(s.log[0].i, 50);
  assert.strictEqual(save.write(file, s), true);
  assert.ok(!fs.existsSync(`${file}.${process.pid}.tmp`));
  const back = save.read(file);
  assert.strictEqual(back.corrupted, false);
  assert.deepStrictEqual(back.state, s);

  // 파손 — .bak 으로 옮기고 null, corrupted
  fs.writeFileSync(file, "{ 이건 JSON 이 아니다");
  const broken = save.read(file);
  assert.deepStrictEqual(broken, { state: null, corrupted: true });
  assert.ok(!fs.existsSync(file));
  assert.ok(fs.existsSync(`${file}.bak`));
  assert.deepStrictEqual(save.read(file), { state: null, corrupted: false });
  // 뼈대가 아닌 JSON 도 파손 — 읽기 전용(repair:false)은 옮기지 않는다
  fs.writeFileSync(file, JSON.stringify({ v: 1, party: "no" }));
  assert.deepStrictEqual(save.read(file, { repair: false }), { state: null, corrupted: true });
  assert.ok(fs.existsSync(file));
  // 빠진 필드는 채운다
  fs.writeFileSync(file, JSON.stringify({ v: 1, party: { "eevee#1": { species: "eevee", affinity: 12 } }, active: "없는키" }));
  const filled = save.read(file).state;
  assert.strictEqual(filled.active, "eevee#1");
  assert.strictEqual(filled.party["eevee#1"].mood, RULES.mood.start);
  assert.strictEqual(filled.daily.streak, 1);
  assert.deepStrictEqual(filled.acc, economy.freshAcc());
});

// ── writer lock ────────────────────────────────────────────────────────────

test("writer: lock 잡기·죽은 pid·살아 있는 pid·release", async () => {
  const lock = path.join(tmpDir("lock"), "save.lock");
  assert.strictEqual(writer.claim(lock).ok, true);
  assert.strictEqual(writer.isMine(lock), true);
  assert.strictEqual(writer.owner(lock), process.pid);
  assert.strictEqual(writer.claim(lock).ok, true, "내 것은 다시 잡아도 된다");
  assert.strictEqual(writer.release(lock), true);
  assert.strictEqual(fs.existsSync(lock), false);
  assert.strictEqual(writer.release(lock), false);
  assert.strictEqual(writer.isMine(lock), false);

  // 죽은 pid 의 lock 은 덮어쓴다
  fs.writeFileSync(lock, `${await deadPid()}\n`);
  assert.strictEqual(writer.owner(lock), null);
  assert.strictEqual(writer.claim(lock).ok, true);
  assert.strictEqual(writer.isMine(lock), true);
  writer.release(lock);

  // 파손 lock 도 덮어쓴다
  fs.writeFileSync(lock, "garbage");
  assert.strictEqual(writer.claim(lock).ok, true);
  writer.release(lock);

  // 살아 있는 다른 pid — 실패, 남의 lock 은 release 로도 못 지운다
  const other = spawnIdle();
  try {
    fs.writeFileSync(lock, `${other.pid}\nready\n`);
    const r = writer.claim(lock);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, "busy");
    assert.strictEqual(r.owner, other.pid);
    assert.strictEqual(writer.release(lock), false);
    assert.ok(fs.existsSync(lock));
  } finally {
    other.kill();
    await other.exited;
  }
  assert.strictEqual(writer.claim(lock).ok, true, "죽으면 이어받는다");
  writer.release(lock);
});

// ── mailbox ────────────────────────────────────────────────────────────────

test("mailbox: 왕복·타임아웃·파손·오래된 요청·회신 청소", async () => {
  const dir = path.join(tmpDir("mail"), "mailbox");
  const seen = [];
  const server = mailbox.serve(
    dir,
    async (cmd, args, meta) => {
      seen.push({ cmd, args, from: meta.from });
      if (cmd === "boom") throw new Error("x");
      return { ok: true, kind: cmd, echo: args };
    },
    {},
  );
  try {
    const r = await mailbox.send(dir, "feed", { a: 1 }, { from: "test" });
    assert.deepStrictEqual(r, { ok: true, kind: "feed", echo: { a: 1 } });
    assert.deepStrictEqual(seen, [{ cmd: "feed", args: { a: 1 }, from: "test" }]);
    assert.deepStrictEqual(fs.readdirSync(dir), [], "요청·회신 모두 치워졌다");
    const err = await mailbox.send(dir, "boom", {}, {});
    assert.strictEqual(err.reason, "error");
    assert.strictEqual((await mailbox.send(dir, "bad cmd", {}, {})).reason, "bad-cmd");

    // 파손 요청은 지운다, 오래된 요청은 처리하지 않고 지운다
    fs.writeFileSync(path.join(dir, `${Date.now()}-1-poke.json`), "{{{");
    const stale = mailbox.requestName(Date.now() - RULES.io.requestTtlMs - 1000, 2, "play");
    fs.writeFileSync(path.join(dir, stale), JSON.stringify({ cmd: "play", args: {}, at: Date.now() - RULES.io.requestTtlMs - 1000 }));
    // 60초 넘은 회신은 청소
    const oldResult = path.join(dir, "1-1-feed.result.json");
    fs.writeFileSync(oldResult, "{}");
    const past = (Date.now() - RULES.io.resultTtlMs - 5000) / 1000;
    fs.utimesSync(oldResult, past, past);
    await server.scan();
    assert.ok(await waitFor(() => fs.readdirSync(dir).length === 0), `남은 파일: ${fs.readdirSync(dir)}`);
    assert.strictEqual(seen.length, 2, "오래된 요청은 handle 에 오지 않는다");
  } finally {
    server.close();
  }

  // writer 가 없으면 timeout, 요청은 회수된다
  const lonely = path.join(tmpDir("mail2"), "mailbox");
  const t = await mailbox.send(lonely, "feed", {}, { timeoutMs: 300 });
  assert.deepStrictEqual(t, { ok: false, kind: "feed", reason: "timeout" });
  assert.deepStrictEqual(fs.readdirSync(lonely), []);
});

// ── createGame ─────────────────────────────────────────────────────────────

test("createGame: writer 흐름 — 시작·tick·act·snapshot·onChange·쓰기 절약", async () => {
  const paths = pathsIn(tmpDir("game"));
  let clock = T0;
  const now = () => clock;
  const game = createGame({ paths, writer: true, now });
  try {
    assert.strictEqual(game.isWriter(), true);
    assert.strictEqual(game.hasSave(), false);
    assert.strictEqual(game.snapshot(), null);
    assert.strictEqual(game.tick(clock, { visible: true }).reason, "no-save");
    assert.strictEqual((await game.act("feed")).reason, "no-save");
    let changes = 0;
    const off = game.onChange(() => changes++);

    assert.strictEqual(game.start("mewtwo").reason, "not-starter");
    const started = game.start("pikachu");
    assert.strictEqual(started.ok, true);
    assert.strictEqual(game.hasSave(), true);
    assert.strictEqual(game.start("eevee").reason, "exists");
    assert.strictEqual(changes, 1);
    let snap = game.snapshot();
    assert.strictEqual(snap.writer, true);
    assert.strictEqual(snap.active.species, "pikachu");
    assert.strictEqual(snap.active.key, "pikachu#1");
    assert.strictEqual(snap.active.nextThreshold, RULES.stages[0]);
    assert.strictEqual(snap.active.feedNextAt, null);
    assert.strictEqual(snap.daily.cap, RULES.dailyCap);

    // 첫 틱은 경과 0. 그 뒤 10초씩 — 누적기만 움직인 틱은 파일에 쓰지 않는다
    game.tick(clock, { visible: true, agent: "running" });
    for (let i = 0; i < 3; i++) game.tick((clock += 10_000), { visible: true, agent: "running" });
    let onDisk = JSON.parse(fs.readFileSync(paths.save, "utf8"));
    assert.strictEqual(onDisk.daily.work, 0);
    assert.strictEqual(onDisk.acc.workMs, 0, "30초는 아직 파일에 없다");
    assert.strictEqual(changes, 1);
    for (let i = 0; i < 3; i++) game.tick((clock += 10_000), { visible: true, agent: "running" });
    onDisk = JSON.parse(fs.readFileSync(paths.save, "utf8"));
    assert.strictEqual(onDisk.daily.work, 1, "1분이 차면 쓴다");
    assert.strictEqual(changes, 2);
    // 잠자기에서 깨어난 큰 간격은 maxElapsedMs 로 자른다
    const r = game.tick((clock += 3 * HOUR), { visible: true, agent: "running" });
    assert.strictEqual(r.gained, 0);
    assert.strictEqual(game.snapshot().daily.presence, 0);
    // 턴 전환은 tick 이 상태 변화를 본다
    game.tick((clock += 1000), { visible: true, agent: "waving" });
    assert.strictEqual(game.snapshot().daily.turns, 1);
    game.tick((clock += 1000), { visible: true, agent: "waving" });
    assert.strictEqual(game.snapshot().daily.turns, 1);

    // act
    let a = await game.act("feed");
    assert.strictEqual(a.ok, true);
    assert.strictEqual(a.gained, RULES.sources.feed.gain);
    assert.strictEqual(a.bonus, RULES.streak.perDay);
    assert.strictEqual(game.snapshot().active.feedNextAt, clock + RULES.sources.feed.cooldown);
    a = await game.act("feed");
    assert.strictEqual(a.reason, "cooldown");
    assert.deepStrictEqual(await game.act("evolve"), { ok: false, kind: "evolve", reason: "not-yet" });
    assert.strictEqual((await game.act("switch", "nope#9")).reason, "unknown-pet");
    assert.strictEqual((await game.act("switch", { key: "pikachu#1" })).ok, true);
    assert.strictEqual((await game.act("dance")).reason, "unknown-cmd");
    off();
    const before = changes;
    await game.act("poke");
    assert.strictEqual(changes, before, "해제한 리스너는 안 불린다");

    // 하루 넘김도 tick 에서
    game.tick((clock += DAY), { visible: false });
    snap = game.snapshot();
    assert.strictEqual(snap.daily.gained, 0);
    assert.strictEqual(snap.daily.streak, 2);
    assert.strictEqual(snap.log.at(-1).kind, "day");

    // resign — lock 을 놓고 읽기 전용으로. 파일은 최신
    game.resign();
    assert.strictEqual(game.isWriter(), false);
    assert.strictEqual(fs.existsSync(paths.saveLock), false);
    assert.strictEqual(game.snapshot().writer, false);
    assert.strictEqual(game.snapshot().active.species, "pikachu");
    assert.strictEqual(game.start("eevee").reason, "not-writer");
    assert.strictEqual(game.claim(), true);
    assert.strictEqual(game.isWriter(), true);
    assert.strictEqual(game.snapshot().daily.streak, 2, "다시 잡으면 파일에서 읽는다");
  } finally {
    game.close();
  }
  assert.strictEqual(fs.existsSync(paths.saveLock), false, "close 가 lock 을 놓는다");
  assert.strictEqual((await game.act("poke")).reason, "closed");
});

test("createGame: reader — 파일에서 snapshot, act 는 mailbox 로, onChange 는 감시로", async () => {
  const paths = pathsIn(tmpDir("game2"));
  let clock = T0;
  const now = () => clock;
  const w = createGame({ paths, writer: true, now });
  const r = createGame({ paths, writer: false, now, from: "cli" });
  try {
    assert.strictEqual(r.isWriter(), false);
    assert.strictEqual(r.snapshot(), null);
    assert.strictEqual(w.start("eevee").ok, true);
    let snap = r.snapshot();
    assert.strictEqual(snap.writer, false);
    assert.strictEqual(snap.active.species, "eevee");

    let notified = 0;
    r.onChange(() => notified++);
    const a = await r.act("poke");
    assert.strictEqual(a.ok, true, JSON.stringify(a));
    assert.strictEqual(a.kind, "poke");
    assert.strictEqual(a.gained, 1);
    assert.strictEqual(w.snapshot().daily.pokes, 1);
    assert.strictEqual(r.snapshot().daily.pokes, 1, "reader 는 바뀐 파일을 다시 읽는다");
    assert.ok(await waitFor(() => notified >= 1), "reader onChange 가 파일 감시로 불린다");
    assert.strictEqual((await r.act("switch", "nope#1")).reason, "unknown-pet");
    assert.deepStrictEqual(await r.act("evolve"), { ok: false, kind: "evolve", reason: "not-yet" });
    // mailbox 의 snapshot 명령
    const viaMail = await mailbox.send(paths.mailbox, "snapshot", {}, { from: "cli" });
    assert.strictEqual(viaMail.ok, true);
    assert.strictEqual(viaMail.snapshot.active.species, "eevee");
    assert.strictEqual((await mailbox.send(paths.mailbox, "shop", {}, {})).reason, "unknown-cmd");
    // reader 의 tick 은 아무것도 하지 않는다
    assert.strictEqual(r.tick(clock, { visible: true }).reason, "not-writer");
    assert.strictEqual(fs.readdirSync(paths.mailbox).length, 0);
  } finally {
    r.close();
    w.close();
  }
  // writer 가 없으면 reader 의 act 는 timeout
  const lone = createGame({ paths, writer: false, now });
  try {
    const t0 = Date.now();
    const res = await lone.act("feed");
    assert.strictEqual(res.reason, "timeout");
    assert.ok(Date.now() - t0 >= RULES.io.sendTimeoutMs - 50);
  } finally {
    lone.close();
  }
});

test("createGame: 다른 프로세스가 writer 면 reader 로 시작하고, 끝나면 tick 에서 이어받는다", async () => {
  const paths = pathsIn(tmpDir("game3"));
  let clock = T0;
  const now = () => clock;
  // 진행 파일을 먼저 만들어 둔다
  const first = createGame({ paths, writer: true, now });
  first.start("eevee");
  first.close();

  const other = spawnIdle();
  fs.writeFileSync(paths.saveLock, `${other.pid}\n`);
  const game = createGame({ paths, writer: true, now });
  try {
    assert.strictEqual(game.isWriter(), false);
    assert.strictEqual(game.snapshot().active.species, "eevee", "reader 로도 진행은 보인다");
    assert.strictEqual(game.tick((clock += 10_000), { visible: true }).reason, "not-writer");
    other.kill();
    await other.exited;
    const r = game.tick((clock += 10_000), { visible: true });
    assert.strictEqual(game.isWriter(), true);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(writer.owner(paths.saveLock), process.pid);
    assert.strictEqual(game.snapshot().writer, true);
  } finally {
    game.close();
    other.kill();
  }
});

test("createGame: 파손 저장 — .bak 으로 옮기고 corrupted, 새로 시작", () => {
  const paths = pathsIn(tmpDir("game4"));
  fs.writeFileSync(paths.save, "not json");
  const game = createGame({ paths, writer: true, now: () => T0 });
  try {
    assert.strictEqual(game.corrupted, true);
    assert.strictEqual(game.hasSave(), false);
    assert.strictEqual(game.snapshot(), null);
    assert.ok(fs.existsSync(`${paths.save}.bak`));
    assert.strictEqual(game.start("eevee").ok, true);
    assert.strictEqual(game.corrupted, false);
    assert.strictEqual(game.snapshot().corrupted, false);
  } finally {
    game.close();
  }
  // 읽기 전용은 파손 파일을 옮기지 않고 corrupted 만 알린다
  const paths2 = pathsIn(tmpDir("game5"));
  fs.writeFileSync(paths2.save, "not json");
  const reader = createGame({ paths: paths2, writer: false, now: () => T0 });
  try {
    assert.strictEqual(reader.corrupted, true);
    assert.strictEqual(reader.snapshot(), null);
    assert.ok(fs.existsSync(paths2.save));
  } finally {
    reader.close();
  }
});

// ── 실행 ───────────────────────────────────────────────────────────────────

(async () => {
  let failed = false;
  for (const { name, fn } of tests) {
    try {
      await fn();
      out(`  ok  ${name}`);
    } catch (e) {
      failed = true;
      process.stderr.write(`  실패  ${name}\n${e && e.stack ? e.stack : e}\n`);
      break;
    }
  }
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // 임시 폴더 정리 실패는 결과와 무관
  }
  if (failed) process.exit(1);
  out("통과");
})();
