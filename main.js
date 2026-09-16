// 펫 오버레이 메인 프로세스 — 테두리 없음 · 배경 투명 · 항상 위
// 앵커 앱(VS Code 등) 창을 따라다니고, 그 앱이 앞에 없거나 내 터미널 탭이 아닐 때는 숨는다
// 설정·경로는 전부 config.js 에서 온다
const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require("electron");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const settings = require("./config");
// 판정 로직은 진단 도구(bin/pkmon-status)와 같은 것을 쓴다 — 두 벌이 되면 진단이 거짓말을 한다
const pkstate = require("./lib/state");
// 그림 소스는 art/ 한 곳에서 고른다 — showdown·sheet·pmd 가 서로를 모르게 분리돼 있다
const { loadArt } = require("./art");
// buddy — 산책·수면·만지기 반응. PMD 에서만 켜진다 (판단은 buddy/brain.js, 붙이는 층은 buddy/body.js)
const { createBuddy } = require("./buddy/body.js");
// Windows 창 추적 헬퍼를 띄워 두고 한 줄씩 묻는다
const { createLineHelper } = require("./lib/line-helper.js");

const { PATHS } = settings;
const { CELL } = require("./art/sheet.js"); // 팩 스프라이트시트의 한 칸 — 정의는 그쪽에 있다
const STATE_POLL_MS = 500;
// Windows 도 헬퍼를 띄워 두고 묻기 때문에(한 번 1ms 안쪽) mac 과 같은 간격으로 창을 따라간다
const ANCHOR_POLL_MS = 400;
const HELPER_TIMEOUT_MS = 2000;
// Windows 헬퍼의 첫 답 — PowerShell 기동과 C# 컴파일이 끼어 느린 컴퓨터·백신 검사 중에는 수 초 걸린다
const HELPER_START_TIMEOUT_MS = 20000;
// 창 주인을 조상에서 못 찾았을 때 프로세스 표를 다시 읽는 간격 — Windows 는 한 번에 수백 ms 동안 메인을 멈춘다
const OWNER_DEEP_RETRY_MS = 10000;
const STACK_RATIO = 0.8; // 여러 마리를 나란히 둘 때 창 너비 대비 간격
const DRAG_GRACE_MS = 2000; // 이 시간 안에 내 창이 움직였으면 드래그 중으로 본다
const VISIBLE_CONFIRM = 2; // 표시 전환은 이만큼 연속 같은 판정일 때만 — 한 번의 경합이 깜빡임이 되지 않게
const CAPTURE_CONFIRM = 2; // 앵커 창을 확정하기까지 연속 일치 횟수
const ANCHOR_MISS_LIMIT = 8; // 내 창이 이만큼 연속으로 안 보이면 앵커를 풀고 다시 찾는다
const CAPTURE_MIN = { w: 400, h: 250 }; // 분리된 DevTools 같은 보조 창을 앵커로 잡지 않도록
const OWN_PID_CHECK_MS = 5000; // 터미널이 죽었는지 확인하는 주기
// 지시한 좌표에서 이만큼 안쪽이면 우리가 옮긴 것으로 본다.
// Windows 배율(125%·150%)에서는 논리 좌표 ↔ 물리 픽셀 반올림으로 1~2px 어긋난 채 돌아온다.
// 정확히 같을 때만 인정하면 그 어긋남이 "사용자가 끌었다"가 되고, 2초 동안 창 추적이 멈춘다
const MOVE_TOLERANCE_PX = 3;

// Electron 캐시·세션 폴더를 펫 데이터 아래로 — 기본값(~/Library/Application Support/<패키지 이름>)은
// 패키지 이름이 바뀌면 옛 폴더가 버려지고, uninstall --purge 로도 안 지워진다. ready 전에 정해야 한다
app.setPath("userData", PATHS.electronData);
// 디스크 캐시를 끈다 — 펫은 로컬 파일과 data URL 만 그려 캐시가 필요 없고, 여러 마리가 같은 폴더의
// 캐시 파일을 동시에 잡으면 Chromium 이 "Failed to open …/GPUCache" 오류를 줄줄이 남긴다
app.commandLine.appendSwitch("disable-http-cache");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");

const config = settings.load();
const { debug, matchCwd, index, anchorApp, windowsDir } = config.runtime;
let { termPid } = config.runtime; // pkmon 이 넘긴 첫 추정 — 확장 기록으로 바로잡을 수 있다 (refineTermPid)
let win = null;
let art = null; // gif·sheet: { kind, dataUrl, w, h, scale, from } / pmd: { kind, cell, zoom, anims, clips, credits, dex, from }
let lastState = null;
let lastTarget = null; // 마지막으로 따라간 창의 위치·크기
let anchorId = null; // 확정된 내 창 ID — 정해지면 이 창만 따라간다
let anchorMiss = 0;
let captureId = null; // 확정 직전의 후보
let captureHits = 0;
let commanded = null; // 프로그램이 마지막으로 지시한 좌표 — 여기 그대로 있으면 사용자가 옮긴 게 아니다
let lastUserMoveAt = 0; // 사용자가 내 창을 마지막으로 움직인 시각
let driftMax = 0; // 디버그 — setPosition 직후 실제 자리와 지시 자리의 최대 편차. MOVE_TOLERANCE_PX 를 넘으면 허용 오차가 모자란다
// 산책 오프셋 — 집(저장된 dx·dy 자리)에서 얼마나 떨어져 있나. buddy 가 없으면 늘 0
let roam = { x: 0, y: 0 };
let buddy = null; // PMD + buddy≠off 일 때만 생긴다
let held = false; // 포인터로 펫을 들고 있는 중 (buddy 의 직접 드래그)
let movingSelf = false; // moveSelf 가 setPosition 을 부르는 중 — mac 은 move 이벤트가 그 안에서 동기로 온다
let droppedAt = 0; // 포인터로 들고 있던 펫을 놓은 시각
const DROP_SETTLE_MS = 500; // 놓은 직후 늦게 도착한 move 이벤트를 새 드래그로 치지 않는 시간
let visible = false;
let wantLast = null;
let wantStreak = 0;
let sawExtension = false; // 확장 기록을 한 번이라도 봤으면, 잃었을 때 닫는 쪽으로 간다
let userHidden = false; // Cmd+Alt+H 로 직접 숨김
let helperFails = 0;
let frontIsMine = false; // 내 창이 화면 맨 앞인가
let level = null; // 지금 창 레벨 — "float" | "normal"
let ownerPid = null; // 내 터미널을 띄운 프로그램의 프로세스 번호 (한 번 찾으면 재사용)
let ownerDeepAt = 0; // 프로세스 표로 창 주인을 마지막으로 찾아본 시각
let servedHelper = null; // Windows 창 추적 헬퍼 (띄워 두고 한 줄씩 묻는다)

// 기동 시 한 번만 구한다 — 래퍼가 먼저 끝나면 부모 관계가 끊긴다
const ancestors = pkstate.ancestorPids(); // 창 주인을 찾는 데 쓴다 (체인 전체)
let myPids = pkstate.pidsUpTo(ancestors, termPid); // 터미널 셸까지만 (탭·상태 판정용)
let termRefined = false;

// 터미널 셸을 확장 기록으로 한 번 바로잡는다 (판정은 lib/state — 진단 도구와 같은 규칙)
function refineTermPid(records) {
  if (termRefined || !records.length) return;
  const found = pkstate.terminalFromRecords(ancestors, records);
  if (found == null) return; // 이 창의 터미널이 아니거나 기록이 아직 없다 — 다음 기록에서 다시 본다
  termRefined = true;
  if (found === termPid) return;
  if (debug) console.log(JSON.stringify({ termPid: { from: termPid, to: found } }));
  termPid = found;
  myPids = pkstate.pidsUpTo(ancestors, termPid);
}

function windowSize() {
  // art 는 창을 만들기 전에 한 번 정해지고 그 뒤 바뀌지 않는다 — 그래서 이 값은 상수다.
  // 동작마다 크기를 바꾸면 stackShift·clampToWindow·commanded 가 줄줄이 어긋난다
  if (art && art.kind === "pmd") {
    return { w: art.cell.w * art.zoom, h: art.cell.h * art.zoom };
  }
  if (art && art.kind === "gif") {
    return { w: Math.round(art.w * art.scale), h: Math.round(art.h * art.scale) };
  }
  return { w: Math.round(CELL.w * config.scale), h: Math.round(CELL.h * config.scale) };
}

function stackShift() {
  return Math.round(windowSize().w * STACK_RATIO) * index;
}

// 훅(pkmon-state.cjs)이 남긴 세션 상태 중 내 터미널 것
const currentInfo = () => pkstate.sessionInfo(PATHS.state, myPids, matchCwd);
const currentState = () => currentInfo().state;

const readWindowRecords = () => pkstate.readWindowRecords(windowsDir);
const myRecord = (records) => pkstate.myRecord(records, myPids);
const tabAxis = (rec) => pkstate.tabAxis(rec, myPids);

// 앵커 앱의 창 위치를 읽는 헬퍼 — mac 은 컴파일된 Swift, Windows 는 PowerShell
// PKMON_WINBOUNDS 로 다른 실행 파일을 가리킬 수 있다 (테스트가 실제 헬퍼를 건드리지 않도록)
// serve 면 한 번 띄워 두고 한 줄씩 묻는다 (lib/line-helper.js)
function helperCommand() {
  // 앱 이름을 몰라도 된다 — 목록은 전체로 받고, 내 창은 프로세스 조상으로 가린다
  const args = anchorApp ? [anchorApp] : [];
  const override = process.env.PKMON_WINBOUNDS;
  if (override) return fs.existsSync(override) ? { cmd: override, args } : null;
  if (process.platform === "darwin") {
    const bin = path.join(PATHS.project, "helpers", "winbounds");
    return fs.existsSync(bin) ? { cmd: bin, args } : null;
  }
  if (process.platform === "win32") {
    const ps1 = path.join(PATHS.project, "helpers", "winbounds.ps1");
    return fs.existsSync(ps1)
      ? { cmd: "powershell", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1, "-Serve", ...args], serve: true }
      : null;
  }
  return null;
}

// 헬퍼에게 창 목록을 한 번 묻는다 — cb(err, stdout)
function queryHelper(helper, cb) {
  if (!helper.serve) {
    execFile(helper.cmd, helper.args, { timeout: HELPER_TIMEOUT_MS, windowsHide: true }, (err, stdout) => cb(err, stdout));
    return;
  }
  if (!servedHelper) {
    servedHelper = createLineHelper(helper.cmd, helper.args, {
      timeoutMs: HELPER_TIMEOUT_MS,
      startTimeoutMs: HELPER_START_TIMEOUT_MS,
    });
  }
  servedHelper.query(cb);
}

// 헬퍼 좌표 → Electron 창 좌표. Windows 헬퍼는 물리 픽셀을 주고 Electron 은 DIP 를 쓴다.
// 배율 125%·150% 에서 그대로 쓰면 펫이 따라갈 창의 오른쪽 아래가 아니라 화면 밖에 놓인다.
// 모니터마다 배율이 달라도 맞게 변환은 Electron(OS)에 맡긴다. mac 헬퍼는 이미 포인트 단위다
function toDip(w) {
  if (process.platform !== "win32") return w;
  const r = screen.screenToDipRect(null, { x: w.x, y: w.y, width: w.w, height: w.h });
  return { ...w, x: r.x, y: r.y, w: r.width, h: r.height };
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
  if (!visible && win.isVisible()) {
    releaseHeld(); // 숨으면 pointerup 이 오지 않는다
    win.hide();
  }
}

// Space 전환 애니메이션 중에는 다른 Space 의 창이 가상 스트립 좌표로 섞여 들어온다
// (보고값 = 실좌표 + Space인덱스 × (디스플레이폭 + 64)). 좌표도 순서도 믿을 수 없으므로 표본을 통째로 버린다
//
// 판정은 "화면 밖으로 완전히 벗어난 창이 있는가" 로 한다. 지금 화면에 보이는 창은 아무리 끝으로
// 밀어도 일부는 화면 안에 남는다 — 통째로 밖에 있다면 다른 Space 의 창이 끌려 들어온 것이다.
// (경계를 조금만 벗어나도 버리게 하면, 창 하나를 화면 밖으로 걸쳐 둔 것만으로 펫이 얼어붙는다)
function screenUnion() {
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
  return { minX, minY, maxX, maxY };
}

function offScreen(windows) {
  const b = screenUnion();
  if (!Number.isFinite(b.minX)) return false;
  return windows.some((w) => w.x >= b.maxX || w.x + w.w <= b.minX || w.y >= b.maxY || w.y + w.h <= b.minY);
}

// 펫을 z-order 맨 위로 올린다 — 포커스는 빼앗지 않는다
// 펫을 z-order 의 알맞은 자리에 놓는다.
//   내 창이 맨 앞  → floating. 그 위에 있어야 할 창이 없고, 창을 클릭해도 묻히지 않는다
//   내 창이 뒤     → 일반 레벨로 내리고 내 창 "바로 위"에 꽂는다. 그 위의 창들이 자연히 가린다
// moveTop() 은 쓰지 않는다 — 백그라운드 앱에서는 창을 활성 앱 아래로 밀어넣는다 (실측 확인)
function place(anchorWindowId) {
  if (!win || !win.isVisible()) return;
  if (frontIsMine) {
    if (level !== "float") {
      win.setAlwaysOnTop(true, "floating");
      level = "float";
    }
    return;
  }
  if (level !== "normal") {
    win.setAlwaysOnTop(false);
    level = "normal";
  }
  if (anchorWindowId == null) return;
  try {
    // 다른 앱 창 바로 위에 꽂는다 — mediaSourceId 의 번호는 mac 의 CGWindowNumber, Windows 의 HWND
    win.moveAbove(`window:${anchorWindowId}:0`);
  } catch {
    // 그 창이 사라졌다 — 다음 폴링에서 다시 잡는다
  }
}

// 확장이 포커스 변화를 적는 순간 바로 반응한다 — 폴링(0.4초)을 기다리면 그만큼 펫이 창에 가려 있다
// winbounds 를 다시 돌리지 않는다. 기록에 "내 창이 포커스"라고 적혀 있으면 그것으로 충분하다
function watchRecords() {
  try {
    fs.mkdirSync(windowsDir, { recursive: true });
  } catch {
    return;
  }
  let pending = false;
  try {
    fs.watch(windowsDir, () => {
      if (pending) return; // tmp+rename 은 이벤트를 여러 번 낸다 — 한 틱으로 묶는다
      pending = true;
      setImmediate(() => {
        pending = false;
        const records = readWindowRecords();
        refineTermPid(records);
        const rec = myRecord(records);
        if (!rec) return;
        sawExtension = true;
        const tab = tabAxis(rec);
        buddy?.focus(focusKeyOf(rec, null));
        // 내 창이 포커스면 그게 곧 "화면 맨 앞" — winbounds 를 다시 돌릴 필요가 없다
        frontIsMine = rec.focused === true;
        // 탭을 옮기면 확장이 즉시 적는다. 폴링(0.4초)에 디바운스(2회)까지 기다리면 스르륵 늦게 사라진다
        if (!isDragging()) {
          applyVisibleNow(decideWant(tab, rec, !!lastTarget));
        }
        place(anchorId != null ? anchorId : lastTarget && lastTarget.id);
        if (debug) {
          console.log(
            JSON.stringify({ watch: "sync", tab, visible, frontIsMine, lagMs: Math.round(Date.now() - rec.at * 1000) }),
          );
        }
      });
    });
  } catch {
    // 감시 실패해도 폴링이 받쳐 준다
  }
}

// 집 — 따라가는 창의 오른쪽 아래 모서리 기준으로 사용자가 놓아 둔 자리.
// pos=fix 면 창 안에 가둔 자리가 집이다. 가두기 전 자리를 집으로 삼으면, 창을 줄여 집이 밖에 걸렸을 때
// 산책 오프셋이 가두기에 먹혀 걷는 그림만 나오고 제자리인 구간이 생긴다 (pos=free 는 가두지 않는다)
function homeSpot(target) {
  const { w, h } = windowSize();
  return clampToWindow(
    target.x + target.w - w + config.window.dx - stackShift(),
    target.y + target.h - h + config.window.dy,
    w,
    h,
    target,
  );
}

// 펫이 놓일 자리 — 집에서 산책 오프셋만큼 옮긴 뒤 창 안에 가둔다
function petSpot(target) {
  const { w, h } = windowSize();
  const home = homeSpot(target);
  const { x, y } = clampToWindow(home.x + roam.x, home.y + roam.y, w, h, target);
  return { x, y, w, h };
}

// 산책할 수 있는 오프셋 범위 — 펫이 따라가는 창 안에 머무는 만큼.
// 집이 창 밖이면(pos=free 로 끌어다 놓은 경우) 0 을 포함하게 넓혀 집에는 늘 돌아올 수 있다.
// 펫이 창보다 크면 범위가 [0,0] 이 되어 걷지 않는다
function roamBox(target) {
  const { w, h } = windowSize();
  const home = homeSpot(target);
  return {
    minX: Math.min(0, target.x - home.x),
    maxX: Math.max(0, target.x + target.w - w - home.x),
    minY: Math.min(0, target.y - home.y),
    maxY: Math.max(0, target.y + target.h - h - home.y),
  };
}

// 포커스 묶음 — 바뀌었다는 사실만 "사용자가 뭔가 했다"로 쓴다.
// 확장 기록의 at 은 10초마다 심장박동으로 바뀌므로 넣지 않는다. 기록이 없으면 화면 맨 앞 창으로 갈음한다
function focusKeyOf(rec, windows) {
  if (rec) return `${rec.focused}|${rec.activeTerminal}|${(rec.terminals || []).join(",")}`;
  // 펫 창 자신은 뺀다 — 레벨을 바꿀 때 맨 앞에 끼면 사용자가 한 일로 오인한다
  const front = windows && windows.find((w) => w.pid !== process.pid);
  return front ? `front:${front.id}` : null;
}

// 사용자가 펫을 다루는 중인가 — 이때는 창 추적·표시 판정·산책이 자리를 건드리지 않는다.
// 들고 가만히 있으면 move 이벤트가 안 와서 유예 시간이 끝난다. held 를 같이 봐야 2초 뒤 원래 자리로 튀지 않는다
function isDragging() {
  return held || Date.now() - lastUserMoveAt < DRAG_GRACE_MS;
}

// 들고 있던 펫을 놓은 것으로 친다 — pointerup 이 영영 안 오는 경로(클릭 통과를 켬·숨김·렌더러 재시작)의 탈출구.
// 저장하지 않는다. 사용자가 놓은 게 아니므로 집은 그대로고, 다음 추적이 펫을 집으로 되돌린다
function releaseHeld() {
  if (!held) return;
  held = false;
  roam = { x: 0, y: 0 };
  buddy?.rehome();
}

// buddy 한 틱 — 산책 오프셋을 받아 창을 옮긴다.
// 창 추적(pollAnchor)이 알아낸 마지막 창을 기준으로 한다. 드래그 중에는 사용자 손에 맡긴다
function buddyTick() {
  if (!buddy || !win) return;
  const dragging = isDragging();
  const next = buddy.tick({ box: lastTarget ? roamBox(lastTarget) : null, visible: visible && !!lastTarget });
  if (dragging) return;
  roam = next;
  if (lastTarget && visible) {
    const spot = petSpot(lastTarget);
    moveSelf(spot.x, spot.y);
  }
}

// 프로그램이 창을 옮기는 유일한 길 — commanded 를 같이 적어야 move 이벤트가 사용자 드래그로 오인되지 않는다
// mac 은 화면 가장자리에서 창 자리를 제약한다 — 지시한 자리와 실제 자리가 수십 px 어긋날 수 있다(아래쪽에서 54px 실측).
// 그래서 지시값과 실제값을 둘 다 기억한다. 실제값을 모르면 그 어긋남이 사용자 드래그로 보이고, 산책이 40ms 마다
// 같은 자리를 다시 지시한다
function moveSelf(x, y) {
  if (!win) return;
  const [cx, cy] = win.getPosition();
  if (cx === x && cy === y) return;
  // 같은 자리를 이미 지시했고 OS 가 옮겨 놓은 자리에 그대로 있다 — 다시 불러도 결과가 같다
  if (commanded && commanded.x === x && commanded.y === y && cx === commanded.ax && cy === commanded.ay) return;
  movingSelf = true;
  try {
    win.setPosition(x, y);
  } finally {
    movingSelf = false;
  }
  const [ax, ay] = win.getPosition();
  commanded = { x, y, ax, ay };
  if (debug) driftMax = Math.max(driftMax, Math.abs(ax - x), Math.abs(ay - y));
}

// 지금 창 자리가 우리가 지시한 그 자리인가 — 시간이 아니라 좌표로 가린다.
// move 이벤트는 비동기라 언제 올지 모른다
function movedByUs() {
  if (movingSelf) return true;
  if (!win || !commanded) return false;
  const [cx, cy] = win.getPosition();
  const near = (px, py) => Math.max(Math.abs(cx - px), Math.abs(cy - py)) <= MOVE_TOLERANCE_PX;
  return near(commanded.x, commanded.y) || (commanded.ax != null && near(commanded.ax, commanded.ay));
}

// 사용자가 끌고 있는가 — 커서가 펫 창 위에 있어야 한다.
// 끄는 동안 커서는 늘 창 위에 있다(OS 드래그도 포인터 드래그도 창이 커서를 따라온다).
// 커서가 딴 데 있는데 창이 지시와 다른 자리에 있으면 OS 가 옮긴 것이다 — 그걸 사용자 이동으로 저장하면
// 사용자가 놓아 둔 집이 영구히 덮인다 (시험 실행 중 이브이 집이 -251/-436 → -479/-61 로 덮인 일이 있었다)
function cursorOnPet() {
  if (!win) return false;
  const p = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  const [w, h] = win.getSize();
  return p.x >= x - 2 && p.x <= x + w + 2 && p.y >= y - 2 && p.y <= y + h + 2;
}

// 표시 여부 — 폴링과 확장 이벤트가 같은 규칙을 쓰도록 한 곳에 모은다
function decideWant(tab, rec, hasTarget) {
  let want;
  if (tab === null) {
    // 확장 기록이 없다. 한 번이라도 본 적 있으면 잃은 것이므로 닫는 쪽으로 간다
    want = sawExtension ? false : hasTarget;
  } else if (anchorId == null) {
    // 아직 내 창을 특정하지 못했다 — 확장이 알려주는 포커스를 함께 본다
    want = tab && rec.focused === true && hasTarget;
  } else {
    want = tab && hasTarget; // 내 창이 목록에 없으면(다른 Space·최소화) 숨긴다
  }
  if (config.keepVisible) want = true;
  if (userHidden) want = false;
  return want;
}

// 확장이 알려 준 변화는 경합이 아니라 확정 신호다 — 디바운스를 건너뛰고 바로 반영한다
function applyVisibleNow(want) {
  wantLast = want;
  wantStreak = VISIBLE_CONFIRM;
  visible = want;
  setVisible(want);
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
    const records = readWindowRecords();
    refineTermPid(records);
    const rec = myRecord(records);
    const tab = tabAxis(rec);
    if (rec) sawExtension = true;
    applyVisible(decideWant(tab, rec, true));
    return;
  }

  queryHelper(helper, (err, stdout) => {
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
    // 목록은 전역 z-order(앞→뒤) 전체다. 앵커 판정에는 앵커 앱 창만 쓰고,
    // 가림 판정에는 전체가 필요하다 — 내 창을 덮는 게 어느 앱인지는 상관없다
    const windows = (info.windows || []).filter((w) => w && typeof w.id === "number").map(toDip);
    // Space 전환 중 — mac 에서만 일어난다. Windows 는 다른 가상 데스크톱의 창이 헬퍼에서 걸러져 들어오지 않고,
    // 화면 밖에 걸어 둔 창 하나(떼어 낸 모니터 자리 등) 때문에 표본을 매번 버리면 펫이 영영 자리를 못 잡는다
    if (process.platform === "darwin" && offScreen(windows)) return;
    // 내 터미널을 띄운 프로그램의 창들 — 앱 이름 표가 아니라 프로세스 조상으로 찾는다.
    // VS Code·cmux·iTerm2·Warp·Windows Terminal·cmd 무엇이든 이걸로 잡힌다
    // 한 번 찾은 창 주인은 바뀌지 않는다 — 다시 찾는 건 그 프로세스의 창이 하나도 없을 때뿐
    // 프로세스 표까지 읽는 깊은 탐색은 한 번도 못 찾았을 때만, 가끔 한다 (동기 호출이라 그동안 펫이 멈춘다).
    // 이미 찾은 주인의 창이 잠깐 없는 것(모두 최소화)은 다시 찾을 이유가 아니다 — 못 찾으면 알던 주인을 그대로 둔다
    if (ownerPid == null || !windows.some((w) => w.pid === ownerPid)) {
      const deep = ownerPid == null && Date.now() - ownerDeepAt >= OWNER_DEEP_RETRY_MS;
      const found = pkstate.ownerPidOf(ancestors, windows, { deep });
      if (deep && found == null) ownerDeepAt = Date.now();
      if (found != null) ownerPid = found;
    }
    let appWindows = ownerPid != null ? windows.filter((w) => w.pid === ownerPid) : [];
    // 조상으로 못 찾을 때(tmux·원격 세션 등)는 터미널 종류에서 받은 앱 이름으로 갈음한다
    if (!appWindows.length) appWindows = anchorApp ? windows.filter((w) => w.app === anchorApp) : windows;

    const records = readWindowRecords();
    refineTermPid(records);
    const rec = myRecord(records);
    if (rec) sawExtension = true;
    const tab = tabAxis(rec);
    buddy?.focus(focusKeyOf(rec, windows));

    // ── 앵커 — 한 번 확정하면 그 창 ID 만 따라간다
    let target = null;
    if (anchorId != null) {
      target = appWindows.find((w) => w.id === anchorId) || null;
      if (target) anchorMiss = 0;
      else if ((anchorMiss += 1) >= ANCHOR_MISS_LIMIT) {
        anchorId = null; // 창이 닫혔거나 오래 안 보임 — 다시 찾는다
        anchorMiss = 0;
      }
    }
    if (anchorId == null) {
      const head = appWindows[0] || null;
      // 내 창이 지금 포커스이고 내 탭이 활성인 순간에만 확정한다 — 그때 맨 앞 창은 반드시 내 창이다
      // 확장이 있으면 그 신호로 확정한다. 없으면 "내 프로그램의 창이 화면 맨 앞" 으로 갈음한다 —
      // 명령을 친 창이 곧 맨 앞이므로 펫이 뜨는 시점에는 이게 맞다
      const sure =
        !!head &&
        head.w >= CAPTURE_MIN.w &&
        head.h >= CAPTURE_MIN.h &&
        (rec
          ? tab === true && rec.focused === true && !records.some((r) => r !== rec && r.focused === true)
          : !!windows[0] && windows[0].id === head.id);
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

    // ── 내 창이 화면 맨 앞이면 펫을 그 위로 올린다
    // 일반 레벨이라 A 를 클릭하면 A 가 펫 위로 올라온다. 다시 올려 주면 [펫, A] 가 되고,
    // 그 뒤 B 를 클릭하면 B 가 그 위로 올라와 [B, 펫, A] — 겹친 부분만 OS 가 알아서 가린다
    // 내 창이 맨 앞인가 — 확장 기록이 더 정확하고, 없으면 창 순서로 갈음한다
    frontIsMine = rec ? rec.focused === true : !!(target && windows[0] && windows[0].id === target.id);

    const spot = target ? petSpot(target) : null;

    let want = decideWant(tab, rec, !!target);
    // 펫을 잡으면 IDE 가 뒤로 간다 — 드래그 중에는 판정을 보류하고 직전 상태를 유지한다
    const dragging = isDragging();
    if (dragging) want = visible;

    if (target && spot && !dragging) {
      lastTarget = target;
      moveSelf(spot.x, spot.y);
    }

    applyVisible(want);
    place(anchorId != null ? anchorId : target && target.id);

    if (debug) {
      console.log(
        JSON.stringify({
          want,
          visible,
          tab,
          anchorId,
          target: target ? target.id : null,
          head: appWindows[0] ? appWindows[0].id : null,
          state: currentState(),
          pos: win.getPosition(),
          roam,
          driftMax,
        }),
      );
    }
  });
}

function applyClickThrough(on, persist = true) {
  // 기동 시 적용은 저장하지 않는다 — 인자로 받은 값이 파일에 눌러앉으면 다음 실행까지 따라온다
  if (persist) settings.save(config, { clickThrough: on });
  else config.clickThrough = on;
  // 들고 있는 중에 클릭 통과를 켜면 pointerup 이 영영 안 온다 — 커서에 붙은 채로 남지 않게 놓는다
  if (on) releaseHeld();
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
    acceptFirstMouse: true, // 포커스 없는 창이라 매번 "첫 클릭"이다 — 삼키지 말고 렌더러로 보낸다 (mac)
    backgroundColor: "#00000000",
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: false, // 일반 레벨 — 내 창 위에만 있고 다른 창이 올라오면 그 아래로 내려간다
    fullscreenable: false,
    focusable: false, // 클릭해도 터미널 포커스를 뺏지 않음
    webPreferences: {
      preload: path.join(PATHS.project, "preload.js"),
      // 창이 숨겨졌다 다시 보일 때 애니메이션 타이머가 멈추지 않게 함
      backgroundThrottling: false,
    },
  });

  // 첫 인자 false — Space(데스크탑) 를 전환해도 펫이 따라오지 않고 자기 창이 있는 Space 에 남는다
  // visibleOnFullScreen 은 별개 속성이라 풀스크린 창 위 표시는 그대로 유지된다
  win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
  win.loadFile("renderer/index.html", {
    query: {
      fps: String(config.fps),
      debug: debug ? "1" : "",
      motionAssist: String(config.motionAssist),
      dotSize: String(config.dotSize),
      // 3D 세트는 올리는 동작만 담겨 있어 앞으로만 돌리면 끊겨 보인다 — 수치 판정에 맡기지 않고 확정
      pingPong: config.pingPong === "auto" && /-3d$/.test(config.slug) ? "on" : String(config.pingPong),
      // buddy 는 잡기·클릭을 직접 받아야 한다 — OS 드래그(app-region)는 렌더러에 마우스 이벤트를 안 준다
      pointer: buddy ? "1" : "",
    },
  });

  if (debug) {
    // Electron 44 부터 인자가 객체 하나 — 예전 위치 인자는 경고를 낸다
    win.webContents.on("console-message", (details) => console.log(`[renderer] ${details.message}`));
    const info =
      art.kind === "pmd"
        ? { 그림: art.kind, 크기: `${art.cell.w}x${art.cell.h}`, 배율: art.zoom, 출처: art.from,
            동작: Object.entries(art.clips).map(([k, c]) => `${k}=${c.anim}`).join(" ") }
        : { 그림: art.kind, 크기: `${art.w}x${art.h}`, 배율: art.scale, 출처: art.from };
    console.log(JSON.stringify(info));
  }

  // 렌더러가 죽거나 다시 뜨면 들고 있던 포인터도 사라진다
  win.webContents.on("render-process-gone", () => releaseHeld());

  win.webContents.on("did-finish-load", () => {
    releaseHeld();
    buddy?.resend();
    applyClickThrough(config.clickThrough, false);
    win.webContents.send("state", currentState());
    pollAnchor();
  });

  win.on("move", () => {
    if (movedByUs() || (!held && !cursorOnPet())) return;
    // 옛 지시 좌표를 남겨 두면, 나중에 그 근처(허용 오차 안)에 놓았을 때 우리가 옮긴 것으로 오판한다
    commanded = null;
    lastUserMoveAt = Date.now();
    // 포인터로 들고 있지 않은데 창이 옮겨졌다(클릭 통과 해제 전의 OS 드래그 등) — 놓인 자리가 새 집.
    // 단 방금 놓았다면 끄는 동안의 move 가 늦게 온 것이다(move 가 비동기인 환경) — 놓을 때 반응을 지우지 않는다
    if (!held && buddy && Date.now() - droppedAt > DROP_SETTLE_MS) {
      buddy.rehome();
      roam = { x: 0, y: 0 };
    }
  });

  win.on("moved", () => {
    if (movedByUs() || (!held && !cursorOnPet())) return;
    commanded = null;
    lastUserMoveAt = Date.now();
    // 포인터로 들고 있는 동안은 놓을 때 한 번만 확정한다. mac 은 moved 가 move 의 별칭이라 끄는 내내 오는데,
    // 그때마다 창 안으로 되돌리면 창 밖으로 끄는 동안 커서와 가두기가 서로 당겨 떨린다
    if (!held) settleUserMove();
  });
}

// 사용자가 옮긴 자리를 확정한다 — 창 밖이면 안으로 들이고, 집 오프셋으로 저장한다.
// OS 드래그는 moved 가 부른다. 포인터 드래그는 놓을 때 직접 부른다 —
// Windows 의 moved 는 OS 드래그가 끝날 때만 오고 setPosition 으로는 오지 않는다
function settleUserMove() {
  // 숨어 있을 때 옛 좌표를 기준으로 오프셋을 저장하면 그 값이 영구히 어긋난다
  if (!win || !lastTarget || !visible) return;

  const [rawX, rawY] = win.getPosition();
  const { w, h } = windowSize();
  // 창 밖으로 끌었으면 경계 안으로 되돌린다
  const { x, y } = clampToWindow(rawX, rawY, w, h, lastTarget);
  moveSelf(x, y);

  // 창 위치는 따라가는 창의 오른쪽 아래 모서리 기준 오프셋으로 기억한다
  settings.save(config, {
    window: {
      dx: x - (lastTarget.x + lastTarget.w - w) + stackShift(),
      dy: y - (lastTarget.y + lastTarget.h - h),
    },
  });
}

// 이 펫이 떴으니 이 펫의 옛 실패 기록은 지운다 — 남겨 두면 status 가 해결된 문제를 계속 보여 준다.
// 다른 펫의 기록은 건드리지 않는다 (여러 마리를 함께 띄운 경우)
function clearFailure() {
  try {
    const e = JSON.parse(fs.readFileSync(PATHS.lastError, "utf8"));
    if (e.slug === config.slug) fs.rmSync(PATHS.lastError, { force: true });
  } catch {
    // 기록 없음
  }
}

// 펫이 못 뜬 이유를 남긴다 — 실패해도 조용히 넘어간다
function reportFailure(message) {
  try {
    fs.mkdirSync(PATHS.home, { recursive: true });
    fs.writeFileSync(PATHS.lastError, JSON.stringify({ at: Date.now() / 1000, slug: config.slug, message }));
  } catch {
    // 기록 실패는 무시
  }
}

ipcMain.handle("art", () => art);

// 포인터로 펫을 만졌다 (buddy 전용) — 렌더러는 화면 좌표만 알려 주고, 옮기기·반응은 여기서 한다
ipcMain.on("pointer", (_e, msg) => {
  if (!win || !buddy || !msg) return;
  const now = Date.now();
  if (msg.type === "grab") {
    held = true;
    lastUserMoveAt = now;
    buddy.pickup();
  } else if (msg.type === "drag" && held && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
    const [cx, cy] = win.getPosition();
    const { w, h } = windowSize();
    // 끄는 중에도 창 안에 가둔다 — 가장자리에 붙어 따라오고, 놓을 때 튀어 들어가지 않는다
    const { x, y } = lastTarget ? clampToWindow(msg.x, msg.y, w, h, lastTarget) : { x: msg.x, y: msg.y };
    buddy.drag(x - cx, y - cy);
    lastUserMoveAt = now;
    win.setPosition(x, y); // 사용자 이동 — commanded 를 적지 않는다. 저장은 놓을 때 settleUserMove 가 한다
  } else if (msg.type === "drop" && held) {
    held = false;
    droppedAt = now;
    lastUserMoveAt = now;
    roam = { x: 0, y: 0 }; // 놓은 자리가 새 집 — 저장하는 오프셋은 실제 창 자리라 산책분이 이미 들어 있다
    settleUserMove();
    buddy.drop();
  } else if (msg.type === "click") {
    buddy.click();
  }
});

app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.hide();
  art = await loadArt(config, PATHS, settings.spritePath, (want, got) => {
    process.stderr.write(`${config.slug}: ${want} 그림을 못 구해 ${got} 로 대체\n`);
  });
  // showdown·sheet 로 떨어졌으면 buddy 도 없다 — 걷는 그림·자는 그림이 없다
  buddy = createBuddy({
    art,
    mode: config.buddy,
    timeScale: config.runtime.buddyTimeScale,
    send: (act) => win?.webContents.send("act", act),
    log: debug ? (o) => console.log(JSON.stringify(o)) : null,
  });
  if (!art) {
    // 원본 GIF 도 스프라이트시트도 없음 — 대개 없는 펫 이름이거나 네트워크가 막혔다
    const sheet = settings.spritePath(config) || "저장소 모름 (PKMON_SOURCE 로 codex-pokepets 경로를 주면 art=sheet 를 쓸 수 있다)";
    process.stderr.write(`펫 그림을 찾을 수 없음: ${config.slug}\n  스프라이트시트: ${sheet}\n`);
    // 펫의 출력은 평소 버려진다 — pkmon 명령과 pkmon status 가 읽을 수 있게 이유를 남긴다
    reportFailure(
      config.art === "sheet" && !config.source
        ? "art=sheet 는 codex-pokepets 저장소 경로(PKMON_SOURCE)가 필요하다"
        : `${config.slug} 그림을 받지 못함 — 네트워크(프록시)를 확인하거나 다른 펫 이름으로 시도`,
    );
    app.exit(3); // 실패로 끝낸다 — pkmon 이 종료 코드를 보고 "펫이 뜨지 못함"을 알린다
    return;
  }
  clearFailure();
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
    const { state, promptAt } = currentInfo();
    buddy?.state(state, promptAt);
    if (state !== lastState) {
      lastState = state;
      win?.webContents.send("state", state);
    }
  }, STATE_POLL_MS);
  if (buddy) setInterval(buddyTick, buddy.TICK_MS);

  watchRecords();
  setInterval(pollAnchor, ANCHOR_POLL_MS);
});

// pkmon 래퍼가 명령 종료 후 보내는 신호 — 펫도 같이 종료
process.on("SIGTERM", () => app.quit());
process.on("SIGINT", () => app.quit());

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  servedHelper?.stop();
});
app.on("window-all-closed", () => app.quit());
