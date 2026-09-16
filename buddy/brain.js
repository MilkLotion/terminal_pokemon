// buddy 의 판단 — 언제 걷고, 어디로 가고, 언제 자고, 건드리면 어떻게 반응할지.
//
// 창·Electron·파일을 모른다. 시각과 입력을 받아 "지금 산책 오프셋"과 "지금 보여줄 동작"만 돌려준다.
// 그래서 node 만으로 시간을 돌려 가며 시험할 수 있다.
//
// 두 모드로 움직인다 — CLI 가 일하는 중(running)인지로 가른다
//   한가  한참 서 있다가 가끔 천천히 걷고, 두리번·앉기 같은 조용한 동작을 한다. 오래 조용하면 잔다
//   작업  거의 서 있지 않는다. 빠르게 걷고 공격·기 모으기 같은 작업 동작을 이어 간다. 자지 않는다
// 작업 동작은 한가할 때 쓰지 않는다 — 보기만 해도 일하는 중인지 갈리게.
// 승인 대기·턴 끝·실패 같은 신호 상태는 어느 모드도 아니다 — 멈춰서 상태 동작에 맡긴다
//
// 동작 고르기는 늘 후보 목록에서 보유한 것 — 없으면 조용히 건너뛴다 (동작이 적은 펫도 오류 없이 돈다)

// 모드와 무관한 시간 (ms). timeScale 로 한꺼번에 줄일 수 있다 — 시험용
const TIMES = {
  quiet: 270_000, // 입력이 이만큼 없으면 새 행동을 시작하지 않는다 — 곧 잔다
  sleep: 300_000, // 입력이 이만큼 없으면 그 자리에서 잔다. 3분은 잠깐 읽는 사이에도 잠들었다
  reactMin: 1_200, // 반응 최소 길이 — 끄덕임 한 번이 0.3초라 한 번만 틀면 안 보인다. 이만큼 반복한다
};

// 모드별 리듬. [최소, 최대] 는 그 사이에서 고르게 뽑는다. ms 값만 timeScale 을 받는다
const RHYTHM = {
  idle: {
    // 걷기 사이 쉬는 시간 (걸어온 쪽 보기 포함) — 숨었다 다시 보일 때도 최소만큼은 가만히 있는다.
    // 지수분포(평균 70→120→45→30초)로 뽑던 때는 한참 서 있다 몰아 걸어, 걷는 모습을 캡처하려 하면 멈췄다.
    // 고르게 뽑는 범위로 바꾸고, 5~6초 걷기·10~15초 쉬기에서 폭을 넓혔다 (2026-09-17)
    pause: [7_000, 20_000],
    // 한 번 걷는 시간 — 거리가 아니라 시간으로 정한다.
    // 창을 가로지르는 질주가 되지 않게 한 번에 이만큼만 걷고, 여러 번에 걸쳐 창 전체를 돌아다닌다
    walk: [3_000, 7_000],
    // 걷는 속도 배율 — 걸을 때마다 뽑는다. 작업 중보다 확실히 느리게 둔다
    pace: [0.6, 1.0],
    fidget: [1_200, 3_000], // 쉬는 틈의 제자리 동작 길이 — 짧은 동작은 이 길이가 될 때까지 반복한다
    lookBack: [800, 2_500], // 걷기를 마친 뒤 걸어온 방향을 보고 서 있는 시간
  },
  work: {
    // 작업 동작 묶음 사이 숨 고르기 — 이보다 길게 서 있으면 일이 멈춘 것처럼 보인다
    pause: [500, 1_800],
    walk: [1_500, 4_000],
    pace: [1.3, 1.8],
    move: [1_200, 2_600], // 반복하는 작업 동작(loop) 하나의 길이 — 한 바퀴 단위로 끊는다
    // 한 번 내지르는 작업 동작(once) 뒤에 서 있는 시간 — 공격은 0.3초 안팎이라 곧바로 다음 공격을 이으면 떤다
    settle: [300, 800],
    moves: [1, 3], // 한 묶음에 이어서 하는 작업 동작 수
    walkChance: 0.55, // 묶음 앞에 걷기를 넣을 확률 — 나머지는 그 자리에서 작업 동작만
  },
};

const WALK = {
  turn: 0.35, // 한가할 때 걷는 도중 한 번 방향을 트는 확률 — 서지 않고 남은 시간만큼 다른 쪽으로 이어 걷는다
  turnMinMs: 1_000, // 방향을 틀고 남은 시간이 이보다 짧으면 틀지 않고 선다
  minStepPx: 24, // 이보다 짧으면 걷지 않고 제자리 동작으로 대신한다
  dragTurnPx: 6, // 끄는 방향을 바꾸는 누적 이동 — 천천히 끌어도 쌓이면 돌아본다
};
// RHYTHM 중 시간(ms)이라 timeScale 을 받는 항목 — pace·moves·walkChance 는 배율·개수·확률이라 그대로 둔다
const SCALED = new Set(["pause", "walk", "move", "settle", "fidget", "lookBack"]);

// 제자리 동작 후보에 섞는 두리번 — 서서 아무 쪽이나 본다 (Idle 을 방향만 바꿔 쓴다)
const LOOK_AROUND = "look-around";
// 제자리 동작의 방향 — 정면과 양 옆 대각선. 뒤를 보고 하면 무슨 동작인지 안 보인다
const FIDGET_ROWS = [0, 1, 7];
// 작업 동작의 방향 — 옆모습까지. 공격은 옆에서 봐야 내지르는 게 보인다
const WORK_ROWS = [0, 1, 2, 6, 7];

// 반응별 후보 — 보유한 것 중에서 고른다. 작업 중에 하는 동작은 art/pmd.js 의 WORK_PLAY 가 정한다
const MOVES = {
  walk: ["Walk"],
  // 한가할 때 쉬는 틈의 제자리 동작 — 조용한 것만. 작업 동작(Charge 등)은 넣지 않는다
  fidget: ["LookUp", "Rotate", "Nod", "Sit", "DeepBreath"],
  sleep: ["Sleep", "EventSleep", "Laying"],
  wake: ["Wake"],
  pickup: ["Hurt", "Cringe"],
  held: ["Walk", "Idle"], // 들린 채 버둥거림 — 끄는 방향을 본다
  drop: ["Hop", "Nod", "Pose"],
  click: ["Nod", "Pose", "Hop", "LookUp"], // 여러 개 중 무작위
  // drop·click 후보가 하나도 없는 펫의 대신 반응 — 원래 후보가 하나라도 있으면 쓰지 않는다.
  // 썬더는 Nod·Pose·LookUp 이 없고 Hop 은 몸 칸보다 커서 빠져 만져도 아무 반응이 없었다.
  // 반응 후보는 작업 동작으로만 담긴 것(workOnly)을 쓰지 않는다 — Charge 는 상태 동작(waving)으로 담긴 펫에만 있다
  reactFallback: ["Rotate", "Charge"],
};

// mode 별 — pause 는 쉬는 시간 배율, fidget 은 한가할 때 쉬는 틈의 칸마다 제자리 동작을 할 확률.
// calm 은 덜 돌아다니고 제자리 동작도 덜 한다 (작업 중에도 숨 고르기가 길어진다)
const MODES = {
  on: { pause: 1, fidget: 0.5 },
  calm: { pause: 2.2, fidget: 0.25 },
};

// 사용자가 봐야 하는 신호 상태 — 기다림·턴 끝·실패 등. 이때는 돌아다니지 않고 상태 동작에 맡긴다.
// running(작업 중)은 신호가 아니다 — 오래 이어지는 상태라 그동안 멈춰 있으면 대기만 하는 것처럼 보인다
const isSignal = (agent) => agent !== "idle" && agent !== "running";

// 화면 좌표(y 아래가 +)의 이동 방향 → PMD 행 (0 아래 · 2 오른쪽 · 4 위 · 6 왼쪽, 사이는 대각선)
function rowOf(dx, dy) {
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); // 오른쪽 0, 아래 2, 왼쪽 ±4, 위 -2
  return (((2 - octant) % 8) + 8) % 8;
}

// work      작업 동작 이름 → "once" | "loop" (art/pmd.js WORK_PLAY 중 가진 것)
// workOnly  작업 동작으로만 담긴 이름 — 만지기 반응에는 쓰지 않는다
function createBrain({
  have,
  durOf,
  work = {},
  workOnly = new Set(),
  mode = "on",
  speedPx = 54,
  timeScale = 1,
  rng = Math.random,
}) {
  const T = Object.fromEntries(Object.entries(TIMES).map(([k, v]) => [k, v * timeScale]));
  const RH = Object.fromEntries(
    Object.entries(RHYTHM).map(([name, r]) => [
      name,
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, SCALED.has(k) ? v.map((x) => x * timeScale) : v])),
    ]),
  );
  const M = MODES[mode] || MODES.on;
  const between = ([lo, hi]) => lo + rng() * (hi - lo);
  const first = (list) => list.find((a) => have.has(a)) || null;
  const pickOf = (list) => list[Math.floor(rng() * list.length)];
  // 만지기 반응 후보 — 작업 동작으로만 담긴 것은 뺀다 (한가할 때 작업 동작이 보이지 않게)
  const reactable = (list) => list.filter((a) => have.has(a) && !workOnly.has(a));
  const firstReact = (list) => reactable(list)[0] || null;
  const anyReact = (list) => {
    const got = reactable(list);
    return got.length ? pickOf(got) : null;
  };
  const workMoves = Object.keys(work).filter((a) => have.has(a));
  // 한 번 재생 길이 — 반응이 끝나는 시각을 메인이 스스로 계산한다 (렌더러에 되묻지 않는다)
  const once = (anim) => Math.max(100, durOf(anim));
  // 반응 길이 — 짧은 동작은 최소 길이가 될 때까지 반복한다 (최대 4번)
  const repeatMs = (anim) => once(anim) * Math.min(4, Math.max(1, Math.ceil(T.reactMin / once(anim))));
  // 걷는 그림이 없는 펫은 산책하지 않는다 — 순간이동은 보기 싫다. 제자리 동작만 한다
  const canWalk = !!first(MOVES.walk);

  // rest · walk · look · fidget · work · sleep · wake · react · react-yield(신호 상태 중 반응) · held · yield
  // look·fidget 은 한가할 때 쉬는 틈 안의 동작 — 끝나도 쉬는 시계(nextAt)는 그대로 간다
  // work 는 작업 중의 동작 하나 — 끝나면 묶음의 다음 동작이나 숨 고르기로 간다
  let phase = "rest";
  let rhythm = "idle"; // idle · work — 마지막으로 본 CLI 상태가 정한다
  let roam = { x: 0, y: 0 };
  let act = null; // 렌더러에 보낼 동작. null 이면 상태 동작
  let nextAt = null; // 쉬는 틈이 끝나고 다음 행동을 시작할 시각
  let fidgets = []; // 쉬는 틈 안에서 제자리 동작을 할 시각들 (오름차순). 비면 남은 틈은 서 있기만 한다
  let until = 0; // look·fidget·work·wake·react 가 끝나는 시각
  let walk = null; // { from, to, startAt, dur, pace, restMs } — restMs 는 방향을 틀어 더 걸을 시간
  let movesLeft = 0; // 이번 묶음에 남은 작업 동작 수
  let settleAt = null; // 한 번 내지른 작업 동작이 끝나 서 있기로 바꿀 시각 (once)
  let lastRow = 0; // 마지막으로 향한 방향 — 걸어간 쪽을 보고 작업 동작을 이어 간다
  let heldRow = 0;
  let heldUntil = 0; // 집어 든 직후 아파하는 동작이 끝나는 시각
  let dragAcc = { x: 0, y: 0 }; // 마지막으로 방향을 바꾼 뒤 끈 거리
  let wasVisible = true;

  // 쉬는 틈을 연다 — 다음 행동 시각과, 한가할 때는 그 사이 제자리 동작 시각들.
  // 걸어온 쪽 보기가 끝난 뒤를 칸(동작 최대 길이 + 여유)으로 나눠, 칸마다 할지 말지와 칸 안의 시각을 뽑는다.
  // 긴 틈에는 여러 번, 짧은 틈에는 한 번도 안 할 수 있다. 작업 중의 숨 고르기는 짧아 끼우지 않는다
  function startPause(now) {
    const r = RH[rhythm];
    nextAt = now + between(r.pause) * M.pause;
    fidgets = [];
    if (rhythm !== "idle") return;
    const slot = r.fidget[1] + T.reactMin;
    for (let at = now + r.lookBack[1]; at + slot <= nextAt; at += slot) {
      if (rng() < M.fidget) fidgets.push(at + rng() * slot);
    }
  }

  // 쉰다 — 한가할 때는 상태 동작(대기)에 맡기고, 작업 중에는 향하던 쪽을 보고 숨을 고른다.
  // 작업 중에 상태 동작으로 돌리면 제자리걸음이 나와 일하는 동작과 섞인다
  function toRest(now) {
    phase = "rest";
    walk = null;
    movesLeft = 0;
    const facing = WORK_ROWS.includes(lastRow) ? lastRow : 0;
    act = rhythm === "work" && have.has("Idle") ? { anim: "Idle", row: facing, mode: "loop" } : null;
    startPause(now);
  }

  // 목표는 창 안 아무 데나 고르게 — 한 번은 want 만큼만 걸으므로, 여러 번에 걸쳐 창 전체를 돌아다닌다.
  // 집 중심으로 뽑으면 집 근처만 맴돈다 (1540px 창에서 왼쪽 절반에 머문 시간 0% 실측).
  // 뽑은 곳이 want 보다 가까우면 몇 번 다시 뽑는다 — 끝내 가까우면 그중 가장 먼 곳까지만 걷는다
  function wanderTarget(box, want) {
    let best = null;
    for (let i = 0; i < 4; i++) {
      const gx = box.minX + rng() * (box.maxX - box.minX);
      const gy = box.minY + rng() * (box.maxY - box.minY);
      const len = Math.hypot(gx - roam.x, gy - roam.y);
      if (!best || len > best.len) best = { gx, gy, len };
      if (len >= want) break;
    }
    const k = best.len > want ? want / best.len : 1;
    return { x: Math.round(roam.x + (best.gx - roam.x) * k), y: Math.round(roam.y + (best.gy - roam.y) * k) };
  }

  // 한 구간 걷기 — budgetMs 동안 pace 배율로 걷는다. turns 면 그중 일부만 걷고 나머지는 방향을 틀어 걷는다.
  // 걷는 그림이 없거나 갈 데가 너무 가까우면 아무것도 바꾸지 않고 false
  function startWalk(now, box, pace, budgetMs, turns) {
    if (!canWalk) return false;
    const speed = speedPx * pace;
    const legMs = turns ? budgetMs * between([0.35, 0.65]) : budgetMs;
    const to = wanderTarget(box, (speed * legMs) / 1000);
    const dx = to.x - roam.x;
    const dy = to.y - roam.y;
    const len = Math.hypot(dx, dy);
    if (len < WALK.minStepPx) return false;
    const dur = (len / speed) * 1000;
    phase = "walk";
    walk = { from: { ...roam }, to, startAt: now, dur, pace, restMs: turns ? budgetMs - dur : 0 };
    lastRow = rowOf(dx, dy);
    act = { anim: first(MOVES.walk), row: lastRow, mode: "loop", rate: Math.round(pace * 100) / 100 };
    return true;
  }

  // 한가할 때의 제자리 동작 하나 — 가진 동작과 두리번 중 무작위, 방향·길이도 무작위. 할 게 없으면 false
  function startFidget(now) {
    const pool = MOVES.fidget.filter((a) => have.has(a));
    if (have.has("Idle")) pool.push(LOOK_AROUND);
    if (!pool.length) return false;
    const pick = pickOf(pool);
    const len = between(RH.idle.fidget);
    phase = "fidget";
    if (pick === LOOK_AROUND) {
      act = { anim: "Idle", row: Math.floor(rng() * 8), mode: "loop" };
      until = now + len;
    } else {
      act = { anim: pick, row: pickOf(FIDGET_ROWS), mode: "loop" };
      until = now + once(pick) * Math.max(1, Math.round(len / once(pick))); // 한 바퀴 단위로 끊는다
    }
    return true;
  }

  // 작업 동작 하나 — 반은 걸어간 쪽을 보고, 반은 앞쪽 아무 방향으로. 할 동작이 없으면 false
  //   loop  move 길이만큼 한 바퀴 단위로 반복한다
  //   once  한 번 재생하고 마지막 자세로 멈춘 뒤(hold) settle 만큼 선 채로 숨을 고른다 — 공격을 연달아 이으면 떤다
  function startWork(now) {
    if (!workMoves.length) return false;
    const pick = pickOf(workMoves);
    phase = "work";
    walk = null;
    const row = WORK_ROWS.includes(lastRow) && rng() < 0.5 ? lastRow : pickOf(WORK_ROWS);
    lastRow = row;
    if (work[pick] === "loop") {
      act = { anim: pick, row, mode: "loop" };
      settleAt = null;
      until = now + once(pick) * Math.max(1, Math.round(between(RH.work.move) / once(pick)));
    } else {
      act = { anim: pick, row, mode: "hold" };
      settleAt = now + once(pick);
      until = settleAt + between(RH.work.settle);
    }
    return true;
  }

  // 묶음의 다음 작업 동작 — 남은 게 없거나 할 동작이 없으면 false
  function nextMove(now) {
    if (movesLeft <= 0 || !startWork(now)) return false;
    movesLeft -= 1;
    return true;
  }

  // 작업 중 쉬는 틈이 끝났다 — 가끔 먼저 걸어가고, 도착하거나 걷지 않으면 작업 동작을 이어 한다
  function startBurst(now, box) {
    const [lo, hi] = RH.work.moves;
    movesLeft = lo + Math.floor(rng() * (hi - lo + 1));
    if (box && rng() < RH.work.walkChance && startWalk(now, box, between(RH.work.pace), between(RH.work.walk), false)) {
      return true;
    }
    return nextMove(now);
  }

  // 반응 — 없는 동작이면 아무것도 바꾸지 않고 false. 부른 쪽이 걷던 중이어도 망가지지 않는다
  function react(now, anim, next = "rest") {
    if (!anim) return false;
    phase = next === "yield" ? "react-yield" : "react";
    walk = null;
    act = { anim, row: 0, mode: "loop" };
    until = now + repeatMs(anim);
    return true;
  }

  function fallAsleep() {
    phase = "sleep";
    walk = null;
    const anim = first(MOVES.sleep);
    act = anim ? { anim, row: 0, mode: "loop" } : null; // 자는 그림이 없으면 서서 가만히 있는다
  }

  // 범위 안으로 — 범위 값이 망가져 들어와도(NaN) 오프셋이 NaN 으로 눌어붙지 않게 0 으로 둔다
  const clampIn = (p, box) => {
    const fit = (v, lo, hi) => {
      const r = Math.min(Math.max(v, lo), hi);
      return Number.isFinite(r) ? r : 0;
    };
    return { x: fit(p.x, box.minX, box.maxX), y: fit(p.y, box.minY, box.maxY) };
  };

  const out = () => ({ roam: { ...roam }, act, phase, rhythm });

  // 한 틱 — 입력: 시각, CLI 상태, 마지막 사용자 활동 시각, 산책 범위(없으면 null), 보이는지
  function tick({ now, agent, activeAt, box, visible }) {
    const working = agent === "running";
    const want = working ? "work" : "idle";
    if (nextAt == null) {
      rhythm = want;
      startPause(now);
    }
    const idle = now - activeAt;
    // 숨어 있다 다시 보이는 순간 밀린 행동이 튀어나오지 않게 — 나타나자마자 걸어가면 어색하다
    if (visible && !wasVisible) nextAt = Math.max(nextAt, now + RH[rhythm].pause[0]);
    wasVisible = visible;

    // 들려 있는 동안은 사용자 손에 맡긴다 — 아파하는 동작이 끝나면 끄는 방향을 보며 버둥거린다
    if (phase === "held") {
      if (now >= heldUntil) {
        const anim = first(MOVES.held);
        act = anim ? { anim, row: heldRow, mode: "loop" } : null;
      }
      return out();
    }

    // 신호 상태 — 상태 동작에 맡긴다. 걷던 자리에 멈추고, 자고 있었으면 깬 것으로 친다.
    // 그 사이 만진 반응은 끝까지 보여 준 뒤 돌려준다
    if (isSignal(agent)) {
      if ((phase === "react" || phase === "react-yield") && now < until) return out();
      if (phase !== "yield") {
        phase = "yield";
        act = null;
        walk = null;
      }
      return out();
    }
    if (phase === "react-yield") phase = "react"; // 신호가 먼저 끝났다 — 반응은 마저 보여 주고 쉰다
    if (phase === "yield") {
      rhythm = want;
      toRest(now);
      if (working) nextAt = now; // 실패 표시가 끝나 일로 돌아왔다 — 바로 움직인다
    }

    // 모드가 바뀌었다. 일을 시작하면 쉬던 것·둘러보던 것을 접고 곧바로 움직이고, 일이 끝나면 작업 동작을 접고 쉰다.
    // 걷기·깨기·만진 반응은 끝까지 보여 준다 — 끝난 뒤 새 모드로 이어 간다
    if (want !== rhythm) {
      rhythm = want;
      if (phase === "rest" || phase === "look" || phase === "fidget" || phase === "work") {
        toRest(now);
        if (working) nextAt = now;
      }
    }

    // 창 크기가 바뀌어 범위가 줄었으면 안으로 들인다. 걷는 중이면 목적지를 줄인다 —
    // 안 줄이면 가두기에 막혀 걷는 그림만 나오고 제자리다
    if (box) {
      if (phase === "walk") walk.to = clampIn(walk.to, box);
      else roam = clampIn(roam, box);
    }

    // 자는 중 — 입력이 들어오거나 CLI 가 일을 시작하면 깬다
    if (phase === "sleep") {
      if (idle >= T.sleep && !working) return out();
      const anim = first(MOVES.wake);
      if (anim && visible) {
        phase = "wake";
        act = { anim, row: 0, mode: "hold" };
        until = now + once(anim);
      } else {
        toRest(now);
        if (working) nextAt = now;
      }
      return out();
    }

    // 걷는 중 — 시간 비율로 위치를 옮긴다
    if (phase === "walk") {
      const t = Math.min(1, (now - walk.startAt) / walk.dur);
      roam = {
        x: Math.round(walk.from.x + (walk.to.x - walk.from.x) * t),
        y: Math.round(walk.from.y + (walk.to.y - walk.from.y) * t),
      };
      if (t < 1) return out();
      // 방향을 틀 시간이 남았다 — 서지 않고 같은 속도로 다른 쪽으로 이어 걷는다. 못 틀면 여기서 선다
      const { pace, restMs } = walk;
      if (restMs >= WALK.turnMinMs && visible && box && startWalk(now, box, pace, restMs, false)) return out();
      // 작업 중 — 걸어간 자리에서 곧바로 작업 동작. 서 있는 그림이 끼면 일이 멈춘 것처럼 보인다
      if (rhythm === "work") {
        if (!(visible && nextMove(now))) toRest(now);
        return out();
      }
      // 도착 — 쉬는 틈을 열고, 걸어온 쪽을 잠깐 보고 서 있다가 정면으로
      toRest(now);
      phase = "look";
      act = have.has("Idle") ? { anim: "Idle", row: lastRow, mode: "loop" } : null;
      until = now + between(RH.idle.lookBack);
      return out();
    }

    // 작업 동작 중 — 한 번 내지른 동작은 끝나면 서서 숨을 고르고, 다 끝나면 묶음의 다음 동작이나 숨 고르기
    if (phase === "work") {
      if (settleAt != null && now >= settleAt) {
        settleAt = null;
        if (have.has("Idle")) act = { anim: "Idle", row: act.row, mode: "loop" };
      }
      if (now < until) return out();
      if (visible && nextMove(now)) return out();
      toRest(now);
      return out();
    }

    if ((phase === "look" || phase === "fidget" || phase === "wake" || phase === "react") && now < until) {
      return out();
    }
    if (phase === "look" || phase === "fidget") {
      // 쉬는 틈 안의 동작이 끝났다 — 남은 쉬는 시간은 서 있는다
      phase = "rest";
      act = null;
    } else if (phase !== "rest") {
      // 깨기·만진 반응을 마쳤다 — 일하는 중이면 숨 고르기 없이 곧바로 움직인다
      toRest(now);
      if (working) nextAt = now;
    }

    if (rhythm === "work") {
      // 자율 행동 — 보일 때만. 아무도 못 보는 곳에서 움직일 이유가 없다
      if (now < nextAt || !visible) return out();
      if (startBurst(now, box)) return out();
      toRest(now); // 할 게 없다(작업 동작도 걷기도 없음) — 다시 쉰다
      return out();
    }

    // 한가 — 오래 조용하면 그 자리에서 잔다. 잠들기 직전에는 새로 움직이지 않는다
    if (idle >= T.sleep) {
      fallAsleep();
      return out();
    }
    if (idle >= T.quiet) return out();

    // 쉬는 틈의 제자리 동작 — 지난 시각은 한꺼번에 버린다(안 보이던 사이 밀린 것을 몰아서 하지 않게)
    if (fidgets.length && now >= fidgets[0]) {
      fidgets = fidgets.filter((at) => at > now);
      if (visible && startFidget(now)) return out();
    }
    if (now < nextAt || !visible || !box) return out();
    if (startWalk(now, box, between(RH.idle.pace), between(RH.idle.walk), rng() < WALK.turn)) return out();
    // 걸을 수 없다(걷는 그림이 없거나 갈 데가 가깝다) — 제자리 동작으로 대신하고 다시 쉰다
    toRest(now);
    // 방금 한 동작이 끝나기 전 시각은 버린다 — 끝나자마자 또 하지 않게
    if (startFidget(now)) fidgets = fidgets.filter((at) => at > until + T.reactMin);
    return out();
  }

  return {
    tick,
    // 사용자가 집어 들었다 — 걷기·수면 무엇이든 멈추고 아파한다
    pickup(now) {
      phase = "held";
      walk = null;
      heldRow = 0;
      dragAcc = { x: 0, y: 0 };
      const anim = first(MOVES.pickup);
      act = anim ? { anim, row: 0, mode: "loop" } : null;
      heldUntil = anim ? now + repeatMs(anim) : now;
    },
    // 끄는 방향 — 이동을 쌓아 두었다가 충분히 끌었을 때 돌아본다. 손 떨림에 휙휙 돌지 않고, 천천히 끌어도 결국 돈다
    drag(dx, dy) {
      dragAcc = { x: dragAcc.x + dx, y: dragAcc.y + dy };
      if (Math.hypot(dragAcc.x, dragAcc.y) < WALK.dragTurnPx) return;
      heldRow = rowOf(dragAcc.x, dragAcc.y);
      dragAcc = { x: 0, y: 0 };
    },
    // 내려놓았다 — 놓은 자리가 새 집이다. CLI 가 일하는 중이어도 반응은 보여 준다
    drop(now, agent) {
      roam = { x: 0, y: 0 };
      const anim = firstReact(MOVES.drop) || firstReact(MOVES.reactFallback);
      if (!react(now, anim, isSignal(agent) ? "yield" : "rest")) toRest(now);
    },
    // 사용자가 창을 직접 옮겼거나 들고 있던 게 풀렸다 — 반응 없이 쉰다
    rehome(now) {
      roam = { x: 0, y: 0 };
      toRest(now);
    },
    // 콕 찔렀다 — 자고 있었으면 먼저 깬다. 걷던 중이면 그 자리에 선다. 반응할 동작이 없으면 아무것도 안 바꾼다
    click(now, agent) {
      if (phase === "held") return;
      if (phase === "sleep") {
        const wake = first(MOVES.wake);
        if (wake) {
          walk = null;
          phase = "wake";
          act = { anim: wake, row: 0, mode: "hold" };
          until = now + once(wake);
          return;
        }
      }
      react(now, anyReact(MOVES.click) || anyReact(MOVES.reactFallback), isSignal(agent) ? "yield" : "rest");
    },
  };
}

module.exports = { createBrain };
