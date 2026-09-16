// 렌더러 공통 — 캔버스와 설정을 만들고, 그림 종류에 맞는 모듈로 넘긴다.
// 그림 방식마다 파일이 따로다: showdown.js(원본 GIF) · sheet.js(codex 팩) · pmd.js(동작별 스프라이트)
const params = new URLSearchParams(location.search);

export const opts = {
  fps: Number(params.get("fps") || 7),
  debug: Boolean(params.get("debug")),
  motionAssist: params.get("motionAssist") || "off",
  dotTarget: Number(params.get("dotSize") ?? 2),
  pingPong: params.get("pingPong") || "auto",
  pointer: params.get("pointer") === "1", // buddy — 잡기·클릭을 렌더러가 직접 받는다
};

export const canvas = document.getElementById("termimon");
export const ctx = canvas.getContext("2d");

// 캔버스 크기를 정한다. 반드시 이 함수로만 정한다.
// canvas.width/height 를 대입하면 2D 컨텍스트가 기본값으로 리셋돼 imageSmoothingEnabled 가
// true 로 돌아간다(같은 값을 다시 넣어도 리셋된다). 그러면 정수 배율에서도 도트가 번진다 —
// 인접한 검정·흰색 픽셀이 [0,0,32,96,159,223,255,255] 처럼 그라데이션이 된다.
// CSS image-rendering: pixelated 로는 못 막는다. 블러가 이미 비트맵에 구워진 뒤다
export function resize(w, h) {
  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;
}
resize(canvas.width, canvas.height);

// 지금 상태. 각 모듈이 읽고, 바뀔 때 onStateChange 로 알림을 받는다
// act 는 buddy 가 고른 동작 — 그림을 불러오기 전에 와도 여기 남아 있다
export const shared = { state: "idle", act: null };
const listeners = [];
export const onStateChange = (fn) => listeners.push(fn);
const actListeners = [];
export const onAct = (fn) => actListeners.push(fn);

export function log(obj) {
  if (opts.debug) console.log(JSON.stringify(obj));
}

export function start() {
  // 디버그 — 마우스가 이 창까지 오는지. 안 오면 창 위에 다른 창이 있거나 OS 가 입력을 막는 것이다
  // (캡처 단계에서 듣는다 — 포인터 처리보다 먼저, 막히더라도 찍히게)
  if (opts.debug) {
    for (const type of ["pointerdown", "pointerup"]) {
      document.addEventListener(type, (e) => log({ input: type, button: e.button, screen: [e.screenX, e.screenY] }), true);
    }
  }
  window.termimon.getArt().then(async (art) => {
    const loaders = { pmd: () => import("./pmd.js"), gif: () => import("./showdown.js"), sheet: () => import("./sheet.js") };
    const load = loaders[art.kind];
    // 모르는 종류를 아무 모듈에나 넘기면 빈 화면이 된다 — 차라리 알린다
    if (!load) throw new Error(`알 수 없는 그림 종류: ${art.kind}`);
    const mod = await load();
    mod.setup(art);
    if (opts.pointer && art.kind === "pmd") (await import("./pointer.js")).enablePointer();
  });

  window.termimon.onState((next) => {
    if (next === shared.state) return;
    const prev = shared.state;
    shared.state = next;
    for (const fn of listeners) fn(next, prev);
  });

  // getArt·모듈 import 를 기다리지 않고 바로 받는다 — 그 사이에 온 act 를 IPC 가 버리지 않게
  window.termimon.onAct((req) => {
    shared.act = req;
    for (const fn of actListeners) fn(req);
  });

  window.termimon.onClickThrough((on) => {
    // 포인터로 직접 끄는 중이면 app-region 을 되살리지 않는다 — 살리면 OS 가 마우스를 가로채 클릭이 안 온다
    document.body.style.webkitAppRegion = on || shared.pointer ? "no-drag" : "drag";
    document.body.style.cursor = on ? "default" : "grab";
  });
}
