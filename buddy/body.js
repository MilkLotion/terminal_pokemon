// buddy 를 메인 프로세스에 붙이는 층 — 신호를 모아 brain 을 돌리고, 결과를 렌더러로 보낸다.
//
// 메인이 알려 주는 것
//   state   CLI 상태와 마지막 프롬프트 시각 (훅 기록)
//   focus   창·터미널 포커스가 바뀌었는지 — 바뀐 값 자체가 아니라 "바뀌었다"만 쓴다
//   pickup · drag · drop · click   펫을 직접 만진 것
// 돌려주는 것
//   tick() 의 산책 오프셋 — 메인이 집 자리에 더해 창을 옮긴다
//   act    렌더러로 보낼 동작 (바뀔 때만 보낸다)
//
// PMD 에서만 켠다. showdown·sheet 는 동작이 하나라 걷는 그림도, 자는 그림도 없다
const { createBrain } = require("./brain.js");

const TICK_MS = 40; // 걷는 동안 창을 옮기는 간격 — 25fps

// 보유 동작·길이를 art 에서 뽑는다
function capabilities(art) {
  const have = new Set(Object.keys(art.anims || {}));
  const durOf = (anim) => ((art.anims[anim] && art.anims[anim].frames) || []).reduce((sum, f) => sum + f.ms, 0);
  return { have, durOf };
}

function createBuddy({ art, mode, timeScale = 1, send, log }) {
  if (!art || art.kind !== "pmd" || !art.anims || mode === "off") return null;
  const { have, durOf } = capabilities(art);
  // 걷는 속도는 도트 배율에 비례 — 큰 펫이 같은 속도로 걸으면 제자리걸음처럼 보인다
  const brain = createBrain({ have, durOf, mode, speedPx: 18 * art.zoom, timeScale });

  let activeAt = Date.now(); // 마지막 사용자 활동 — 막 켰으면 사용자가 있는 것
  let agent = "idle";
  let focusKey = null;
  let sentAct; // 마지막으로 보낸 동작(JSON). undefined 면 아직 안 보냈다
  let lastPhase = null;

  const bump = (at = Date.now()) => {
    if (at > activeAt) activeAt = at;
  };

  return {
    TICK_MS,

    // 훅이 남긴 상태. promptAt 은 초 단위.
    //   쉬다가 일을 시작함  훅 기록에 promptAt 이 없어도(Codex 등) 프롬프트로 친다.
    //                       실패 표시가 끝나 작업으로 돌아가는 것(failed→running)은 자동이라 빼고
    //   일이 끝남          사용자가 결과를 읽는 때다. 안 치면 3분 시계가 프롬프트부터 돌아,
    //                       4분짜리 작업이 끝나자마자 잠든다 (시뮬레이션: 프롬프트의 46% 가 자는 펫에 도착)
    state(next, promptAt) {
      if (promptAt) bump(promptAt * 1000);
      if (next !== agent && next === "running" && agent !== "failed") bump();
      if (next !== agent && next === "idle") bump();
      agent = next;
    },

    // 포커스 묶음(포커스·활성 터미널·터미널 목록 등)이 달라졌으면 사용자가 뭔가 한 것.
    // 기록을 잠깐 못 읽은 것(null)은 변화가 아니다 — A→없음→A 를 두 번의 활동으로 세지 않는다
    focus(key) {
      if (key == null) return;
      if (focusKey !== null && key !== focusKey) bump();
      focusKey = key;
    },

    pickup() {
      bump();
      brain.pickup(Date.now());
    },
    drag(dx, dy) {
      brain.drag(dx, dy);
    },
    drop() {
      bump();
      brain.drop(Date.now(), activeAt, agent);
    },
    click() {
      bump();
      brain.click(Date.now(), agent);
    },
    // 펫 드래그가 아닌 경로로 창이 옮겨졌다 — 놓인 자리가 새 집
    rehome() {
      brain.rehome(Date.now(), activeAt);
    },

    // 렌더러가 새로 떴다 — 보냈던 동작을 다시 보내게 한다
    resend() {
      sentAct = undefined;
    },

    tick({ box, visible }) {
      const now = Date.now();
      const o = brain.tick({ now, agent, activeAt, box, visible });
      const key = JSON.stringify(o.act);
      if (key !== sentAct) {
        sentAct = key;
        send(o.act);
      }
      if (log && o.phase !== lastPhase) {
        lastPhase = o.phase;
        log({ buddy: o.phase, act: o.act ? `${o.act.anim}/${o.act.row}/${o.act.mode}` : null,
              idleSec: Math.round((now - activeAt) / 1000), roam: o.roam });
      }
      return o.roam;
    },
  };
}

module.exports = { createBuddy };
