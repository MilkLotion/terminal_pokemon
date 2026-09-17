// 저장을 쓰는 프로세스는 하나 — save.lock 에 pid 를 적어 잡는다 (config.js PATHS.saveLock). 1판 game/writer.js 를 옮기며 타입만
//
// 살아 있는 다른 pid 가 있으면 실패, 죽은 pid 의 lock 은 덮어쓴다. release 는 내 pid 일 때만 지운다.
// 파일은 'wx'(없을 때만 만들기)로 만든다 — 동시에 뜬 둘이 "없네" 하고 같이 쓰는 것을 막는다.
// 누가 writer 가 되는지(독립 펫이 있으면 그것, 없으면 먼저 뜬 창 펫)는 부르는 쪽(main)이 정한다 —
// 여기는 claim · release · isMine · owner 만 내놓는다. 창 펫이 독립 펫에 자리를 내주려면 release 뒤 독립 펫이 claim 한다
// pidAlive 는 lib/state.js 와 같은 로직을 여기 다시 둔다 — 옛 JS 에 기대지 않기 위해 (S2 에서 follow/ 로 옮겨지면 그쪽 것을 쓴다)
import fs from "node:fs";
import path from "node:path";

export type ClaimReason = "ok" | "busy" | "error";

export interface ClaimResult {
  ok: boolean;
  owner: number | null; // ok 면 내 pid, busy 면 살아 있는 상대 pid
  reason: ClaimReason;
}

// 프로세스가 살아 있나 — 신호 0 은 보내지 않고 존재만 확인한다
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // 남의 소유 프로세스 — 살아 있다
  }
}

// lock 에 적힌 pid — 없거나 파손이면 null
export function readOwner(lockFile: string): number | null {
  try {
    const pid = Number(String(fs.readFileSync(lockFile, "utf8")).trim().split(/\s+/)[0]);
    return pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

// 살아 있는 소유자 pid — 죽었거나 없으면 null
export function owner(lockFile: string): number | null {
  const pid = readOwner(lockFile);
  return pid != null && pidAlive(pid) ? pid : null;
}

// 잡기 — { ok, owner, reason }. reason: ok · busy(살아 있는 다른 pid) · error
export function claim(lockFile: string, pid: number = process.pid): ClaimResult {
  for (let i = 0; i < 2; i++) {
    try {
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      const fd = fs.openSync(lockFile, "wx");
      try {
        fs.writeSync(fd, `${pid}\n`);
      } finally {
        fs.closeSync(fd);
      }
      return { ok: true, owner: pid, reason: "ok" };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") return { ok: false, owner: null, reason: "error" };
    }
    const cur = readOwner(lockFile);
    if (cur === pid) return { ok: true, owner: pid, reason: "ok" }; // 이미 내 것
    if (cur != null && pidAlive(cur)) return { ok: false, owner: cur, reason: "busy" };
    try {
      fs.unlinkSync(lockFile); // 죽은 pid · 파손 — 지우고 한 번 더
    } catch {
      // 사이에 누가 지웠다 — 다음 회차의 wx 가 가른다
    }
  }
  return { ok: false, owner: readOwner(lockFile), reason: "busy" };
}

// 내 pid 가 적혀 있나 — 파일을 매번 읽는다 (누가 지웠거나 가로챘으면 바로 안다)
export function isMine(lockFile: string, pid: number = process.pid): boolean {
  return readOwner(lockFile) === pid;
}

// 놓기 — 내 것일 때만 지운다. 남의 lock 은 건드리지 않는다
export function release(lockFile: string, pid: number = process.pid): boolean {
  if (!isMine(lockFile, pid)) return false;
  try {
    fs.unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}
