// buddy 의 판단 — 언제 걷고, 어디로 가고, 언제 자고, 건드리면 어떻게 반응할지.
//
// 창·Electron·파일을 모른다. 시각과 입력을 받아 "지금 산책 오프셋"과 "지금 보여줄 동작"만 돌려준다.
// 그래서 node 만으로 시간을 돌려 가며 시험할 수 있다.
//
// 동작 고르기는 늘 후보 목록에서 보유한 것 — 없으면 조용히 건너뛴다 (동작이 적은 펫도 오류 없이 돈다)

// 시간 상수 (ms). timeScale 로 한꺼번에 줄일 수 있다 — 시험용
const TIMES = {
  refractory: 20_000, // 한 번 움직인 뒤 최소 쉬는 시간. 숨었다 다시 보일 때도 이만큼은 가만히 있는다
  // 그 뒤 다음 행동까지의 평균 — 지수분포라 규칙적으로 보이지 않는다.
  // 70초에서는 작업 사이 쉬는 틈마다 움직여 부산했다 (시뮬레이션 시간당 14회 → 120초로 약 14회를 쉬는 시간에 고르게)
  wanderMean: 120_000,
  quiet: 150_000, // 입력이 이만큼 없으면 새 행동을 시작하지 않는다 — 곧 잔다
  sleep: 180_000, // 입력이 이만큼 없으면 그 자리에서 잔다
  lookBack: 1_500, // 걷기를 마친 뒤 걸어온 방향을 보고 서 있는 시간
  reactMin: 1_200, // 반응 최소 길이 — 끄덕임 한 번이 0.3초라 한 번만 틀면 안 보인다. 이만큼 반복한다
  excitedWithin: 30_000, // 최근 이 안에 입력이 있었으면 조금 더 자주 움직인다
  calmAfter: 90_000, // 이만큼 입력이 없으면 덜 움직인다
};

const WALK = {
  maxStepPx: 260, // 한 번에 걷는 최대 거리 — 창을 가로지르는 질주가 되지 않게
  minStepPx: 24, // 이보다 짧으면 걷지 않고 제자리 동작으로 대신한다
  dragTurnPx: 6, // 끄는 방향을 바꾸는 누적 이동 — 천천히 끌어도 쌓이면 돌아본다
};

// 반응별 후보 — 보유한 것 중에서 고른다
const MOVES = {
  walk: ["Walk"],
  fidget: ["LookUp", "Rotate", "Nod"], // 여러 개 중 무작위
  sleep: ["Sleep", "EventSleep", "Laying"],
  wake: ["Wake"],
  pickup: ["Hurt", "Cringe"],
  held: ["Walk", "Idle"], // 들린 채 버둥거림 — 끄는 방향을 본다
  drop: ["Hop", "Nod", "Pose"],
  click: ["Nod", "Pose", "Hop", "LookUp"], // 여러 개 중 무작위
};

// mode 별 배율 — calm 은 덜 돌아다니고 제자리 동작도 덜 한다
const MODES = {
  on: { wander: 1, fidgetRatio: 0.3 },
  calm: { wander: 2.2, fidgetRatio: 0.15 },
};

// 화면 좌표(y 아래가 +)의 이동 방향 → PMD 행 (0 아래 · 2 오른쪽 · 4 위 · 6 왼쪽, 사이는 대각선)
function rowOf(dx, dy) {
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)); // 오른쪽 0, 아래 2, 왼쪽 ±4, 위 -2
  return (((2 - octant) % 8) + 8) % 8;
}

function createBrain({ have, durOf, mode = "on", speedPx = 54, timeScale = 1, rng = Math.random }) {
  const T = Object.fromEntries(Object.entries(TIMES).map(([k, v]) => [k, v * timeScale]));
  const M = MODES[mode] || MODES.on;
  const first = (list) => list.find((a) => have.has(a)) || null;
  const any = (list) => {
    const got = list.filter((a) => have.has(a));
    return got.length ? got[Math.floor(rng() * got.length)] : null;
  };
  // 한 번 재생 길이 — 반응이 끝나는 시각을 메인이 스스로 계산한다 (렌더러에 되묻지 않는다)
  const once = (anim) => Math.max(100, durOf(anim));
  // 반응 길이 — 짧은 동작은 최소 길이가 될 때까지 반복한다 (최대 4번)
  const repeatMs = (anim) => once(anim) * Math.min(4, Math.max(1, Math.ceil(T.reactMin / once(anim))));
  // 걷는 그림이 없는 펫은 산책하지 않는다 — 순간이동은 보기 싫다. 제자리 동작만 한다
  const canWalk = !!first(MOVES.walk);

  let phase = "rest"; // rest · walk · look · fidget · sleep · wake · react · react-yield(일하는 중 반응) · held · yield
  let roam = { x: 0, y: 0 };
  let act = null; // 렌더러에 보낼 동작. null 이면 상태 동작
  let nextAt = null; // rest 에서 다음 자율 행동 시각
  let until = 0; // look·fidget·wake·react 가 끝나는 시각
  let walk = null; // { from, to, startAt, dur }
  let heldRow = 0;
  let heldUntil = 0; // 집어 든 직후 아파하는 동작이 끝나는 시각
  let dragAcc = { x: 0, y: 0 }; // 마지막으로 방향을 바꾼 뒤 끈 거리
  let wasVisible = true;

  // 다음 자율 행동까지 기다릴 시간 — 최근에 사용자가 있었으면 조금 자주, 오래 없었으면 드물게
  function restDelay(now, activeAt) {
    const idle = now - activeAt;
    const arousal = idle < T.excitedWithin ? 0.6 : idle > T.calmAfter ? 1.6 : 1;
    const wait = -Math.log(1 - rng()) * T.wanderMean; // 지수분포
    return T.refractory + wait * arousal * M.wander;
  }

  function toRest(now, activeAt) {
    phase = "rest";
    act = null;
    walk = null;
    nextAt = now + restDelay(now, activeAt);
  }

  function startWalk(now, to) {
    const dx = to.x - roam.x;
    const dy = to.y - roam.y;
    const len = Math.hypot(dx, dy);
    if (!canWalk || len < 1) return false;
    phase = "walk";
    walk = { from: { ...roam }, to: { ...to }, startAt: now, dur: (len / speedPx) * 1000 };
    act = { anim: first(MOVES.walk), row: rowOf(dx, dy), mode: "loop" };
    return true;
  }

  // 목표는 창 안 아무 데나 고르게 — 한 걸음은 최대 거리까지만 가므로, 여러 번에 걸쳐 창 전체를 돌아다닌다.
  // 집 중심으로 뽑으면 집 근처만 맴돈다 (1540px 창에서 왼쪽 절반에 머문 시간 0% 실측)
  function wanderTarget(box) {
    const gx = box.minX + rng() * (box.maxX - box.minX);
    const gy = box.minY + rng() * (box.maxY - box.minY);
    let dx = gx - roam.x;
    let dy = gy - roam.y;
    const len = Math.hypot(dx, dy);
    if (len > WALK.maxStepPx) {
      dx *= WALK.maxStepPx / len;
      dy *= WALK.maxStepPx / len;
    }
    return { x: Math.round(roam.x + dx), y: Math.round(roam.y + dy), len: Math.min(len, WALK.maxStepPx) };
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

  const out = () => ({ roam: { ...roam }, act, phase });

  // 한 틱 — 입력: 시각, Claude 상태, 마지막 사용자 활동 시각, 산책 범위(없으면 null), 보이는지
  function tick({ now, claude, activeAt, box, visible }) {
    if (nextAt == null) nextAt = now + restDelay(now, activeAt);
    const idle = now - activeAt;
    // 숨어 있다 다시 보이는 순간 밀린 행동이 튀어나오지 않게 — 나타나자마자 걸어가면 어색하다
    if (visible && !wasVisible) nextAt = Math.max(nextAt, now + T.refractory);
    wasVisible = visible;

    // 들려 있는 동안은 사용자 손에 맡긴다 — 아파하는 동작이 끝나면 끄는 방향을 보며 버둥거린다
    if (phase === "held") {
      if (now >= heldUntil) {
        const anim = first(MOVES.held);
        act = anim ? { anim, row: heldRow, mode: "loop" } : null;
      }
      return out();
    }

    // Claude 가 일하는 중 — 상태 동작에 맡긴다. 걷던 자리에 멈추고, 자고 있었으면 깬 것으로 친다.
    // 그 사이 만진 반응은 끝까지 보여 준 뒤 돌려준다
    if (claude !== "idle") {
      if ((phase === "react" || phase === "react-yield") && now < until) return out();
      if (phase !== "yield") {
        phase = "yield";
        act = null;
        walk = null;
      }
      return out();
    }
    if (phase === "react-yield") phase = "react"; // 일이 먼저 끝났다 — 반응은 마저 보여 주고 쉰다
    if (phase === "yield") toRest(now, activeAt);

    // 창 크기가 바뀌어 범위가 줄었으면 안으로 들인다. 걷는 중이면 목적지를 줄인다 —
    // 안 줄이면 가두기에 막혀 걷는 그림만 나오고 제자리다
    if (box) {
      if (phase === "walk") walk.to = clampIn(walk.to, box);
      else roam = clampIn(roam, box);
    }

    // 자는 중 — 입력이 들어오면 깬다
    if (phase === "sleep") {
      if (idle >= T.sleep) return out();
      const anim = first(MOVES.wake);
      if (anim && visible) {
        phase = "wake";
        act = { anim, row: 0, mode: "hold" };
        until = now + once(anim);
      } else toRest(now, activeAt);
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
      // 도착 — 걸어온 쪽을 잠깐 보고 서 있다가 정면으로
      const row = act ? act.row : 0;
      walk = null;
      phase = "look";
      act = have.has("Idle") ? { anim: "Idle", row, mode: "loop" } : null;
      until = now + T.lookBack;
      return out();
    }

    if ((phase === "look" || phase === "fidget" || phase === "wake" || phase === "react") && now < until) {
      return out();
    }
    if (phase !== "rest") toRest(now, activeAt);

    // 오래 조용하면 그 자리에서 잔다. 잠들기 직전에는 새로 움직이지 않는다
    if (idle >= T.sleep) {
      fallAsleep();
      return out();
    }
    if (idle >= T.quiet) return out();

    // 자율 행동 — 보일 때만. 아무도 못 보는 곳에서 돌아다닐 이유가 없다
    if (now < nextAt || !visible || !box) return out();
    const target = wanderTarget(box);
    if (rng() >= M.fidgetRatio && target.len >= WALK.minStepPx && startWalk(now, target)) return out();
    const anim = any(MOVES.fidget);
    if (anim) {
      phase = "fidget";
      act = { anim, row: 0, mode: "loop" };
      until = now + repeatMs(anim);
    } else nextAt = now + restDelay(now, activeAt);
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
    // 내려놓았다 — 놓은 자리가 새 집이다. Claude 가 일하는 중이어도 반응은 보여 준다
    drop(now, activeAt, claude) {
      roam = { x: 0, y: 0 };
      if (!react(now, first(MOVES.drop), claude !== "idle" ? "yield" : "rest")) toRest(now, activeAt);
    },
    // 사용자가 창을 직접 옮겼거나 들고 있던 게 풀렸다 — 반응 없이 쉰다
    rehome(now, activeAt) {
      roam = { x: 0, y: 0 };
      toRest(now, activeAt);
    },
    // 콕 찔렀다 — 자고 있었으면 먼저 깬다. 걷던 중이면 그 자리에 선다. 반응할 동작이 없으면 아무것도 안 바꾼다
    click(now, claude) {
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
      react(now, any(MOVES.click), claude !== "idle" ? "yield" : "rest");
    },
  };
}

module.exports = { createBrain };
