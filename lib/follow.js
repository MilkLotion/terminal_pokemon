// 동반자(companion)가 어느 창을 따르고 어느 세션의 상태를 볼지 — 순수 함수. 창·파일·Electron 을 모른다.
//
// 세션 펫은 자기를 띄운 터미널에 묶여 기동 때 정한 pid 만 본다. 동반자는 기기당 하나라 매 폴링
// "지금 맨 앞 창" 을 다시 고르고, 그 창의 주인이 터미널 호스트인지를 가른다.
//   (a) 포커스된 VS Code 창 기록이 있으면 → 그 창의 활성 터미널 셸 pid 를 따른다 (확장이 적어 둔다)
//   (b) 훅 기록 중 조상에 그 창 주인 pid 가 든 것이 있으면 → 훅이 달린 CLI 를 띄운 적 있는 터미널 앱이다
//   (c) 알려진 터미널 앱 이름이면 → 아직 CLI 를 띄운 적 없다. 붙기만 하고 상태는 대기
//   (d) 아니면 터미널 호스트가 아니다 → 부르는 쪽이 앵커를 유지한다 (브라우저를 봐도 펫은 마지막 자리에 남는다)
// 앱 이름표(c)는 대비책일 뿐 — (a)(b) 는 이름을 몰라도 맞는다

// 터미널 앱 이름 — 헬퍼가 주는 app 필드 (mac 은 앱 이름, Windows 는 실행 파일 이름). 대소문자를 가리지 않는다
const KNOWN_TERMINAL_APPS = new Set(
  [
    "Code", "Code - Insiders", "Cursor", "Windsurf", "Antigravity", "VSCodium",
    "iTerm2", "Terminal", "Ghostty", "WezTerm", "Warp", "Alacritty", "kitty", "Hyper", "Tabby",
    "WindowsTerminal", "cmux",
  ].map((name) => name.toLowerCase()),
);
const isKnownTerminal = (app) => KNOWN_TERMINAL_APPS.has(String(app || "").toLowerCase());

// TERM_PROGRAM 값 → 헬퍼의 app 이름. 조상으로 창 주인을 못 찾을 때(tmux 등)의 대비책 (cli/run.js anchorApp)
const TERM_PROGRAM_APPS = { vscode: "Code", ghostty: "Ghostty", "iTerm.app": "iTerm2", Apple_Terminal: "Terminal", WezTerm: "WezTerm" };

// 펫 자신(과 이름이 같은 다른 펫)인가 — 세션 펫·창 펫은 전부 같은 Electron 이라 이름으로 함께 걸러야 한다.
// self = { pid, appNames: Set<소문자 이름> }
const isSelf = (w, self) =>
  !!self && (w.pid === self.pid || (self.appNames && self.appNames.has(String(w.app || "").toLowerCase())));

// 맨 앞 창. 헬퍼의 frontPid(맨 앞 앱 pid)로 고른다 — 앱 이름은 펫끼리 겹친다.
// Windows 는 frontId(포그라운드 HWND)가 목록에 있으면 그 창, 없으면(대화상자·작은 창) 같은 pid 의 첫 창.
// frontPid 를 주지 않는 옛 헬퍼는 frontmost 이름으로 대체한다.
// 반환: 창 하나. 펫 자신이거나 그 앱의 창이 목록에 없으면(다른 Space — 실측 32.5%) null
function frontWindow(info, windows, self) {
  if (!info || !Array.isArray(windows)) return null;
  const frontPid = Number(info.frontPid) || 0;
  let front = null;
  if (frontPid) {
    if (self && frontPid === self.pid) return null;
    const byId = info.frontId != null ? windows.find((w) => w.id === info.frontId && w.pid === frontPid) : null;
    front = byId || windows.find((w) => w.pid === frontPid) || null;
  } else if (info.frontmost) {
    front = windows.find((w) => w.app === info.frontmost) || null;
  }
  return front && !isSelf(front, self) ? front : null;
}

// 맨 앞 창의 주인이 터미널 호스트인가 — 위 (a)~(d).
//   front          frontWindow 의 결과 (null 이면 (a) 만 본다 — VS Code 가 포커스인데 창이 목록에 없을 수 있다)
//   windowRecords  확장이 적은 창 기록 (살아 있는 것만, lib/state readWindowRecords)
//   stateRecords   훅이 적은 세션 기록 (lib/state readStateRecords)
// 반환: { kind: "vscode" | "hook" | "known", rec, pids, frontIsHost } — pids 는 따를 세션의 pid (비면 대기). 호스트가 아니면 null
//   frontIsHost  맨 앞 창 자체가 터미널 앱으로 보이는가 ((b) 또는 (c)). (a) 는 확장 기록의 포커스로 판정해 OS 의 맨 앞 창과
//                잠깐 어긋날 수 있다(blur 를 적기 전의 몇 ms) — 부르는 쪽이 이 값으로 자리를 옮길지 가른다
function hostOf(front, windowRecords, stateRecords) {
  const hooked = !!front && (stateRecords || []).some((r) => Array.isArray(r.ancestors) && r.ancestors.includes(front.pid));
  const frontIsHost = hooked || (!!front && isKnownTerminal(front.app));
  const focused = (windowRecords || []).find((r) => r.focused === true) || null;
  if (focused) {
    // 원격 창(SSH·WSL)의 터미널 pid 는 다른 컴퓨터 것이라 대조할 수 없다 — 붙기만 하고 대기
    const pids = focused.remote || focused.activeTerminal == null ? [] : [focused.activeTerminal];
    return { kind: "vscode", rec: focused, pids, frontIsHost };
  }
  if (!front) return null;
  if (hooked) return { kind: "hook", rec: null, pids: [front.pid], frontIsHost };
  if (frontIsHost) return { kind: "known", rec: null, pids: [], frontIsHost };
  return null;
}

module.exports = { KNOWN_TERMINAL_APPS, TERM_PROGRAM_APPS, isKnownTerminal, frontWindow, hostOf };
