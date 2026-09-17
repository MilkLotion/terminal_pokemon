// 렌더러에 최소 기능만 노출 — 그림 로드, 상태·클릭 통과 알림
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pokebuddy", {
  // gif·sheet: { kind, dataUrl, w, h, scale } / pmd: { kind, cell, zoom, anims, clips, credits, dex }
  getArt: () => ipcRenderer.invoke("art"),
  onState: (cb) => ipcRenderer.on("state", (_e, state) => cb(state)),
  onClickThrough: (cb) => ipcRenderer.on("click-through", (_e, on) => cb(on)),
  // buddy 가 고른 동작 { anim, row, mode } — null 이면 상태 동작으로 돌아간다 (PMD 만)
  onAct: (cb) => ipcRenderer.on("act", (_e, req) => cb(req)),
  // 펫을 잡고·끌고·놓고·찌른 것 { type: grab|drag|drop|click, x, y } (buddy 만)
  pointer: (msg) => ipcRenderer.send("pointer", msg),
  // 커서가 창 위에 있는 자리 { x, y } (창 안 좌표) — 그 자리가 그림 위인지 hit 으로 답한다 (buddy 만)
  onHover: (cb) => ipcRenderer.on("hover", (_e, p) => cb(p)),
  hit: (on) => ipcRenderer.send("hit", on),
  // 첫 실행 스타터 선택 창 (renderer/picker.js) — 목록·문구를 받고, 고른 슬러그를 보낸다
  pickerList: () => ipcRenderer.invoke("picker-list"),
  pickerStart: (slug) => ipcRenderer.send("picker-start", slug),
});
