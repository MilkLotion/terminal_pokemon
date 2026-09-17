// src/follow 자체 확인 — npm run build 뒤 node dist/tools/selftest-follow.js (npm run selftest 가 차례로 돈다)
//
// 테스트 프레임워크 없이 assert 만. 프로세스 표는 가짜 ParentMap 을 주입하고, 파일은 임시 폴더에서만 —
// 사용자의 ~/.claude/pokebuddy/ 는 건드리지 않는다. 헬퍼는 node 스크립트로 흉내 낸다 (빈 줄마다 한 줄 답).
// 끝에 "통과 (N건)" 한 줄. 실패하면 어디서 깨졌는지와 함께 종료 코드 1
import assert from "node:assert";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as front from "../follow/front";
import { createLineHelper } from "../follow/line-helper";
import * as state from "../follow/state";
import type { HelperWindow, ParentMap, StateRecord, WindowRecord } from "../follow/types";
import * as winbounds from "../follow/winbounds";

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>): Promise<void> => {
  await fn();
  n += 1;
  say(`  ok  ${name}`);
};

// 있어야 하는 값 — 없으면 여기서 실패한다 (없는 값에 점을 찍어 TypeError 로 죽는 대신)
function some<T>(v: T | null | undefined, what = "값"): T {
  assert.ok(v != null, `${what} 이(가) 없다`);
  return v;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-follow-"));
const tmpDir = (name: string): string => {
  const dir = path.join(tmpRoot, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};
const writeJson = (dir: string, name: string, v: unknown): string => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(v));
  return file;
};
const nowSec = (): number => Date.now() / 1000;

// 가짜 프로세스 표 — [pid, ppid, 이름, 경로?]
type Row = [number, number, string, string?];
function fakeParent(rows: Row[]): ParentMap {
  const parent = state.emptyParentMap();
  for (const [pid, ppid, name, file] of rows) {
    parent.set(pid, ppid);
    parent.names.set(pid, name);
    if (file) {
      parent.paths ??= new Map();
      parent.paths.set(pid, file);
    }
  }
  return parent;
}
const win = (pid: number, app: string, id = pid * 10): HelperWindow => ({ app, pid, id, x: 0, y: 0, w: 800, h: 600 });

// 이미 끝난 pid — 잠깐 떠서 바로 끝나는 프로세스의 pid
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore", windowsHide: true });
  await new Promise((r) => child.on("exit", r));
  return some(child.pid, "자식 pid");
}

// 콜백 한 번을 Promise 로
const once = <T>(run: (cb: (err: Error | null, v?: T) => void) => void): Promise<{ err: Error | null; v?: T }> =>
  new Promise((resolve) => run((err, v) => resolve({ err, v })));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── state.ts ────────────────────────────────────────────────────────────────

async function testPids(): Promise<void> {
  await ok("pidAlive: 나 자신은 살아 있고 끝난 pid 는 아니다", async () => {
    assert.strictEqual(state.pidAlive(process.pid), true);
    assert.strictEqual(state.pidAlive(await deadPid()), false);
  });

  await ok("ancestorPids: 가짜 표로 가까운 것부터, 1 이하에서 멈춘다", () => {
    const parent = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 300, "bash"],
      [300, 1, "Code"],
    ]);
    assert.deepStrictEqual(state.ancestorPids(100, parent), [100, 200, 300]);
    assert.deepStrictEqual(state.ancestorPids(999, parent), [999]); // 표에 없음 — 자기만
    // 40 단계 상한 — 고리를 만들어도 끝난다
    const loop = fakeParent([
      [1, 2, "a"],
      [2, 3, "b"],
      [3, 2, "c"],
    ]);
    assert.strictEqual(state.ancestorPids(3, loop).length, 40);
  });

  await ok("pidsUpTo: 터미널에서 자르고, 모르면 전부, 체인 밖이면 그 번호만", () => {
    const chain = [1, 2, 3, 4];
    assert.deepStrictEqual([...state.pidsUpTo(chain, 3)], [1, 2, 3]);
    assert.deepStrictEqual([...state.pidsUpTo(chain, null)], [1, 2, 3, 4]);
    assert.deepStrictEqual([...state.pidsUpTo(chain, 0)], [1, 2, 3, 4]);
    assert.deepStrictEqual([...state.pidsUpTo(chain, 9)], [9]);
  });

  await ok("myPidsFor: 주입한 표로 체인을 만들고 터미널에서 자른다", () => {
    const parent = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 300, "bash"],
      [300, 400, "Code"],
    ]);
    assert.deepStrictEqual([...state.myPidsFor(200, 100, parent)], [100, 200]);
  });

  await ok("terminalFromRecords: 원격 창은 빼고, 펫 자신(chain[0])은 보지 않는다", () => {
    const chain = [1, 2, 3, 4];
    const rec = (terminals: number[], remote = false): WindowRecord => ({ at: nowSec(), terminals, remote });
    assert.strictEqual(state.terminalFromRecords(chain, [rec([3], true), rec([4])]), 4);
    assert.strictEqual(state.terminalFromRecords(chain, [rec([3]), rec([4])]), 3); // 가까운 것
    assert.strictEqual(state.terminalFromRecords(chain, [rec([1])]), null);
    assert.strictEqual(state.terminalFromRecords(chain, []), null);
  });

  await ok("isCommandShell: 경로·로그인 셸·.exe 를 벗기고 이름으로 본다", () => {
    for (const s of ["/bin/zsh", "-zsh", "bash.exe", "PowerShell.exe", "C:\\Windows\\System32\\cmd.exe", "pwsh", "env"]) {
      assert.strictEqual(state.isCommandShell(s), true, s);
    }
    for (const s of ["node", "claude", "/Applications/Code.app/Contents/MacOS/Electron", "", null, undefined]) {
      assert.strictEqual(state.isCommandShell(s), false, String(s));
    }
  });
}

async function testSessionAnchor(): Promise<void> {
  const names = (rows: [number, string][]): Map<number, string> => new Map(rows);

  await ok("sessionAnchor: claude 안의 !pokebuddy → host=claude, term=터미널 bash", () => {
    // pokebuddy → bash → claude → bash(터미널) → Code
    const chain = [1, 2, 3, 4, 5];
    const r = state.sessionAnchor(chain, names([[1, "node"], [2, "bash"], [3, "claude"], [4, "-bash"], [5, "Code"]]));
    assert.deepStrictEqual(r, { host: 3, term: 4 });
  });

  await ok("sessionAnchor: codex 안 (여러 겹) → host=가장 바깥 node(codex.js), term=pwsh(터미널)", () => {
    // pokebuddy → pwsh → codex.exe → node(codex.js) → pwsh(터미널) → WindowsTerminal
    const chain = [1, 2, 3, 4, 5, 6];
    const r = state.sessionAnchor(
      chain,
      names([[1, "node.exe"], [2, "pwsh.exe"], [3, "codex.exe"], [4, "node.exe"], [5, "pwsh.exe"], [6, "WindowsTerminal.exe"]]),
    );
    assert.deepStrictEqual(r, { host: 4, term: 5 });
  });

  await ok("sessionAnchor: 셸에서 바로 → host=null, term=그 셸", () => {
    // pokebuddy → bash(터미널) → Code
    const r = state.sessionAnchor([1, 2, 3], names([[1, "node"], [2, "bash"], [3, "Code"]]));
    assert.deepStrictEqual(r, { host: null, term: 2 });
  });

  await ok("sessionAnchor: 셸 없이 곧바로 불림(작업 실행기) → 부른 쪽을 따라 산다 · 전부 셸이면 맨 위가 term", () => {
    assert.deepStrictEqual(state.sessionAnchor([1, 2, 3], names([[1, "node"], [2, "runner"], [3, "Code"]])), { host: 2, term: null });
    assert.deepStrictEqual(state.sessionAnchor([1, 2, 3], names([[1, "node"], [2, "bash"], [3, "zsh"]])), { host: null, term: 3 });
    assert.deepStrictEqual(state.sessionAnchor([1], names([[1, "node"]])), { host: null, term: null });
    assert.deepStrictEqual(state.sessionAnchor([1, 2], null), { host: 2, term: null }); // 이름을 모르면 셸이 아닌 것으로
  });
}

async function testOwnerPid(): Promise<void> {
  await ok("ownerPidOf: 창 주인이 내 조상 — 직접 탐색 (프로세스 표를 읽지 않는다)", () => {
    const chain = [100, 200, 300, 400];
    const windows = [win(999, "Safari"), win(300, "Code")];
    assert.strictEqual(state.ownerPidOf(chain, windows, { deep: false }), 300);
    // 펫 자신(chain[0])의 창은 보지 않는다
    assert.strictEqual(state.ownerPidOf(chain, [win(100, "Electron")], { deep: false }), null);
  });

  await ok("ownerPidOf: explorer 에서 체인을 자른다 — 탐색기 창을 주인으로 잡지 않는다", () => {
    const chain = [100, 200, 999];
    const parent = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 999, "cmd.exe"],
      [999, 0, "explorer.exe"],
    ]);
    // 창 목록의 앱 이름으로 자름
    assert.strictEqual(state.ownerPidOf(chain, [win(999, "explorer")], { deep: true, parent }), null);
    // 표의 이름으로 자름 — explorer 아래(자손)의 아무 앱 창도 안 잡는다
    const other = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 999, "cmd.exe"],
      [999, 0, "explorer.exe"],
      [777, 999, "chrome.exe"],
    ]);
    assert.strictEqual(state.ownerPidOf(chain, [win(777, "chrome")], { deep: true, parent: other }), null);
  });

  await ok("ownerPidOf: 창 주인이 내 조상의 자손(conhost) — 깊은 탐색만 찾는다", () => {
    const chain = [100, 200, 300];
    const parent = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 300, "cmd.exe"],
      [300, 1, "WindowsTerminal.exe"],
      [400, 200, "conhost.exe"],
    ]);
    const windows = [win(400, "conhost")];
    assert.strictEqual(state.ownerPidOf(chain, windows, { deep: false, parent }), null);
    assert.strictEqual(state.ownerPidOf(chain, windows, { deep: true, parent }), 400);
    // 펫 자신이 띄운 헬퍼의 창 — 올라가면 펫(chain[0])에 닿아 멈춘다
    const helper = fakeParent([
      [100, 200, "pokebuddy"],
      [200, 300, "bash"],
      [500, 100, "winbounds"],
    ]);
    assert.strictEqual(state.ownerPidOf(chain, [win(500, "winbounds")], { deep: true, parent: helper }), null);
  });
}

async function testWindowRecords(): Promise<void> {
  await ok("readWindowRecords: 폴더 없음 → [] · 파손·모양 틀림·미래 시각·죽은 hostPid·오래된 기록 제외 · 최신순", async () => {
    assert.deepStrictEqual(state.readWindowRecords(path.join(tmpRoot, "없음")), []);
    const dir = tmpDir("windows");
    const now = nowSec();
    const dead = await deadPid();
    writeJson(dir, "a.json", { at: now - 10, terminals: [11], hostPid: process.pid, tag: "a" });
    writeJson(dir, "b.json", { at: now - 1, terminals: [12], tag: "b" }); // hostPid 없음 — 시각으로 판정
    fs.writeFileSync(path.join(dir, "broken.json"), "{ 쓰는 중");
    writeJson(dir, "shape.json", { at: "x", terminals: [] });
    writeJson(dir, "noterm.json", { at: now, terminals: null });
    writeJson(dir, "future.json", { at: now + 100, terminals: [13] });
    writeJson(dir, "dead.json", { at: now, terminals: [14], hostPid: dead });
    writeJson(dir, "stale.json", { at: now - state.WINDOW_STALE_SEC - 1, terminals: [15] });
    fs.writeFileSync(path.join(dir, "note.txt"), "json 아님");
    const recs = state.readWindowRecords(dir) as (WindowRecord & { tag: string })[];
    assert.deepStrictEqual(recs.map((r) => r.tag), ["b", "a"]);
  });

  await ok("myRecord · tabAxis: 내 터미널이 든 창, 그 창의 활성 탭인가", () => {
    const recs: WindowRecord[] = [
      { at: 2, terminals: [7, 8], activeTerminal: 8 },
      { at: 1, terminals: [9], activeTerminal: 9 },
    ];
    const mine = new Set([1, 9]);
    const rec = some(state.myRecord(recs, mine));
    assert.deepStrictEqual(rec.terminals, [9]);
    assert.strictEqual(state.myRecord(recs, new Set([5])), null);
    assert.strictEqual(state.tabAxis(rec, mine), true);
    assert.strictEqual(state.tabAxis(some(recs[0]), mine), false);
    assert.strictEqual(state.tabAxis({ at: 1, terminals: [1], activeTerminal: null }, mine), false);
    assert.strictEqual(state.tabAxis(null, mine), null);
  });
}

async function testStateRecords(): Promise<void> {
  await ok("resolveState: hold/then · STALE 은 running·waiting 만 · 없으면 idle", () => {
    const now = nowSec();
    assert.strictEqual(state.resolveState({ state: "running", at: now }), "running");
    assert.strictEqual(state.resolveState({}), "idle");
    assert.strictEqual(state.resolveState({ state: "waving", hold: 5, then: "idle", at: now - 10 }), "idle");
    assert.strictEqual(state.resolveState({ state: "waving", hold: 60, then: "idle", at: now - 10 }), "waving");
    assert.strictEqual(state.resolveState({ state: "waving", hold: 5, at: now - 10 }), "idle"); // then 없음 → idle
    assert.strictEqual(state.resolveState({ state: "running", at: now - state.STALE_SEC - 1 }), "idle");
    assert.strictEqual(state.resolveState({ state: "waiting", at: now - state.STALE_SEC - 1 }), "idle");
    assert.strictEqual(state.resolveState({ state: "failed", at: now - state.STALE_SEC - 1 }), "failed");
    assert.strictEqual(state.resolveState({ state: "running", at: now - state.STALE_SEC + 1 }), "running");
  });

  await ok("stateIsMine: 조상이 있으면 조상으로, 없으면 cwd 로, 둘 다 없으면 내 것", () => {
    const mine = new Set([1, 2]);
    assert.strictEqual(state.stateIsMine({ ancestors: [2, 9] }, mine, null), true);
    assert.strictEqual(state.stateIsMine({ ancestors: [9] }, mine, null), false);
    assert.strictEqual(state.stateIsMine({ ancestors: [9], cwd: "/a" }, mine, "/a"), false); // 조상이 우선
    assert.strictEqual(state.stateIsMine({ cwd: "/a" }, mine, "/a"), true);
    assert.strictEqual(state.stateIsMine({ cwd: "/b" }, mine, "/a"), false);
    assert.strictEqual(state.stateIsMine({}, mine, "/a"), true);
    assert.strictEqual(state.stateIsMine({ ancestors: [] }, mine, null), true);
  });

  await ok("stateFor: pids 중 하나를 조상으로 가진 최신 기록 · 조상 없는 기록은 거름 · pids 비면 대기", () => {
    const now = nowSec();
    const recs: StateRecord[] = [
      { state: "waiting", at: now, cwd: "/x" }, // 조상 없음 — 거른다
      { state: "running", at: now, ancestors: [30, 31], promptAt: 1234 },
      { state: "failed", at: now, ancestors: [30] },
    ];
    assert.deepStrictEqual(state.stateFor(recs, []), { state: "idle", promptAt: null });
    assert.deepStrictEqual(state.stateFor(recs, null), { state: "idle", promptAt: null });
    assert.deepStrictEqual(state.stateFor(recs, new Set([30])), { state: "running", promptAt: 1234 });
    assert.deepStrictEqual(state.stateFor(recs, [31]), { state: "running", promptAt: 1234 });
    assert.deepStrictEqual(state.stateFor(recs, [99]), { state: "idle", promptAt: null });
    assert.deepStrictEqual(state.stateFor([{ state: "waving", at: now, ancestors: [5] }], [5]), { state: "waving", promptAt: null });
  });

  await ok("readStateRecords · sessionInfo: mtime 최신순 · hostPid 우선 · 조상 없는 기록은 내 것 판정 · terminalOnly 는 늘 대기", () => {
    assert.deepStrictEqual(state.readStateRecords(path.join(tmpRoot, "없음")), []);
    const dir = tmpDir("state");
    const now = nowSec();
    const older = writeJson(dir, "old.json", { state: "waiting", at: now, ancestors: [300], tag: "old" });
    const newer = writeJson(dir, "new.json", { state: "running", at: now, ancestors: [300], promptAt: 77, tag: "new" });
    const loose = writeJson(dir, "loose.json", { state: "failed", at: now, cwd: "/work", tag: "loose" });
    fs.writeFileSync(path.join(dir, "broken.json"), "{");
    const t = Date.now() / 1000;
    fs.utimesSync(older, t - 300, t - 300);
    fs.utimesSync(loose, t - 200, t - 200);
    fs.utimesSync(newer, t - 100, t - 100);
    const recs = state.readStateRecords(dir) as (StateRecord & { tag: string })[];
    assert.deepStrictEqual(recs.map((r) => r.tag), ["new", "loose", "old"]);

    const myPids = new Set([100, 200]);
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids, terminalOnly: true }), { state: "idle", promptAt: null });
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids, hostPid: 300 }), { state: "running", promptAt: 77 });
    // hostPid 가 어느 기록의 조상에도 없으면 — 조상을 못 적은 기록만 cwd 로 가린다
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids, hostPid: 999, matchCwd: "/work" }), { state: "failed", promptAt: null });
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids, hostPid: 999, matchCwd: "/other" }), { state: "idle", promptAt: null });
    // hostPid 없음(npm start) — 내 터미널이 조상에 있는 기록. 여기서는 없고, 조상 없는 기록이 cwd 로 맞는다
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids, matchCwd: "/work" }), { state: "failed", promptAt: null });
    assert.deepStrictEqual(state.sessionInfo(dir, { myPids: new Set([300]) }), { state: "running", promptAt: 77 });
    assert.deepStrictEqual(state.sessionInfo(path.join(tmpRoot, "없음"), { myPids }), { state: "idle", promptAt: null });
  });
}

// ── front.ts ────────────────────────────────────────────────────────────────

async function testFront(): Promise<void> {
  const windows = [win(10, "Safari", 101), win(20, "Code", 201), win(20, "Code", 202), win(30, "Electron", 301)];
  const self = { pid: 30, appNames: new Set(["electron"]) };

  await ok("frontWindow: frontPid 로 고른다 · frontId 가 있으면 그 창 · 없으면 같은 pid 의 첫 창", () => {
    assert.strictEqual(some(front.frontWindow({ frontPid: 20, windows }, windows, self)).id, 201);
    assert.strictEqual(some(front.frontWindow({ frontPid: 20, frontId: 202, windows }, windows, self)).id, 202);
    assert.strictEqual(some(front.frontWindow({ frontPid: 20, frontId: 999, windows }, windows, self)).id, 201); // 대화상자 — 목록에 없음
    assert.strictEqual(front.frontWindow({ frontPid: 40, windows }, windows, self), null); // 다른 Space — 창이 목록에 없음
  });

  await ok("frontWindow: 펫 자신(pid·이름)은 null · 옛 헬퍼는 frontmost 이름으로 · 입력이 없으면 null", () => {
    assert.strictEqual(front.frontWindow({ frontPid: 30, windows }, windows, self), null);
    assert.strictEqual(front.frontWindow({ frontmost: "Electron", windows }, windows, self), null);
    assert.strictEqual(front.frontWindow({ frontmost: "Electron", windows }, windows, { pid: 1, appNames: new Set(["electron"]) }), null);
    assert.strictEqual(some(front.frontWindow({ frontmost: "Code", windows }, windows, self)).pid, 20);
    assert.strictEqual(some(front.frontWindow({ frontmost: "Code", windows }, windows)).pid, 20); // self 없음
    assert.strictEqual(front.frontWindow({ windows }, windows, self), null);
    assert.strictEqual(front.frontWindow(null, windows, self), null);
    assert.strictEqual(front.frontWindow({ frontPid: 20, windows }, null, self), null);
  });

  await ok("hostOf: (a) 포커스된 VS Code 창 기록 → 활성 터미널 · 원격이면 pids 비움 · front 가 없어도 (a)", () => {
    const now = nowSec();
    const focused: WindowRecord = { at: now, terminals: [5, 6], activeTerminal: 6, focused: true };
    const blurred: WindowRecord = { at: now, terminals: [7], activeTerminal: 7, focused: false };
    const codeWin = win(20, "Code");
    const r = some(front.hostOf(codeWin, [blurred, focused], []));
    assert.deepStrictEqual(r, { kind: "vscode", rec: focused, pids: [6], frontIsHost: true });
    const remote = some(front.hostOf(win(10, "Safari"), [{ ...focused, remote: true }], []));
    assert.deepStrictEqual(remote, { kind: "vscode", rec: { ...focused, remote: true }, pids: [], frontIsHost: false });
    const noTab = some(front.hostOf(null, [{ ...focused, activeTerminal: null }], []));
    assert.deepStrictEqual(noTab.pids, []);
    assert.strictEqual(noTab.kind, "vscode");
  });

  await ok("hostOf: (b) 훅 기록의 조상에 창 주인 → hook · (c) 알려진 터미널 이름 → known · (d) 아니면 null", () => {
    const hooked: StateRecord[] = [{ state: "running", at: nowSec(), ancestors: [40, 41] }];
    assert.deepStrictEqual(front.hostOf(win(41, "mystery"), [], hooked), { kind: "hook", rec: null, pids: [41], frontIsHost: true });
    assert.deepStrictEqual(front.hostOf(win(50, "iterm2"), [], hooked), { kind: "known", rec: null, pids: [], frontIsHost: true });
    assert.deepStrictEqual(front.hostOf(win(50, "WindowsTerminal"), [], []), { kind: "known", rec: null, pids: [], frontIsHost: true });
    assert.strictEqual(front.hostOf(win(60, "Safari"), [], hooked), null);
    assert.strictEqual(front.hostOf(null, [], hooked), null);
    assert.strictEqual(front.hostOf(win(60, "Safari"), null, null), null);
  });

  await ok("KNOWN_TERMINAL_APPS · TERM_PROGRAM_APPS · isKnownTerminal: 대소문자 무관, 표 값은 헬퍼의 app 이름", () => {
    assert.strictEqual(front.isKnownTerminal("code"), true);
    assert.strictEqual(front.isKnownTerminal("Code - Insiders"), true);
    assert.strictEqual(front.isKnownTerminal("Finder"), false);
    assert.strictEqual(front.isKnownTerminal(null), false);
    assert.strictEqual(front.TERM_PROGRAM_APPS["vscode"], "Code");
    assert.strictEqual(front.TERM_PROGRAM_APPS["Apple_Terminal"], "Terminal");
    assert.strictEqual(front.TERM_PROGRAM_APPS["unknown"], undefined);
    for (const app of Object.values(front.TERM_PROGRAM_APPS)) assert.strictEqual(front.KNOWN_TERMINAL_APPS.has(app.toLowerCase()), true, app);
  });
}

// ── line-helper.ts · winbounds.ts ───────────────────────────────────────────

// 가짜 헬퍼 — 표준입력 한 줄마다 {"n":k} 한 줄. answerUpTo 를 넘긴 질문에는 답하지 않는다(멈춘 헬퍼 흉내)
function fakeServeScript(dir: string, name: string, answerUpTo = Infinity): string {
  const file = path.join(dir, name);
  fs.writeFileSync(
    file,
    [
      `let n = 0; const upTo = ${Number.isFinite(answerUpTo) ? answerUpTo : "Infinity"};`,
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (d) => { for (const line of d.split("\\n").slice(0, -1)) { n += 1; if (n <= upTo) process.stdout.write(JSON.stringify({ n, echo: line }) + "\\n"); } });',
      'process.stdin.on("end", () => process.exit(0));',
    ].join("\n"),
  );
  return file;
}

async function testLineHelper(): Promise<void> {
  const dir = tmpDir("helper");
  const serve = fakeServeScript(dir, "serve.js");

  await ok("createLineHelper: 빈 줄마다 한 줄 답 · 답을 기다리는 중엔 겹쳐 묻지 않는다 · stop 은 대기 중인 질문을 끝낸다", async () => {
    const h = createLineHelper(process.execPath, [serve], { timeoutMs: 3000, startTimeoutMs: 10000 });
    const a = await once<string>((cb) => h.query(cb));
    assert.strictEqual(a.err, null);
    assert.deepStrictEqual(JSON.parse(some(a.v)), { n: 1, echo: "" });
    // 겹쳐 묻기 — 두 번째 cb 는 불리지 않고 첫 답만 온다
    let second = 0;
    const b = await once<string>((cb) => {
      h.query(cb);
      h.query(() => {
        second += 1;
      });
    });
    assert.deepStrictEqual(JSON.parse(some(b.v)), { n: 2, echo: "" });
    assert.strictEqual(second, 0);
    // stop — 대기 중 질문은 "헬퍼 중단" 으로 끝난다
    const c = once<string>((cb) => h.query(cb));
    h.stop();
    assert.strictEqual(some((await c).err).message, "헬퍼 중단");
    h.stop(); // 두 번 멈춰도 조용하다
  });

  await ok("createLineHelper: 답이 늦으면 헬퍼를 버리고 다음 질문에 새로 띄운다 (한 번 답한 뒤라 재시도 간격 없음)", async () => {
    const onlyFirst = fakeServeScript(dir, "first-only.js", 1);
    const h = createLineHelper(process.execPath, [onlyFirst], { timeoutMs: 150, startTimeoutMs: 10000 });
    const a = await once<string>((cb) => h.query(cb));
    assert.deepStrictEqual(JSON.parse(some(a.v)), { n: 1, echo: "" });
    const b = await once<string>((cb) => h.query(cb));
    assert.strictEqual(some(b.err).message, "헬퍼 중단");
    const c = await once<string>((cb) => h.query(cb)); // 새 프로세스 — 번호가 1 로 돌아온다
    assert.strictEqual(c.err, null);
    assert.deepStrictEqual(JSON.parse(some(c.v)), { n: 1, echo: "" });
    h.stop();
  });

  await ok("createLineHelper: 첫 답도 못 하면 실패로 세고 다음 질문은 재시도 대기 · 바로 끝나는 헬퍼는 '헬퍼가 끝남'", async () => {
    const silent = fakeServeScript(dir, "silent.js", 0);
    const h = createLineHelper(process.execPath, [silent], { timeoutMs: 100, startTimeoutMs: 100 });
    const a = await once<string>((cb) => h.query(cb));
    assert.strictEqual(some(a.err).message, "헬퍼 중단");
    const b = await once<string>((cb) => h.query(cb));
    assert.strictEqual(some(b.err).message, "헬퍼 재시도 대기");
    h.stop();

    const quit = path.join(dir, "quit.js");
    fs.writeFileSync(quit, "process.exit(0);");
    const q = createLineHelper(process.execPath, [quit], { timeoutMs: 3000, startTimeoutMs: 3000 });
    const c = await once<string>((cb) => q.query(cb));
    assert.strictEqual(some(c.err).message, "헬퍼가 끝남");
    q.stop();
  });

  await ok("helperCommand: POKEBUDDY_WINBOUNDS 덮어쓰기 · mac 실행 파일 · Windows ps1 -Serve · 없으면 null", () => {
    const proj = tmpDir("project");
    const bare: NodeJS.ProcessEnv = {};
    assert.strictEqual(winbounds.helperCommand("darwin", proj, bare), null);
    assert.strictEqual(winbounds.helperCommand("win32", proj, bare), null);
    assert.strictEqual(winbounds.helperCommand("linux", proj, bare), null);
    fs.mkdirSync(path.join(proj, "helpers"));
    const bin = path.join(proj, "helpers", "winbounds");
    fs.writeFileSync(bin, "");
    assert.deepStrictEqual(winbounds.helperCommand("darwin", proj, bare), { cmd: bin, args: [] });
    assert.deepStrictEqual(winbounds.helperCommand("darwin", proj, bare, "Code"), { cmd: bin, args: ["Code"] });
    assert.strictEqual(winbounds.helperCommand("linux", proj, bare), null); // 파일이 있어도 다른 플랫폼은 없음
    const ps1 = path.join(proj, "helpers", "winbounds.ps1");
    fs.writeFileSync(ps1, "");
    assert.deepStrictEqual(winbounds.helperCommand("win32", proj, bare, "Code"), {
      cmd: "powershell",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Serve", "Code"],
      serve: true,
    });
    // 덮어쓰기 — 있으면 그것, 없으면 null (플랫폼 기본으로 떨어지지 않는다)
    assert.deepStrictEqual(winbounds.helperCommand("linux", proj, { POKEBUDDY_WINBOUNDS: bin }), { cmd: bin, args: [] });
    assert.strictEqual(winbounds.helperCommand("darwin", proj, { POKEBUDDY_WINBOUNDS: path.join(proj, "없음") }), null);
  });

  await ok("parseInfo: JSON 한 줄 → HelperInfo · id 가 숫자 아닌 창은 뺌 · 깨진 줄·객체 아님 → null", () => {
    const line = '{"frontmost":"Code","frontPid":2108,"windows":[{"app":"Code","pid":2108,"id":12345,"x":0,"y":30,"w":2560,"h":1324},{"app":"x","pid":1,"id":"bad"},null]}';
    const info = some(winbounds.parseInfo(line));
    assert.strictEqual(info.frontmost, "Code");
    assert.strictEqual(info.frontPid, 2108);
    assert.deepStrictEqual(info.windows.map((w) => w.id), [12345]);
    const ps = some(winbounds.parseInfo('{"frontmost":"Code","frontId":123456,"windows":[]}'));
    assert.strictEqual(ps.frontId, 123456);
    assert.deepStrictEqual(ps.windows, []);
    assert.deepStrictEqual(some(winbounds.parseInfo("{}")).windows, []);
    assert.strictEqual(winbounds.parseInfo('{"frontmost":'), null);
    assert.strictEqual(winbounds.parseInfo(""), null);
    assert.strictEqual(winbounds.parseInfo(undefined), null);
    assert.strictEqual(winbounds.parseInfo("null"), null);
    assert.strictEqual(winbounds.parseInfo("42"), null);
    // 헬퍼 답 → frontWindow 로 이어지는지
    const picked = front.frontWindow(info, info.windows, { pid: 1, appNames: new Set(["electron"]) });
    assert.strictEqual(some(picked).id, 12345);
  });

  await ok("queryHelper: 한 번 실행(execFile) · serve 는 하나를 띄워 두고 재사용 · stopHelper 로 멈춤", async () => {
    const onceScript = path.join(dir, "once.js");
    fs.writeFileSync(onceScript, 'process.stdout.write(JSON.stringify({ frontmost: "Code", frontPid: 7, windows: [{ app: "Code", pid: 7, id: 70, x: 0, y: 0, w: 1, h: 1 }] }) + "\\n");');
    const a = await once<string>((cb) => winbounds.queryHelper({ cmd: process.execPath, args: [onceScript] }, cb));
    assert.strictEqual(a.err, null);
    assert.strictEqual(some(winbounds.parseInfo(a.v)).frontPid, 7);
    const bad = await once<string>((cb) => winbounds.queryHelper({ cmd: path.join(dir, "없는-실행파일"), args: [] }, cb));
    assert.ok(bad.err instanceof Error);

    const cmd = { cmd: process.execPath, args: [serve], serve: true };
    const b = await once<string>((cb) => winbounds.queryHelper(cmd, cb, { timeoutMs: 3000, startTimeoutMs: 10000 }));
    assert.deepStrictEqual(JSON.parse(some(b.v)), { n: 1, echo: "" });
    const c = await once<string>((cb) => winbounds.queryHelper(cmd, cb));
    assert.deepStrictEqual(JSON.parse(some(c.v)), { n: 2, echo: "" }); // 같은 프로세스 — 번호가 이어진다
    winbounds.stopHelper();
    winbounds.stopHelper(); // 없을 때도 조용하다
    const d = await once<string>((cb) => winbounds.queryHelper(cmd, cb));
    assert.deepStrictEqual(JSON.parse(some(d.v)), { n: 1, echo: "" }); // 새로 띄움
    winbounds.stopHelper();
    await sleep(50); // 자식이 끝날 시간 — 임시 폴더 삭제 전에
  });
}

async function main(): Promise<void> {
  say("selftest-follow");
  await testPids();
  await testSessionAnchor();
  await testOwnerPid();
  await testWindowRecords();
  await testStateRecords();
  await testFront();
  await testLineHelper();
  say(`통과 (${n}건)`);
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error && e.stack ? e.stack : e);
    process.exitCode = 1;
  })
  .finally(() => {
    winbounds.stopHelper();
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // 임시 폴더 — 남아도 해가 없다
    }
  });
