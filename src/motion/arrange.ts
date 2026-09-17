// 겹침 밀어내기 — 쉬는 마리들의 몸 사각형이 겹치면 뒤에 그려지는(배열 뒤) 쪽을 조금씩 민다. 최소 구현 (모임·사교성은 S3)
//
// 무대가 틱마다 부른다. rects 는 그리는 순서(뒤가 위). movable 은 들고 있지 않고 걷고 있지 않은(phase rest·look·fidget·sleep) 마리.
// 겹침이 작은 축으로 step 만큼 민다 — 큰 축으로 밀면 멀리 뛴다. 방향은 앞 마리의 중심에서 멀어지는 쪽, 중심이 같으면 오른쪽·아래
// 무대 밖으로 나가는 건 여기서 막지 않는다 — 부르는 쪽의 clampInStage 가 받는다
// 기동 직후에는 step 을 크게(몸 너비의 0.8) 잡아 여러 번 돌려 같은 기본 집에서 태어난 마리들을 옆으로 벌린다
import type { BodyRect, Nudge } from "./types";

// 겹친 길이 — 0 이하면 안 겹친다 (모서리가 닿기만 한 것도 안 겹친 것)
const overlapOf = (a: BodyRect, b: BodyRect): { x: number; y: number } => ({
  x: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
  y: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
});

// 겹친 쌍마다 밀 마리와 방향을 정해 누적한다. 결과는 마리 id → 이번 틱에 더할 이동. 안 겹치면 빈 Map
export function separate(rects: readonly BodyRect[], step: number): Nudge {
  const nudge: Nudge = new Map();
  const push = (id: string, dx: number, dy: number): void => {
    const cur = nudge.get(id) ?? { dx: 0, dy: 0 };
    nudge.set(id, { dx: cur.dx + dx, dy: cur.dy + dy });
  };
  for (let i = 0; i < rects.length; i++) {
    const front = rects[i];
    if (!front) continue;
    for (let j = i + 1; j < rects.length; j++) {
      const back = rects[j];
      if (!back) continue;
      const o = overlapOf(front, back);
      if (o.x <= 0 || o.y <= 0) continue;
      // 뒤쪽을 민다. 뒤쪽이 못 움직이면 앞쪽을 반대로 민다. 둘 다 못 움직이면 그대로
      const mover = back.movable ? back : front.movable ? front : null;
      if (!mover) continue;
      const other = mover === back ? front : back;
      const cx = mover.x + mover.w / 2 - (other.x + other.w / 2);
      const cy = mover.y + mover.h / 2 - (other.y + other.h / 2);
      if (o.x <= o.y) {
        const dir = cx < 0 ? -1 : 1; // 중심이 같으면 오른쪽
        push(mover.id, dir * Math.min(step, o.x), 0);
      } else {
        const dir = cy < 0 ? -1 : 1; // 중심이 같으면 아래
        push(mover.id, 0, dir * Math.min(step, o.y));
      }
    }
  }
  return nudge;
}
