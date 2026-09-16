// 포인터로 펫을 잡고 옮긴다 — buddy 가 켜진 PMD 에서만 쓴다.
//
// 기본 경로는 CSS -webkit-app-region: drag 로 OS 가 창을 끈다. 그 방식은 렌더러에 마우스 이벤트가
// 하나도 오지 않아 "클릭"을 알 수 없고, mac 에서는 놓는 순간도 알 수 없다(moved 가 move 의 별칭).
// 그래서 buddy 에서는 직접 끈다 — 눌렀다 떼면 클릭, 조금이라도 끌면 드래그.
//
// 메인에는 화면 좌표만 넘긴다. 창을 옮기고 반응을 고르는 건 메인이 한다
import { shared } from "./core.js";

const DRAG_START_PX = 4; // 이만큼 움직여야 드래그 — 손 떨림을 클릭으로 친다
const CLICK_MAX_MS = 500; // 이보다 오래 누르고 있다 떼면 클릭이 아니다

export function enablePointer() {
  shared.pointer = true; // 클릭 통과를 끌 때 app-region 을 되살리지 않게 core 가 본다
  document.body.style.webkitAppRegion = "no-drag";

  let press = null; // { id, grabX, grabY, sx, sy, at, dragging }

  document.body.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    // 이전 누름의 떼기를 놓쳤다 — 먼저 놓아 준다. 안 그러면 메인이 들고 있는 상태로 남는다
    if (press) release({ pointerId: press.id }, true);
    // 누른 채 창 밖으로 나가도 이벤트를 계속 받는다 — 빠르게 끌면 작은 창을 금방 벗어난다
    document.body.setPointerCapture(e.pointerId);
    press = { id: e.pointerId, grabX: e.clientX, grabY: e.clientY, sx: e.screenX, sy: e.screenY, at: performance.now(), dragging: false };
    document.body.style.cursor = "grabbing";
  });

  document.body.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    // 버튼이 이미 떨어졌는데 pointerup 을 놓쳤다(클릭 통과 전환 등) — 놓은 것으로 친다
    if ((e.buttons & 1) === 0) {
      release(e, true);
      return;
    }
    if (!press.dragging) {
      if (Math.hypot(e.screenX - press.sx, e.screenY - press.sy) < DRAG_START_PX) return;
      press.dragging = true;
      window.termimon.pointer({ type: "grab" });
    }
    // 잡은 지점이 커서 밑에 그대로 있도록 창 좌상단을 계산해 넘긴다
    window.termimon.pointer({ type: "drag", x: Math.round(e.screenX - press.grabX), y: Math.round(e.screenY - press.grabY) });
  });

  const release = (e, cancelled) => {
    if (!press || e.pointerId !== press.id) return;
    const { dragging, at } = press;
    press = null;
    document.body.style.cursor = "grab";
    if (dragging) window.termimon.pointer({ type: "drop" });
    else if (!cancelled && performance.now() - at <= CLICK_MAX_MS) window.termimon.pointer({ type: "click" });
  };
  document.body.addEventListener("pointerup", (e) => release(e, false));
  // 캡처를 잃으면(창이 숨겨짐 등) 놓은 것으로 친다 — 안 그러면 들린 채로 남는다
  document.body.addEventListener("pointercancel", (e) => release(e, true));
  document.body.addEventListener("lostpointercapture", (e) => release(e, true));
  // 클릭 통과를 켜면 이후 마우스는 아래로 간다 — 누르고 있던 것도 놓는다 (메인도 따로 놓는다)
  window.termimon.onClickThrough((on) => {
    if (on && press) release({ pointerId: press.id }, true);
  });
}
