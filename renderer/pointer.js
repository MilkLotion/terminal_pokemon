// 포인터로 펫을 잡고 옮긴다 — buddy 가 켜진 PMD 에서만 쓴다.
//
// 기본 경로는 CSS -webkit-app-region: drag 로 OS 가 창을 끈다. 그 방식은 렌더러에 마우스 이벤트가
// 하나도 오지 않아 "클릭"을 알 수 없고, mac 에서는 놓는 순간도 알 수 없다(moved 가 move 의 별칭).
// 그래서 buddy 에서는 직접 끈다 — 눌렀다 떼면 클릭, 조금이라도 끌면 드래그.
//
// 메인에는 화면 좌표만 넘긴다. 창을 옮기고 반응을 고르는 건 메인이 한다
//
// 그림 위만 클릭을 받는다. 작업 동작(공격 등)이 칸을 키워 창이 몸보다 크다 — 투명한 곳까지 받으면 그만큼 IDE 를 못 누른다.
// 커서 밑이 그림인지 답하면 메인이 클릭 통과를 켜고 끈다 (main.js hoverTick)
import { canvas, ctx, shared } from "./core.js";

const DRAG_START_PX = 4; // 이만큼 움직여야 드래그 — 손 떨림을 클릭으로 친다
const CLICK_MAX_MS = 500; // 이보다 오래 누르고 있다 떼면 클릭이 아니다
const HIT_PAD_PX = 3; // 그림 가장자리에서 이만큼 떨어진 곳까지 그림으로 친다 — 도트 사이 틈에서 클릭이 새지 않게

// 창 안 좌표 (x, y) 가 그림 위인가 — 둘레 HIT_PAD_PX 안에 투명하지 않은 픽셀이 하나라도 있으면
function opaqueNear(x, y) {
  // 캔버스는 창을 가득 채운다. 창 좌표와 캔버스 픽셀이 다를 때(배율)를 대비해 비율로 옮긴다
  const cx = Math.floor((x * canvas.width) / (canvas.clientWidth || canvas.width));
  const cy = Math.floor((y * canvas.height) / (canvas.clientHeight || canvas.height));
  const x0 = Math.max(0, cx - HIT_PAD_PX);
  const y0 = Math.max(0, cy - HIT_PAD_PX);
  const w = Math.min(canvas.width, cx + HIT_PAD_PX + 1) - x0;
  const h = Math.min(canvas.height, cy + HIT_PAD_PX + 1) - y0;
  if (w <= 0 || h <= 0) return false;
  const { data } = ctx.getImageData(x0, y0, w, h);
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
}

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
      window.pokebuddy.pointer({ type: "grab" });
    }
    // 잡은 지점이 커서 밑에 그대로 있도록 창 좌상단을 계산해 넘긴다
    window.pokebuddy.pointer({ type: "drag", x: Math.round(e.screenX - press.grabX), y: Math.round(e.screenY - press.grabY) });
  });

  const release = (e, cancelled) => {
    if (!press || e.pointerId !== press.id) return;
    const { dragging, at } = press;
    press = null;
    document.body.style.cursor = "grab";
    if (dragging) window.pokebuddy.pointer({ type: "drop" });
    else if (!cancelled && performance.now() - at <= CLICK_MAX_MS) window.pokebuddy.pointer({ type: "click" });
  };
  document.body.addEventListener("pointerup", (e) => release(e, false));
  // 캡처를 잃으면(창이 숨겨짐 등) 놓은 것으로 친다 — 안 그러면 들린 채로 남는다
  document.body.addEventListener("pointercancel", (e) => release(e, true));
  document.body.addEventListener("lostpointercapture", (e) => release(e, true));
  // 클릭 통과를 켜면 이후 마우스는 아래로 간다 — 누르고 있던 것도 놓는다 (메인도 따로 놓는다)
  window.pokebuddy.onClickThrough((on) => {
    if (on && press) release({ pointerId: press.id }, true);
  });

  // 우클릭 — 그림 위에서만 메뉴를 청한다 (메뉴는 메인이 네이티브로 띄운다). 투명한 곳은 통과 중이라 오지 않지만,
  // 통과 전환 전의 한 프레임에 올 수 있어 한 번 더 가린다
  document.body.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (press) return; // 끄는 중에 우클릭 — 무시
    if (opaqueNear(e.clientX, e.clientY)) window.pokebuddy.pointer({ type: "menu" });
  });

  // 메인이 묻는 커서 자리가 그림 위인지 답한다. 누르고 있는 동안은 늘 그림 위로 답한다 —
  // 도중에 통과로 바뀌면 떼기가 아래 창으로 가서 펫이 들린 채 남는다
  window.pokebuddy.onHover((p) => window.pokebuddy.hit(press != null || opaqueNear(p.x, p.y)));
}
