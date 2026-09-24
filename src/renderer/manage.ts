// 관리 창 — 스냅샷을 받아 그리고, 조작은 명령으로 보낸다. 게임 규칙은 하나도 여기 두지 않는다.
//
// 값은 메인이 이미 화면이 읽을 모양으로 바꿔서 준다 (src/tx/snapshot.ts, src/tx/lists.ts). 여기서는 배치와 글자만 만든다.
// 명령을 보내면 새 스냅샷을 다시 받아 그린다. 화면이 스스로 상태를 들고 있지 않는다.
// 도감은 1089종이라 스냅샷에 없다. 탭을 처음 열 때만 따로 부르고 그다음부터는 들고 있는다.
import type { BagItemView, DexEntry, EggView, ManageReply, PetView, ShopItemView, SlotView, Snapshot } from "../shared/manage.js";

type TabId = "party" | "box" | "dex" | "shop" | "bag";

const TABS: { id: TabId; label: string }[] = [
  { id: "party", label: "파티" },
  { id: "box", label: "박스" },
  { id: "dex", label: "도감" },
  { id: "shop", label: "상점" },
  { id: "bag", label: "가방" },
];

// 만복도 구간 → 화면 낱말. 계약의 구간 이름과 1:1 이다
const ZONE_WORD: Record<string, string> = { full: "배부름", normal: "보통", hungry: "배고픔", starving: "매우 배고픔" };

const SHOP_TABS = [
  { id: "all", label: "전체" },
  { id: "egg", label: "알" },
  { id: "pokemon", label: "포켓몬" },
  { id: "tool", label: "도구" },
  { id: "evolution", label: "진화" },
  { id: "slot", label: "파티 칸" },
];

const DEX_TABS = [
  { id: "all", label: "전체" },
  { id: "obtained", label: "획득" },
  { id: "unlocked", label: "해금" },
  { id: "locked", label: "미해금" },
];

// 한 번에 다 그리면 무겁다. 도감은 앞에서부터 이만큼만 보여 준다
const DEX_SHOWN = 200;

// 성격을 골라야 하는 도구 — 고르는 화면이 아직 없어 여기서 막는다
const NEEDS_NATURE = new Set(["mint"]);

function need<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`manage.html 에 #${id} 가 없다`);
  return el;
}

const pointsEl = need("points", HTMLElement);
const tabsEl = need("tabs", HTMLElement);
const bodyEl = need("body", HTMLElement);
const scrimEl = need("scrim", HTMLElement);
const dName = need("d-name", HTMLElement);
const dSub = need("d-sub", HTMLElement);
const dMeters = need("d-meters", HTMLElement);
const dActions = need("d-actions", HTMLElement);
const dNotice = need("d-notice", HTMLElement);

// 대화상자는 개체 상세이거나 도구 사용 대상 고르기다
type Dialog = { kind: "pet"; petId: string } | { kind: "use"; itemId: string };

let tab: TabId = "party";
let view: Snapshot | null = null;
let dexRows: DexEntry[] | null = null;
let boxPage = 0;
let shopFilter = "all";
let dexFilter = "all";
let dialog: Dialog | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const button = (cls: string, text?: string): HTMLButtonElement => {
  const b = el("button", cls || undefined, text);
  b.type = "button";
  return b;
};

const point = (n: number): string => `${n.toLocaleString("ko-KR")}P`;

// 값 막대 하나 — 이름, 현재/최대, 채움
function meter(label: string, value: number, zone?: string): HTMLElement {
  const box = el("div", "meter");
  const row = el("div", "row");
  row.append(el("span", undefined, label), el("span", undefined, `${value}/100`));
  const track = el("div", "track");
  const fill = el("div", zone && zone !== "full" && zone !== "normal" ? `fill ${zone}` : "fill");
  fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
  track.appendChild(fill);
  box.append(row, track);
  return box;
}

// 거르개 칩 한 줄 — 도감과 상점이 같은 모양을 쓴다
function chips(items: { id: string; label: string }[], current: string, pick: (id: string) => void): HTMLElement {
  const row = el("div", "chips");
  for (const it of items) {
    const b = button("chip", it.label);
    b.setAttribute("aria-pressed", String(it.id === current));
    b.addEventListener("click", () => pick(it.id));
    row.appendChild(b);
  }
  return row;
}

function head(title: string, sub: string): HTMLElement {
  const box = el("div", "head");
  box.append(el("h1", undefined, title), el("div", "sub", sub));
  return box;
}

// ── 파티 ───────────────────────────────────────────────────────────────────────

function petCard(pet: PetView): HTMLElement {
  const card = button("slot");

  const portrait = el("div", "portrait", pet.shiny ? "이로치" : "");
  if (pet.hidden) {
    const mark = el("span", "mark");
    mark.title = "숨긴 상태";
    portrait.appendChild(mark);
  }
  card.appendChild(portrait);

  const info = el("div", "info");
  const top = el("div", "top");
  top.append(el("span", undefined, `Lv.${pet.level}`), el("span", undefined, `다음 레벨까지 ${pet.percentToNext}%`));
  info.appendChild(top);
  info.appendChild(el("div", "name", pet.name));

  const tags = el("div", "tags");
  for (const t of pet.types) tags.appendChild(el("span", "tag", t));
  tags.appendChild(el("span", "tag nature", pet.nature));
  if (pet.longPlay) tags.appendChild(el("span", "tag", "오래 놀아주기"));
  info.appendChild(tags);

  const meters = el("div", "meters");
  meters.append(meter("친밀도", pet.affinity), meter("만복도", pet.fullness, pet.zone));
  info.appendChild(meters);

  card.appendChild(info);
  card.addEventListener("click", () => openPet(pet.id));
  card.title = `${pet.name} · ${ZONE_WORD[pet.zone] ?? pet.zone}`;
  return card;
}

function blankCard(slot: SlotView): HTMLElement {
  const card = button("slot blank");
  if (slot.state === "locked") {
    card.classList.add("locked");
    card.disabled = true;
    card.append(el("strong", undefined, "잠긴 칸"), el("small", undefined, slot.unlockBy === "achievement" ? "업적 보상으로 열기" : "상점에서 구매"));
    return card;
  }
  card.append(el("strong", undefined, "빈 칸"), el("small", undefined, "박스에서 배치"));
  card.addEventListener("click", () => {
    tab = "box";
    draw();
  });
  return card;
}

function drawParty(v: Snapshot): void {
  bodyEl.appendChild(head("파티", `${v.party.shown}마리 표시 중 · ${v.party.usable} / ${v.party.slots.length}칸 사용 가능`));
  const grid = el("div", "grid");
  for (const slot of v.party.slots) grid.appendChild(slot.pet ? petCard(slot.pet) : blankCard(slot));
  bodyEl.appendChild(grid);
}

// ── 박스 ───────────────────────────────────────────────────────────────────────

function eggCard(egg: EggView): HTMLElement {
  const card = el("div", "egg");
  card.appendChild(el("div", "shell"));
  card.appendChild(el("div", undefined, egg.name));
  card.appendChild(el("div", "note", egg.ready ? "준비 완료" : `${egg.percent}% · ${egg.remainSec}초`));
  card.appendChild(el("div", "note", `쓰다듬기 ${egg.actions.pat} · 노래 ${egg.actions.song}`));

  // 열기는 한 줄을 혼자 쓴다. 돌봄 두 개와 나란히 두면 글자가 줄바꿈된다
  if (egg.ready) {
    const row = el("div", "acts");
    const open = button("primary", "열기");
    open.addEventListener("click", () => void send("egg.open", egg.id));
    row.appendChild(open);
    card.appendChild(row);
  }
  const acts = el("div", "acts");
  for (const [action, label] of [["pat", "쓰다듬기"], ["song", "노래"]] as const) {
    const b = button("", label);
    b.disabled = !egg.careReady;
    b.addEventListener("click", () => void send("egg.care", egg.id, { action }));
    acts.appendChild(b);
  }
  card.appendChild(acts);
  return card;
}

function drawBox(v: Snapshot): void {
  const kept = v.boxes.reduce((sum, b) => sum + b.used, 0);
  bodyEl.appendChild(head("박스", `보관 ${kept}마리 · 박스 ${v.boxes.length}개`));

  const daycare = el("div", "daycare");
  const title = el("div", "title");
  title.append(el("strong", undefined, "돌보미집"), el("span", undefined, `알 ${v.eggs.used} / ${v.eggs.size}`));
  daycare.appendChild(title);
  const eggs = el("div", "eggs");
  if (v.eggs.list.length) for (const egg of v.eggs.list) eggs.appendChild(eggCard(egg));
  else eggs.appendChild(el("div", "note", "알이 없습니다. 상점에서 살 수 있어요."));
  daycare.appendChild(eggs);
  bodyEl.appendChild(daycare);

  if (boxPage >= v.boxes.length) boxPage = 0;
  const box = v.boxes[boxPage];
  if (!box) return;

  const pager = el("div", "pager");
  const prev = button("", "◀");
  prev.disabled = boxPage === 0;
  prev.addEventListener("click", () => {
    boxPage -= 1;
    draw();
  });
  const next = button("", "▶");
  next.disabled = boxPage >= v.boxes.length - 1;
  next.addEventListener("click", () => {
    boxPage += 1;
    draw();
  });
  pager.append(prev, el("span", "label", box.name), el("span", "used", `${box.used} / ${box.size}`), next);
  bodyEl.appendChild(pager);

  const grid = el("div", "box-grid");
  for (const pet of box.slots) {
    if (!pet) {
      grid.appendChild(el("div", "cell blank"));
      continue;
    }
    const cell = button("cell");
    cell.append(el("div", "dot"), el("div", "who", pet.name), el("div", "note", pet.shiny ? `Lv.${pet.level} · 이로치` : `Lv.${pet.level}`));
    cell.title = `${pet.name} · 눌러서 파티에 배치`;
    cell.addEventListener("click", () => void send("party.place", pet.id));
    grid.appendChild(cell);
  }
  bodyEl.appendChild(grid);
}

// ── 도감 ───────────────────────────────────────────────────────────────────────

function dexCell(row: DexEntry): HTMLElement {
  const cell = el("div", row.state === "locked" ? "dex-cell locked" : "dex-cell");
  cell.append(el("div", "no", `#${String(row.dex).padStart(4, "0")}`), el("div", "dot"));
  cell.appendChild(el("div", undefined, row.state === "locked" ? "???" : row.name));
  if (row.state === "obtained") cell.appendChild(el("div", "no", row.shiny ? "이로치 획득" : "획득"));
  if (row.condition) cell.title = `발견한 조건: ${row.condition}`;
  return cell;
}

function drawDex(v: Snapshot): void {
  bodyEl.appendChild(head("도감", `획득 ${v.dex.obtained} · 해금 ${v.dex.unlocked} · 이로치 ${v.dex.shiny}`));
  bodyEl.appendChild(
    chips(DEX_TABS, dexFilter, (id) => {
      dexFilter = id;
      draw();
    }),
  );
  if (!dexRows) {
    bodyEl.appendChild(el("div", "empty-note", "도감을 읽는 중입니다."));
    return;
  }
  const rows = dexRows.filter((r) => dexFilter === "all" || r.state === dexFilter);
  if (!rows.length) {
    bodyEl.appendChild(el("div", "empty-note", "해당하는 종이 없습니다."));
    return;
  }
  const grid = el("div", "dex-grid");
  for (const row of rows.slice(0, DEX_SHOWN)) grid.appendChild(dexCell(row));
  bodyEl.appendChild(grid);
  if (rows.length > DEX_SHOWN) bodyEl.appendChild(el("div", "empty-note", `${rows.length}종 가운데 앞 ${DEX_SHOWN}종을 보여 줍니다.`));
}

// ── 상점 ───────────────────────────────────────────────────────────────────────

function shopRow(item: ShopItemView): HTMLElement {
  const card = button("row-card");
  const body = el("div", "body");
  const why = item.blocked ?? (item.affordable ? item.note : "포인트가 모자라요");
  body.append(el("div", "title", item.name), el("div", "note", why));
  card.append(body, el("div", "price", point(item.price)));
  card.disabled = item.blocked != null || !item.affordable;
  card.addEventListener("click", () => void send("shop.buy", item.id));
  return card;
}

function drawShop(v: Snapshot): void {
  bodyEl.appendChild(head("상점", `보유 ${point(v.points)}`));
  bodyEl.appendChild(
    chips(SHOP_TABS, shopFilter, (id) => {
      shopFilter = id;
      draw();
    }),
  );
  const rows = v.shop.filter((i) => shopFilter === "all" || i.category === shopFilter);
  if (!rows.length) {
    bodyEl.appendChild(el("div", "empty-note", "파는 것이 없습니다."));
    return;
  }
  const list = el("div", "rows");
  for (const item of rows) list.appendChild(shopRow(item));
  bodyEl.appendChild(list);
}

// ── 가방 ───────────────────────────────────────────────────────────────────────

function bagRow(item: BagItemView): HTMLElement {
  const card = button("row-card");
  const blocked = NEEDS_NATURE.has(item.id);
  const body = el("div", "body");
  body.append(el("div", "title", item.name), el("div", "note", blocked ? "성격을 고르는 화면이 아직 없습니다" : "눌러서 사용"));
  card.append(body, el("div", "count", `×${item.count}`));
  card.disabled = blocked;
  card.addEventListener("click", () => openUse(item.id));
  return card;
}

function drawBag(v: Snapshot): void {
  bodyEl.appendChild(head("가방", `도구 ${v.bag.length}종`));
  if (!v.bag.length) {
    bodyEl.appendChild(el("div", "empty-note", "가방이 비었습니다. 상점에서 도구를 살 수 있어요."));
    return;
  }
  const list = el("div", "rows");
  for (const item of v.bag) list.appendChild(bagRow(item));
  bodyEl.appendChild(list);
}

// ── 그리기 ─────────────────────────────────────────────────────────────────────

function drawTabs(): void {
  tabsEl.replaceChildren();
  for (const t of TABS) {
    const b = button("", t.label);
    b.setAttribute("aria-selected", String(t.id === tab));
    b.addEventListener("click", () => {
      tab = t.id;
      if (t.id === "dex" && !dexRows) void loadDex();
      draw();
    });
    tabsEl.appendChild(b);
  }
}

function draw(): void {
  drawTabs();
  bodyEl.replaceChildren();
  if (!view) {
    bodyEl.appendChild(el("div", "empty-note", "저장이 없습니다. 첫 포켓몬을 먼저 고르세요."));
    return;
  }
  pointsEl.textContent = `${view.points.toLocaleString("ko-KR")} P`;
  if (tab === "party") drawParty(view);
  else if (tab === "box") drawBox(view);
  else if (tab === "dex") drawDex(view);
  else if (tab === "shop") drawShop(view);
  else drawBag(view);
}

// ── 대화상자 ───────────────────────────────────────────────────────────────────

const partyPets = (): PetView[] => (view ? view.party.slots.map((s) => s.pet).filter((p): p is PetView => p != null) : []);

const petOf = (id: string): PetView | null => partyPets().find((p) => p.id === id) ?? null;

function actionButton(label: string, primary: boolean, disabled: boolean, run: () => void): HTMLButtonElement {
  const b = button(primary ? "act primary" : "act", label);
  b.disabled = disabled;
  b.addEventListener("click", run);
  return b;
}

function closeDialog(): void {
  dialog = null;
  scrimEl.classList.remove("open");
}

// 도구를 쓸 대상 고르기 — 파티에 있는 개체만 고를 수 있다
function drawUse(itemId: string): void {
  const item = view?.bag.find((i) => i.id === itemId);
  dName.textContent = item ? item.name : itemId;
  const pets = partyPets();
  dSub.textContent = pets.length ? "누구에게 쓸까요?" : "파티에 개체가 없습니다.";
  dMeters.replaceChildren();
  const acts = pets.map((p) => actionButton(`${p.name} (Lv.${p.level})`, false, false, () => void send("bag.use", itemId, { petId: p.id })));
  acts.push(actionButton("닫기", false, false, closeDialog));
  dActions.replaceChildren(...acts);
}

function drawPet(petId: string): void {
  const pet = petOf(petId);
  if (!pet) {
    closeDialog();
    return;
  }
  dName.textContent = pet.name;
  dSub.textContent = `Lv.${pet.level} · ${pet.nature} · ${ZONE_WORD[pet.zone] ?? pet.zone}${pet.hidden ? " · 숨긴 상태" : ""}`;
  dMeters.replaceChildren(meter("친밀도", pet.affinity), meter("만복도", pet.fullness, pet.zone));
  dActions.replaceChildren(
    actionButton(pet.hidden ? "꺼내기" : "숨기기", true, false, () => void send(pet.hidden ? "party.show" : "party.hide", pet.id)),
    actionButton(pet.feedReady ? "밥 주기" : `밥 주기 (${pet.feedInSec}초)`, false, !pet.feedReady || pet.fullness >= 100, () => void send("feed", pet.id)),
    actionButton(pet.playReady ? "놀아주기" : "놀아주기 (쿨타임)", false, !pet.playReady, () => void send("play", pet.id)),
    actionButton("진화", false, false, () => void send("evolve", pet.id)),
    actionButton("박스에 보관", false, false, () => void send("party.keep", pet.id)),
    actionButton("닫기", false, false, closeDialog),
  );
}

function drawDialog(): void {
  if (!dialog) {
    scrimEl.classList.remove("open");
    return;
  }
  scrimEl.classList.add("open");
  if (dialog.kind === "use") drawUse(dialog.itemId);
  else drawPet(dialog.petId);
}

function clearNotice(): void {
  dNotice.className = "notice";
  dNotice.textContent = "";
}

function openPet(id: string): void {
  dialog = { kind: "pet", petId: id };
  clearNotice();
  drawDialog();
}

function openUse(itemId: string): void {
  dialog = { kind: "use", itemId };
  clearNotice();
  drawDialog();
}

// 실패 이유 → 화면 문구. 모르는 이유는 그대로 보여 무엇이 빠졌는지 드러나게 한다
const REASON: Record<string, string> = {
  cooldown: "아직 쉬는 시간이에요.",
  full: "이미 배가 불러요.",
  already: "이미 그 상태예요.",
  "max-level": "이미 최고 레벨이에요.",
  "no-slot": "그 칸이 없어요.",
  "no-pet": "그 개체가 없어요.",
  "not-in-party": "파티에 없어요.",
  "not-in-box": "박스에 없어요.",
  "party-full": "파티에 빈 칸이 없어요.",
  "no-empty-slot": "파티에 빈 칸이 없어요.",
  "slot-locked": "잠긴 칸이에요.",
  "slot-not-empty": "그 칸이 이미 차 있어요.",
  "not-enough-points": "포인트가 모자라요.",
  "daycare-full": "돌보미집이 가득 찼어요.",
  "max-slots": "더 열 수 있는 칸이 없어요.",
  "no-locked-slot": "더 열 수 있는 칸이 없어요.",
  "not-unlocked": "아직 해금하지 않은 종이에요.",
  "not-ready": "아직 준비되지 않았어요.",
  "no-candidate": "지금은 진화할 수 없어요.",
  "need-choice": "진화할 곳이 여럿이에요. 고르는 화면이 아직 없습니다.",
  "no-step": "더 진화하지 않아요.",
  "none-left": "가방에 남은 것이 없어요.",
  "no-item": "가방에 없어요.",
  "unknown-item": "모르는 도구예요.",
  "bad-nature": "쓸 수 없는 성격이에요.",
  "daily-cap": "오늘은 더 쓸 수 없어요.",
  "save-failed": "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

// 대상이 사라지거나 바뀌는 조작 — 결과를 보여 줄 곳이 없으므로 창을 닫는다
const CLOSES = new Set(["party.keep", "egg.open", "bag.use"]);

// 도감이 함께 바뀌는 조작 — 다음에 도감을 열 때 다시 읽게 비운다
const TOUCHES_DEX = new Set(["egg.open", "shop.buy", "evolve", "bag.use"]);

// 조작 하나마다 새 요청이다. 같은 순간의 두 클릭이 하나로 합쳐지지 않게 보내는 쪽이 식별자를 만든다.
// 같은 값으로 다시 보내면 실행기가 한 번만 반영한다 (docs/specs/modules.md "거래 실행기")
let seq = 0;
const nextReqId = (cmd: string, target: string): string => `ui:${Date.now()}:${++seq}:${cmd}:${target}`;

async function send(cmd: string, target: string, extra: Record<string, unknown> = {}): Promise<void> {
  const args = { ...extra, reqId: nextReqId(cmd, target) };
  const reply: ManageReply = await window.pokebuddyManage.command({ cmd, target, args });
  if (reply.ok && TOUCHES_DEX.has(cmd)) dexRows = null;
  await refresh();

  if (reply.ok) {
    clearNotice();
    if (CLOSES.has(cmd)) {
      closeDialog();
      return;
    }
  } else {
    dNotice.className = "notice bad";
    dNotice.textContent = REASON[reply.reason] ?? reply.reason;
  }
  drawDialog();
}

async function loadDex(): Promise<void> {
  dexRows = await window.pokebuddyManage.dex();
  if (tab === "dex") draw();
}

async function refresh(): Promise<void> {
  view = await window.pokebuddyManage.snapshot();
  draw();
}

scrimEl.addEventListener("click", (e) => {
  if (e.target === scrimEl) closeDialog();
});

void refresh();
// 시간이 흐르면 만복도·쿨타임·알 준비가 바뀐다. 창이 떠 있는 동안 주기적으로 다시 읽는다
setInterval(() => void refresh().then(drawDialog), 5000);
