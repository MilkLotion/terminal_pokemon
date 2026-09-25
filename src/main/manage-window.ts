// 관리 창 — 파티·박스·도감·상점·가방을 보는 창. 문서는 src/renderer/manage.html, 값은 스냅샷이 준다.
//
// 폭은 고정이고 세로만 조절한다. 박스 6열과 도감 5열 격자가 640 폭에 맞춰져 있다 (docs/specs/s5.md "관리 창").
// 창을 열 때 흐른 시간을 먼저 적용한다. 그래야 만복도와 쿨타임이 지금 값으로 보인다.
// 창은 하나만 둔다. 다시 열면 이미 떠 있는 창을 앞으로 가져온다.
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type { AgentAction, ManageChannel, ManageReply, ManageRequest, ManageRoute } from "../shared/manage";
import { WINDOW_V3_RULES } from "../save/rules.js";
import { createGame, type GameV3 } from "./game.js";
import { windowIcon } from "./paths.js";

const CH = {
  snapshot: "manage:snapshot",
  command: "manage:command",
  dex: "manage:dex",
  dexDetail: "manage:dex-detail",
  agents: "manage:agents",
  route: "manage:route",
} satisfies Record<string, ManageChannel>;

// 창 조작 단추가 앉는 자리. 색은 헤더와 같아야 이어져 보인다 (`--surface` 와 `--muted`)
const CHROME = { color: "#ffffff", symbolColor: "#4a6663", height: 40 };

export interface ManageOptions {
  preload: string;
  html: string;
  game?: GameV3; // 시험에서 다른 저장을 꽂는다
  // 명령을 보내는 길. 앱은 커맨드 처리기를 준다 — writer 면 실행기로, reader 면 mailbox 로 간다.
  // 없으면 실행기를 바로 부른다 (개발용 실행기)
  send?: (req: ManageRequest) => Promise<ManageReply>;
  route?: ManageRoute; // 열면서 옮겨 갈 곳 — 알림 배너의 `바로가기`
}

let win: BrowserWindow | null = null;
let wired = false;

const isRequest = (v: unknown): v is ManageRequest =>
  v != null && typeof v === "object" && typeof (v as { cmd?: unknown }).cmd === "string";

const isAgentRequest = (v: unknown): v is { name: string; action: AgentAction } => {
  if (v == null || typeof v !== "object") return false;
  const r = v as { name?: unknown; action?: unknown };
  return typeof r.name === "string" && (r.action === "connect" || r.action === "disconnect" || r.action === "check");
};

// 관리 창이 보낸 요청인가. 무대 창·선택 창도 같은 preload 를 쓰므로 보낸 창을 확인한다
const mine = (e: IpcMainInvokeEvent): boolean => !!win && !win.isDestroyed() && e.sender === win.webContents;

const DENIED: ManageReply = { ok: false, reason: "denied" };

// 채널을 한 번만 건다. 창을 여러 번 열어도 처리기는 하나다
function wire(game: GameV3, send: (req: ManageRequest) => Promise<ManageReply>): void {
  if (wired) return;
  wired = true;
  ipcMain.handle(CH.snapshot, (e) => {
    if (!mine(e)) return null;
    game.tick(); // 본 값이 지금 값이 되도록 먼저 시간을 적용한다
    return game.view();
  });
  ipcMain.handle(CH.dex, (e) => (mine(e) ? game.dex() : []));
  ipcMain.handle(CH.dexDetail, (e, slug: unknown) => (mine(e) && typeof slug === "string" ? game.dexDetail(slug) : null));
  ipcMain.handle(CH.agents, (e, req: unknown) => {
    if (!mine(e)) return { ...DENIED, list: [] };
    return game.agents(isAgentRequest(req) ? req : undefined);
  });
  ipcMain.handle(CH.command, async (e, req: unknown): Promise<ManageReply> => {
    if (!mine(e)) return DENIED;
    if (!isRequest(req)) return { ok: false, reason: "bad-request" };
    game.tick();
    return send(req);
  });
}

export function openManage(opts: ManageOptions): BrowserWindow {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    if (opts.route) win.webContents.send(CH.route, opts.route);
    return win;
  }
  const game = opts.game ?? createGame();
  wire(game, opts.send ?? (async (req) => game.send(req, "settings")));
  win = new BrowserWindow({
    width: WINDOW_V3_RULES.width,
    height: WINDOW_V3_RULES.height,
    minWidth: WINDOW_V3_RULES.width,
    maxWidth: WINDOW_V3_RULES.width,
    minHeight: WINDOW_V3_RULES.minHeight,
    title: "pokebuddy",
    icon: windowIcon(),
    // 제목 표시줄을 숨기고 우리 헤더를 그 자리에 둔다. 창 조작 단추는 OS 가 헤더 위에 겹쳐 그린다.
    // 단추를 직접 그리지 않으므로 Windows 의 맞춤 배치와 키보드 조작이 그대로 남는다 (docs/specs/s5.md "화면 구조")
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: CHROME.color,
      symbolColor: CHROME.symbolColor,
      height: CHROME.height,
    },
    webPreferences: { preload: opts.preload },
  });
  win.on("closed", () => {
    win = null;
  });
  const route = opts.route;
  // 문서를 다 읽은 뒤에 보낸다. 렌더러는 첫 화면을 그린 뒤에 옮긴다
  if (route) win.webContents.once("did-finish-load", () => win?.webContents.send(CH.route, route));
  void win.loadFile(opts.html);
  return win;
}

export function closeManage(): void {
  if (win && !win.isDestroyed()) win.close();
  win = null;
}
