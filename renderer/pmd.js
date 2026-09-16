// PMD 스프라이트 — 동작마다 그림이 따로 있다.
//
// 시트는 행 = 방향 8종(0=정면 2=오른쪽 4=뒤 6=왼쪽), 열 = 프레임.
// 칸 크기가 동작마다 다르지만 창은 고정이므로, 고정 캔버스 안에 가운데 정렬한다.
// PMD 의 정렬 기준점은 칸 안의 (칸너비/2, 칸높이/2 + 4) 다. 칸을 캔버스 가운데에 놓으면
// 이 점이 캔버스의 (W/2, H/2 + 4) 에 떨어진다 — 칸 크기와 무관한 상수라, 동작이 바뀌어도
// 발 위치가 그대로다.
//
// 프레임 지속시간이 프레임마다 다르다(AnimData.xml). 균일 간격으로는 표현할 수 없어
// 누적 시간으로 넘긴다.
//
// 무엇을 재생할지는 두 갈래다.
//   상태  Claude 상태(idle·running…)에 붙은 동작. 기본값
//   act   메인(buddy)이 직접 고른 동작 — 산책·수면·반응. 있으면 상태보다 앞선다. null 이면 상태로 돌아간다
import { canvas, ctx, shared, onStateChange, onAct, log, resize } from "./core.js";

const TICK_MS = 16;
// 창이 숨었다 돌아오면 밀린 시간이 쌓여 있다. 따라잡지 않고 지금부터 다시 센다
const CATCHUP_LIMIT_MS = 250;

export function setup(art) {
  const { cell, zoom, anims, clips } = art;
  resize(cell.w * zoom, cell.h * zoom);

  const images = {}; // 동작 이름 → 이미지
  let act = null; // 메인이 고른 동작 { anim, row, mode, rate } — 상태보다 앞선다 (걸러진 것만)
  let cur = null; // 지금 재생 중 { anim, row, mode, rate }. 첫 재생 전엔 null
  let frame = 0;
  let due = 0;
  let frozen = false; // 한 번 재생이 끝나 마지막 프레임에서 멈춘 상태
  let ready = false; // 시트를 다 불러왔는가
  // 한 번만 재생하는 상태 동작(waving=Pose once · failed=Faint hold)을 이미 끝까지 보여준 상태.
  // act 가 끼어들었다 null 로 돌아와도 다시 재생하지 않는다 — 또 인사하고, 또 쓰러지면 이상하다.
  // 상태가 바뀌면 지운다
  let doneState = null;

  // 불러오는 중에 온 act 는 core 가 shared.act 에 남겨 둔다 — 다 불러온 뒤 그걸로 시작한다
  onAct((req) => {
    if (!ready) return;
    if (!req) {
      if (!act) return; // 이미 상태 동작 — 같은 null 이 또 와도 되감지 않는다
      act = null;
    } else {
      const ok = sanitize(req);
      if (!ok) return; // 없는 동작 — 지금 재생 중인 것을 지우지 않고 무시한다
      act = ok;
    }
    play(wanted());
  });

  const asPlay = (c) => ({ anim: c.anim, row: c.row, mode: c.mode, rate: 1 });
  // 프레임 지속시간 — rate 배 빠르게 (산책 속도에 맞춰 걷는 그림도 빨라지고 느려진다)
  const msOf = (a, i) => a.frames[i].ms / cur.rate;

  // 지금 보여야 할 동작 — act 가 있으면 그것, 없으면 상태에 붙은 것
  function wanted() {
    if (act) return act;
    const c = clips[shared.state] || clips.idle;
    if (doneState === shared.state && c.mode === "once") return asPlay(clips.idle); // 인사는 끝났다
    return asPlay(c);
  }

  function paint() {
    const a = cur && anims[cur.anim];
    const img = cur && images[cur.anim];
    if (!a || !img) return;
    const f = a.frames[frame];
    const dx = Math.round((cell.w - a.fw) / 2);
    const dy = Math.round((cell.h - a.fh) / 2);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, f.x * a.fw, cur.row * a.fh, a.fw, a.fh, dx * zoom, dy * zoom, a.fw * zoom, a.fh * zoom);
  }

  function play(next) {
    const prev = cur;
    cur = next;
    // 같은 그림을 계속 도는 전환은 되감지 않는다 — 되감으면 뚝 끊긴다.
    // idle→waiting 이 둘 다 Idle 루프인 경우, 산책 중 방향·속도만 바뀌는 경우(프레임은 잇고 행만 바꿔 그린다)
    if (prev && prev.anim === next.anim && prev.mode === "loop" && next.mode === "loop") {
      if (prev.row !== next.row) paint();
      return;
    }
    frame = 0;
    frozen = false;
    // 이미 쓰러진 상태로 돌아오면 쓰러지는 과정을 다시 보이지 않고 마지막 자세로 둔다
    if (!act && next.mode === "hold" && doneState === shared.state) {
      frame = anims[next.anim].frames.length - 1;
      frozen = true;
    }
    due = performance.now() + msOf(anims[next.anim], frame);
    paint();
    log({ pmd: act ? "act" : shared.state, anim: next.anim, row: next.row, mode: next.mode, rate: next.rate });
  }

  // 있는 동작만 받는다 — 방향 행은 그 시트에 있는 범위로 줄인다 (1행짜리 동작 방어)
  // 이름은 자기 키로만 찾는다 — "constructor" 같은 프로토타입 이름이 통과하면 그리다 죽는다
  function sanitize(req) {
    if (!req || typeof req.anim !== "string" || !Object.hasOwn(images, req.anim)) return null;
    const row = Math.min(Math.max(0, Math.round(req.row) || 0), anims[req.anim].rows - 1);
    const mode = req.mode === "hold" ? "hold" : "loop"; // act 는 반복 또는 끝 자세 유지 — 언제 끝낼지는 메인이 정한다
    // 재생 속도 — 없거나 망가진 값이면 원래 속도. 0 에 가까우면 멈춘 것처럼 보이고 너무 크면 깜박이므로 가둔다
    const rate = Number.isFinite(req.rate) ? Math.min(Math.max(req.rate, 0.25), 4) : 1;
    return { anim: req.anim, row, mode, rate };
  }

  function step() {
    if (frozen) return;
    const now = performance.now();
    if (now < due) return;
    const a = anims[cur.anim];

    if (frame + 1 >= a.frames.length) {
      if (cur.mode === "loop") frame = 0;
      else if (cur.mode === "hold") {
        frozen = true; // 쓰러진 채로·반응 끝 자세로 있는다. act 면 메인이 다음 동작을 보낸다
        if (!act) doneState = shared.state;
        return;
      } else {
        // once — 상태 동작(waving=Pose)만 쓴다. 한 번 보여주고 돌아온다.
        // 끝났다고 적어 두어, 상태가 그대로여도 다시 고르지 않게 한다
        doneState = shared.state;
        play(wanted());
        return;
      }
    } else {
      frame += 1;
    }

    due += msOf(a, frame);
    if (now - due > CATCHUP_LIMIT_MS) due = now + msOf(a, frame);
    paint();
  }

  // 시트를 전부 불러온 뒤 시작한다 — 중간에 비면 빈 칸이 보인다
  const loading = Object.entries(anims).map(
    ([name, a]) =>
      new Promise((done) => {
        const img = new Image();
        img.onload = () => {
          images[name] = img;
          done();
        };
        img.onerror = () => done();
        img.src = a.dataUrl;
      }),
  );

  Promise.all(loading).then(() => {
    // 못 불러온 동작을 가리키는 상태는 지운다 — 남겨두면 그 상태를 골라 paint 가 아무것도 안 그리고,
    // 직전 그림이 캔버스에 그대로 남는다(hold 면 그 상태로 굳는다)
    for (const [name, c] of Object.entries(clips)) if (!images[c.anim]) delete clips[name];
    if (!clips.idle) throw new Error("PMD idle 그림을 불러오지 못했다");

    act = sanitize(shared.act);
    ready = true;
    play(wanted());
    setInterval(step, TICK_MS);
    const stateAnims = new Set(Object.values(clips).map((c) => c.anim));
    log({ 그림: "pmd", 캔버스: `${canvas.width}x${canvas.height}`, 배율: zoom,
          동작: Object.entries(clips).map(([k, c]) => `${k}=${c.anim}`).join(" "),
          추가: Object.keys(images).filter((n) => !stateAnims.has(n)).join(" "),
          도트보간: ctx.imageSmoothingEnabled });
    // 불러오기 전에 상태가 바뀌어도 여기서 shared.state 로 시작하므로 놓치지 않는다.
    // 먼저 등록하면 그 사이 play 가 cur 를 바꿔, 위 첫 play 가 "같은 루프"로 보고 아무것도 안 그린다
    onStateChange(() => {
      doneState = null;
      if (!act) play(wanted());
    });
  });
}
