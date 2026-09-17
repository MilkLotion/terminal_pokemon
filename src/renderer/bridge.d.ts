// window.pokebuddy — preload 가 contextBridge 로 내놓는 다리. 무대(stage.ts)와 선택 창(picker.ts)이 같은 preload 를 쓴다
// 타입만 — 계약은 src/shared/stage.d.ts 한 곳. 이 파일은 emit 되지 않는다
import type { StageBridge } from "../shared/stage.js";

declare global {
  interface Window {
    pokebuddy: StageBridge;
  }
}

export {};
