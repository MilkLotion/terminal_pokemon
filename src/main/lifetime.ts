// 수명 — pid 파일 규약(claim · ready · watch) · 호스트/터미널 생존 · 실패 기록. 펫을 끝내 줄 부모가 없으므로 스스로 본다
//
// 내 pid 파일 — 모드마다 다르다. 파일이 사라지면 스스로 끝난다 (시험에서 끝내는 길도 이 파일 삭제)
//   session    pokebuddy 가 만든 <세션>-<pid>-<순번>-<종>.pid. pokebuddy 없이 직접 실행했으면 없다
//   window     w-<확장 호스트 pid>-<pid>.pid — 스스로 만든다 (확장은 Electron 만 띄운다). VS Code 명령 "펫 내리기"가 지운다
//   companion  companion.lock — pokebuddy companion 이 만든다. 직접 실행(npm start)이면 스스로 만든다. companion stop 이 지운다
// 끝날 조건
//   session    세션(CLI LLM)이 끝남 · 터미널 셸이 끝남(강제로 닫힌 탭) · pid 파일이 사라짐
//   window     확장 호스트(hostPid)가 끝남 · 창 기록이 사라짐(anchor trackRecord) · pid 파일이 사라짐
//   companion  lock 파일이 사라짐 (companion stop) · 트레이·메뉴의 종료
import fs from "node:fs";
import path from "node:path";
import type { Mode } from "../shared/types";
import { petFile, windowPetFile, type Paths, type RuntimeInfo } from "./paths";

export const LIFETIME_RULES = {
  checkMs: 1000, // 세션·터미널이 끝났는지, pid 파일이 남아 있는지 확인하는 주기 (옛 LIFE_CHECK_MS)
};

export interface LifetimeOptions {
  mode: Mode;
  petFile: string | null;
  hostPid: number | null;
  termPid: () => number | null; // 확장 기록으로 바로잡힐 수 있어 함수로 받는다 (anchor refineTermPid)
  pidAlive: (pid: number) => boolean;
  hasWindow: () => boolean; // 창이 생긴 뒤에만 ready 를 적는다
  quit: () => void;
  pid?: number;
}

export interface Lifetime {
  start(): void; // 주기 확인 + pid 파일 폴더 감시
  stop(): void;
  claim(): boolean; // 창 펫·동반자가 pid 파일을 스스로 만든다. false 면 살아 있는 다른 동반자가 있다 — 끝내야 한다
  owns(): boolean; // pid 파일이 내 것인가 — 동반자 lock 은 새 동반자가 다시 적었을 수 있다
  check(): void; // 창이 생겼으면 ready 를 적고, 파일이 사라졸으면 끝낸다
  release(): void; // will-quit — 내 것일 때만 지운다
}

// 모드별 pid 파일 경로 — 없으면 null (pokebuddy 없이 세션 모드로 직접 실행 등)
export function petFileOf(mode: Mode, runtime: Pick<RuntimeInfo, "hostPid" | "session" | "index">, slug: string, paths: Paths, pid = process.pid): string | null {
  if (mode === "companion") return paths.companionLock;
  if (mode === "window") return runtime.hostPid ? windowPetFile(runtime.hostPid, pid) : null;
  return runtime.session ? petFile(runtime.session, pid, runtime.index, slug) : null;
}

const firstPid = (file: string): number => Number(fs.readFileSync(file, "utf8").split("\n")[0]);

export function createLifetime(opts: LifetimeOptions): Lifetime {
  const { mode, petFile: file, hostPid, termPid, pidAlive, hasWindow, quit } = opts;
  const pid = opts.pid ?? process.pid;
  let seen = false; // 한 번도 못 봤으면 끝내지 않는다 — pokebuddy 가 파일을 못 만든 경우까지 곧바로 끝나지 않게
  let ready = false;
  let timer: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;

  // 창을 만들었으면 ready 를 적어 pokebuddy 가 기다림을 끝내게 하고, 파일이 사라졌으면(pokebuddy stop · 같은 세션에서 다른 펫으로
  // 바꿈) 스스로 끝난다
  function check(): void {
    if (!file) return;
    if (!fs.existsSync(file)) {
      if (seen) quit();
      return;
    }
    seen = true;
    if (ready || !hasWindow()) return;
    let fd: number | null = null;
    try {
      // r+ 는 없는 파일을 만들지 않는다 — 방금 내려진 펫이 파일을 되살리지 않게
      fd = fs.openSync(file, "r+");
      fs.ftruncateSync(fd);
      fs.writeSync(fd, `${pid}\nready\n`);
      ready = true;
    } catch {
      // 방금 지워졌다 — 다음 확인에서 끝난다
    } finally {
      if (fd != null) fs.closeSync(fd);
    }
  }

  function tick(): void {
    const term = termPid();
    if ((hostPid && !pidAlive(hostPid)) || (term && !pidAlive(term))) {
      quit();
      return;
    }
    check();
  }

  return {
    start() {
      tick();
      timer = setInterval(tick, LIFETIME_RULES.checkMs);
      // 내리기는 바로 반응한다 — 같은 펫을 다시 띄울 때 새 펫이 옛 펫이 끝나길 기다린다 (전역 단축키를 넘겨받으려고)
      if (file) {
        try {
          watcher = fs.watch(path.dirname(file), () => check());
        } catch {
          // 감시 실패해도 주기 확인이 받쳐 준다
        }
      }
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      try {
        watcher?.close();
      } catch {
        // 이미 닫혔다
      }
      watcher = null;
    },
    // 동반자 lock 에 살아 있는 다른 pid 가 적혀 있으면 그쪽이 먼저다 — 단일 인스턴스 잠금이 막지 못한 경우의 마지막 방어
    claim() {
      if (!file || mode === "session") return true;
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (mode === "companion" && fs.existsSync(file)) {
          const other = firstPid(file);
          if (other > 0 && other !== pid && pidAlive(other)) return false;
        }
        fs.writeFileSync(file, `${pid}\n`);
        return true;
      } catch {
        return true; // 못 만들면 파일 감시 없이 산다 — 호스트 생존·트레이로만 끝난다
      }
    },
    owns() {
      if (!file) return false;
      if (mode !== "companion") return true;
      try {
        return firstPid(file) === pid;
      } catch {
        return false;
      }
    },
    check,
    // 떠 있는 펫 목록에서 빠진다 — 남겨 두면 status 가 끝난 펫을 센다. 동반자 lock 은 내 pid 일 때만 — 새 동반자가 다시 적은 것을 지우면 그쪽이 끝난다
    release() {
      if (file && this.owns()) fs.rmSync(file, { force: true });
    },
  };
}

// 펫이 못 뜬 이유를 남긴다 — 펫의 출력은 평소 버려지므로 pokebuddy 명령과 pokebuddy status 가 읽을 수 있게. 실패해도 조용히
export function reportFailure(paths: Pick<Paths, "home" | "lastError">, slug: string, message: string): void {
  try {
    fs.mkdirSync(paths.home, { recursive: true });
    fs.writeFileSync(paths.lastError, JSON.stringify({ at: Date.now() / 1000, slug, message }));
  } catch {
    // 기록 실패는 무시
  }
}

// 이 펫이 떴으니 이 펫의 옛 실패 기록은 지운다 — 남겨 두면 status 가 해결된 문제를 계속 보여 준다. 다른 펫의 기록은 건드리지 않는다
export function clearFailure(paths: Pick<Paths, "lastError">, slug: string): void {
  try {
    const e = JSON.parse(fs.readFileSync(paths.lastError, "utf8")) as { slug?: unknown };
    if (e.slug === slug) fs.rmSync(paths.lastError, { force: true });
  } catch {
    // 기록 없음
  }
}
