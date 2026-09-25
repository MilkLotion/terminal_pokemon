// 무대 진입 — ready → init(크기·DPR) · sheets 캐시 · frame 보관 · 16ms 그리기 루프 · 마리별 Animator.
//
// 위치의 주인은 메인이다. 40ms 마다 오는 StageFrame 을 그대로 그리고, 애니 프레임 진행(어느 프레임인지)만 스스로 한다.
// 렌더러가 죽고 다시 떠도 ready → 메인의 재송신(init · sheets · 마지막 frame)으로 복구된다.
// 다시 그리는 때: 프레임이 새로 왔거나 · 어느 마리의 애니 프레임이 바뀌었거나 · 캔버스 크기가 바뀌었을 때만
import type { HoverQuery, LookSheets, PointerMsg, SpriteSheet, StageBridge, StageFrame, StageInit, StageSize } from "../shared/stage.js";
import { hitAt, rectOf, type HitLookup } from "./hit.js";
import { enablePointer } from "./pointer.js";
import { Animator, SpriteStore, TICK_MS } from "./sprites.js";

const params = new URLSearchParams(location.search);
const opts = {
  mock: params.get("mock") === "1", // Chrome 에서 stage.html 을 직접 열어 보는 가짜 다리 (아래 mockBridge)
  debug: params.get("debug") === "1", // init.debug 와 같다 — 화면 안 텍스트
};

// 문서 요소 — 없으면 무대를 띄울 수 없으니 바로 던진다. 함수 안에서도 좁혀진 타입을 쓰려고 상수로 받는다
function need<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`stage.html 에 #${id} 가 없다`);
  return el;
}
const canvas = need("stage", HTMLCanvasElement);
const debugBox = need("debug", HTMLPreElement);
// getContext 옵션 없음 — willReadFrequently 를 주면 GPU 가속이 빠진다. 픽셀은 시트별 ImageData(sprites.ts)에서 읽는다
const ctx = ((): CanvasRenderingContext2D => {
  const c = canvas.getContext("2d");
  if (!c) throw new Error("2D 컨텍스트를 만들지 못했다");
  return c;
})();

const store = new SpriteStore();
const animators = new Map<string, Animator>();
let init: StageInit | null = null;
let frame: StageFrame | null = null;
let dpr = window.devicePixelRatio || 1;
let dirty = true;
let hoverId: string | null = null;
let debugOn = opts.debug || opts.mock;
const notes: string[] = []; // 디버그 줄 — 마지막 몇 개만
const note = (s: string) => {
  notes.push(s);
  if (notes.length > 8) notes.shift();
  renderDebug();
};

// 진단 — 화면 debug 와 함께 메인 로그로 (stage:log). 옛 preload 에는 log 가 없을 수 있어 optional call
function diag(entry: Record<string, unknown>) {
  bridge.log?.(entry);
  if (debugOn) note(Object.entries(entry).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" "));
}

// 캔버스 크기 = 무대 크기(DIP) × devicePixelRatio. 반드시 이 함수로만 정한다.
// canvas.width/height 를 대입하면 2D 컨텍스트가 기본값으로 리셋돼 imageSmoothingEnabled 가 true 로 돌아간다(같은 값을
// 다시 넣어도 리셋된다). 그러면 정수 배율에서도 도트가 번진다 — 인접한 검정·흰색 픽셀이 [0,0,32,96,159,223,255,255] 처럼
// 그라데이션이 된다. CSS image-rendering: pixelated 로는 못 막는다. 블러가 이미 비트맵에 구워진 뒤다
function resize(size: StageSize) {
  const w = Math.max(1, Math.round(size.w));
  const h = Math.max(1, Math.round(size.h));
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.imageSmoothingEnabled = false;
  dirty = true;
}

// 프레임 반영 — 마리마다 Animator 를 맞추고, 사라진 마리의 것은 버린다. look 이 바뀐 마리는 새로 만든다
function syncFrame(f: StageFrame, now: number) {
  frame = f;
  const seen = new Set<string>();
  for (const pet of f.pets) {
    seen.add(pet.id);
    let a = animators.get(pet.id);
    if (!a || a.look !== pet.look) {
      a = new Animator(store, pet.look);
      animators.set(pet.id, a);
    }
    a.update(pet, f.state, now);
  }
  for (const id of animators.keys()) if (!seen.has(id)) animators.delete(id);
  dirty = true;
}

// 히트가 볼 것 — 그 마리가 지금 그려진 프레임과 시트 알파
const lookup: HitLookup = (pet) => {
  const art = store.get(pet.look);
  const shown = animators.get(pet.id)?.current();
  if (!art || !shown) return null;
  const sheet = art.anims[shown.anim];
  const alpha = art.alpha.get(shown.anim);
  if (!sheet || !alpha) return null;
  return { body: art.body, sprite: { fw: sheet.fw, fh: sheet.fh, col: shown.col, row: shown.row, alpha } };
};
const hitAtStage = (x: number, y: number) => (frame ? hitAt(frame, lookup, x, y) : null);

function paint() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  // 그리는 순서 = 배열 순서 (뒤가 위)
  for (const pet of frame.pets) {
    if (pet.berry) {
      const x = Math.round(pet.berry.x * dpr), y = Math.round(pet.berry.y * dpr);
      const unit = Math.max(1, Math.round(3 * dpr));
      ctx.fillStyle = "#d65073";
      ctx.fillRect(x - unit * 2, y - unit * 3, unit * 4, unit * 3);
      ctx.fillStyle = "#78b65a";
      ctx.fillRect(x, y - unit * 4, unit * 2, unit);
      ctx.fillStyle = "#ffb3bf";
      ctx.fillRect(x - unit, y - unit * 2, unit, unit);
    }
    const art = store.get(pet.look);
    const shown = animators.get(pet.id)?.current();
    if (!art || !shown) continue;
    const sheet = art.anims[shown.anim];
    const img = art.images.get(shown.anim);
    if (!sheet || !img) continue;
    const r = rectOf(pet, art.body, sheet);
    // 목적 사각형은 장치 픽셀로 반올림 — 정수 배율에서 도트 한 칸이 고르게 나오게
    ctx.drawImage(
      img,
      shown.col * sheet.fw,
      shown.row * sheet.fh,
      sheet.fw,
      sheet.fh,
      Math.round(r.x * dpr),
      Math.round(r.y * dpr),
      Math.round(r.w * dpr),
      Math.round(r.h * dpr),
    );
    if (pet.evolution) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 226, 110, ${pet.evolution})`;
      ctx.lineWidth = 3 * dpr;
      const radius = (1 - pet.evolution) * 18 + Math.max(r.w, r.h) / 2;
      ctx.beginPath();
      ctx.arc((r.x + r.w / 2) * dpr, (r.y + r.h / 2) * dpr, radius * dpr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
  if (debugOn) renderDebug();
}

function renderDebug() {
  if (!debugOn) return;
  const lines = [
    `무대 ${init ? `${init.size.w}x${init.size.h}` : "?"} dpr ${dpr} 캔버스 ${canvas.width}x${canvas.height} 보간 ${ctx.imageSmoothingEnabled}`,
    `시트 ${store.keys().join(" ") || "없음"}  상태 ${frame?.state ?? "?"}  히트 ${hoverId ?? "-"}  누름 ${pointer.pressedId() ?? "-"}`,
  ];
  for (const pet of frame?.pets ?? []) {
    const reason = store.reason(pet.look);
    lines.push(
      `${pet.id} ${pet.look} x${pet.zoom} @${Math.round(pet.x)},${Math.round(pet.y)}${pet.held ? " 들림" : ""}  ${reason ?? animators.get(pet.id)?.describe() ?? ""}`,
    );
  }
  debugBox.textContent = [...lines, ...notes].join("\n");
}

function tick() {
  // 다른 디스플레이로 옮겨지면 DPR 이 바뀐다 — 창 크기는 그대로라 resize 이벤트가 없을 수 있어 여기서 본다
  const nowDpr = window.devicePixelRatio || 1;
  if (nowDpr !== dpr) {
    dpr = nowDpr;
    if (init) resize(init.size);
  }
  const now = performance.now();
  for (const a of animators.values()) if (a.step(now)) dirty = true;
  if (dirty) {
    dirty = false;
    paint();
  }
}

const bridge: StageBridge = opts.mock ? mockBridge() : window.pokebuddy;

const pointer = enablePointer(document.body, {
  hitAt: hitAtStage,
  bodyOrigin: (id) => {
    const pet = frame?.pets.find((p) => p.id === id);
    return pet ? { x: pet.x, y: pet.y } : null;
  },
  send: (msg) => {
    bridge.pointer(msg);
    if (debugOn && msg.type !== "drag") note(`pointer ${msg.type} ${msg.id} @${msg.x},${msg.y}`);
  },
});

bridge.onInit((next) => {
  init = next;
  debugOn = opts.debug || opts.mock || next.debug;
  debugBox.hidden = !debugOn;
  resize(next.size);
});

bridge.onSheets((sheets) => {
  void store.put(sheets).then((r) => {
    // 시트가 준비되면 이 look 의 마리들이 다음 update 에서 재생을 시작한다 — 프레임을 기다리지 않고 지금 것으로 한 번 맞춘다
    if (frame) syncFrame(frame, performance.now());
    dirty = true;
    // 디코드 실패·idle 없는 look — 메인은 이 길로만 안다 (화면엔 안 그려지고 끝나는 것을 막는다)
    if (!r.ok || r.missing.length > 0) diag({ kind: "sheets", look: sheets.look, ok: r.ok, missing: r.missing, reason: r.reason });
    else if (debugOn) note(`sheets ${sheets.look} ${Object.keys(sheets.anims).length}동작`);
  });
});

bridge.onFrame((f) => syncFrame(f, performance.now()));

// 메인이 묻는 커서 자리가 어느 마리 위인지 답한다. 누르고 있는 동안은 늘 그 마리로 답한다 —
// 도중에 통과로 바뀌면 떼기가 아래 창으로 가서 마리가 들린 채 남는다
bridge.onHover((q: HoverQuery) => {
  hoverId = pointer.pressedId() ?? hitAtStage(q.x, q.y);
  bridge.hit(hoverId);
  if (!pointer.pressedId()) document.body.style.cursor = hoverId ? "grab" : "default";
  if (debugOn) renderDebug();
});

// 울음소리 — 메인이 받은 PokeAPI 울음소리(ogg)를 한 번 낸다. 원본이 커서 소리를 줄인다
bridge.onCry((uri) => {
  const audio = new Audio(uri);
  audio.volume = 0.2;
  void audio.play().catch(() => undefined); // 재생을 막는 환경이면 소리 없이 넘어간다
});

// 클릭 통과를 켜면 이후 마우스는 아래로 간다 — 누르고 있던 것도 놓는다 (메인도 따로 놓는다)
bridge.onClickThrough((on) => {
  if (on) {
    pointer.release();
    document.body.style.cursor = "default";
  }
});

setInterval(tick, TICK_MS);
// 로드 직후 한 번 — 메인이 init · 모든 look 의 sheets · 마지막 frame 을 (다시) 보낸다
bridge.ready();

// ---- mock — stage.html?mock=1 을 Chrome 에서 직접 열 때의 가짜 다리. 고정 시트 없이 색 사각형 시트를 만들어
//      그리기·히트·드래그를 화면 안 텍스트로 확인한다. Electron 에서는 쓰지 않는다
function mockBridge(): StageBridge {
  type Cb<T> = (v: T) => void;
  const cbs = { init: [] as Cb<StageInit>[], sheets: [] as Cb<LookSheets>[], frame: [] as Cb<StageFrame>[], hover: [] as Cb<HoverQuery>[], ct: [] as Cb<boolean>[] };

  // 색 사각형 시트 — 프레임마다 안쪽 여백을 달리 해 넘어가는 것이 보이게, 행마다 밝기를 달리 해 방향이 보이게
  function sheet(fw: number, fh: number, cols: number, rows: number, hue: number, ms: number): SpriteSheet {
    const c = document.createElement("canvas");
    c.width = fw * cols;
    c.height = fh * rows;
    const g = c.getContext("2d");
    if (g) {
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const inset = 2 + i * 2;
          g.fillStyle = `hsl(${hue} 70% ${35 + r * 6}%)`;
          g.fillRect(i * fw + inset, r * fh + inset, fw - inset * 2, fh - inset * 2 - 4);
          g.fillStyle = "#fff";
          g.fillRect(i * fw + Math.floor(fw / 2) - 1, r * fh + Math.floor(fh / 2) + 3, 3, 3); // 정렬 기준점 (w/2, h/2+4) 표시
        }
      }
    }
    return { fw, fh, rows, frames: Array.from({ length: cols }, (_, x) => ({ x, ms })), dataUrl: c.toDataURL("image/png") };
  }
  function look(name: string, hue: number, big: boolean): LookSheets {
    const anims: Record<string, SpriteSheet> = {
      Idle: sheet(24, 24, 2, 8, hue, 500),
      Walk: sheet(24, 24, 4, 8, hue, 150),
      Pose: sheet(24, 24, 3, 1, hue + 40, 130),
      Faint: sheet(24, 24, 3, 1, hue - 40, 200),
    };
    if (big) anims["Attack"] = sheet(48, 40, 3, 8, hue + 90, 60); // 몸보다 큰 작업 동작 — 몸 밖으로 넘치는 정렬 확인
    return {
      look: name,
      cell: big ? { w: 48, h: 40 } : { w: 24, h: 24 },
      body: { w: 24, h: 24 },
      anims,
      clips: {
        idle: { anim: "Idle", mode: "loop", row: 0 },
        running: { anim: "Walk", mode: "loop", row: 2 },
        waiting: { anim: "Idle", mode: "loop", row: 4 },
        waving: { anim: "Pose", mode: "once", row: 0 },
        failed: { anim: "Faint", mode: "hold", row: 0 },
      },
    };
  }

  const states: StageFrame["state"][] = ["idle", "running", "waiting", "waving", "failed"];
  const pets = [
    { id: "a", look: "mock-a", zoom: 2, x: 40, y: 60, held: false, walk: true },
    { id: "b", look: "mock-b", zoom: 3, x: 200, y: 40, held: false, walk: false },
    { id: "c", look: "mock-c", zoom: 2, x: 120, y: 120, held: false, walk: false },
  ];
  let held: string | null = null;
  let t0 = 0;
  let last: PointerMsg | null = null;

  function frameAt(now: number): StageFrame {
    const sec = (now - t0) / 1000;
    const state = states[Math.floor(sec / 4) % states.length] ?? "idle";
    const a = pets[0];
    if (a && held !== a.id) {
      a.x = 40 + Math.round(((Math.sin(sec / 2) + 1) / 2) * Math.max(0, innerWidth - 100));
    }
    const dir = Math.cos(sec / 2) >= 0 ? 2 : 6;
    return {
      at: Date.now(),
      state,
      pets: pets.map((p) => ({
        id: p.id,
        look: p.look,
        zoom: p.zoom,
        x: p.x,
        y: p.y,
        held: held === p.id,
        play: held === p.id ? { anim: "Idle", row: 4, mode: "hold", rate: 1 } : p.walk ? { anim: "Walk", row: dir, mode: "loop", rate: 1.5 } : p.id === "c" && Math.floor(sec) % 6 < 2 ? { anim: "Attack", row: 0, mode: "loop", rate: 1 } : null,
      })),
    };
  }

  return {
    ready() {
      t0 = performance.now();
      setTimeout(() => {
        for (const cb of cbs.init) cb({ size: { w: innerWidth, h: innerHeight }, debug: true });
        for (const cb of cbs.sheets) {
          cb(look("mock-a", 120, false));
          cb(look("mock-b", 0, false));
          cb(look("mock-c", 210, true));
        }
        setInterval(() => {
          const f = frameAt(performance.now());
          for (const cb of cbs.frame) cb(f);
        }, 40);
        addEventListener("resize", () => {
          for (const cb of cbs.init) cb({ size: { w: innerWidth, h: innerHeight }, debug: true });
        });
        // 메인의 hoverTick 흉내 — 마우스 자리를 40ms 마다 묻는다
        let mx = -1;
        let my = -1;
        addEventListener("pointermove", (e) => {
          mx = e.clientX;
          my = e.clientY;
        });
        setInterval(() => {
          if (mx >= 0) for (const cb of cbs.hover) cb({ x: mx, y: my });
        }, 40);
        // 키 c — 클릭 통과 켜기 흉내 (누르고 있던 것이 놓이는지)
        addEventListener("keydown", (e) => {
          if (e.key === "c") for (const cb of cbs.ct) cb(true);
        });
      }, 0);
    },
    onInit: (cb) => void cbs.init.push(cb),
    onSheets: (cb) => void cbs.sheets.push(cb),
    onFrame: (cb) => void cbs.frame.push(cb),
    onHover: (cb) => void cbs.hover.push(cb),
    onClickThrough: (cb) => void cbs.ct.push(cb),
    onCry: () => {},
    hit: () => {},
    log: () => {}, // mock 은 진단을 #debug 로만 본다
    pointer(msg) {
      last = msg;
      const p = pets.find((x) => x.id === msg.id);
      if (!p) return;
      if (msg.type === "grab") held = msg.id;
      else if (msg.type === "drag" && held === msg.id) {
        p.x = msg.x;
        p.y = msg.y;
      } else if (msg.type === "drop") held = null;
      else if (msg.type === "click") p.zoom = p.zoom >= 3 ? 1 : p.zoom + 1;
      else if (msg.type === "menu") note(`(mock) 메뉴 ${msg.id} — 마지막 ${last.type}`);
    },
    pickerList: () => Promise.resolve({ title: "", subtitle: "", start: "", empty: "", items: [] }),
    pickerPortraits: () => Promise.resolve({}),
    pickerStart: () => {},
  };
}
