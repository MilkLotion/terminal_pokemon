// src/agents 자체 확인 — npm run build 뒤 node dist/tools/selftest-agents.js (npm run selftest 가 넷을 차례로 돈다)
// 임시 HOME 을 쓴다 — 진짜 ~/.claude 설정 파일을 건드리지 않는다. 연결·해제는 --dry-run 만
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentName } from "../shared/types";

const home = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-selftest-agents-"));
process.env.HOME = home; // config.js · setup.js 가 require 될 때 os.homedir() 로 읽는다 (mac · linux)
process.env.USERPROFILE = home;

// 배럴 없이 모듈을 직접. HOME 을 바꾼 뒤에 읽어야 해서 import 문이 아니라 require 꼴 — ES import 는 파일 맨 위로 끌어올려진다
import usage = require("../agents/usage");
import registry = require("../agents/registry");
const agents = { ...usage, ...registry };

const say = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
let n = 0;
const ok = (name: string, fn: () => void): void => {
  fn();
  n += 1;
  say(`  ok  ${name}`);
};

// 있어야 하는 값 — 없으면 여기서 실패한다 (없는 값에 점을 찍어 TypeError 로 죽는 대신)
function some<T>(v: T | null | undefined, what = "값"): T {
  assert.ok(v != null, `${what} 이(가) 없다`);
  return v;
}

try {
  ok("usage: 더하기·차이·토큰 접기", () => {
    const a = { in: 10, out: 20, cacheRead: 1000, cacheWrite: 100 };
    const b = { in: 1, out: 2, cacheRead: 3, cacheWrite: 4 };
    assert.deepStrictEqual(agents.addUsage(a, b), { in: 11, out: 22, cacheRead: 1003, cacheWrite: 104 });
    assert.deepStrictEqual(agents.diffUsage(a, b), { in: 9, out: 18, cacheRead: 997, cacheWrite: 96 });
    // 줄었으면 새 기록 — 지금 값 전체
    assert.deepStrictEqual(agents.diffUsage(b, a), b);
    assert.strictEqual(agents.tokensOf(a), 10 + 20 + 100 + 100); // cacheRead 1000 × 0.1
    assert.strictEqual(agents.tokensOf(a, { in: 1, out: 1, cacheRead: 0, cacheWrite: 0 }), 30);
  });

  ok("usage: 기록 폴더 읽기 — usage 없는 기록은 뺀다", () => {
    const dir = path.join(home, "state");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s1.json"), JSON.stringify({ cli: "claude", state: "idle", at: 1000, usageAt: 1005, usage: { in: 5, out: 6, cacheRead: 7, cacheWrite: 8 } }));
    fs.writeFileSync(path.join(dir, "s2.json"), JSON.stringify({ cli: "codex", state: "running", at: 1001 }));
    fs.writeFileSync(path.join(dir, "bad.json"), "{");
    fs.writeFileSync(path.join(dir, "negative.json"), JSON.stringify({ usage: { in: -1, out: 0, cacheRead: 0, cacheWrite: 0 } }));
    fs.writeFileSync(path.join(dir, "infinite.json"), '{"usage":{"in":1e999,"out":0,"cacheRead":0,"cacheWrite":0}}');
    const list = agents.readSessionUsages(dir);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(some(list[0]).sessionId, "s1");
    assert.strictEqual(some(list[0]).at, 1005000);
    assert.deepStrictEqual(agents.readSessionUsages(path.join(home, "없음")), []);
  });

  ok("usage: 기준점과 증분 — 처음엔 0, 늘어난 만큼만, 새 세션은 전부", () => {
    const cur = [{ sessionId: "a", cli: "claude", usage: { in: 100, out: 50, cacheRead: 0, cacheWrite: 0 }, at: 1 }];
    const seen = agents.baseline(cur);
    let r = agents.deltaSince(cur, seen);
    assert.strictEqual(agents.tokensOf(r.delta), 0);
    const cur2 = [
      { sessionId: "a", cli: "claude", usage: { in: 130, out: 60, cacheRead: 0, cacheWrite: 0 }, at: 2 },
      { sessionId: "b", cli: "claude", usage: { in: 10, out: 10, cacheRead: 0, cacheWrite: 0 }, at: 2 },
    ];
    r = agents.deltaSince(cur2, r.seen);
    assert.deepStrictEqual(r.delta, { in: 40, out: 20, cacheRead: 0, cacheWrite: 0 }); // a 130−100 + b 10, out 60−50 + 10
    assert.deepStrictEqual(Object.keys(r.perSession).sort(), ["a", "b"]);
    // 일시적으로 못 읽은 세션의 기준점도 남겨 중복 적립 방지
    r = agents.deltaSince(cur2.slice(1), r.seen);
    assert.deepStrictEqual(Object.keys(r.seen).sort(), ["a", "b"]);
    assert.strictEqual(agents.tokensOf(r.delta), 0);
    r = agents.deltaSince(cur2, r.seen);
    assert.strictEqual(agents.tokensOf(r.delta), 0, "다시 읽힌 누적값은 재적립하지 않음");
    r = agents.deltaSince([{ ...cur2[0]!, usage: { ...cur2[0]!.usage, in: 135 } }], r.seen);
    assert.strictEqual(agents.tokensOf(r.delta), 5, "복구 후 새 사용량만 적립");
  });

  ok("registry: 세 에이전트, 사용량 출처", () => {
    assert.deepStrictEqual(agents.AGENTS.map((a) => a.name), ["claude", "codex", "gemini"]);
    assert.strictEqual(some(agents.agentInfo("claude")).usage, "transcript");
    assert.strictEqual(some(agents.agentInfo("codex")).usage, "none");
    assert.strictEqual(agents.agentInfo("bogus"), null);
  });

  ok("connect/disconnect --dry-run: 임시 HOME 에서 claude 는 등록 예정, codex 는 설치 안 됨, 모르는 CLI 는 거절", () => {
    const c = agents.connect("claude", { dryRun: true });
    assert.strictEqual(c.ok, true);
    assert.strictEqual(c.changed, true);
    assert.ok(some(c.added).includes("Stop"));
    assert.ok(!fs.existsSync(path.join(home, ".claude", "settings.json"))); // dry-run 은 쓰지 않는다
    const x = agents.connect("codex", { dryRun: true });
    assert.strictEqual(x.ok, false);
    assert.strictEqual(x.reason, "not-installed");
    assert.strictEqual(agents.connect("bogus" as AgentName, { dryRun: true }).reason, "unknown-cli"); // 타입 밖의 이름 — 런타임 거절을 본다
    const d = agents.disconnect("claude", { dryRun: true });
    assert.strictEqual(d.ok, true);
    assert.deepStrictEqual(d.removed, []);
  });

  ok("status: 세 줄, 임시 HOME 에서는 전부 미연결", () => {
    const rows = agents.status();
    assert.strictEqual(rows.length, 3);
    for (const r of rows) assert.strictEqual(r.connected, false);
    assert.strictEqual(some(rows.find((r) => r.name === "claude")).installed, true); // claude 는 설정 폴더가 없어도 쓰는 것으로 (always)
    assert.strictEqual(some(rows.find((r) => r.name === "codex")).installed, false);
  });

  say(`통과 (${n}건)`);
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
