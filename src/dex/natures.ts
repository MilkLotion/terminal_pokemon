// 성격 — data/natures.json 의 25개. 이름·다섯 축(+1 · 0 · −1). 앱 안에서 축은 전부 배율 (design.md "성격")

import type { Axis, AxisValue, Nature, NatureId } from "../shared/types";
import { loadJson, type DexOptions } from "./data";

export const AXES: readonly Axis[] = ["activity", "boldness", "steadiness", "sociability", "patience"];

// 모르는 성격의 축 — 전부 0 (중립)
export const NEUTRAL_AXES: Readonly<Record<Axis, AxisValue>> = {
  activity: 0,
  boldness: 0,
  steadiness: 0,
  sociability: 0,
  patience: 0,
};

const table = (opts?: DexOptions): Nature[] => loadJson<Nature[]>("natures.json", opts);

// 25개 전부 — 표의 순서(대응표 행 순서). 복사본
export const natures = (opts?: DexOptions): Nature[] => [...table(opts)];

// 하나 — 모르는 id 는 undefined
export const nature = (id: string, opts?: DexOptions): Nature | undefined => table(opts).find((n) => n.id === id);

export const isNatureId = (id: string, opts?: DexOptions): id is NatureId => nature(id, opts) !== undefined;

// 축 값 — 모르는 id 면 전부 0. 항상 새 객체
export const axesOf = (id: string, opts?: DexOptions): Record<Axis, AxisValue> => ({ ...(nature(id, opts)?.axes ?? NEUTRAL_AXES) });

// 무작위 하나 — rng 는 [0, 1) 을 돌려주는 함수 (시험에서 고정)
export function randomNature(rng: () => number = Math.random, opts?: DexOptions): Nature {
  const list = table(opts);
  const idx = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  const picked = list[idx];
  if (!picked) throw new Error("natures.json 이 비어 있다");
  return picked;
}
