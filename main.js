// 펫 오버레이 메인 프로세스 — 테두리 없음 · 배경 투명 · 항상 위
// 앵커 앱(VS Code 등) 창을 따라다니고, 그 앱이 앞에 없거나 내 터미널 탭이 아닐 때는 숨는다
// 설정·경로는 전부 config.js 에서 온다
const { app, BrowserWindow, globalShortcut, ipcMain } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("./config");

const { PATHS } = settings;
// User-Agent 가 없으면 Showdown 이 403 으로 막는다
const GIF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const GIF_MAX = { w: 480, h: 420 }; // 창이 지나치게 커지지 않도록
const CELL = { w: 192, h: 208 }; // 팩 스프라이트시트의 한 칸
const STATE_POLL_MS = 500;
const ANCHOR_POLL_MS = process.platform === "darwin" ? 400 : 1000;
const STALE_SEC = 600; // 작업 중·기다림이 이만큼 갱신 없으면 대기로 — Esc 중단 시 Stop 훅이 안 옴
const ACTIVE_STALE_SEC = 120; // 활성 터미널 기록이 이만큼 멈춰 있으면 확장이 없는 것으로 본다
const STACK_RATIO = 0.8; // 여러 마리를 나란히 둘 때 창 너비 대비 간격
const DRAG_GRACE_MS = 2000; // 이 시간 안에 내 창이 움직였으면 드래그 중으로 본다
// 펫 창이 맨 앞일 때 쓰이는 이름 — 단, 내 창이 방금 움직였을 때만 예외를 적용한다
const SELF_APP_NAMES = new Set(["Electron", "terminal_pkmon"]);

const config = settings.load();
const { debug, termPid, matchCwd, index, anchorApp, activeTerminalFile } = config.runtime;
let win = null;
let art = null; // { kind: "gif" | "sheet", dataUrl, w, h, scale, from }
let lastState = null;
let lastTarget = null; // 마지막으로 찾은 앵커 창 위치
let anchoring = false; // 프로그램이 옮기는 중 — 사용자의 드래그와 구분
let lastUserMoveAt = 0; // 사용자가 내 창을 마지막으로 움직인 시각

function windowSize() {
  if (art && art.kind === "gif") {
    return { w: Math.round(art.w * art.scale), h: Math.round(art.h * art.scale) };
  }
  return { w: Math.round(CELL.w * config.scale), h: Math.round(CELL.h * config.scale) };
}

function stackShift() {
  return Math.round(windowSize().w * STACK_RATIO) * index;
}

// 원본 GIF 주소 — 3D 는 Showdown 애니메이션 세트, 2D 는 같은 사이트의 5세대 세트(폼까지 이름으로 구분된다)
function gifUrls(slug) {
  const base = slug.replace(/-3d$/, "");
  if (/-3d$/.test(slug)) return [`https://play.pokemonshowdown.com/sprites/ani/${base}.gif`];
  return [
    `https://play.pokemonshowdown.com/sprites/gen5ani/${slug}.gif`,
    `https://play.pokemonshowdown.com/sprites/ani/${slug}.gif`,
  ];
}

// GIF 헤더에서 크기만 읽는다 (7~10번째 바이트)
function gifSize(buf) {
  if (buf.length < 10 || buf.toString("ascii", 0, 3) !== "GIF") return null;
  const w = buf.readUInt16LE(6);
  const h = buf.readUInt16LE(8);
  return w && h ? { w, h } : null;
}

async function loadGif(slug) {
  const cached = path.join(PATHS.gifs, `${slug}.gif`);
  try {
    if (fs.existsSync(cached)) {
      const buf = fs.readFileSync(cached);
      const size = gifSize(buf);
      if (size) return { buf, size, from: cached };
    }
  } catch {
    // 캐시가 깨졌으면 새로 받는다
  }

  for (const url of gifUrls(slug)) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": GIF_UA } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const size = gifSize(buf);
      if (!size) continue;
      fs.mkdirSync(PATHS.gifs, { recursive: true });
      fs.writeFileSync(cached, buf);
      return { buf, size, from: url };
    } catch {
      // 네트워크 실패·차단 — 다음 후보나 스프라이트시트로 넘어간다
    }
  }
  return null;
}

// 표시할 그림 — 원본 GIF 가 있으면 그것, 없으면 팩의 스프라이트시트
async function loadArt() {
  if (config.useGif !== "off") {
    const gif = await loadGif(config.slug);
    if (gif) {
      // 도트가 1px 인 원본을 정수배로 확대 — 배율이 깨지면 도트가 고르지 않다
      const target = Math.max(1, config.dotSize || 1);
      const scale = Math.max(
        1,
        Math.min(target, Math.floor(GIF_MAX.w / gif.size.w), Math.floor(GIF_MAX.h / gif.size.h)),
      );
      return {
        kind: "gif",
        dataUrl: `data:image/gif;base64,${gif.buf.toString("base64")}`,
        w: gif.size.w,
        h: gif.size.h,
        scale,
        from: gif.from,
      };
    }
  }

  const file = settings.spritePath(config);
  try {
    const data = fs.readFileSync(file);
    return {
      kind: "sheet",
      dataUrl: `data:image/webp;base64,${data.toString("base64")}`,
      w: CELL.w,
      h: CELL.h,
      scale: config.scale,
      from: file,
    };
  } catch {
    // GIF 도 스프라이트시트도 못 구한 경우 — 창 없이 프로세스만 남지 않게 여기서 끝낸다
    return null;
  }
}

// 이 상태 기록이 내 터미널의 세션 것인지
// 1순위: 훅이 남긴 조상 프로세스 목록에 내 터미널 셸 번호가 있는가 (터미널 단위로 정확)
// 2순위: 작업 디렉토리 (조상 정보가 없는 Windows·구버전 기록용)
function stateIsMine(record) {
  if (termPid && Array.isArray(record.ancestors) && record.ancestors.length) {
    return record.ancestors.includes(termPid);
  }
  if (matchCwd && record.cwd) return record.cwd === matchCwd;
  return true;
}

// 훅(pkmon-state.cjs)이 남긴 세션 상태 파일 중 내 터미널 것
function currentState() {
  try {
    const files = fs
      .readdirSync(PATHS.state)
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(PATHS.state, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    for (const file of files) {
      const record = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!stateIsMine(record)) continue;

      const age = Date.now() / 1000 - (record.at || 0);
      let state = record.state || "idle";
      if (record.hold != null && age >= record.hold) state = record.then || "idle";
      if ((state === "running" || state === "waiting") && age > STALE_SEC) return "idle";
      return state;
    }
    return "idle";
  } catch {
    return "idle";
  }
}

// 지금 보고 있는 터미널 탭이 내 탭인지 — 확장(pkmon-active-terminal)이 알려준다
// "mine"(내 탭) · "other"(다른 탭) · "unknown"(확장이 없거나 기록이 멈춤)
function terminalTab() {
  if (!termPid) return "unknown"; // 터미널 번호를 모름 (래퍼 없이 실행)

  // 기본은 새 경로. 경로를 직접 지정했으면(테스트) 그 파일만 쓴다
  const readRecord = (file) => {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return null;
    }
  };
  const fresh = (rec) => rec && Date.now() / 1000 - (rec.at || 0) <= ACTIVE_STALE_SEC;

  let record = readRecord(activeTerminalFile);
  // 확장을 새로 불러오기 전에는 구버전이 옛 경로에 적는다 — 새 경로가 비었거나 멈췄을 때만 본다
  if (!process.env.PKMON_ACTIVE_FILE && !fresh(record)) {
    record = readRecord(PATHS.activeTerminalLegacy) || record;
  }

  if (!record) return "unknown"; // 확장 미설치
  // 기록이 오래 멈춰 있으면 확장이 없는 것으로 본다 — 안 그러면 모든 펫이 영영 숨는다
  if (Date.now() / 1000 - (record.at || 0) > ACTIVE_STALE_SEC) return "unknown";
  if (record.pid == null) return "unknown"; // 활성 터미널 없음
  if (Number(record.pid) === termPid) return "mine";
  // 창이 여러 개면 각 창의 확장이 같은 파일에 쓴다 — 내 터미널이 없는 기록은 남의 창 것이다
  if (Array.isArray(record.terminals) && !record.terminals.includes(termPid)) return "other-window";
  return "other";
}

// 앵커 앱의 창 위치를 읽는 헬퍼 — mac 은 컴파일된 Swift, Windows 는 PowerShell
// PKMON_WINBOUNDS 로 다른 실행 파일을 가리킬 수 있다 (테스트가 실제 헬퍼를 건드리지 않도록)
function helperCommand() {
  if (!anchorApp) return null;
  const override = process.env.PKMON_WINBOUNDS;
  if (override) return fs.existsSync(override) ? { cmd: override, args: [anchorApp] } : null;
  if (process.platform === "darwin") {
    const bin = path.join(PATHS.project, "helpers", "winbounds");
    return fs.existsSync(bin) ? { cmd: bin, args: [anchorApp] } : null;
  }
  if (process.platform === "win32") {
    const ps1 = path.join(PATHS.project, "helpers", "winbounds.ps1");
    return fs.existsSync(ps1)
      ? { cmd: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, anchorApp] }
      : null;
  }
  return null;
}

// 펫이 따라가는 창 밖으로 나가지 않도록 위치를 가둔다 (창보다 펫이 크면 좌상단에 맞춘다)
// pos=free 면 가두지 않는다
function clampToWindow(x, y, w, h, target) {
  if (config.pos === "free") return { x: Math.round(x), y: Math.round(y) };
  const maxX = Math.max(target.x, target.x + target.w - w);
  const maxY = Math.max(target.y, target.y + target.h - h);
  return {
    x: Math.round(Math.min(Math.max(x, target.x), maxX)),
    y: Math.round(Math.min(Math.max(y, target.y), maxY)),
  };
}

function setVisible(visible) {
  if (!win) return;
  if (visible && !win.isVisible()) {
    win.showInactive(); // 포커스를 빼앗지 않고 표시
    win.webContents.invalidate(); // 숨어 있는 동안 멈춘 화면 갱신을 되살림
  }
  if (!visible && win.isVisible()) win.hide();
}

// 표시 여부 — 탭 정보가 살아 있으면 그것만으로 정한다
// 내 탭이면 크롬 등 다른 앱을 보고 있어도 남고, 다른 탭으로 옮기면 숨는다
// 탭 정보가 없을 때(확장 미설치 등)만 앱 기준으로 넘어간다
function shouldShow(frontmost) {
  const tab = terminalTab();
  if (tab === "mine") return true;
  if (tab === "other") return false;
  // 다른 VS Code 창의 기록 — 내 창과 무관하므로 그대로 둔다 (창을 오갈 때 펫이 꺼지지 않게)
  if (tab === "other-window") return true;
  if (!frontmost) return true;
  return config.keepVisible || frontmost === anchorApp || SELF_APP_NAMES.has(frontmost);
}

function pollAnchor() {
  const helper = helperCommand();
  if (!win) return;
  if (!helper) {
    setVisible(shouldShow(null));
    return;
  }

  execFile(helper.cmd, helper.args, { timeout: 2000 }, (err, stdout) => {
    if (err || !win) return;
    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      return;
    }

    // 펫 창이 맨 앞 = 사용자가 펫을 만지는 중. 이때도 앵커 앱이 뒤로 갔다고 보지 않는다.
    // 어느 터미널의 펫인지는 활성 터미널 기록으로만 가리므로, 다른 터미널 펫은 그대로 숨어 있다.
    const selfFront = SELF_APP_NAMES.has(info.frontmost);
    // 내 창이 방금 움직였으면 = 내가 끌리는 중. 이때는 자리를 되돌리지 않는다
    const beingDragged = selfFront && Date.now() - lastUserMoveAt < DRAG_GRACE_MS;
    // 내 창을 계속 따라간다 — 맨 앞 창이 아니라, 지난번에 따라가던 창과 가장 가까운 창을 고른다
    // (창이 여러 개일 때 다른 창을 보더라도 펫이 그쪽으로 끌려가지 않는다)
    const windows = info.windows || [];
    const distance = (w) =>
      Math.abs(w.x - lastTarget.x) + Math.abs(w.y - lastTarget.y) + Math.abs(w.w - lastTarget.w) + Math.abs(w.h - lastTarget.h);
    const target = lastTarget
      ? windows.reduce((best, w) => (!best || distance(w) < distance(best) ? w : best), null)
      : windows[0];
    const visible = shouldShow(info.frontmost);

    if (!target || !visible) {
      setVisible(false);
      if (debug) {
        console.log(JSON.stringify({ hidden: true, tab: terminalTab(), beingDragged, frontmost: info.frontmost }));
      }
      return;
    }

    setVisible(true);
    if (beingDragged) {
      if (debug) console.log(JSON.stringify({ dragging: true, frontmost: info.frontmost }));
      return;
    }
    lastTarget = target;

    const { w, h } = windowSize();
    const spot = clampToWindow(
      target.x + target.w - w + config.window.dx - stackShift(),
      target.y + target.h - h + config.window.dy,
      w,
      h,
      target,
    );
    const { x, y } = spot;
    anchoring = true;
    win.setPosition(x, y);
    anchoring = false;
    if (debug) {
      console.log(JSON.stringify({ anchor: { x, y, w, h }, target, frontmost: info.frontmost, state: currentState() }));
    }
  });
}

function applyClickThrough(on) {
  settings.save(config, { clickThrough: on });
  win.setIgnoreMouseEvents(on, { forward: true });
  win.webContents.send("click-through", on);
}

function createWindow() {
  const { w: width, h: height } = windowSize();
  win = new BrowserWindow({
    width,
    height,
    show: false, // 첫 배치 전 깜빡임 방지
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    focusable: false, // 클릭해도 터미널 포커스를 뺏지 않음
    webPreferences: {
      preload: path.join(PATHS.project, "preload.js"),
      // 창이 숨겨졌다 다시 보일 때 애니메이션 타이머가 멈추지 않게 함
      backgroundThrottling: false,
    },
  });

  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile("index.html", {
    query: {
      fps: String(config.fps),
      debug: debug ? "1" : "",
      motionAssist: String(config.motionAssist),
      dotSize: String(config.dotSize),
      // 3D 세트는 올리는 동작만 담겨 있어 앞으로만 돌리면 끊겨 보인다 — 수치 판정에 맡기지 않고 확정
      pingPong: config.pingPong === "auto" && /-3d$/.test(config.slug) ? "on" : String(config.pingPong),
    },
  });

  if (debug) {
    win.webContents.on("console-message", (_e, _level, message) => console.log(`[renderer] ${message}`));
    console.log(JSON.stringify({ 그림: art.kind, 크기: `${art.w}x${art.h}`, 배율: art.scale, 출처: art.from }));
  }

  win.webContents.on("did-finish-load", () => {
    applyClickThrough(config.clickThrough);
    win.webContents.send("state", currentState());
    pollAnchor();
  });

  // 드래그 판정용 — 내 창이 사용자 손에 움직이는 동안 계속 갱신된다
  win.on("move", () => {
    if (!anchoring) lastUserMoveAt = Date.now();
  });

  win.on("moved", () => {
    if (anchoring) return;
    lastUserMoveAt = Date.now();
    if (!lastTarget) return;

    const [rawX, rawY] = win.getPosition();
    const { w, h } = windowSize();
    // 창 밖으로 끌었으면 경계 안으로 되돌린다
    const { x, y } = clampToWindow(rawX, rawY, w, h, lastTarget);
    if (x !== rawX || y !== rawY) {
      anchoring = true;
      win.setPosition(x, y);
      anchoring = false;
    }

    // 창 위치는 따라가는 창의 오른쪽 아래 모서리 기준 오프셋으로 기억한다
    settings.save(config, {
      window: {
        dx: x - (lastTarget.x + lastTarget.w - w) + stackShift(),
        dy: y - (lastTarget.y + lastTarget.h - h),
      },
    });
  });
}

ipcMain.handle("art", () => art);

app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.hide();
  art = await loadArt();
  if (!art) {
    // 원본 GIF 도 스프라이트시트도 없음 — 대개 없는 펫 이름이다
    process.stderr.write(`펫 그림을 찾을 수 없음: ${config.slug}\n  스프라이트시트: ${settings.spritePath(config)}\n`);
    app.quit();
    return;
  }
  createWindow();

  globalShortcut.register("CommandOrControl+Alt+P", () => applyClickThrough(!config.clickThrough));
  globalShortcut.register("CommandOrControl+Alt+H", () => (win.isVisible() ? win.hide() : win.showInactive()));
  globalShortcut.register("CommandOrControl+Alt+Q", () => app.quit());
  // 항상 보이기 — 켜면 크롬 등 다른 앱을 봐도 펫이 남는다 (설정에 저장됨)
  globalShortcut.register("CommandOrControl+Alt+K", () => {
    settings.save(config, { keepVisible: !config.keepVisible });
    pollAnchor();
  });

  setInterval(() => {
    const state = currentState();
    if (state !== lastState) {
      lastState = state;
      win?.webContents.send("state", state);
    }
  }, STATE_POLL_MS);

  setInterval(pollAnchor, ANCHOR_POLL_MS);
});

// pkmon 래퍼가 명령 종료 후 보내는 신호 — 펫도 같이 종료
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());

app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => app.quit());
