// 창 추적 상태기 — 400ms 마다 헬퍼에게 창 목록을 묻고, 모드별로 따를 창(target) · 표시(visible) · z-order 자리(placeId)를 정한다.
// 옛 main.js 의 pollAnchor · resolveAnchored · resolveCompanion · decideWant · applyVisible · watchRecords · refineTermPid ·
// trackRecord 를 한 곳에. 판정 로직은 follow/(진단 도구와 같은 것) — 두 벌이 되면 진단이 거짓말을 한다.
// Electron 이 필요한 부분(toDip · offScreen · 작업 영역 · quit)은 host 로 받아 node 에서도 돌릴 수 있게 한다.
//
// 결과는 onUpdate 로 낸다 — 무대 창이 setStage(무대 사각형) · setVisible · place 를 한다. 창을 옮기지 않으므로
// 1판의 petSpot·moveBody 는 여기 없다 (마리 자리는 stage.ts 가 무대 안에서 계산한다)
import fs from "node:fs";
import * as follow from "../follow/front";
import * as pkstate from "../follow/state";
import type { HelperInfo, HelperWindow, SelfMark, StateInfo, StateRecord, WindowRecord } from "../follow/types";
import { helperCommand, parseInfo, queryHelper, stopHelper } from "../follow/winbounds";
import type { Mode } from "../shared/types";
import type { Paths, RuntimeInfo } from "./paths";

export const ANCHOR_RULES = {
  // Windows 도 헬퍼를 띄워 두고 묻기 때문에(한 번 1ms 안쪽) mac 과 같은 간격으로 창을 따라간다
  pollMs: 400,
  // 창 주인을 조상에서 못 찾았을 때 프로세스 표를 다시 읽는 간격 — Windows 는 한 번에 수백 ms 동안 메인을 멈춘다
  ownerDeepRetryMs: 10000,
  visibleConfirm: 2, // 표시 전환은 이만큼 연속 같은 판정일 때만 — 한 번의 경합이 깜빡임이 되지 않게
  captureConfirm: 2, // 앵커 창을 확정하기까지 연속 일치 횟수
  anchorMissLimit: 8, // 내 창이 이만큼 연속으로 안 보이면 앵커를 풀고 다시 찾는다
  captureMin: { w: 400, h: 250 }, // 분리된 DevTools 같은 보조 창을 앵커로 잡지 않도록
  // 창 펫 — 내 창 기록이 이만큼 연속 없으면 창이 닫힌 것이다 (확장이 지운다). tmp+rename 사이의 한 번은 넘긴다
  recordMissLimit: 5,
  helperFailWarn: 3, // 헬퍼가 이만큼 연속 실패하면 알리고(안전한 쪽으로) 펫을 숨긴다
};

// Electron 이 있어야 하는 일 — 시험에서는 가짜를 준다
export interface AnchorHost {
  platform: NodeJS.Platform;
  now(): number;
  toDip(w: HelperWindow): HelperWindow; // Windows 물리 픽셀 → DIP
  offScreen(windows: HelperWindow[]): boolean; // mac Space 전환 중 표본인가
  workArea(): HelperWindow; // 터미널 호스트를 한 번도 못 봤을 때의 가짜 창 (fake:true)
  quit(): void;
  quitting(): boolean; // 끝내는 중에는 헬퍼에 묻지 않는다 — before-quit 에서 멈춘 헬퍼를 다음 질문이 다시 띄우면 펫보다 오래 남는다
}

export interface AnchorFlags {
  userHidden: boolean; // Cmd+Alt+H · 우클릭 · 트레이로 직접 숨김
  keepVisible: boolean; // 항상 보이기 (설정)
  held: boolean; // 마리를 들고 있는 중 — 표시 판정을 보류하고 직전 상태를 유지한다
}

export interface AnchorUpdate {
  target: HelperWindow | null; // 따라갈 창 (DIP). fake 면 작업 영역
  visible: boolean; // 디바운스를 거친 표시 여부
  placeId: number | null; // z-order 로 바로 위에 꽂을 창 번호 — 동반자는 null (늘 위)
  frontIsMine: boolean;
}

export interface AnchorOptions {
  mode: Mode;
  runtime: RuntimeInfo;
  paths: Pick<Paths, "state" | "project">;
  self: SelfMark; // 펫 자신을 가리는 표 — 세션·창 펫은 전부 같은 Electron 이라 이름으로 함께 걸러야 맨 앞 창에서 빠진다
  env?: NodeJS.ProcessEnv;
  host: AnchorHost;
  flags(): AnchorFlags;
  onUpdate(u: AnchorUpdate): void;
  onFocus(key: string | null): void; // 포커스 묶음이 바뀌었다 — 움직임 모듈의 "사용자가 뭔가 했다"
  log: ((o: Record<string, unknown>) => void) | null;
}

export interface Anchor {
  start(): void; // 폴링 + 확장 기록 감시
  stop(): void;
  poll(): void; // 지금 바로 한 번 (단축키·메뉴 뒤)
  currentInfo(): StateInfo; // 따를 훅 상태 — 모드별 규칙
  termPid(): number | null; // 확장 기록으로 바로잡힌 터미널 셸 (수명 감시가 본다)
  target(): HelperWindow | null;
  visible(): boolean;
}

interface Resolved {
  target: HelperWindow | null;
  want: boolean;
  placeId: number | null;
  debug: Record<string, unknown>;
}

export function createAnchor(opts: AnchorOptions): Anchor {
  const { mode, runtime, paths, self, host, log } = opts;
  const env = opts.env ?? process.env;
  const R = ANCHOR_RULES;
  const { hostPid, session, matchCwd, anchorApp, windowsDir } = runtime;

  let termPid = runtime.termPid; // pokebuddy 가 넘긴 첫 추정 — 확장 기록으로 바로잡을 수 있다 (refineTermPid)
  // 창 주인을 찾는 데 쓴다 (체인 전체). pokebuddy 가 구해 넘긴 것을 쓴다 — pokebuddy 는 펫을 띄우고 곧바로 끝나서,
  // 펫이 스스로 구하면 부모 관계가 이미 끊겨 있다 (Windows 는 끊긴 채 남고, mac 은 launchd 밑으로 옮겨진다).
  // 넘겨받지 못했으면(npm start 로 직접 실행) 스스로 구한다. 동반자는 조상을 쓰지 않는다 — Windows 의 프로세스 표 읽기(1초)를 아낀다
  const ancestors =
    mode === "companion" ? [process.pid] : runtime.ancestors.length ? [process.pid, ...runtime.ancestors] : pkstate.ancestorPids();
  let myPids = pkstate.pidsUpTo(ancestors, termPid); // 터미널 셸까지만 (탭·상태 판정용)
  let termRefined = false;

  let lastTarget: HelperWindow | null = null; // 마지막으로 따라간 창
  let anchorId: number | null = null; // 확정된 내 창 ID — 정해지면 이 창만 따라간다
  let anchorMiss = 0;
  let captureId: number | null = null; // 확정 직전의 후보
  let captureHits = 0;
  let visible = false;
  let wantLast: boolean | null = null;
  let wantStreak = 0;
  let sawExtension = false; // 확장 기록을 한 번이라도 봤으면, 잃었을 때 닫는 쪽으로 간다
  let helperFails = 0;
  let frontIsMine = false; // 내 창이 화면 맨 앞인가
  let ownerPid: number | null = null; // 내 터미널을 띄운 프로그램의 프로세스 번호 (한 번 찾으면 재사용)
  let ownerDeepAt = 0; // 프로세스 표로 창 주인을 마지막으로 찾아본 시각
  let followPids = new Set<number>(); // window·companion — 이번 폴링이 고른 "따를 세션"의 pid (활성 터미널 셸 또는 창 주인)
  let stateRecords: StateRecord[] = []; // 마지막으로 읽은 훅 기록 (최신순) — window·companion 은 폴링마다 한 번 읽어 판정 둘에 같이 쓴다
  let companionTarget: HelperWindow | null = null; // companion — 마지막으로 따른 터미널 호스트 창. 브라우저를 봐도 여기 남는다
  let recordMiss = 0; // window — 내 창 기록이 연속으로 없던 횟수
  let timer: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;

  // 훅(pokebuddy-state)이 남긴 세션 상태 중 따를 것.
  //   session           나를 부른 CLI 것. pokebuddy 가 띄웠는데 부른 CLI 가 없으면 셸에서 바로 띄운 펫이다 — CLI 상태를 따르지 않는다 (기본 동작만)
  //   window·companion  폴링이 고른 followPids(활성 터미널 셸·창 주인)를 조상으로 가진 최신 기록 (follow/state stateFor). 비면 대기
  const terminalOnly = mode === "session" && session != null && !hostPid;
  const currentInfo = (): StateInfo =>
    mode === "session"
      ? pkstate.sessionInfo(paths.state, { myPids, matchCwd, hostPid, terminalOnly })
      : pkstate.stateFor(stateRecords, followPids);

  const readWindowRecords = (): WindowRecord[] => pkstate.readWindowRecords(windowsDir);
  // 내 창 기록 — 창 펫은 확장이 넘긴 자기 호스트 pid 로, 세션 펫은 내 터미널 셸이 든 것으로
  const myRecord = (records: WindowRecord[]): WindowRecord | null =>
    mode === "window" ? (records.find((r) => r.hostPid === hostPid) ?? null) : pkstate.myRecord(records, myPids);
  // 탭 축 — 창 펫은 그 창의 모든 탭을 따르므로 기록만 있으면 활성이다
  const tabAxis = (rec: WindowRecord | null): boolean | null => (mode === "window" ? (rec ? true : null) : pkstate.tabAxis(rec, myPids));
  // 창 펫이 따를 세션 — 이 창의 활성 터미널 셸. 원격 창의 pid 는 다른 컴퓨터 것이라 대조하지 않는다 (대기)
  const followOf = (rec: WindowRecord | null): Set<number> =>
    new Set(rec && !rec.remote && rec.activeTerminal != null ? [rec.activeTerminal] : []);

  // 터미널 셸을 확장 기록으로 한 번 바로잡는다 (판정은 follow/state — 진단 도구와 같은 규칙). 세션 펫만 — 다른 모드는 터미널 셸에 묶이지 않는다
  function refineTermPid(records: WindowRecord[]): void {
    if (mode !== "session" || termRefined || !records.length) return;
    const found = pkstate.terminalFromRecords(ancestors, records);
    if (found == null) return; // 이 창의 터미널이 아니거나 기록이 아직 없다 — 다음 기록에서 다시 본다
    termRefined = true;
    if (found === termPid) return;
    log?.({ termPid: { from: termPid, to: found } });
    termPid = found;
    myPids = pkstate.pidsUpTo(ancestors, termPid);
  }

  // 창 펫 — 내 창의 기록이 사라졌다(확장 비활성·창 닫힘 뒤 deactivate). 연속으로 없을 때만 끝난다 — tmp+rename 사이의 한 번은 넘긴다
  function trackRecord(rec: WindowRecord | null): void {
    if (mode !== "window") return;
    if (rec) {
      recordMiss = 0;
      return;
    }
    if ((recordMiss += 1) >= R.recordMissLimit) host.quit();
  }

  // 포커스 묶음 — 바뀌었다는 사실만 "사용자가 뭔가 했다"로 쓴다.
  // 확장 기록의 at 은 10초마다 심장박동으로 바뀌므로 넣지 않는다. 기록이 없으면 화면 맨 앞 창으로 갈음한다
  function focusKeyOf(rec: WindowRecord | null, windows: HelperWindow[] | null): string | null {
    if (rec) return `${rec.focused}|${rec.activeTerminal}|${(rec.terminals || []).join(",")}`;
    // 펫 창 자신은 뺀다 — 레벨을 바꿀 때 맨 앞에 끼면 사용자가 한 일로 오인한다
    const front = windows?.find((w) => w.pid !== process.pid);
    return front ? `front:${front.id}` : null;
  }

  // 표시 여부 — 폴링과 확장 이벤트가 같은 규칙을 쓰도록 한 곳에 모은다
  function decideWant(tab: boolean | null, rec: WindowRecord | null, hasTarget: boolean): boolean {
    const f = opts.flags();
    // 동반자는 늘 보인다 — 맨 앞 창이 터미널이 아니어도 마지막 자리에 남는다. 직접 숨긴 것만 예외
    if (mode === "companion") return !f.userHidden;
    let want: boolean;
    if (tab === null) {
      // 확장 기록이 없다. 한 번이라도 본 적 있으면 잃은 것이므로 닫는 쪽으로 간다
      want = sawExtension ? false : hasTarget;
    } else if (anchorId == null) {
      // 아직 내 창을 특정하지 못했다 — 확장이 알려주는 포커스를 함께 본다
      want = tab && rec?.focused === true && hasTarget;
    } else {
      want = tab && hasTarget; // 내 창이 목록에 없으면(다른 Space·최소화) 숨긴다
    }
    if (f.keepVisible) want = true;
    if (f.userHidden) want = false;
    return want;
  }

  // 확장이 알려 준 변화는 경합이 아니라 확정 신호다 — 디바운스를 건너뛰고 바로 반영한다
  function applyVisibleNow(want: boolean): void {
    wantLast = want;
    wantStreak = R.visibleConfirm;
    visible = want;
  }

  // 표시 전환은 같은 판정이 연속으로 나올 때만 반영한다
  function applyVisible(want: boolean): void {
    if (want === wantLast) wantStreak += 1;
    else {
      wantLast = want;
      wantStreak = 1;
    }
    if (wantStreak < R.visibleConfirm) return;
    visible = want;
  }

  const emit = (placeId: number | null): void => opts.onUpdate({ target: lastTarget, visible, placeId, frontIsMine });

  // 세션·창 펫 — 내 터미널을 띄운 프로그램의 창 중 "내 창"을 찾아 따른다 (조상 → 창 주인, 확장 기록 → 내 창 확정)
  function resolveAnchored(windows: HelperWindow[], records: WindowRecord[]): Resolved {
    // 내 터미널을 띄운 프로그램의 창들 — 앱 이름 표가 아니라 프로세스 조상으로 찾는다.
    // VS Code·cmux·iTerm2·Warp·Windows Terminal·cmd 무엇이든 이걸로 잡힌다
    // 한 번 찾은 창 주인은 바뀌지 않는다 — 다시 찾는 건 그 프로세스의 창이 하나도 없을 때뿐
    // 프로세스 표까지 읽는 깊은 탐색은 한 번도 못 찾았을 때만, 가끔 한다 (동기 호출이라 그동안 펫이 멈춘다).
    // 이미 찾은 주인의 창이 잠깐 없는 것(모두 최소화)은 다시 찾을 이유가 아니다 — 못 찾으면 알던 주인을 그대로 둔다
    // 창 펫은 확장이 [확장 호스트, VS Code 메인] 을 조상으로 넘기므로 바로 맞는다
    if (ownerPid == null || !windows.some((w) => w.pid === ownerPid)) {
      const deep = ownerPid == null && host.now() - ownerDeepAt >= R.ownerDeepRetryMs;
      const found = pkstate.ownerPidOf(ancestors, windows, { deep });
      if (deep && found == null) ownerDeepAt = host.now();
      if (found != null) ownerPid = found;
    }
    let appWindows = ownerPid != null ? windows.filter((w) => w.pid === ownerPid) : [];
    // 조상으로 못 찾을 때(tmux·원격 세션 등)는 터미널 종류에서 받은 앱 이름으로 갈음한다
    if (!appWindows.length) appWindows = anchorApp ? windows.filter((w) => w.app === anchorApp) : windows;

    refineTermPid(records);
    const rec = myRecord(records);
    trackRecord(rec);
    if (rec) sawExtension = true;
    const tab = tabAxis(rec);
    opts.onFocus(focusKeyOf(rec, windows));
    if (mode === "window") followPids = followOf(rec);

    // ── 앵커 — 한 번 확정하면 그 창 ID 만 따라간다
    let target: HelperWindow | null = null;
    if (anchorId != null) {
      target = appWindows.find((w) => w.id === anchorId) ?? null;
      if (target) anchorMiss = 0;
      else if ((anchorMiss += 1) >= R.anchorMissLimit) {
        anchorId = null; // 창이 닫혔거나 오래 안 보임 — 다시 찾는다
        anchorMiss = 0;
      }
    }
    if (anchorId == null) {
      const head = appWindows[0] ?? null;
      const first = windows[0];
      // 내 창이 지금 포커스이고 내 탭이 활성인 순간에만 확정한다 — 그때 맨 앞 창은 반드시 내 창이다
      // 확장이 있으면 그 신호로 확정한다. 없으면 "내 프로그램의 창이 화면 맨 앞" 으로 갈음한다 —
      // 명령을 친 창이 곧 맨 앞이므로 펫이 뜨는 시점에는 이게 맞다
      const sure =
        !!head &&
        head.w >= R.captureMin.w &&
        head.h >= R.captureMin.h &&
        (rec
          ? tab === true && rec.focused === true && !records.some((r) => r !== rec && r.focused === true)
          : !!first && first.id === head.id);
      if (sure && head.id === captureId) {
        if ((captureHits += 1) >= R.captureConfirm) {
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

    return {
      target,
      want: decideWant(tab, rec, !!target),
      placeId: anchorId != null ? anchorId : target ? target.id : null,
      debug: { tab, anchorId, target: target ? target.id : null, head: appWindows[0] ? appWindows[0].id : null, pids: [...followPids] },
    };
  }

  // 동반자 — 맨 앞 창이 터미널 호스트면 그 창을 따르고 그 창의 세션을 본다. 아니면 마지막 창에 그대로 남는다 (follow/front)
  function resolveCompanion(info: HelperInfo, windows: HelperWindow[], records: WindowRecord[]): Resolved {
    const front = follow.frontWindow(info, windows, self);
    const hostInfo = follow.hostOf(front, records, stateRecords);
    let moved = false;
    if (hostInfo) {
      followPids = new Set(hostInfo.pids);
      // 자리를 옮길 창인가 — VS Code 포커스 판정(a)은 확장 기록이라 OS 의 맨 앞 창과 잠깐 어긋날 수 있다(blur 를 적기 전의 몇 ms).
      // 그 순간 맨 앞이 브라우저면 자리를 옮기지 않고 상태만 따른다. 맨 앞 창이 터미널 앱으로 보이거나 따르던 그 앱이면 옮긴다
      const trusted =
        !!front && (hostInfo.kind !== "vscode" || hostInfo.frontIsHost || (companionTarget != null && companionTarget.pid === front.pid));
      if (trusted) {
        companionTarget = front;
        moved = true;
      }
      opts.onFocus(focusKeyOf(hostInfo.rec, windows));
    }
    // 호스트가 아니거나(브라우저가 앞) 그 창이 목록에 없다(다른 Space) — 마지막 창을 번호로 다시 찾아 위치만 갱신한다.
    // 닫혔으면 마지막 값 그대로 — 펫은 그 자리에 남는다
    if (companionTarget && !moved) {
      const seen = windows.find((w) => w.id === companionTarget!.id);
      if (seen) companionTarget = seen;
    }
    frontIsMine = true; // 늘 위 — place 가 floating 으로 둔다
    return {
      target: companionTarget ?? host.workArea(),
      want: decideWant(null, null, true),
      placeId: null,
      debug: { front: front ? front.id : null, host: hostInfo ? hostInfo.kind : null, pids: [...followPids] },
    };
  }

  // 추적 수단이 없다 — 탭 축만으로 정한다. 자리는 작업 영역(가짜 창)으로 갈음해 무대는 있게 한다
  function pollWithoutHelper(): void {
    const records = readWindowRecords();
    lastTarget = host.workArea();
    if (mode === "companion") {
      const hostInfo = follow.hostOf(null, records, stateRecords);
      if (hostInfo) followPids = new Set(hostInfo.pids);
      frontIsMine = true;
      applyVisible(decideWant(null, null, true));
      emit(null);
      return;
    }
    refineTermPid(records);
    const rec = myRecord(records);
    trackRecord(rec);
    const tab = tabAxis(rec);
    if (rec) sawExtension = true;
    if (mode === "window") followPids = followOf(rec);
    frontIsMine = rec ? rec.focused === true : false;
    applyVisible(decideWant(tab, rec, true));
    emit(null);
  }

  function poll(): void {
    if (host.quitting()) return;
    // 훅 기록은 폴링마다 한 번 — 호스트 판정(어느 앱이 CLI 를 띄운 적 있나)과 상태 판정이 같이 쓴다
    if (mode !== "session") stateRecords = pkstate.readStateRecords(paths.state);
    const helper = helperCommand(host.platform, paths.project, env, anchorApp ?? "");
    if (!helper) {
      pollWithoutHelper();
      return;
    }

    queryHelper(helper, (err, stdout) => {
      if (host.quitting()) return;
      if (err) {
        // 헬퍼가 계속 실패하면 안전한 쪽으로 — 아무 앱 위에나 영영 떠 있는 것을 막는다. 동반자는 늘 위가 뜻이라 자리만 멈춘다
        helperFails += 1;
        if (helperFails === R.helperFailWarn) {
          process.stderr.write(
            mode === "companion" ? "창 추적 헬퍼가 응답하지 않음 — 창을 따라가지 못한다\n" : "창 추적 헬퍼가 응답하지 않음 — 펫을 숨긴다\n",
          );
        }
        if (helperFails >= R.helperFailWarn && mode !== "companion") {
          applyVisible(false);
          emit(anchorId ?? (lastTarget ? lastTarget.id : null));
        }
        return;
      }
      helperFails = 0;

      const info = parseInfo(stdout);
      if (!info) return;
      // 목록은 전역 z-order(앞→뒤) 전체다. 앵커 판정에는 앵커 앱 창만 쓰고,
      // 가림 판정에는 전체가 필요하다 — 내 창을 덮는 게 어느 앱인지는 상관없다
      const windows = info.windows.map((w) => host.toDip(w));
      // Space 전환 중 — mac 에서만 일어난다. Windows 는 다른 가상 데스크톱의 창이 헬퍼에서 걸러져 들어오지 않고,
      // 화면 밖에 걸어 둔 창 하나(떼어 낸 모니터 자리 등) 때문에 표본을 매번 버리면 펫이 영영 자리를 못 잡는다
      if (host.platform === "darwin" && host.offScreen(windows)) return;

      const records = readWindowRecords();
      const picked = mode === "companion" ? resolveCompanion(info, windows, records) : resolveAnchored(windows, records);

      let { want } = picked;
      // 마리를 잡고 있는 동안은 판정을 보류하고 직전 상태를 유지한다
      if (opts.flags().held) want = visible;
      if (picked.target) lastTarget = picked.target;

      applyVisible(want);
      emit(picked.placeId);

      if (log) {
        const tgt = lastTarget ? { id: lastTarget.id, x: lastTarget.x, y: lastTarget.y, w: lastTarget.w, h: lastTarget.h, fake: !!lastTarget.fake } : null;
        log({ mode, want, visible, ...picked.debug, state: currentInfo().state, target: tgt });
      }
    });
  }

  // 확장이 포커스 변화를 적는 순간 바로 반응한다 — 폴링(0.4초)을 기다리면 그만큼 펫이 창에 가려 있다
  // winbounds 를 다시 돌리지 않는다. 기록에 "내 창이 포커스"라고 적혀 있으면 그것으로 충분하다
  function watchRecords(): void {
    try {
      fs.mkdirSync(windowsDir, { recursive: true });
    } catch {
      return;
    }
    let pending = false;
    try {
      watcher = fs.watch(windowsDir, () => {
        if (pending) return; // tmp+rename 은 이벤트를 여러 번 낸다 — 한 틱으로 묶는다
        pending = true;
        setImmediate(() => {
          pending = false;
          if (host.quitting()) return;
          if (mode === "companion") {
            poll(); // 동반자는 맨 앞 창을 다시 고른다 — 포커스가 바뀐 순간 폴링(0.4초)을 기다리지 않게
            return;
          }
          const records = readWindowRecords();
          refineTermPid(records);
          const rec = myRecord(records);
          trackRecord(rec);
          if (!rec) return;
          sawExtension = true;
          const tab = tabAxis(rec);
          opts.onFocus(focusKeyOf(rec, null));
          // 내 창이 포커스면 그게 곧 "화면 맨 앞" — winbounds 를 다시 돌릴 필요가 없다
          frontIsMine = rec.focused === true;
          // 탭을 옮기면 확장이 즉시 적는다. 폴링(0.4초)에 디바운스(2회)까지 기다리면 스르륵 늦게 사라진다.
          // 실제로 들고 있을 때만 미룬다
          if (!opts.flags().held) applyVisibleNow(decideWant(tab, rec, !!lastTarget));
          emit(anchorId ?? (lastTarget ? lastTarget.id : null));
          log?.({ watch: "sync", tab, visible, frontIsMine, lagMs: Math.round(host.now() - rec.at * 1000) });
        });
      });
      watcher.on("error", () => {
        // 폴더가 사라졌다 — 폴링이 받쳐 준다
      });
    } catch {
      // 감시 실패해도 폴링이 받쳐 준다
    }
  }

  return {
    start() {
      watchRecords();
      poll();
      timer = setInterval(poll, R.pollMs);
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
      stopHelper();
    },
    poll,
    currentInfo,
    termPid: () => termPid,
    target: () => lastTarget,
    visible: () => visible,
  };
}
