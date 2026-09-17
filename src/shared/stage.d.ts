// 무대 IPC 계약 — 메인 · preload · 렌더러가 같은 모양을 본다. 타입만 둔다 (런타임 값 없음)
// 선언 파일인 이유: 렌더러 tsconfig(rootDir src/renderer)와 메인 tsconfig(rootDir src)가 함께 읽어야 하는데
//   .ts 면 렌더러 빌드가 rootDir 밖 소스로 거부한다(TS6059). 선언 파일은 rootDir 검사와 emit 이 없다
// 다른 파일을 import 하지 않는다 — 렌더러 프로그램에 rootDir 밖 .ts 가 끌려 들어오지 않게
// StageState 는 shared/types.ts 의 AgentState 와 같은 값 — selftest-stage 가 서로 대입해 어긋남을 잡는다

export type StageState = "idle" | "running" | "waiting" | "waving" | "failed";
export type PlayMode = "loop" | "hold" | "once";

export interface StageSize {
  w: number; // DIP
  h: number;
}

export interface StageInit {
  size: StageSize;
  debug: boolean;
}

// PMD 시트 하나 — art/pmd.js sheetOf 의 결과 모양
export interface SpriteSheet {
  fw: number;
  fh: number;
  rows: number;
  frames: { x: number; ms: number }[]; // x 는 열 번호(픽셀 아님) — 렌더러가 x × fw 로 자른다
  dataUrl: string;
}

// 모습(look) 하나의 그림 묶음 — 렌더러가 look 키로 캐시한다
export interface LookSheets {
  look: string; // Pet.look ?? Pet.species
  cell: StageSize; // 담긴 동작 전부를 덮는 칸 (도트, 배율 전)
  body: StageSize; // 작업 동작을 뺀 몸 칸 — 자리 계산의 기준
  anims: Record<string, SpriteSheet>;
  clips: Record<string, { anim: string; mode: PlayMode; row: number }>; // 상태 → 동작 (StageState 키)
}

// 지금 재생할 동작 — 움직임 모듈이 고른 것. rate 는 재생 속도 배율(걷는 속도)
export interface Play {
  anim: string;
  row: number; // PMD 방향 행 0~7
  mode: PlayMode;
  rate: number;
}

// 무대 위 마리 하나 — x·y 는 무대 안 좌표(DIP)의 "몸" 좌상단. 그림은 몸 칸 가운데에 맞춰 렌더러가 그린다
export interface StagePet {
  evolution?: number; // 진화 연출의 남은 비율 0~1
  berry?: { x: number; y: number };
  id: string;
  look: string;
  zoom: number; // 도트 배율 (Pet.size 를 그림 크기로 가둔 값)
  x: number;
  y: number;
  play: Play | null; // null 이면 상태 동작 clips[state]
  held: boolean;
}

export interface StageFrame {
  at: number; // 메인 시각 ms
  state: StageState; // 상태 동작의 기준 (S2 는 전원 공통)
  pets: StagePet[]; // 그리는 순서 = 배열 순서 (뒤가 위)
}

export interface HoverQuery {
  x: number; // 무대 안 좌표
  y: number;
}
export type HitReply = string | null; // 마리 id

export type PointerType = "grab" | "drag" | "drop" | "click" | "menu";
export interface PointerMsg {
  type: PointerType;
  id: string; // 어느 마리
  x: number; // drag: 몸 좌상단이 놓일 무대 안 자리. 나머지: 커서 자리
  y: number;
}

export interface PickerItem {
  slug: string;
  name: string;
}
export interface PickerPayload {
  title: string;
  start: string;
  groups: { label: string; items: PickerItem[] }[];
}

// 채널 이름 — preload 와 메인이 같은 문자열을 쓰도록 유니언으로 묶는다 (런타임 상수는 양쪽이 각자 satisfies 로 검사)
export type StageChannel =
  | "stage:init" // M→R  StageInit
  | "stage:sheets" // M→R  LookSheets
  | "stage:frame" // M→R  StageFrame
  | "stage:hover" // M→R  HoverQuery
  | "stage:click-through" // M→R  boolean
  | "stage:ready" // R→M  없음
  | "stage:hit" // R→M  HitReply
  | "stage:pointer" // R→M  PointerMsg
  | "stage:log" // R→M  Record<string, unknown> — 렌더러 진단(시트 디코드 실패 등)을 메인 로그로
  | "picker:list" // R→M invoke → PickerPayload
  | "picker:start"; // R→M  slug

// preload 가 window.pokebuddy 로 내놓는 것 — 무대와 선택 창이 같은 preload 를 쓴다
export interface StageBridge {
  ready(): void;
  onInit(cb: (init: StageInit) => void): void;
  onSheets(cb: (sheets: LookSheets) => void): void;
  onFrame(cb: (frame: StageFrame) => void): void;
  onHover(cb: (q: HoverQuery) => void): void;
  onClickThrough(cb: (on: boolean) => void): void;
  hit(id: HitReply): void;
  pointer(msg: PointerMsg): void;
  log(entry: Record<string, unknown>): void;
  pickerList(): Promise<PickerPayload>;
  pickerStart(slug: string): void;
}
