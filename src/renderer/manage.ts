// 관리 창 — 스냅샷을 받아 그리고, 조작은 명령으로 보낸다. 게임 규칙은 하나도 여기 두지 않는다.
//
// 값은 메인이 이미 화면이 읽을 모양으로 바꿔서 준다 (src/tx/snapshot.ts, src/tx/lists.ts). 여기서는 배치와 글자만 만든다.
// 명령을 보내면 새 스냅샷을 다시 받아 그린다. 화면이 스스로 상태를 들고 있지 않는다.
// 도감과 CLI 연결은 스냅샷에 없다. 필요할 때만 따로 부르고 그다음부터는 들고 있는다.
// 모달은 하나만 뜬다. 어느 모달인지는 `dialog` 하나가 가진다 — 겹쳐 띄우지 않는다.
import type {
  AchievementView,
  AgentRow,
  BagItemView,
  DexEntry,
  EggView,
  ManageReply,
  PetView,
  ShopItemView,
  SlotView,
  Snapshot,
} from "../shared/manage.js";

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

// 잠들기 기준 — 0 은 잠들지 않음. 값은 src/state/settings.ts 의 허용 목록과 같다
const SLEEP_CHOICES = [
  { id: "3", label: "3분" },
  { id: "5", label: "5분" },
  { id: "10", label: "10분" },
  { id: "15", label: "15분" },
  { id: "0", label: "잠들지 않음" },
];

// 한 번에 다 그리면 무겁다. 도감은 앞에서부터 이만큼만 보여 준다
const DEX_SHOWN = 200;

// 한 번에 살 수 있는 최대 수량. `[스펙 미확정]` 정식 상한이 정해지면 여기를 고친다
const BUY_MAX = 10;

// 여러 개 살 수 있는 상품 — 알·포켓몬·파티 칸은 하나씩만 산다
const MULTI_BUY = new Set(["tool", "evolution"]);

// 성격을 골라야 하는 도구 — 고르는 화면이 아직 없어 여기서 막는다
const NEEDS_NATURE = new Set(["mint"]);

// 가이드북 — 구성은 docs/specs/s5.md "튜토리얼과 가이드북" 의 다섯 주제다.
// 숫자는 적지 않는다. 밸런스 값이 바뀌어도 이 문구가 어긋나지 않게 한다
const GUIDE: { title: string; lines: string[] }[] = [
  {
    title: "돌봄",
    lines: [
      "밥을 주면 만복도가 오른다. 쿨타임이 지나야 다시 줄 수 있다.",
      "놀아주면 친밀도가 오른다. 쿨타임이 지난 뒤 남은 시간 안에 이어서 놀아주면 중첩이 오른다.",
      "세 번 이어서 놀아주면 오래 놀아주기가 되고 친밀도 증가량이 늘어난다.",
      "PC 잠금·절전·앱 종료 중에는 시간이 흐르지 않는다.",
    ],
  },
  {
    title: "상점과 알",
    lines: [
      "포인트로 알, 도구, 진화용 도구, 파티 칸을 산다.",
      "산 알은 돌보미집으로 간다. 쓰다듬기와 노래로 준비 시간을 줄인다.",
      "돌봄 행동의 종류와 횟수가 나오는 종을 바꾼다. 어떤 조합이 어떤 종을 부르는지는 직접 찾는다.",
      "준비를 마친 알을 열면 개체가 나온다. 파티가 차 있으면 박스로 간다.",
    ],
  },
  {
    title: "파티와 박스",
    lines: [
      "파티 칸은 처음부터 다 열려 있지 않다. 상점과 업적으로 연다.",
      "파티에 있는 개체만 시간이 흐른다. 박스에 둔 개체는 멈춘다.",
      "꺼낸 개체만 바탕화면에 보인다. 숨겨도 포인트와 친밀도는 쌓인다.",
      "박스 개체를 파티에 배치하거나 파티 개체와 맞바꾼다.",
    ],
  },
  {
    title: "진화",
    lines: [
      "조건을 채운 개체는 상세에서 직접 진화시킨다. 저절로 진화하지 않는다.",
      "조건은 종마다 다르다. 레벨, 친밀도, 도구, 시간대를 본다.",
      "진화할 곳이 여럿인 종은 어디로 갈지 골라야 한다.",
      "진화해도 같은 개체다. 이로치와 성격은 그대로 남는다.",
    ],
  },
  {
    title: "업적",
    lines: [
      "업적은 조건을 채우면 달성으로 남는다. 나중에 상태가 바뀌어도 달성은 사라지지 않는다.",
      "달성과 보상 수령은 다르다. 보상은 업적창에서 직접 받는다.",
      "받지 않은 보상이 있으면 헤더의 업적창 아이콘에 점이 뜬다.",
    ],
  },
];

function need<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`manage.html 에 #${id} 가 없다`);
  return el;
}

const pointsEl = need("points", HTMLElement);
const tabsEl = need("tabs", HTMLElement);
const bodyEl = need("body", HTMLElement);
const scrimEl = need("scrim", HTMLElement);
const dialogEl = need("dialog", HTMLElement);
const achDotEl = need("achievements-dot", HTMLElement);

// 모달 하나. 어느 것인지와 그 모달만 쓰는 값을 함께 담는다
type Dialog =
  | { kind: "pet"; petId: string }
  | { kind: "use"; itemId: string }
  | { kind: "buy"; productId: string; qty: number }
  | { kind: "pick-box"; slotIndex: number } // 칸이 정해졌고 넣을 박스 개체를 고른다
  | { kind: "pick-slot"; petId: string } // 개체가 정해졌고 넣을 파티 칸을 고른다
  | { kind: "achievements" }
  | { kind: "settings"; tab: "general" | "agents" }
  | { kind: "guide" };

let tab: TabId = "party";
let view: Snapshot | null = null;
let dexRows: DexEntry[] | null = null;
let agentRows: AgentRow[] | null = null;
let boxPage = 0;
let shopFilter = "all";
let dexFilter = "all";
let dialog: Dialog | null = null;
let notice = ""; // 마지막 실패 문구. 모달을 다시 그려도 남는다

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

// 거르개 칩 한 줄 — 도감·상점·설정이 같은 모양을 쓴다
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

// 켬·끔처럼 둘 중 하나 — 붙은 두 칸으로 그린다
function toggle(on: boolean, labels: [string, string], pick: (on: boolean) => void): HTMLElement {
  const box = el("div", "toggle");
  for (const [i, label] of labels.entries()) {
    const b = button("", label);
    const isOn = i === 0;
    b.setAttribute("aria-pressed", String(on === isOn));
    b.addEventListener("click", () => pick(isOn));
    box.appendChild(b);
  }
  return box;
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
  card.append(el("strong", undefined, "빈 칸"), el("small", undefined, "박스에서 고르기"));
  card.addEventListener("click", () => open({ kind: "pick-box", slotIndex: slot.index }));
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
    const openEgg = button("primary", "열기");
    openEgg.addEventListener("click", () => void send("egg.open", egg.id));
    row.appendChild(openEgg);
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

function boxCell(pet: PetView, onPick: () => void): HTMLButtonElement {
  const cell = button("cell");
  cell.append(el("div", "dot"), el("div", "who", pet.name), el("div", "note", pet.shiny ? `Lv.${pet.level} · 이로치` : `Lv.${pet.level}`));
  cell.addEventListener("click", onPick);
  return cell;
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
    const cell = boxCell(pet, () => openPet(pet.id));
    cell.title = `${pet.name} · 눌러서 상세 보기`;
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
  body.append(el("div", "title", item.name), el("div", "note", item.blocked ?? item.note));
  card.append(body, el("div", "price", point(item.price)));
  // 살 수 없어도 누를 수 있다. 이유는 구매 창이 보여 준다
  card.addEventListener("click", () => open({ kind: "buy", productId: item.id, qty: 1 }));
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
  card.addEventListener("click", () => open({ kind: "use", itemId: item.id }));
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
  achDotEl.hidden = view.achievements.unclaimed === 0;
  if (tab === "party") drawParty(view);
  else if (tab === "box") drawBox(view);
  else if (tab === "dex") drawDex(view);
  else if (tab === "shop") drawShop(view);
  else drawBag(view);
}

// ── 모달 · 공통 ────────────────────────────────────────────────────────────────

const partyPets = (): PetView[] => (view ? view.party.slots.map((s) => s.pet).filter((p): p is PetView => p != null) : []);

const boxPets = (): PetView[] => (view ? view.boxes.flatMap((b) => b.slots.filter((p): p is PetView => p != null)) : []);

const petOf = (id: string): PetView | null => [...partyPets(), ...boxPets()].find((p) => p.id === id) ?? null;

const slotOfPet = (id: string): number | null => view?.party.slots.find((s) => s.pet?.id === id)?.index ?? null;

const emptySlot = (): number | null => view?.party.slots.find((s) => s.state === "empty")?.index ?? null;

function actionButton(label: string, primary: boolean, disabled: boolean, run: () => void): HTMLButtonElement {
  const b = button(primary ? "act primary" : "act", label);
  b.disabled = disabled;
  b.addEventListener("click", run);
  return b;
}

// 제목 줄 — `back` 을 주면 돌아가기를 앞에 둔다. 모달을 겹치지 않고 안에서 화면을 바꾼다
function dialogHead(title: string, sub: string, back?: { label: string; to: Dialog }): HTMLElement[] {
  const row = el("div", "title-row");
  if (back) {
    const b = button("back", `‹ ${back.label}`);
    b.addEventListener("click", () => open(back.to));
    row.appendChild(b);
  }
  row.appendChild(el("h2", undefined, title));
  return sub ? [row, el("div", "sub", sub)] : [row];
}

function actions(...items: HTMLElement[]): HTMLElement {
  const box = el("div", "actions");
  box.append(...items);
  return box;
}

const closeButton = (label = "닫기"): HTMLButtonElement => actionButton(label, false, false, close);

// ── 모달 · 개체 상세 ───────────────────────────────────────────────────────────

function drawPet(petId: string): void {
  const pet = petOf(petId);
  if (!pet) {
    close();
    return;
  }
  const slot = slotOfPet(petId);
  const inParty = slot != null;
  // 박스 개체는 스냅샷에서 늘 숨김으로 온다. 파티에 있을 때만 숨김 여부가 뜻을 가진다
  const kept = inParty && pet.hidden ? " · 숨긴 상태" : "";
  dialogEl.append(...dialogHead(pet.name, `Lv.${pet.level} · ${pet.nature} · ${ZONE_WORD[pet.zone] ?? pet.zone}${kept}`));

  const meters = el("div", "meters");
  meters.append(meter("친밀도", pet.affinity), meter("만복도", pet.fullness, pet.zone));
  dialogEl.appendChild(meters);

  if (!inParty) {
    // 박스 개체 — 빈 칸이 있으면 바로 배치하고, 없으면 바꿀 칸을 고른다
    const free = emptySlot();
    dialogEl.appendChild(el("div", "sub", "박스에 있습니다. 파티에 있는 동안에만 시간이 흐릅니다."));
    dialogEl.appendChild(
      actions(
        free != null
          ? actionButton("파티에 배치", true, false, () => void send("party.place", pet.id, { slotIndex: free }))
          : actionButton("교체", true, false, () => open({ kind: "pick-slot", petId: pet.id })),
        closeButton(),
      ),
    );
    return;
  }

  dialogEl.appendChild(
    actions(
      actionButton(pet.hidden ? "꺼내기" : "숨기기", true, false, () => void send(pet.hidden ? "party.show" : "party.hide", pet.id)),
      actionButton(pet.feedReady ? "밥 주기" : `밥 주기 (${pet.feedInSec}초)`, false, !pet.feedReady || pet.fullness >= 100, () => void send("feed", pet.id)),
      actionButton(pet.playReady ? "놀아주기" : "놀아주기 (쿨타임)", false, !pet.playReady, () => void send("play", pet.id)),
      actionButton("진화", false, false, () => void send("evolve", pet.id)),
      actionButton("교체", false, false, () => open({ kind: "pick-box", slotIndex: slot })),
      actionButton("박스에 보관", false, false, () => void send("party.keep", pet.id)),
      closeButton(),
    ),
  );
}

// ── 모달 · 도구 사용 대상 고르기 ───────────────────────────────────────────────

function drawUse(itemId: string): void {
  const item = view?.bag.find((i) => i.id === itemId);
  const pets = partyPets();
  dialogEl.append(...dialogHead(item ? item.name : itemId, pets.length ? "누구에게 쓸까요?" : "파티에 개체가 없습니다."));
  const acts = pets.map((p) => actionButton(`${p.name} (Lv.${p.level})`, false, false, () => void send("bag.use", itemId, { petId: p.id })));
  dialogEl.appendChild(actions(...acts, closeButton()));
}

// ── 모달 · 구매 창 ─────────────────────────────────────────────────────────────

function buyRow(label: string, value: string): HTMLElement {
  const row = el("div", "buy-row");
  row.append(el("span", undefined, label), el("span", "value", value));
  return row;
}

function drawBuy(productId: string, qty: number): void {
  const item = view?.shop.find((i) => i.id === productId);
  if (!item || !view) {
    close();
    return;
  }
  // 살 수 있는 개수는 포인트와 상한 중 작은 쪽이다. 값이 0이면 개수를 따지지 않는다
  const affordable = item.price > 0 ? Math.floor(view.points / item.price) : BUY_MAX;
  const cap = Math.max(1, Math.min(BUY_MAX, affordable));
  const many = MULTI_BUY.has(item.category);
  const count = many ? Math.max(1, Math.min(qty, cap)) : 1;
  const total = item.price * count;

  dialogEl.append(...dialogHead(item.name, item.note));

  if (many) {
    const row = el("div", "buy-row");
    const box = el("div", "qty");
    const minus = button("", "−");
    minus.disabled = count <= 1;
    minus.addEventListener("click", () => open({ kind: "buy", productId, qty: count - 1 }));
    const plus = button("", "+");
    plus.disabled = count >= cap;
    plus.addEventListener("click", () => open({ kind: "buy", productId, qty: count + 1 }));
    box.append(minus, el("span", "count", String(count)), plus);
    row.append(el("span", undefined, "수량"), box);
    dialogEl.appendChild(row);
  }

  dialogEl.appendChild(buyRow("합계", point(total)));
  dialogEl.appendChild(buyRow("보유 포인트", point(view.points)));

  const short = total > view.points;
  const why = item.blocked ?? (short ? "포인트가 모자라요." : "");
  if (why) dialogEl.appendChild(el("div", "notice bad", why));

  const acts: HTMLElement[] = [];
  acts.push(actionButton(item.price === 0 ? "받기" : "구매", true, !!item.blocked || short, () => void buy(productId, count)));
  // 돌보미집이 가득 찼을 때만 그리로 보낸다. 비우고 나면 다시 살 수 있다
  if (item.blocked && item.category === "egg") {
    acts.push(
      actionButton("돌보미집 보기", false, false, () => {
        tab = "box";
        close();
      }),
    );
  }
  acts.push(closeButton());
  dialogEl.appendChild(actions(...acts));
}

// 여러 개 사기 — 구매는 한 번에 하나다. 순서대로 보내고 하나라도 걸리면 거기서 멈춘다
async function buy(productId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const ok = await send("shop.buy", productId, {}, { keepOpen: i < count - 1 });
    if (!ok) return;
  }
}

// ── 모달 · 개체와 칸 고르기 ────────────────────────────────────────────────────

function drawPickBox(slotIndex: number): void {
  const pets = boxPets();
  const filled = view?.party.slots[slotIndex]?.state === "pokemon";
  dialogEl.append(...dialogHead("박스에서 고르기", filled ? `${slotIndex + 1}번 칸의 개체와 맞바꿉니다.` : `${slotIndex + 1}번 칸에 넣습니다.`));
  if (!pets.length) {
    dialogEl.appendChild(el("div", "empty-note", "박스가 비었습니다."));
    dialogEl.appendChild(actions(closeButton()));
    return;
  }
  const grid = el("div", "pick-grid");
  for (const pet of pets) {
    grid.appendChild(boxCell(pet, () => void send(filled ? "party.swap" : "party.place", pet.id, { slotIndex })));
  }
  dialogEl.appendChild(grid);
  dialogEl.appendChild(actions(closeButton()));
}

function drawPickSlot(petId: string): void {
  const pet = petOf(petId);
  if (!pet || !view) {
    close();
    return;
  }
  dialogEl.append(...dialogHead("파티 칸 고르기", `${pet.name}을(를) 어느 칸에 넣을까요?`));
  const grid = el("div", "pick-grid");
  for (const slot of view.party.slots) {
    if (slot.state === "locked") {
      const locked = el("div", "cell blank");
      locked.appendChild(el("div", "note", "잠김"));
      grid.appendChild(locked);
      continue;
    }
    const cell = button("cell");
    cell.append(el("div", "dot"), el("div", "who", slot.pet ? slot.pet.name : "빈 칸"), el("div", "note", `${slot.index + 1}번`));
    cell.addEventListener("click", () => void send(slot.pet ? "party.swap" : "party.place", petId, { slotIndex: slot.index }));
    grid.appendChild(cell);
  }
  dialogEl.appendChild(grid);
  dialogEl.appendChild(actions(closeButton()));
}

// ── 모달 · 업적창 ──────────────────────────────────────────────────────────────

function achievementRow(a: AchievementView): HTMLElement {
  const row = el("div", `achievement ${a.state}`);
  row.appendChild(el("span", "state"));
  const body = el("div", "body");
  body.append(el("div", "label", a.name), el("div", "hint", a.desc));
  row.appendChild(body);
  if (a.state === "achieved") {
    const claim = button("act primary", "보상 받기");
    claim.title = a.reward;
    claim.addEventListener("click", () => void send("achievement.claim", a.id));
    row.appendChild(claim);
  } else {
    row.appendChild(el("span", "done", a.state === "claimed" ? `${a.reward} 받음` : a.reward));
  }
  return row;
}

function drawAchievements(): void {
  if (!view) {
    close();
    return;
  }
  const list = view.achievements.list;
  dialogEl.append(...dialogHead("업적", `달성 ${view.achievements.total} / ${list.length} · 미수령 ${view.achievements.unclaimed}`));
  const scroll = el("div", "scroll");
  for (const a of list) scroll.appendChild(achievementRow(a));
  dialogEl.appendChild(scroll);
  dialogEl.appendChild(actions(closeButton()));
}

// ── 모달 · 설정 ────────────────────────────────────────────────────────────────

// 설정 한 줄. 조작이 넓으면 이름 아래에 깐다 — 옆에 두면 설명이 좁아져 여러 줄로 접힌다
function settingRow(label: string, hint: string, control: HTMLElement, stack = false): HTMLElement {
  const row = el("div", stack ? "setting stack" : "setting");
  const body = el("div", "body");
  body.append(el("div", "label", label), el("div", "hint", hint));
  row.append(body, control);
  return row;
}

function drawGeneral(scroll: HTMLElement): void {
  if (!view) return;
  const s = view.settings;
  const set = (key: string, value: unknown): void => void send("settings.set", key, { value });

  scroll.appendChild(
    settingRow(
      "놀이공간",
      s.playArea === "region" ? (s.hasRegion ? "그려 둔 영역 안에서만 돌아다닙니다." : "영역을 아직 그리지 않았습니다.") : "화면 전체를 씁니다.",
      toggle(s.playArea === "full", ["화면 전체", "영역 지정"], (full) => set("playArea", full ? "full" : "region")),
    ),
  );
  if (s.playArea === "region") scroll.appendChild(el("div", "hint", "영역 그리기는 아직 없습니다."));

  scroll.appendChild(
    settingRow(
      "잠들기 기준",
      "이만큼 아무 입력이 없으면 잠듭니다.",
      chips(SLEEP_CHOICES, String(s.sleepAfterMin), (id) => set("sleepAfterMin", Number(id))),
      true,
    ),
  );
  scroll.appendChild(settingRow("언어", "화면에 쓰는 말", toggle(s.language === "ko", ["한국어", "English"], (ko) => set("language", ko ? "ko" : "en"))));
  scroll.appendChild(settingRow("로그인 시 시작", "PC 를 켜면 함께 켭니다.", toggle(s.startOnLogin, ["켬", "끔"], (on) => set("startOnLogin", on))));
  scroll.appendChild(settingRow("알림 소리", "배너가 뜰 때 소리를 냅니다.", toggle(s.sound, ["켬", "끔"], (on) => set("sound", on))));

  const guide = button("go");
  const body = el("div", "body");
  body.append(el("div", "label", "가이드북"), el("div", "hint", "돌봄, 상점과 알, 파티와 박스, 진화, 업적"));
  guide.append(body, el("span", "arrow", "›"));
  guide.addEventListener("click", () => open({ kind: "guide" }));
  scroll.appendChild(guide);

  scroll.appendChild(el("div", "hint", "포켓몬 표시와 클릭 통과는 아직 이 창에 없습니다."));
}

// CLI 한 줄 — 상태를 네 가지로 나눈다 (docs/specs/s5.md "설정과 연결")
function agentRow(row: AgentRow): HTMLElement {
  const state = row.error ? "확인 필요" : !row.installed ? "미설치" : row.connected ? "연결됨" : "연결 안 됨";
  const usage = row.usage === "transcript" ? "토큰으로 적립" : "작업 시간으로 적립";
  const hint = row.error ? row.error : !row.installed ? "이 CLI 를 쓰고 있지 않습니다." : `${usage} · 훅 ${row.registered}/${row.total}`;

  const control = el("div", "actions");
  control.style.margin = "0";
  if (!row.installed) control.appendChild(actionButton("다시 확인", false, false, () => void agent(row.name, "check")));
  else if (row.connected) control.appendChild(actionButton("해제", false, false, () => void agent(row.name, "disconnect")));
  else control.appendChild(actionButton("연결", true, false, () => void agent(row.name, "connect")));

  return settingRow(row.label, `${state} · ${hint}`, control);
}

function drawAgents(scroll: HTMLElement): void {
  if (!agentRows) {
    scroll.appendChild(el("div", "empty-note", "연결 상태를 읽는 중입니다."));
    return;
  }
  for (const row of agentRows) scroll.appendChild(agentRow(row));
  scroll.appendChild(el("div", "hint", "연결하면 각 CLI 의 설정에 훅을 넣습니다. 해제하면 다시 뺍니다."));
}

function drawSettings(sub: "general" | "agents"): void {
  dialogEl.append(...dialogHead("설정", ""));
  const tabs = el("div", "subtabs");
  for (const [id, label] of [["general", "일반"], ["agents", "연결"]] as const) {
    const b = button("", label);
    b.setAttribute("aria-selected", String(id === sub));
    b.addEventListener("click", () => {
      if (id === "agents" && !agentRows) void loadAgents();
      open({ kind: "settings", tab: id });
    });
    tabs.appendChild(b);
  }
  dialogEl.appendChild(tabs);

  const scroll = el("div", "scroll");
  if (sub === "general") drawGeneral(scroll);
  else drawAgents(scroll);
  dialogEl.appendChild(scroll);
  dialogEl.appendChild(actions(closeButton()));
}

// ── 모달 · 가이드북 ────────────────────────────────────────────────────────────

function drawGuide(): void {
  dialogEl.append(...dialogHead("가이드북", "", { label: "설정", to: { kind: "settings", tab: "general" } }));
  const scroll = el("div", "scroll");
  for (const topic of GUIDE) {
    const box = el("div", "topic");
    box.appendChild(el("h3", undefined, topic.title));
    for (const line of topic.lines) box.appendChild(el("p", undefined, line));
    scroll.appendChild(box);
  }
  dialogEl.appendChild(scroll);
  dialogEl.appendChild(actions(closeButton()));
}

// ── 모달 · 여닫기 ──────────────────────────────────────────────────────────────

// 모달마다 폭이 다르다. 고르기는 격자가 들어가서 넓고, 목록은 길어서 안에서 스크롤한다
const SHAPE: Record<Dialog["kind"], string> = {
  pet: "dialog",
  use: "dialog",
  buy: "dialog",
  "pick-box": "dialog wide",
  "pick-slot": "dialog wide",
  achievements: "dialog tall",
  settings: "dialog tall",
  guide: "dialog tall",
};

function drawDialog(): void {
  if (!dialog) {
    scrimEl.classList.remove("open");
    return;
  }
  scrimEl.classList.add("open");
  dialogEl.className = SHAPE[dialog.kind];
  dialogEl.replaceChildren();

  if (dialog.kind === "pet") drawPet(dialog.petId);
  else if (dialog.kind === "use") drawUse(dialog.itemId);
  else if (dialog.kind === "buy") drawBuy(dialog.productId, dialog.qty);
  else if (dialog.kind === "pick-box") drawPickBox(dialog.slotIndex);
  else if (dialog.kind === "pick-slot") drawPickSlot(dialog.petId);
  else if (dialog.kind === "achievements") drawAchievements();
  else if (dialog.kind === "settings") drawSettings(dialog.tab);
  else drawGuide();

  if (notice) dialogEl.appendChild(el("div", "notice bad", notice));
}

// 다른 모달로 갈 때는 지난 실패 문구를 지운다. 구매 창의 부족 안내처럼 그 화면이 다시 만드는 것은 남는다
function open(next: Dialog): void {
  dialog = next;
  notice = "";
  drawDialog();
}

function close(): void {
  dialog = null;
  notice = "";
  scrimEl.classList.remove("open");
}

const openPet = (id: string): void => open({ kind: "pet", petId: id });

// ── 명령 보내기 ────────────────────────────────────────────────────────────────

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
  "not-pokemon": "그 칸에 개체가 없어요.",
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
  "bad-value": "고를 수 없는 값이에요.",
  "daily-cap": "오늘은 더 쓸 수 없어요.",
  "not-achieved": "아직 달성하지 않았어요.",
  "already-claimed": "이미 받았어요.",
  "save-failed": "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
  "art-missing": "바뀔 모습의 그림을 받지 못했어요. 잠시 뒤 다시 해 주세요.",
  "not-writer": "다른 창이 저장을 맡고 있어요. 잠시 뒤 다시 해 주세요.",
  timeout: "응답이 없어요. 잠시 뒤 다시 해 주세요.",
};

// 대상이 사라지거나 일이 끝나는 조작 — 결과를 보여 줄 곳이 없으므로 모달을 닫는다
const CLOSES = new Set(["party.keep", "party.place", "party.swap", "egg.open", "bag.use", "shop.buy"]);

// 도감이 함께 바뀌는 조작 — 다음에 도감을 열 때 다시 읽게 비운다
const TOUCHES_DEX = new Set(["egg.open", "shop.buy", "evolve", "bag.use"]);

// 조작 하나마다 새 요청이다. 같은 순간의 두 클릭이 하나로 합쳐지지 않게 보내는 쪽이 식별자를 만든다.
// 같은 값으로 다시 보내면 실행기가 한 번만 반영한다 (docs/specs/modules.md "거래 실행기")
let seq = 0;
const nextReqId = (cmd: string, target: string): string => `ui:${Date.now()}:${++seq}:${cmd}:${target}`;

// 답을 기다리는 조작이 있으면 새 조작을 받지 않는다. 빠른 두 번 클릭이 두 번 사거나 두 번 쓰지 않게 한다.
// 여러 개 사기는 앞 조작의 답을 받은 뒤 다음을 보내므로 막히지 않는다
let busy = false;

// 성공하면 true. 여러 번 보내는 쪽이 중간에 멈출 수 있게 돌려준다
async function send(cmd: string, target: string, extra: Record<string, unknown> = {}, opts: { keepOpen?: boolean } = {}): Promise<boolean> {
  if (busy) return false;
  busy = true;
  let reply: ManageReply;
  try {
    const args = { ...extra, reqId: nextReqId(cmd, target) };
    reply = await window.pokebuddyManage.command({ cmd, target, args });
    if (reply.ok && TOUCHES_DEX.has(cmd)) dexRows = null;
    await refresh();
  } finally {
    busy = false;
  }

  if (!reply.ok) {
    notice = REASON[reply.reason] ?? reply.reason;
    drawDialog();
    return false;
  }
  notice = "";
  if (CLOSES.has(cmd) && !opts.keepOpen) close();
  else drawDialog();
  return true;
}

async function agent(name: string, action: "connect" | "disconnect" | "check"): Promise<void> {
  const reply = await window.pokebuddyManage.agents({ name, action });
  agentRows = reply.list;
  notice = reply.ok ? "" : (REASON[reply.reason] ?? reply.reason);
  drawDialog();
}

async function loadDex(): Promise<void> {
  dexRows = await window.pokebuddyManage.dex();
  if (tab === "dex") draw();
}

async function loadAgents(): Promise<void> {
  agentRows = (await window.pokebuddyManage.agents()).list;
  if (dialog?.kind === "settings" && dialog.tab === "agents") drawDialog();
}

async function refresh(): Promise<void> {
  view = await window.pokebuddyManage.snapshot();
  draw();
}

need("open-achievements", HTMLButtonElement).addEventListener("click", () => open({ kind: "achievements" }));
need("open-settings", HTMLButtonElement).addEventListener("click", () => open({ kind: "settings", tab: "general" }));

scrimEl.addEventListener("click", (e) => {
  if (e.target === scrimEl) close();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && dialog) close();
});

void refresh();
// 시간이 흐르면 만복도·쿨타임·알 준비가 바뀐다. 창이 떠 있는 동안 주기적으로 다시 읽는다
setInterval(() => void refresh().then(drawDialog), 5000);
