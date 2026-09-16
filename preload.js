// 렌더러에 최소 기능만 노출 — 그림 로드, 상태·클릭 통과 알림
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pkmon", {
  // { kind: "gif" | "sheet", dataUrl, w, h, scale }
  getArt: () => ipcRenderer.invoke("art"),
  onState: (cb) => ipcRenderer.on("state", (_e, state) => cb(state)),
  onClickThrough: (cb) => ipcRenderer.on("click-through", (_e, on) => cb(on)),
});
