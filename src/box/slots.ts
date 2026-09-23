// 박스 칸 다루기 — 규칙은 docs/specs/s5.md "박스". 순수 함수이며 저장을 쓰지 않는다.
//
// 한 박스는 30칸이다. 모두 차면 새 박스를 자동으로 추가한다.
// 개체의 값은 건드리지 않는다. 박스는 어느 칸에 누가 있는지만 안다.
import { newBox } from "../save/v3.js";
import type { BoxV3 } from "../shared/save-v3";

export interface BoxSpot {
  boxIndex: number;
  slotIndex: number;
}

// 개체가 든 칸. 없으면 null
export function findPet(boxes: BoxV3[], petId: string): BoxSpot | null {
  for (let b = 0; b < boxes.length; b++) {
    const box = boxes[b];
    if (!box) continue;
    const i = box.slots.indexOf(petId);
    if (i >= 0) return { boxIndex: b, slotIndex: i };
  }
  return null;
}

// 개체를 박스에서 뺀다. 없었으면 false
export function takePet(boxes: BoxV3[], petId: string): boolean {
  const spot = findPet(boxes, petId);
  if (!spot) return false;
  const box = boxes[spot.boxIndex];
  if (!box) return false;
  box.slots[spot.slotIndex] = null;
  return true;
}

// 개체를 앞 박스의 첫 빈 칸에 넣는다. 자리가 없으면 박스를 새로 만든다
export function putPet(boxes: BoxV3[], petId: string): BoxSpot {
  for (let b = 0; b < boxes.length; b++) {
    const box = boxes[b];
    if (!box) continue;
    const i = box.slots.indexOf(null);
    if (i < 0) continue;
    box.slots[i] = petId;
    return { boxIndex: b, slotIndex: i };
  }
  const box = newBox(`b${boxes.length + 1}`, `박스 ${boxes.length + 1}`);
  box.slots[0] = petId;
  boxes.push(box);
  return { boxIndex: boxes.length - 1, slotIndex: 0 };
}

export const usedCount = (box: BoxV3): number => box.slots.filter((s) => s !== null).length;

export const totalUsed = (boxes: BoxV3[]): number => boxes.reduce((a, b) => a + usedCount(b), 0);
