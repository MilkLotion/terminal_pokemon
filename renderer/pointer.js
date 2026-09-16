// 포인터로 펫을 잡고 옮긴다 — buddy 가 켜진 PMD 에서만 쓴다.
//
// 기본 경로는 CSS -webkit-app-region: drag 로 OS 가 창을 끈다. 그 방식은 렌더러에 마우스 이벤트가
// 하나도 오지 않아 "클릭"을 알 수 없고, mac 에서는 놓는 순간도 알 수 없다(moved 가 move 의 별칭).
// 그래서 buddy 에서는 직접 끈다 — 눌렀다 떼면 클릭, 조금이라도 끌면 드래그.
//
// 누르기(pointerdown)가 안 올 때가 있다. Windows 에서 포커스를 받지 않는 창(focusable:false)을 숨겼다 다시 보이면,
// Chromium 이 누르기를 먹고(WM_MOUSEACTIVATE → MA_NOACTIVATEANDEAT) 떼기와 "버튼이 눌린 채 움직임"만 넘긴다.
// 탭을 한 번 옮기면 잡기·클릭이 안 되던 원인이다 (최소 시험 창으로 재현). 그래서 누르기에 기대지 않는다 —
//   버튼이 눌린 채 움직이면 그때 누른 것으로 치고, 짝 없는 떼기는 클릭으로 친다.
//
// 메인에는 잡은 지점만 넘긴다. 끄는 동안 창은 메인이 커서를 직접 읽어 옮긴다 — 누르기가 먹히면 OS 가 마우스를
// 이 창에 묶어 주지 않아, 커서가 작은 창을 벗어나는 순간 움직임이 끊긴다
import { shared } from "./core.js";

const DRAG_START_PX = 4; // 이만큼 움직여야 드래그 — 손 떨림을 클릭으로 친다
const CLICK_MAX_MS = 500; // 이보다 오래 누르고 있다 떼면 클릭이 아니다
const RELEASE_QUIET_MS = 300; // 놓은 직후 늦게 온 떼기를 또 클릭으로 치지 않는다

export function enablePointer() {
  shared.pointer = true; // 클릭 통과를 끌 때 app-region 을 되살리지 않게 core 가 본다
  document.body.style.webkitAppRegion = "no-drag";

  let press = null; // { id, grabX, grabY, sx, sy, at, dragging }
  let releasedAt = 0;

  const begin = (e) => {
    // 이전 누름의 떼기를 놓쳤다 — 먼저 놓아 준다. 안 그러면 메인이 들고 있는 상태로 남는다
    if (press) release({ pointerId: press.id }, true);
    try {
      // 누른 채 창 밖으로 나가도 이벤트를 계속 받는다 — 누르기가 먹힌 경우에는 걸리지 않을 수 있다
      document.body.setPointerCapture(e.pointerId);
    } catch {
      // 메인이 커서를 따라 창을 옮기므로 캡처 없이도 이벤트가 이어진다
    }
    press = { id: e.pointerId, grabX: e.clientX, grabY: e.clientY, sx: e.screenX, sy: e.screenY, at: performance.now(), dragging: false };
    document.body.style.cursor = "grabbing";
  };

  document.body.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    begin(e);
  });

  document.body.addEventListener("pointermove", (e) => {
    // 누르기가 먹혔다 — 버튼이 눌린 채 움직이면 지금 누른 것으로 친다
    if (!press && (e.buttons & 1)) begin(e);
    if (!press || e.pointerId !== press.id) return;
    // 버튼이 이미 떨어졌는데 pointerup 을 놓쳤다(클릭 통과 전환·창 밖에서 놓음 등) — 놓은 것으로 친다
    if ((e.buttons & 1) === 0) {
      release(e, true);
      return;
    }
    if (press.dragging || Math.hypot(e.screenX - press.sx, e.screenY - press.sy) < DRAG_START_PX) return;
    press.dragging = true;
    // 잡은 지점(창 안 좌표) — 메인이 이 지점이 커서 밑에 그대로 있도록 창을 옮긴다
    window.pkmon.pointer({ type: "grab", offsetX: press.grabX, offsetY: press.grabY });
  });

  const release = (e, cancelled) => {
    if (!press || e.pointerId !== press.id) return;
    const { dragging, at } = press;
    press = null;
    releasedAt = performance.now();
    document.body.style.cursor = "grab";
    if (dragging) window.pkmon.pointer({ type: "drop" });
    else if (!cancelled && performance.now() - at <= CLICK_MAX_MS) window.pkmon.pointer({ type: "click" });
  };
  document.body.addEventListener("pointerup", (e) => {
    if (press) {
      release(e, false);
      return;
    }
    // 짝 없는 떼기 — 누르기가 먹힌 클릭이다 (움직였다면 위에서 누른 것으로 쳤다)
    if (e.button === 0 && performance.now() - releasedAt > RELEASE_QUIET_MS) {
      releasedAt = performance.now();
      window.pkmon.pointer({ type: "click" });
    }
  });
  // 캡처를 잃으면(창이 숨겨짐 등) 놓은 것으로 친다 — 안 그러면 들린 채로 남는다
  document.body.addEventListener("pointercancel", (e) => release(e, true));
  document.body.addEventListener("lostpointercapture", (e) => release(e, true));
  // 클릭 통과를 켜면 이후 마우스는 아래로 간다 — 누르고 있던 것도 놓는다 (메인도 따로 놓는다)
  window.pkmon.onClickThrough((on) => {
    if (on && press) release({ pointerId: press.id }, true);
  });
}
