// 펫 오버레이 메인 프로세스 — 테두리 없음 · 배경 투명 · 항상 위
// 앵커 앱(VS Code 등) 창을 따라다니고, 그 앱이 앞에 없거나 내 터미널 탭이 아닐 때는 숨는다
// 설정·경로는 전부 config.js 에서 온다
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("./config");
// 판정 로직은 진단 도구(bin/pkmon-status)와 같은 것을 쓴다 — 두 벌이 되면 진단이 거짓말을 한다
const pkstate = require("./lib/state");

const { PATHS } = settings;
// User-Agent 가 없으면 Showdown 이 403 으로 막는다
const GIF_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const GIF_MAX = { w: 480, h: 420 }; // 창이 지나치게 커지지 않도록
const CELL = { w: 192, h: 208 }; // 팩 스프라이트시트의 한 칸
const STATE_POLL_MS = 500;
const ANCHOR_POLL_MS = process.platform === "darwin" ? 400 : 1000;
const STACK_RATIO = 0.8; // 여러 마리를 나란히 둘 때 창 너비 대비 간격
const DRAG_GRACE_MS = 2000; // 이 시간 안에 내 창이 움직였으면 드래그 중으로 본다
const VISIBLE_CONFIRM = 2; // 표시 전환은 이만큼 연속 같은 판정일 때만 — 한 번의 경합이 깜빡임이 되지 않게
const CAPTURE_CONFIRM = 2; // 앵커 창을 확정하기까지 연속 일치 횟수
const ANCHOR_MISS_LIMIT = 8; // 내 창이 이만큼 연속으로 안 보이면 앵커를 풀고 다시 찾는다
const CAPTURE_MIN = { w: 600, h: 400 }; // 분리된 DevTools 같은 보조 창을 앵커로 잡지 않도록
const SCREEN_SLACK = 64; // 화면 경계 판정 여유
const OWN_PID_CHECK_MS = 5000; // 터미널이 죽었는지 확인하는 주기

const config = settings.load();
const { debug, termPid, matchCwd, index, anchorApp, windowsDir } = config.runtime;
let win = null;
let art = null; // { kind: "gif" | "sheet", dataUrl, w, h, scale, from }
let lastState = null;
let lastTarget = null; // 마지막으로 따라간 창의 위치·크기
let anchorId = null; // 확정된 내 창 ID — 정해지면 이 창만 따라간다
let anchorMiss = 0;
let captureId = null; // 확정 직전의 후보
let captureHits = 0;
let commanded = null; // 프로그램이 마지막으로 지시한 좌표 — 여기 그대로 있으면 사용자가 옮긴 게 아니다
let lastUserMoveAt = 0; // 사용자가 내 창을 마지막으로 움직인 시각
let visible = false;
let wantLast = null;
let wantStreak = 0;
let sawExtension = false; // 확장 기록을 한 번이라도 봤으면, 잃었을 때 닫는 쪽으로 간다
let userHidden = false; // Cmd+Alt+H 로 직접 숨김
let helperFails = 0;

// 기동 시 한 번만 구한다 — 래퍼가 먼저 끝나면 부모 관계가 끊긴다
const myPids = pkstate.myPidsFor(termPid);

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

// 훅(pkmon-state.cjs)이 남긴 세션 상태 중 내 터미널 것
const currentState = () => pkstate.sessionState(PATHS.state, myPids, matchCwd);

const readWindowRecords = () => pkstate.readWindowRecords(windowsDir);
const myRecord = (records) => pkstate.myRecord(records, myPids);
const tabAxis = (rec) => pkstate.tabAxis(rec, myPids);

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

// Space 전환 애니메이션 중에는 다른 Space 의 창이 가상 스트립 좌표로 섞여 들어온다
// (보고값 = 실좌표 + Space인덱스 × (디스플레이폭 + 64)). 좌표도 순서도 믿을 수 없으므로 표본을 통째로 버린다
function offScreen(windows) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of screen.getAllDisplays()) {
    minX = Math.min(minX, d.bounds.x);
    minY = Math.min(minY, d.bounds.y);
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
  }
  if (!Number.isFinite(minX)) return false;
  return windows.some(
    (w) =>
      w.x < minX - SCREEN_SLACK ||
      w.y < minY - SCREEN_SLACK ||
      w.x + w.w > maxX + SCREEN_SLACK ||
      w.y + w.h > maxY + SCREEN_SLACK,
  );
}

// 표시 전환은 같은 판정이 연속으로 나올 때만 반영한다
function applyVisible(want) {
  if (want === wantLast) wantStreak += 1;
  else {
    wantLast = want;
    wantStreak = 1;
  }
  if (wantStreak < VISIBLE_CONFIRM) return;
  visible = want;
  setVisible(want);
}

function pollAnchor() {
  if (!win) return;
  const helper = helperCommand();
  if (!helper) {
    // 창을 추적할 수단이 없다 — 탭 축만으로 정한다
    const rec = myRecord(readWindowRecords());
    const tab = tabAxis(rec);
    if (rec) sawExtension = true;
    let want = tab === null ? !sawExtension : tab && rec.focused === true;
    if (config.keepVisible) want = true;
    if (userHidden) want = false;
    applyVisible(want);
    return;
  }

  execFile(helper.cmd, helper.args, { timeout: 2000 }, (err, stdout) => {
    if (!win) return;
    if (err) {
      // 헬퍼가 계속 실패하면 안전한 쪽으로 — 아무 앱 위에나 영영 떠 있는 것을 막는다
      helperFails += 1;
      if (helperFails === 3) process.stderr.write("창 추적 헬퍼가 응답하지 않음 — 펫을 숨긴다\n");
      if (helperFails >= 3) applyVisible(false);
      return;
    }
    helperFails = 0;

    let info;
    try {
      info = JSON.parse(stdout);
    } catch {
      return;
    }
    const windows = (info.windows || []).filter((w) => w && typeof w.id === "number");
    if (offScreen(windows)) return; // Space 전환 중

    const records = readWindowRecords();
    const rec = myRecord(records);
    if (rec) sawExtension = true;
    const tab = tabAxis(rec);

    // ── 앵커 — 한 번 확정하면 그 창 ID 만 따라간다
    let target = null;
    if (anchorId != null) {
      target = windows.find((w) => w.id === anchorId) || null;
      if (target) anchorMiss = 0;
      else if ((anchorMiss += 1) >= ANCHOR_MISS_LIMIT) {
        anchorId = null; // 창이 닫혔거나 오래 안 보임 — 다시 찾는다
        anchorMiss = 0;
      }
    }
    if (anchorId == null) {
      const head = windows[0] || null;
      // 내 창이 지금 포커스이고 내 탭이 활성인 순간에만 확정한다 — 그때 맨 앞 창은 반드시 내 창이다
      const sure =
        !!head &&
        tab === true &&
        rec.focused === true &&
        head.w >= CAPTURE_MIN.w &&
        head.h >= CAPTURE_MIN.h &&
        !records.some((r) => r !== rec && r.focused === true);
      if (sure && head.id === captureId) {
        if ((captureHits += 1) >= CAPTURE_CONFIRM) {
          anchorId = head.id;
          captureHits = 0;
        }
      } else {
        captureId = sure ? head.id : null;
        captureHits = sure ? 1 : 0;
      }
      target = head; // 확정 전에는 맨 앞 창을 임시로 따라간다
    }

    // ── 창 축 — 내 창이 이 앱 창들 중 맨 앞인가
    // 목록은 앵커 앱으로 걸러져 있으므로, 크롬을 보고 있어도 이 앱 창들끼리의 순서는 그대로다
    const front = !!(target && windows[0] && windows[0].id === target.id);

    let want;
    if (tab === null) {
      // 확장 기록이 없다. 한 번이라도 본 적 있으면 잃은 것이므로 닫는 쪽으로 간다
      want = sawExtension ? false : front;
    } else if (anchorId == null) {
      // 아직 내 창을 특정하지 못했다 — 확장이 알려주는 포커스로 판단한다
      want = tab && rec.focused === true;
    } else {
      want = tab && front;
    }
    if (config.keepVisible) want = true;
    if (userHidden) want = false;
    // 펫을 잡으면 IDE 가 뒤로 간다 — 드래그 중에는 판정을 보류하고 직전 상태를 유지한다
    const dragging = Date.now() - lastUserMoveAt < DRAG_GRACE_MS;
    if (dragging) want = visible;

    if (target && !dragging) {
      lastTarget = target;
      const { w, h } = windowSize();
      const { x, y } = clampToWindow(
        target.x + target.w - w + config.window.dx - stackShift(),
        target.y + target.h - h + config.window.dy,
        w,
        h,
        target,
      );
      const [curX, curY] = win.getPosition();
      if (curX !== x || curY !== y) {
        commanded = { x, y };
        win.setPosition(x, y);
      }
    }

    applyVisible(want);

    if (debug) {
      console.log(
        JSON.stringify({
          want,
          visible,
          tab,
          front,
          anchorId,
          target: target ? target.id : null,
          head: windows[0] ? windows[0].id : null,
          state: currentState(),
        }),
      );
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
  // 첫 인자 false — Space(데스크탑) 를 전환해도 펫이 따라오지 않고 자기 창이 있는 Space 에 남는다
  // visibleOnFullScreen 은 별개 속성이라 풀스크린 창 위 표시는 그대로 유지된다
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
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

  // 드래그 판정 — 시간이 아니라 좌표로 가린다.
  // move 이벤트는 비동기라 언제 올지 모른다. 지금 자리가 우리가 지시한 그 자리면 사용자가 옮긴 게 아니다.
  const movedByUs = () => {
    const [cx, cy] = win.getPosition();
    return !!commanded && cx === commanded.x && cy === commanded.y;
  };

  win.on("move", () => {
    if (!movedByUs()) lastUserMoveAt = Date.now();
  });

  win.on("moved", () => {
    if (movedByUs()) return;
    lastUserMoveAt = Date.now();
    // 숨어 있을 때 옛 좌표를 기준으로 오프셋을 저장하면 그 값이 영구히 어긋난다
    if (!lastTarget || !visible) return;

    const [rawX, rawY] = win.getPosition();
    const { w, h } = windowSize();
    // 창 밖으로 끌었으면 경계 안으로 되돌린다
    const { x, y } = clampToWindow(rawX, rawY, w, h, lastTarget);
    if (x !== rawX || y !== rawY) {
      commanded = { x, y };
      win.setPosition(x, y);
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

  // 전역 단축키는 시스템에서 배타적이다 — 펫이 여러 마리면 먼저 등록한 한 마리만 먹는다
  const bind = (accel, fn) => {
    if (!globalShortcut.register(accel, fn)) {
      process.stderr.write(`단축키 ${accel} 는 다른 펫이 이미 쓰고 있음 — 이 펫에는 안 먹는다\n`);
    }
  };
  bind("CommandOrControl+Alt+P", () => applyClickThrough(!config.clickThrough));
  bind("CommandOrControl+Alt+H", () => {
    userHidden = !userHidden; // 폴링이 되돌리지 않도록 상태로 남긴다
    pollAnchor();
  });
  bind("CommandOrControl+Alt+Q", () => app.quit());
  // 항상 보이기 — 켜면 크롬 등 다른 앱을 봐도 펫이 남는다 (설정에 저장됨)
  bind("CommandOrControl+Alt+K", () => {
    settings.save(config, { keepVisible: !config.keepVisible });
    pollAnchor();
  });

  // 터미널이 강제 종료되면 래퍼의 정리 코드가 돌지 않는다 — 고아로 남지 않게 스스로 끝낸다
  if (termPid) {
    setInterval(() => {
      if (!pkstate.pidAlive(termPid)) app.quit();
    }, OWN_PID_CHECK_MS);
  }

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
