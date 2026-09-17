// 전역 단축키 — Cmd/Ctrl+Alt+P 고스트 · H 숨김 · Q 종료 · K 항상 보기.
// 시스템에서 배타적이라 펫이 여러 마리면 먼저 잡은 한 마리만 먹는다. 못 잡은 펫은 가끔 다시 잡아 본다 —
// 잡고 있던 펫이 내려지면(pokebuddy stop eevee) 남은 펫이 이어받는다.
// 동반자는 잡지 않는다 — 늘 먼저 떠 있어 세션 펫이 영영 못 잡고, Cmd+Alt+Q 가 동반자를 끄게 된다. 트레이·우클릭으로 대신 (부르는 쪽이 가른다)
import { globalShortcut } from "electron";

export const SHORTCUT_RULES = {
  retryMs: 3000,
};

export interface ShortcutActions {
  ghost(): void; // 클릭 통과 토글
  hidden(): void; // 직접 숨기기·보이기
  quit(): void;
  keep(): void; // 항상 보이기 — 켜면 다른 앱을 봐도 펫이 남는다 (설정에 저장)
}

export interface Shortcuts {
  start(): void;
  stop(): void;
}

export function createShortcuts(act: ShortcutActions, log: ((o: Record<string, unknown>) => void) | null = null): Shortcuts {
  const table: Record<string, () => void> = {
    "CommandOrControl+Alt+P": () => act.ghost(),
    "CommandOrControl+Alt+H": () => act.hidden(),
    "CommandOrControl+Alt+Q": () => act.quit(),
    "CommandOrControl+Alt+K": () => act.keep(),
  };
  let warned = false;
  let retry: NodeJS.Timeout | null = null;

  function bind(): boolean {
    const missed: string[] = [];
    for (const [accel, fn] of Object.entries(table)) {
      if (globalShortcut.isRegistered(accel)) continue; // 이미 이 펫이 잡고 있다
      if (!globalShortcut.register(accel, fn)) missed.push(accel);
    }
    if (missed.length && !warned) {
      warned = true;
      process.stderr.write(`단축키 ${missed.join(", ")} 는 다른 펫이 쓰고 있음 — 그 펫이 끝나면 이어받는다\n`);
    } else if (!missed.length && warned) {
      log?.({ shortcuts: "이어받음" });
    }
    return missed.length === 0;
  }

  return {
    start() {
      if (bind()) return;
      retry = setInterval(() => {
        if (bind() && retry) {
          clearInterval(retry);
          retry = null;
        }
      }, SHORTCUT_RULES.retryMs);
    },
    stop() {
      if (retry) clearInterval(retry);
      retry = null;
      globalShortcut.unregisterAll();
    },
  };
}
