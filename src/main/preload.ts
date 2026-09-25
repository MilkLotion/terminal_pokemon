// 샌드박스 preload — 렌더러에 window.pokebuddy(StageBridge)·pokebuddyManage·pokebuddyBanner 를 노출한다. 모든 창이 같은 preload 를 쓴다.
// 샌드박스라 electron 만 require 할 수 있다 — 우리 모듈은 끌어오지 않고 타입만 import() 식으로 본다 (이 파일은 모듈이 아닌 스크립트).
// 채널 이름은 shared/stage.d.ts StageChannel 과 같은 문자열인지 satisfies 로 검사한다 — 메인(stage-window.ts)도 같은 검사를 한다
type StageBridge = import("../shared/stage").StageBridge;
type StageChannel = import("../shared/stage").StageChannel;
type StageInit = import("../shared/stage").StageInit;
type LookSheets = import("../shared/stage").LookSheets;
type StageFrame = import("../shared/stage").StageFrame;
type HoverQuery = import("../shared/stage").HoverQuery;
type PickerPayload = import("../shared/stage").PickerPayload;
type ManageBridge = import("../shared/manage").ManageBridge;
type ManageChannel = import("../shared/manage").ManageChannel;
type ManageRequest = import("../shared/manage").ManageRequest;
type ManageReply = import("../shared/manage").ManageReply;
type Snapshot = import("../shared/manage").Snapshot;
type DexEntry = import("../shared/manage").DexEntry;
type DexDetail = import("../shared/manage").DexDetail;
type AgentReply = import("../shared/manage").AgentReply;
type ManageRoute = import("../shared/manage").ManageRoute;
type BannerBridge = import("../shared/manage").BannerBridge;
type BannerChannel = import("../shared/manage").BannerChannel;
type BannerView = import("../shared/manage").BannerView;

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

const CH = {
  init: "stage:init",
  sheets: "stage:sheets",
  frame: "stage:frame",
  hover: "stage:hover",
  clickThrough: "stage:click-through",
  ready: "stage:ready",
  hit: "stage:hit",
  pointer: "stage:pointer",
  log: "stage:log",
  pickerList: "picker:list",
  pickerStart: "picker:start",
} satisfies Record<string, StageChannel>;

const bridge: StageBridge = {
  ready: () => ipcRenderer.send(CH.ready),
  onInit: (cb) => ipcRenderer.on(CH.init, (_e, init: StageInit) => cb(init)),
  onSheets: (cb) => ipcRenderer.on(CH.sheets, (_e, sheets: LookSheets) => cb(sheets)),
  onFrame: (cb) => ipcRenderer.on(CH.frame, (_e, frame: StageFrame) => cb(frame)),
  onHover: (cb) => ipcRenderer.on(CH.hover, (_e, q: HoverQuery) => cb(q)),
  onClickThrough: (cb) => ipcRenderer.on(CH.clickThrough, (_e, on: boolean) => cb(on)),
  hit: (id) => ipcRenderer.send(CH.hit, id),
  pointer: (msg) => ipcRenderer.send(CH.pointer, msg),
  log: (entry) => ipcRenderer.send(CH.log, entry),
  pickerList: () => ipcRenderer.invoke(CH.pickerList) as Promise<PickerPayload>,
  pickerStart: (slug) => ipcRenderer.send(CH.pickerStart, slug),
};

contextBridge.exposeInMainWorld("pokebuddy", bridge);

// 관리 창 — 스냅샷과 명령, 그리고 스냅샷에 담지 않는 도감과 CLI 연결
const MANAGE = {
  snapshot: "manage:snapshot",
  command: "manage:command",
  dex: "manage:dex",
  dexDetail: "manage:dex-detail",
  agents: "manage:agents",
  route: "manage:route",
} satisfies Record<string, ManageChannel>;

const manage: ManageBridge = {
  snapshot: () => ipcRenderer.invoke(MANAGE.snapshot) as Promise<Snapshot | null>,
  command: (req: ManageRequest) => ipcRenderer.invoke(MANAGE.command, req) as Promise<ManageReply>,
  dex: () => ipcRenderer.invoke(MANAGE.dex) as Promise<DexEntry[]>,
  dexDetail: (slug: string) => ipcRenderer.invoke(MANAGE.dexDetail, slug) as Promise<DexDetail | null>,
  agents: (req) => ipcRenderer.invoke(MANAGE.agents, req) as Promise<AgentReply>,
  onRoute: (cb) => ipcRenderer.on(MANAGE.route, (_e, route: ManageRoute) => cb(route)),
};

contextBridge.exposeInMainWorld("pokebuddyManage", manage);

// 알림 배너 창 — 배너 하나를 받고, `바로가기` 와 커서 올림을 알린다
const BANNER = {
  show: "banner:show",
  go: "banner:go",
  hover: "banner:hover",
} satisfies Record<string, BannerChannel>;

const banner: BannerBridge = {
  onShow: (cb) => ipcRenderer.on(BANNER.show, (_e, view: BannerView) => cb(view)),
  go: (key) => ipcRenderer.send(BANNER.go, key),
  hover: (on) => ipcRenderer.send(BANNER.hover, on),
};

contextBridge.exposeInMainWorld("pokebuddyBanner", banner);
