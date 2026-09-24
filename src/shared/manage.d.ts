// 관리 창 IPC 계약 — 메인 · preload · 렌더러가 같은 모양을 본다. 타입만 둔다 (런타임 값 없음)
// 선언 파일인 이유와 다른 파일을 import 하지 않는 이유는 shared/stage.d.ts 와 같다.
// 화면이 읽는 값은 src/tx/snapshot.ts 가 만든다. 그 파일이 여기 타입을 가져다 쓴다 — 모양의 출처는 한 곳이다.
// FullnessZone 은 src/state/time-v3.ts 의 같은 이름과 같은 값이다. 자체 검사가 서로 대입해 어긋남을 잡는다

export type ViewZone = "full" | "normal" | "hungry" | "starving";
export type ViewSlotState = "pokemon" | "empty" | "locked";
export type ViewUnlockBy = "shop" | "achievement";

export interface ViewBuff {
  kind: string;
  remainMin: number;
}

export interface PetView {
  id: string;
  species: string;
  name: string; // 화면에 보이는 종 이름
  shiny: boolean;
  level: number;
  percentToNext: number; // 다음 레벨까지 백분율
  types: string[]; // 화면에 보이는 타입 이름
  nature: string; // 화면에 보이는 성격 이름
  affinity: number;
  fullness: number;
  zone: ViewZone;
  hidden: boolean;
  feedReady: boolean;
  feedInSec: number;
  playReady: boolean;
  playStreak: number;
  longPlay: boolean;
  buffs: ViewBuff[];
}

export interface SlotView {
  index: number;
  state: ViewSlotState;
  unlockBy?: ViewUnlockBy;
  pet?: PetView;
}

export interface EggView {
  id: string;
  kind: string;
  name: string;
  ready: boolean;
  remainSec: number;
  percent: number;
  careReady: boolean;
  actions: { pat: number; song: number };
}

export interface BoxView {
  id: string;
  name: string;
  used: number;
  size: number;
  slots: (PetView | null)[];
}

export interface BagItemView {
  id: string;
  name: string;
  count: number;
}

export type ShopCategory = "egg" | "pokemon" | "tool" | "evolution" | "slot";

export interface ShopItemView {
  id: string;
  name: string;
  note: string;
  price: number;
  category: ShopCategory;
  affordable: boolean; // 지금 포인트로 살 수 있다
  blocked?: string; // 살 수 없는 다른 이유 — 화면이 그대로 보여 준다
}

export type DexState = "obtained" | "unlocked" | "locked";

export interface DexEntry {
  slug: string;
  dex: number;
  name: string;
  state: DexState;
  shiny: boolean;
  condition: string | null; // 발견한 알 행동 조건
}

export interface Snapshot {
  points: number;
  party: { slots: SlotView[]; shown: number; usable: number };
  boxes: BoxView[];
  eggs: { list: EggView[]; used: number; size: number };
  bag: BagItemView[];
  dex: { unlocked: number; obtained: number; shiny: number };
  shop: ShopItemView[];
  achievements: { total: number; unclaimed: number };
}

// 화면이 보내는 요청 — 이름과 인자는 src/tx/bridge.ts 가 푼다.
// 조작 하나마다 `args.reqId` 를 새로 붙인다. 없으면 같은 순간의 두 조작이 하나로 합쳐진다
export interface ManageRequest {
  cmd: string;
  target?: string;
  args?: Record<string, unknown>;
}

// 결과는 문구가 아니라 코드 — 문구는 화면이 만든다
export interface ManageReply {
  ok: boolean;
  reason: string;
  [key: string]: unknown;
}

// 도감은 1089종이라 스냅샷에 담지 않는다. 탭을 열 때만 따로 부른다
export type ManageChannel = "manage:snapshot" | "manage:command" | "manage:dex";

export interface ManageBridge {
  snapshot: () => Promise<Snapshot | null>; // 저장이 없으면 null
  command: (req: ManageRequest) => Promise<ManageReply>;
  dex: () => Promise<DexEntry[]>;
}
