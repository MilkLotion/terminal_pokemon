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
  DexDetail,
  DexEntry,
  EggView,
  ManageReply,
  ManageRoute,
  PetView,
  PortraitAsk,
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

const DEX_COLUMNS = 5; // manage.html 의 .dex-grid 열 수와 같다

// 한 번에 살 수 있는 최대 수량. `[스펙 미확정]` 정식 상한이 정해지면 여기를 고친다
const BUY_MAX = 10;

// 여러 개 살 수 있는 상품 — 알·포켓몬·파티 칸은 하나씩만 산다
const MULTI_BUY = new Set(["tool", "evolution"]);

// 성격을 골라야 하는 도구 — 고르는 화면이 아직 없어 여기서 막는다

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
  | { kind: "evolve"; petId: string; to?: string; itemId?: string } // 진화 확인 — to 는 고른 후보, itemId 는 가방의 돌로 왔을 때
  | { kind: "evo-target"; itemId: string } // 가방의 진화용 도구 — 진화할 개체를 고른다
  | { kind: "nature"; petId: string; pick?: string; itemId?: string; listOpen?: boolean } // 성격 변경 — pick 은 고른 성격, itemId 는 가방의 민트로 왔을 때
  | { kind: "nature-target"; itemId: string } // 가방의 민트 — 성격을 바꿀 개체를 고른다
  | { kind: "buy"; productId: string; qty: number }
  | { kind: "pick-box"; slotIndex: number } // 칸이 정해졌고 넣을 박스 개체를 고른다
  | { kind: "pick-slot"; petId: string } // 개체가 정해졌고 넣을 파티 칸을 고른다
  | { kind: "achievements" }
  | { kind: "settings"; tab: "general" | "agents" }
  | { kind: "guide" };

let tab: TabId = "party";
let view: Snapshot | null = null;
let detailPet: string | null = null; // 개체 상세 페이지에 띄운 개체 — 있으면 탭 본문 대신 상세를 그린다
let dexRows: DexEntry[] | null = null;
// 도감에서 고른 칸과 그 상세 — 상세는 칸을 누를 때 한 종만 따로 읽는다
let dexPick: string | null = null;
let dexDetail: DexDetail | null = null;
let agentRows: AgentRow[] | null = null;
let boxPage = 0;
// 검색어 — 탭을 옮겨도 남는다 (docs/specs/s5.md "검색과 선택을 유지한다")
let boxQuery = "";
let dexQuery = "";
let pickQuery = "";
let boxMarked: string | null = null; // 박스 검색 결과로 찾아간 개체 — 그 칸을 고른 칸으로 보인다
// 다시 그린 뒤 되돌릴 검색 칸 — 입력 중에 화면을 새로 그려도 포커스와 커서가 남게
let searchFocus: { key: string; caret: number } | null = null;
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

// ── 초상 ───────────────────────────────────────────────────────────────────────
// 초상을 메인에서 data URI 로 받아 원 안에 채운다 (src/main/portraits.ts). 받기 전·못 받으면 빈 원 그대로다.
// 창을 열 때 디스크에 있는 그림 전부를 먼저 받는다(loadArt). 그래서 상점·상세에 들어가자마자 그림이 모두 보인다.
// 디스크에 없는 그림만 칸을 그린 뒤 청한다. 도감은 1000 칸이 넘어 보이는 칸만 청한다(lazy).
// 보이는 칸은 그린 뒤와 스크롤할 때 위치를 재서 고른다 — IntersectionObserver 는 창이 가려져 있으면 반응하지 않았다.
// 받은 것은 창이 떠 있는 동안 기억한다

const portraitCache = new Map<string, string | null>();
const portraitWant = new Map<string, PortraitAsk>();
let portraitTimer: ReturnType<typeof setTimeout> | null = null;

function paintPortrait(host: HTMLElement, uri: string, cls = "art"): void {
  if (host.classList.contains("has-art")) return;
  for (const n of [...host.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove(); // "이로치" 같은 자리 글자는 그림이 대신한다
  const img = document.createElement("img");
  img.className = cls;
  img.alt = "";
  img.decoding = "sync"; // 칸과 그림이 한 프레임에 같이 보이게 한다
  img.src = uri;
  host.prepend(img);
  host.classList.add("has-art");
}

function askPortraits(): void {
  if (portraitTimer) return;
  portraitTimer = setTimeout(() => {
    portraitTimer = null;
    const asks = [...portraitWant.values()];
    portraitWant.clear();
    if (!asks.length) return;
    void window.pokebuddyManage.portraits(asks).then((got) => {
      for (const [key, uri] of Object.entries(got)) portraitCache.set(key, uri);
      for (const host of document.querySelectorAll<HTMLElement>("[data-portrait]")) {
        const uri = portraitCache.get(host.dataset.portrait ?? "");
        if (uri) paintPortrait(host, uri);
      }
    });
  }, 30);
}

function wantPortrait(key: string): void {
  if (portraitCache.has(key)) return;
  const [slug = "", shiny] = key.split(":");
  portraitWant.set(key, { slug, shiny: shiny === "shiny" });
  askPortraits();
}

// 화면에 들어온 lazy 칸을 청한다. 위아래로 한 화면씩 미리 받는다
let lazyTimer: ReturnType<typeof setTimeout> | null = null;
function askVisiblePortraits(): void {
  if (lazyTimer) return;
  lazyTimer = setTimeout(() => {
    lazyTimer = null;
    const view = window.innerHeight;
    for (const host of document.querySelectorAll<HTMLElement>("[data-portrait-lazy]")) {
      const r = host.getBoundingClientRect();
      if (r.bottom < -view || r.top > view * 2) continue;
      host.removeAttribute("data-portrait-lazy");
      wantPortrait(host.dataset.portrait ?? "");
    }
  }, 60);
}
document.addEventListener("scroll", askVisiblePortraits, true); // 스크롤은 거품이 없어 잡는 단계에서 받는다

// 초상 자리 하나 — cls 는 크기(portrait 80 · dot 26 등)를 정하는 기존 클래스다. lazy 면 보일 때 청한다
function portraitOf(slug: string, shiny: boolean, cls: string, text = "", lazy = false): HTMLElement {
  const host = el("div", cls, text);
  const key = shiny ? `${slug}:shiny` : slug;
  host.dataset.portrait = key;
  const uri = portraitCache.get(key);
  if (uri) paintPortrait(host, uri);
  else if (uri === undefined) {
    if (lazy) {
      host.dataset.portraitLazy = "";
      askVisiblePortraits();
    } else wantPortrait(key);
  }
  return host;
}

// 도구·알 그림 — PokeAPI 에 그림이 있는 것만 채운다(이상한사탕·진화의 돌·알). 없으면 Figma 처럼 빈 칸이다
const iconCache = new Map<string, string | null>();
const iconWant = new Set<string>();
let iconTimer: ReturnType<typeof setTimeout> | null = null;

function iconOf(key: string | null, cls: string): HTMLElement {
  const host = el("div", cls);
  if (!key) return host;
  host.dataset.icon = key;
  const uri = iconCache.get(key);
  if (uri) paintPortrait(host, uri, "icon-art");
  else if (uri === undefined) {
    iconWant.add(key);
    iconTimer ??= setTimeout(() => {
      iconTimer = null;
      const keys = [...iconWant];
      iconWant.clear();
      void window.pokebuddyManage.icons(keys).then((got) => {
        for (const [k, u] of Object.entries(got)) iconCache.set(k, u);
        for (const h of document.querySelectorAll<HTMLElement>("[data-icon]")) {
          const u = iconCache.get(h.dataset.icon ?? "");
          if (u) paintPortrait(h, u, "icon-art");
        }
      });
    }, 30);
  }
  return host;
}

// ── 파티 ───────────────────────────────────────────────────────────────────────

// 타입 배지 — Figma `Type Badge` `118:134`. 색은 manage.html 의 `.type[data-type]` 이 타입 키로 고른다
function typeBadge(name: string, id: string | undefined): HTMLElement {
  const badge = el("span", "type", name);
  if (id) badge.dataset.type = id;
  return badge;
}

function petCard(pet: PetView): HTMLElement {
  const card = button("slot");

  const portrait = portraitOf(pet.species, pet.shiny, "portrait", pet.shiny ? "이로치" : "");
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
  pet.types.forEach((name, i) => tags.appendChild(typeBadge(name, pet.typeIds[i])));
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
  card.appendChild(iconOf("egg", "shell"));
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

// ── 검색 ───────────────────────────────────────────────────────────────────────
// 한글은 조합 중인 글자가 있다. 조합 중에는 다시 그리지 않고, 조합이 끝나면 그린다

function searchBox(key: string, value: string, placeholder: string, onChange: (q: string) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "search";
  input.className = "search";
  input.id = `search-${key}`;
  input.placeholder = placeholder;
  input.value = value;
  input.setAttribute("aria-label", placeholder);
  // 다시 그리면 옛 칸이 빠지며 blur 가 먼저 온다(Chromium). 그래서 그린 뒤에 기억을 다시 넣고 되돌린다
  const apply = (): void => {
    const saved = { key, caret: input.selectionStart ?? input.value.length };
    onChange(input.value);
    searchFocus = saved;
    restoreSearchFocus();
  };
  input.addEventListener("input", (e) => {
    if (!(e as InputEvent).isComposing) apply();
  });
  input.addEventListener("compositionend", apply);
  // 사용자가 다른 곳을 누르면 포커스 기억을 지운다
  input.addEventListener("blur", () => {
    if (searchFocus?.key === key) searchFocus = null;
  });
  return input;
}

function restoreSearchFocus(): void {
  if (!searchFocus) return;
  const input = document.getElementById(`search-${searchFocus.key}`);
  if (!(input instanceof HTMLInputElement)) return;
  input.focus();
  input.setSelectionRange(searchFocus.caret, searchFocus.caret);
}

const normQuery = (q: string): string => q.trim().toLowerCase();

// 이름은 부분 일치, 숫자만 넣으면 도감 번호 앞자리 일치("025" 와 "25" 가 같다)
function matchesName(name: string, q: string): boolean {
  return name.toLowerCase().includes(q);
}
function matchesDex(row: DexEntry, q: string): boolean {
  if (/^\d+$/.test(q)) return String(row.dex).startsWith(String(Number(q)));
  // 미해금 종은 이름이 숨겨져 있다 — 이름으로 찾으면 무엇인지 드러나므로 번호로만 찾는다
  return row.state !== "locked" && matchesName(row.name, q);
}

function boxCell(pet: PetView, onPick: () => void): HTMLButtonElement {
  const cell = button("cell");
  cell.append(portraitOf(pet.species, pet.shiny, "dot"), el("div", "who", pet.name), el("div", "note", pet.shiny ? `Lv.${pet.level} · 이로치` : `Lv.${pet.level}`));
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
    boxMarked = null;
    draw();
  });
  const next = button("", "▶");
  next.disabled = boxPage >= v.boxes.length - 1;
  next.addEventListener("click", () => {
    boxPage += 1;
    boxMarked = null;
    draw();
  });
  pager.append(prev, el("span", "label", box.name), el("span", "used", `${box.used} / ${box.size}`), next);
  // 이름 검색 — 모든 박스를 대상으로 한다. 정렬은 기준이 미정이라 두지 않는다 (docs/specs/ui-components.md C-07)
  pager.appendChild(
    searchBox("box", boxQuery, "이름 검색", (q) => {
      boxQuery = q;
      draw();
    }),
  );
  bodyEl.appendChild(pager);

  const q = normQuery(boxQuery);
  if (q) {
    const found = v.boxes.flatMap((b, bi) => b.slots.filter((p): p is PetView => p != null && matchesName(p.name, q)).map((p) => ({ pet: p, bi, box: b.name })));
    if (!found.length) {
      bodyEl.appendChild(el("div", "empty-note", "검색 결과 없음"));
      return;
    }
    const results = el("div", "box-grid");
    for (const { pet, bi, box: boxName } of found) {
      // 결과를 누르면 그 개체가 있는 박스로 간다
      const cell = boxCell(pet, () => {
        boxQuery = "";
        searchFocus = null;
        boxPage = bi;
        boxMarked = pet.id;
        draw();
      });
      cell.appendChild(el("div", "note", boxName));
      cell.title = `${pet.name} · ${boxName}로 가기`;
      results.appendChild(cell);
    }
    bodyEl.appendChild(results);
    return;
  }

  const grid = el("div", "box-grid");
  for (const pet of box.slots) {
    if (!pet) {
      grid.appendChild(el("div", "cell blank"));
      continue;
    }
    const cell = boxCell(pet, () => openPet(pet.id));
    cell.setAttribute("aria-pressed", String(pet.id === boxMarked));
    cell.title = `${pet.name} · 눌러서 상세 보기`;
    grid.appendChild(cell);
  }
  bodyEl.appendChild(grid);
}

// ── 도감 ───────────────────────────────────────────────────────────────────────

function dexCell(row: DexEntry): HTMLElement {
  const cell = button(row.state === "locked" ? "dex-cell locked" : "dex-cell");
  cell.setAttribute("aria-pressed", String(row.slug === dexPick));
  cell.addEventListener("click", () => void pickDex(row.slug));
  // 미해금 종은 그림을 보이지 않는다 — 이름을 숨기는 것과 같다
  cell.append(el("div", "no", `#${String(row.dex).padStart(4, "0")}`), row.state === "locked" ? el("div", "dot") : portraitOf(row.slug, false, "dot", "", true));
  cell.appendChild(el("div", undefined, row.state === "locked" ? "???" : row.name));
  if (row.state === "obtained") cell.appendChild(el("div", "no", row.shiny ? "이로치 획득" : "획득"));
  if (row.condition) cell.title = `발견한 조건: ${row.condition}`;
  return cell;
}

// 도감 상세 패널 — 격자 아래에 둔다 (Figma Dex / Base 의 species-detail)
const DEX_STATE_WORD: Record<string, string> = { obtained: "획득", unlocked: "해금", locked: "미해금" };

function dexPanel(d: DexDetail): HTMLElement {
  const panel = el("div", "dex-detail");
  const headRow = el("div", "head");
  const meta = d.state === "locked"
    ? "미해금 · 이름과 진화는 해금하면 보여요"
    : `${DEX_STATE_WORD[d.state] ?? d.state} · 이로치 ${d.shiny ? "획득" : "미획득"} · 보유 ${d.owned}마리`;
  headRow.append(el("strong", undefined, `#${String(d.dex).padStart(4, "0")} ${d.name}`), el("span", "meta", d.genus ? `${d.genus} · ${meta}` : meta));
  panel.appendChild(headRow);
  // 공식 도감 설명 — 해금한 종만 온다
  if (d.flavor) panel.appendChild(el("p", "flavor", d.flavor));
  const rows: [string, string][] = [
    ["입수 방법", d.methods],
    ["진화", d.evolution],
    ["알 행동 조건", d.eggCondition],
    ["특수 기믹", d.gimmick],
  ];
  if (d.types.length) {
    const row = el("div", "row");
    const badges = el("span", "value types");
    d.types.forEach((name, i) => badges.appendChild(typeBadge(name, d.typeIds[i])));
    row.append(el("span", "key", "타입"), badges);
    panel.appendChild(row);
  }
  for (const [key, value] of rows) {
    const row = el("div", "row");
    row.append(el("span", "key", key), el("span", "value", value));
    panel.appendChild(row);
  }
  return panel;
}

// 칸을 누르면 그 종의 상세를 읽는다. 다시 누르면 닫는다
async function pickDex(slug: string): Promise<void> {
  if (dexPick === slug) {
    dexPick = null;
    dexDetail = null;
    draw();
    return;
  }
  dexPick = slug;
  dexDetail = await window.pokebuddyManage.dexDetail(slug);
  if (tab === "dex") draw();
}

function drawDex(v: Snapshot): void {
  bodyEl.appendChild(head("도감", `획득 ${v.dex.obtained} · 해금 ${v.dex.unlocked} · 이로치 ${v.dex.shiny}`));
  // 이름·번호 검색 — 등록 상태 칩과 함께 적용한다. 지방 셀렉트는 목록·매핑이 미정이라 두지 않는다
  const bar = el("div", "search-row");
  bar.appendChild(
    searchBox("dex", dexQuery, "이름 또는 번호 검색", (q) => {
      dexQuery = q;
      draw();
    }),
  );
  bodyEl.appendChild(bar);
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
  const q = normQuery(dexQuery);
  const rows = dexRows.filter((r) => (dexFilter === "all" || r.state === dexFilter) && (!q || matchesDex(r, q)));
  if (!rows.length) {
    bodyEl.appendChild(el("div", "empty-note", q ? "검색 결과 없음" : "해당하는 종이 없습니다."));
    return;
  }
  // 상세 패널은 고른 칸이 있는 줄 바로 아래에 격자 폭으로 끼운다. 목록이 길어도 눈앞에 열린다
  // 전부 그린다(2026-09-25 사용자 요청). 화면 밖 칸은 CSS content-visibility 로 그리기를 미루고, 초상은 보이는 칸만 받는다
  const shown = rows;
  const picked = dexDetail && dexDetail.slug === dexPick ? shown.findIndex((r) => r.slug === dexPick) : -1;
  const panelAfter = picked < 0 ? -1 : Math.min(Math.floor(picked / DEX_COLUMNS) * DEX_COLUMNS + DEX_COLUMNS - 1, shown.length - 1);
  const grid = el("div", "dex-grid");
  shown.forEach((row, i) => {
    grid.appendChild(dexCell(row));
    if (i === panelAfter && dexDetail) grid.appendChild(dexPanel(dexDetail));
  });
  bodyEl.appendChild(grid);
}

// ── 상점 ───────────────────────────────────────────────────────────────────────

// 상점 줄의 그림 — 포켓몬 상품은 초상, 랜덤알은 알, 도구는 도구 그림. 칸 늘리기처럼 그림이 없는 상품은 빈 칸
function shopThumb(item: ShopItemView): HTMLElement {
  if (item.category === "pokemon") return portraitOf(item.id, false, "thumb round");
  if (item.category === "egg") return iconOf(item.id === "ancient-stone" ? null : "egg", "thumb"); // 태고의돌은 PokeAPI 그림이 없다
  if (item.category === "slot") return iconOf(null, "thumb");
  return iconOf(`item:${item.id}`, "thumb");
}

function shopRow(item: ShopItemView): HTMLElement {
  const card = button("row-card");
  card.appendChild(shopThumb(item));
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
  card.appendChild(iconOf(`item:${item.id}`, "thumb"));
  const body = el("div", "body");
  const note = item.evolution ? "눌러서 진화할 포켓몬 고르기" : item.natures ? "눌러서 성격을 바꿀 포켓몬 고르기" : "눌러서 사용";
  body.append(el("div", "title", item.name), el("div", "note", note));
  card.append(body, el("div", "count", `×${item.count}`));
  const next: Dialog = item.evolution ? { kind: "evo-target", itemId: item.id } : item.natures ? { kind: "nature-target", itemId: item.id } : { kind: "use", itemId: item.id };
  card.addEventListener("click", () => open(next));
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
      detailPet = null;
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
  pointsEl.textContent = view.points.toLocaleString("ko-KR");
  achDotEl.hidden = view.achievements.unclaimed === 0;
  // 개체 상세 페이지 — 개체가 사라졌으면 탭으로 돌아간다
  const detail = detailPet ? petOf(detailPet) : null;
  if (detail) {
    drawPetPage(detail);
    restoreSearchFocus();
    return;
  }
  detailPet = null;
  if (tab === "party") drawParty(view);
  else if (tab === "box") drawBox(view);
  else if (tab === "dex") drawDex(view);
  else if (tab === "shop") drawShop(view);
  else drawBag(view);
  restoreSearchFocus();
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

// ── 개체 상세 페이지 ───────────────────────────────────────────────────────────
// Figma `08 · 개체 상세 시안` 의 시안 C(2단) `453:946` — 2026-09-25 사용자 선택. 모달이 아니라 탭 본문을 차지하는 페이지다.
// 왼쪽 기둥은 프로필(초상·이름·레벨·성격·타입·네 막대), 오른쪽은 돌봄·성장·표시·관리를 짧게 쌓는다.
// 박스 개체는 돌봄·표시가 없다(계약: 박스 상세에는 표시 항목을 두지 않는다). 진화·성격 모달은 이 페이지 위에 뜨고 돌아온다

function pageButton(label: string, primary: boolean, disabled: boolean, run: () => void): HTMLButtonElement {
  const b = button(primary ? "page-btn primary" : "page-btn", label);
  b.disabled = disabled;
  b.addEventListener("click", run);
  return b;
}

// 목록 카드의 한 줄 — 왼쪽에 이름과 설명, 오른쪽에 딸린 것. run 이 있으면 줄 전체를 누른다
function listRow(title: string, desc: string | null, right: HTMLElement[], run?: () => void): HTMLElement {
  const row = run ? button("list-row") : el("div", "list-row");
  const copy = el("div", "copy");
  copy.appendChild(el("div", "title", title));
  if (desc) copy.appendChild(el("div", "desc", desc));
  row.appendChild(copy);
  row.append(...right);
  if (run) {
    row.appendChild(el("span", "chev", "›"));
    row.addEventListener("click", run);
  }
  return row;
}

function listCard(...rows: HTMLElement[]): HTMLElement {
  const box = el("div", "list-card");
  box.append(...rows);
  return box;
}

// 켬·끔 스위치 — Figma `Toggle` `299:3593`
function switchButton(on: boolean, label: string, run: () => void): HTMLButtonElement {
  const b = button("switch");
  b.setAttribute("role", "switch");
  b.setAttribute("aria-checked", String(on));
  b.setAttribute("aria-label", label);
  b.addEventListener("click", run);
  return b;
}

// 크기 1~6 — 누를 때마다 한 번 저장한다. 고른 단계는 채운 단추다
function sizeButtons(pet: PetView): HTMLElement {
  const group = el("div", "sizes");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "크기");
  for (let n = 1; n <= 6; n++) {
    const b = button("size", String(n));
    b.setAttribute("aria-pressed", String(n === pet.size));
    b.addEventListener("click", () => {
      if (n !== pet.size) void send("pet.set", pet.id, { size: n });
    });
    group.appendChild(b);
  }
  return group;
}

const boxNameOf = (id: string): string | null => view?.boxes.find((b) => b.slots.some((p) => p?.id === id))?.name ?? null;

function drawPetPage(pet: PetView): void {
  const slot = slotOfPet(pet.id);
  const inParty = slot != null;
  const where = inParty ? `파티 ${slot + 1}번` : (boxNameOf(pet.id) ?? "박스");
  const page = el("div", "pet-page");

  // 돌아가기 줄 — 왼쪽 링크, 오른쪽 자리와 상태
  const back = el("div", "back-row");
  const link = button("back-link", inParty ? "‹  파티로" : "‹  박스로");
  link.addEventListener("click", () => {
    detailPet = null;
    draw();
  });
  back.append(link, el("span", "where", inParty ? `${where} · ${pet.hidden ? "숨긴 상태" : "표시 중"}` : `${where} · 보관 중`));
  page.appendChild(back);

  const cols = el("div", "pet-cols");

  // 왼쪽 기둥 — 초상, 이름, 레벨·성격, 타입, 네 막대
  const side = el("div", "pet-side");
  const portrait = portraitOf(pet.species, pet.shiny, "portrait big", pet.shiny ? "이로치" : "");
  if (inParty && pet.hidden) {
    const mark = el("span", "mark");
    mark.title = "숨긴 상태";
    portrait.appendChild(mark);
  }
  side.appendChild(portrait);
  side.appendChild(el("div", "name", pet.name));
  side.appendChild(el("div", "sub", `Lv.${pet.level} · ${pet.nature}`));
  const badges = el("div", "badges");
  pet.types.forEach((name, i) => badges.appendChild(typeBadge(name, pet.typeIds[i])));
  side.appendChild(badges);
  const bars = el("div", "bars");
  const bar = (label: string, value: number, shown: string, cls = ""): HTMLElement => {
    const box = el("div", "bar");
    const head = el("div", "head");
    head.append(el("span", undefined, label), el("strong", undefined, shown));
    const track = el("div", "track");
    const fill = el("div", cls ? `fill ${cls}` : "fill");
    fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
    track.appendChild(fill);
    box.append(head, track);
    return box;
  };
  bars.append(
    bar("경험치", pet.percentToNext, `${pet.percentToNext}%`),
    bar("친밀도", pet.affinity, `${pet.affinity}`),
    bar("만복도", pet.fullness, `${pet.fullness} · ${ZONE_WORD[pet.zone] ?? pet.zone}`, pet.zone === "hungry" || pet.zone === "starving" ? pet.zone : ""),
    bar("기분", pet.mood, `${pet.mood} · ${pet.moodWord}`, "mood"),
  );
  side.appendChild(bars);
  if (inParty && pet.longPlay) side.appendChild(el("span", "chip-note", "오래 놀아주기"));
  cols.appendChild(side);

  // 오른쪽 — 돌봄, 성장, 표시, 관리
  const main = el("div", "pet-main");
  const label = (s: string): HTMLElement => el("div", "section-label", s);
  if (inParty) {
    main.appendChild(label("돌봄"));
    const care = el("div", "care-row");
    const full = pet.fullness >= 100;
    care.append(
      pageButton(full ? "밥 주기 · 배부름" : pet.feedReady ? "밥 주기" : `밥 주기 · ${pet.feedInSec}초`, true, !pet.feedReady || full, () => void send("feed", pet.id)),
      pageButton(pet.playReady ? "놀아주기" : "놀아주기 · 쉬는 중", false, !pet.playReady, () => void send("play", pet.id)),
    );
    main.appendChild(care);
  }

  main.appendChild(label("성장"));
  const ready = pet.evolutions.filter((e) => e.ready);
  const evolve = (): void => open({ kind: "evolve", petId: pet.id });
  const evoRow = !pet.evolutions.length
    ? listRow("진화", "더 진화하지 않아요", [])
    : ready.length
      ? listRow(`진화 · ${ready.map((e) => e.name).join(" · ")}`, "조건을 채웠어요. 한 단계씩 직접 진화해요", [el("span", "chip-ready", "진화 가능")], evolve)
      : listRow(`진화 · ${pet.evolutions.map((e) => e.name).join(" · ")}`, pet.evolutions.map((e) => e.need ?? "").filter(Boolean).join(" · ") || "조건을 채우면 진화해요", [], evolve);
  main.appendChild(listCard(evoRow, listRow(`성격 · ${pet.nature}`, "민트로 바꿀 수 있어요", [], () => open({ kind: "nature", petId: pet.id }))));

  if (inParty) {
    main.appendChild(label("표시"));
    main.appendChild(
      listCard(
        listRow("화면 표시", pet.hidden ? "숨겨 둔 상태예요" : null, [switchButton(!pet.hidden, "화면 표시", () => void send(pet.hidden ? "party.show" : "party.hide", pet.id))]),
        listRow("크기", null, [sizeButtons(pet)]),
      ),
    );
  }

  const manage = el("div", "manage-row");
  if (inParty) {
    manage.append(pageButton("교체", false, false, () => open({ kind: "pick-box", slotIndex: slot })), pageButton("박스에 보관", false, false, () => void send("party.keep", pet.id)));
  } else {
    const free = emptySlot();
    manage.appendChild(
      free != null
        ? pageButton("파티에 배치", true, false, () => void send("party.place", pet.id, { slotIndex: free }))
        : pageButton("교체", true, false, () => open({ kind: "pick-slot", petId: pet.id })),
    );
  }
  main.appendChild(manage);
  if (notice) main.appendChild(el("div", "notice bad", notice));
  cols.appendChild(main);
  page.appendChild(cols);
  bodyEl.appendChild(page);
}

// ── 모달 · 진화 확인 ───────────────────────────────────────────────────────────
// 후보마다 결과 종과 상태를 보인다. 가능한 후보가 하나면 그것을 고른 채로 연다.
// `취소` 는 아무것도 바꾸지 않는다 (docs/specs/s5.md "진화 확인 화면에서 취소한 개체는 진화 가능 상태를 유지한다")

function drawEvolve(petId: string, to?: string, itemId?: string): void {
  const pet = petOf(petId);
  if (!pet) {
    close();
    return;
  }
  // 가방의 돌로 왔으면 그 돌이 조건인 후보만 보인다
  const list = itemId ? pet.evolutions.filter((c) => c.item === itemId) : pet.evolutions;
  const ready = list.filter((c) => c.ready);
  const picked = list.find((c) => c.to === to && c.ready) ?? (ready.length === 1 ? ready[0] : undefined);
  const back: { label: string; to: Dialog } = itemId ? { label: "대상", to: { kind: "evo-target", itemId } } : { label: pet.name, to: { kind: "pet", petId } };
  dialogEl.append(...dialogHead("진화", ready.length > 1 ? "진화할 모습을 고르세요." : `${pet.name} · Lv.${pet.level}`, back));

  const rows = el("div", "rows");
  for (const c of list) {
    const row = button("row-card");
    const body = el("div", "body");
    body.append(el("div", "title", c.name), el("div", "note", c.ready ? "진화할 수 있어요" : (c.need ?? "조건이 모자라요")));
    row.appendChild(body);
    row.disabled = !c.ready;
    row.setAttribute("aria-pressed", String(picked?.to === c.to));
    row.addEventListener("click", () => open({ kind: "evolve", petId, to: c.to, ...(itemId ? { itemId } : {}) }));
    rows.appendChild(row);
  }
  dialogEl.appendChild(rows);

  if (picked) {
    const info = el("div", "info-box");
    info.appendChild(el("div", undefined, `${pet.name} → ${picked.name}`));
    const item = picked.item ? view?.bag.find((b) => b.id === picked.item) : undefined;
    info.appendChild(el("div", "note", item ? `${item.name} 1개를 씁니다. 레벨·친밀도·성격은 그대로입니다.` : "레벨·친밀도·성격은 그대로입니다."));
    dialogEl.appendChild(info);
  }

  const go = actionButton("진화", true, !picked, () => {
    if (!picked) return;
    void send("evolve", pet.id, { to: picked.to }).then((ok) => {
      if (ok) open({ kind: "pet", petId });
    });
  });
  dialogEl.appendChild(actions(go, actionButton("취소", false, false, () => open(back.to))));
}

// 가방의 진화용 도구 — 그 도구로 지금 진화할 수 있는 개체를 고른다. 박스 개체에게도 쓸 수 있다
function drawEvoTarget(itemId: string): void {
  const item = view?.bag.find((b) => b.id === itemId);
  const pets = [...partyPets(), ...boxPets()].filter((p) => p.evolutions.some((c) => c.item === itemId && c.ready));
  dialogEl.append(...dialogHead(item ? item.name : itemId, pets.length ? "누구를 진화시킬까요?" : "이 도구로 지금 진화할 수 있는 포켓몬이 없어요."));
  const acts = pets.map((p) => actionButton(`${p.name} (Lv.${p.level})`, false, false, () => open({ kind: "evolve", petId: p.id, itemId })));
  dialogEl.appendChild(actions(...acts, closeButton()));
}

// ── 모달 · 성격 변경 ───────────────────────────────────────────────────────────
// 왼쪽은 지금, 오른쪽은 바꾼 후다. 오른쪽에서 성격을 고르면 필요한 민트가 가운데에 보인다 (Figma Detail / Nature Change).
// 보정 없는 성격은 모두 성실민트다. 가방의 민트로 왔으면 그 민트가 바꿀 수 있는 성격만 고른다.
// `취소` 는 아무것도 바꾸지 않는다

function drawNature(petId: string, pick: string | undefined, itemId: string | undefined, listOpen: boolean): void {
  const pet = petOf(petId);
  if (!pet || !view) {
    close();
    return;
  }
  const item = itemId ? view.bag.find((b) => b.id === itemId) : undefined;
  const options = view.natures.filter((n) => !item?.natures || item.natures.includes(n.id));
  // 민트 하나로 성격이 정해지면 고른 채로 연다
  const only = options.length === 1 ? options[0] : undefined;
  const chosen = pick ?? (only && only.id !== pet.natureId ? only.id : undefined);
  const picked = options.find((n) => n.id === chosen && n.id !== pet.natureId);
  const back: { label: string; to: Dialog } = itemId ? { label: "대상", to: { kind: "nature-target", itemId } } : { label: pet.name, to: { kind: "pet", petId } };
  const slot = slotOfPet(petId);
  dialogEl.append(...dialogHead("성격을 바꿀까요?", `${pet.name} Lv.${pet.level} · ${slot != null ? `파티 ${slot + 1}번` : "박스"}`, back));
  const redraw = (next: { pick?: string; listOpen?: boolean }): void => open({ kind: "nature", petId, ...(itemId ? { itemId } : {}), ...(chosen ? { pick: chosen } : {}), listOpen: false, ...next });

  const before = el("div", "nat-card");
  before.append(portraitOf(pet.species, pet.shiny, "portrait"), el("div", "name", pet.name), el("div", "note", pet.nature), el("div", "note", "지금"));

  const mid = el("div", "mint-mid");
  mid.append(el("div", undefined, picked ? picked.mintName : "민트"), el("div", undefined, "→"));

  const select = el("div", "select");
  const trigger = button("select-btn");
  trigger.append(el("span", undefined, picked ? picked.name : "성격 고르기"), el("span", "chev", listOpen ? "▴" : "▾"));
  trigger.setAttribute("aria-expanded", String(listOpen));
  trigger.addEventListener("click", () => redraw({ listOpen: !listOpen }));
  select.appendChild(trigger);
  if (listOpen) {
    const list = el("div", "select-list");
    for (const n of options) {
      const opt = button("select-opt");
      const current = n.id === pet.natureId;
      opt.append(el("span", undefined, n.name), el("span", "hint", current ? "지금" : n.mintName));
      opt.disabled = current;
      opt.setAttribute("aria-pressed", String(n.id === picked?.id));
      opt.addEventListener("click", () => redraw({ pick: n.id }));
      list.appendChild(opt);
    }
    select.appendChild(list);
  }
  const after = el("div", "nat-card");
  after.append(portraitOf(pet.species, pet.shiny, "portrait"), el("div", "name", pet.name), select, el("div", "note", "바꾼 후"));

  const row = el("div", "compare");
  row.append(before, mid, after);
  dialogEl.appendChild(row);

  const have = picked ? (view.bag.find((b) => b.id === picked.mint)?.count ?? 0) : 0;
  if (picked) {
    const info = el("div", "info-box");
    if (have > 0) info.append(el("div", undefined, `${picked.mintName} 1개를 씁니다`), el("div", "note", `가방에 ${have}개 있어요 · 성격만 바뀌고 레벨·친밀도는 그대로`));
    else {
      const price = view.shop.find((p) => p.id === picked.mint)?.price;
      info.append(el("div", undefined, `${picked.mintName}가 없어요`), el("div", "note", price != null ? `상점 도구 분류에서 ${price}P 에 살 수 있어요` : "상점에서 살 수 있어요"));
    }
    dialogEl.appendChild(info);
  }

  const change = actionButton("바꾸기", true, !picked || have === 0, () => {
    if (!picked) return;
    void send("bag.use", picked.mint, { petId, nature: picked.id }).then((ok) => {
      if (ok) open({ kind: "pet", petId });
    });
  });
  dialogEl.appendChild(actions(change, actionButton("취소", false, false, () => open(back.to))));
}

// 가방의 민트 — 성격을 바꿀 개체를 고른다. 파티와 박스 개체 모두 대상이다. 이미 그 성격이면 고를 수 없다
function drawNatureTarget(itemId: string): void {
  const item = view?.bag.find((b) => b.id === itemId);
  const allowed = item?.natures ?? [];
  const pets = [...partyPets(), ...boxPets()];
  dialogEl.append(...dialogHead(item ? item.name : itemId, pets.length ? "누구의 성격을 바꿀까요?" : "성격을 바꿀 포켓몬이 없어요."));
  const acts = pets.map((p) => {
    const same = allowed.length === 1 && allowed[0] === p.natureId;
    return actionButton(`${p.name} (${p.nature})`, false, same, () => open({ kind: "nature", petId: p.id, itemId }));
  });
  dialogEl.appendChild(actions(...acts, closeButton()));
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
  const all = boxPets();
  const q = normQuery(pickQuery);
  const pets = q ? all.filter((p) => matchesName(p.name, q)) : all;
  const filled = view?.party.slots[slotIndex]?.state === "pokemon";
  dialogEl.append(...dialogHead("박스에서 고르기", filled ? `${slotIndex + 1}번 칸의 개체와 맞바꿉니다.` : `${slotIndex + 1}번 칸에 넣습니다.`));
  // 박스 탭과 같은 검색 줄 (docs/work/s5-design-system-v2/plan.md "원작식 박스 구조와 검색")
  if (all.length) {
    const bar = el("div", "search-row");
    bar.appendChild(
      searchBox("pick", pickQuery, "이름 검색", (value) => {
        pickQuery = value;
        drawDialog();
      }),
    );
    dialogEl.appendChild(bar);
  }
  if (all.length && !pets.length) {
    dialogEl.appendChild(el("div", "empty-note", "검색 결과 없음"));
    dialogEl.appendChild(actions(closeButton()));
    return;
  }
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
    cell.append(slot.pet ? portraitOf(slot.pet.species, slot.pet.shiny, "dot") : el("div", "dot"), el("div", "who", slot.pet ? slot.pet.name : "빈 칸"), el("div", "note", `${slot.index + 1}번`));
    cell.addEventListener("click", () => void send(slot.pet ? "party.swap" : "party.place", petId, { slotIndex: slot.index }));
    grid.appendChild(cell);
  }
  dialogEl.appendChild(grid);
  dialogEl.appendChild(actions(closeButton()));
}

// ── 모달 · 업적창 ──────────────────────────────────────────────────────────────

function achievementRow(a: AchievementView): HTMLElement {
  const row = el("div", `achievement ${a.state}`);
  row.dataset.id = a.id; // 알림 배너의 `바로가기` 가 이 줄로 옮겨 온다
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

  // 포켓몬 표시·클릭 통과 — 이 앱의 창 상태다. 앱이 값을 줄 때만 둔다 (docs/specs/s5.md 설정 계약의 첫 두 항목)
  if (view.display) {
    const d = view.display;
    scroll.appendChild(settingRow("포켓몬 표시", "끄면 포켓몬을 잠시 숨깁니다. 트레이에서도 바꿀 수 있습니다.", toggle(!d.hidden, ["켬", "끔"], (on) => set("hidden", !on))));
    scroll.appendChild(settingRow("클릭 통과", "켜면 포켓몬을 눌러도 뒤의 창이 눌립니다.", toggle(d.clickThrough, ["켬", "끔"], (on) => set("clickThrough", on))));
  }

  scroll.appendChild(
    settingRow(
      "놀이공간",
      s.playArea === "region" ? (s.hasRegion ? "그려 둔 영역 안에서만 돌아다닙니다." : "영역을 아직 그리지 않았습니다.") : "화면 전체를 씁니다.",
      toggle(s.playArea === "full", ["화면 전체", "영역 지정"], (full) => set("playArea", full ? "full" : "region")),
    ),
  );
  // 영역 지정일 때만 그리기 단추를 둔다. 그린 뒤에는 `다시 그리기` (docs/specs/s5.md 설정 계약)
  if (s.playArea === "region") {
    const draw = actionButton(s.hasRegion ? "다시 그리기" : "영역 그리기", !s.hasRegion, false, () => void regionDraw());
    scroll.appendChild(settingRow("영역", "동반자가 돌아다닐 영역을 그립니다.", draw));
  }

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
  evolve: "dialog",
  "evo-target": "dialog",
  nature: "dialog",
  "nature-target": "dialog",
  buy: "dialog",
  "pick-box": "dialog wide",
  "pick-slot": "dialog wide",
  achievements: "dialog tall",
  settings: "dialog tall",
  guide: "dialog tall",
};

// 가림막 — 켜고 끌 때 메인에도 알린다. OS 가 그리는 창 단추 자리는 CSS 가 덮지 못한다
let dimmed = false;
function setScrim(on: boolean): void {
  scrimEl.classList.toggle("open", on);
  if (on === dimmed) return;
  dimmed = on;
  window.pokebuddyManage.dim(on);
}

function drawDialog(): void {
  if (!dialog) {
    setScrim(false);
    return;
  }
  setScrim(true);
  dialogEl.className = SHAPE[dialog.kind];
  dialogEl.replaceChildren();

  if (dialog.kind === "use") drawUse(dialog.itemId);
  else if (dialog.kind === "evolve") drawEvolve(dialog.petId, dialog.to, dialog.itemId);
  else if (dialog.kind === "evo-target") drawEvoTarget(dialog.itemId);
  else if (dialog.kind === "nature") drawNature(dialog.petId, dialog.pick, dialog.itemId, dialog.listOpen === true);
  else if (dialog.kind === "nature-target") drawNatureTarget(dialog.itemId);
  else if (dialog.kind === "buy") drawBuy(dialog.productId, dialog.qty);
  else if (dialog.kind === "pick-box") drawPickBox(dialog.slotIndex);
  else if (dialog.kind === "pick-slot") drawPickSlot(dialog.petId);
  else if (dialog.kind === "achievements") drawAchievements();
  else if (dialog.kind === "settings") drawSettings(dialog.tab);
  else drawGuide();

  if (notice) dialogEl.appendChild(el("div", "notice bad", notice));
  restoreSearchFocus();
}

// 다른 모달로 갈 때는 지난 실패 문구를 지운다. 구매 창의 부족 안내처럼 그 화면이 다시 만드는 것은 남는다
function open(next: Dialog): void {
  // 개체 상세는 모달이 아니라 페이지다 — 모달을 닫고 그 개체가 있는 탭에서 상세를 그린다
  if (next.kind === "pet") {
    dialog = null;
    notice = "";
    setScrim(false);
    detailPet = next.petId;
    tab = slotOfPet(next.petId) != null ? "party" : "box";
    draw();
    bodyEl.scrollTop = 0;
    return;
  }
  dialog = next;
  notice = "";
  drawDialog();
}

function close(): void {
  dialog = null;
  notice = "";
  setScrim(false);
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
  "sold-out": "이 알에서 나올 포켓몬을 모두 모았어요.",
  "max-slots": "더 열 수 있는 칸이 없어요.",
  "no-locked-slot": "더 열 수 있는 칸이 없어요.",
  "not-unlocked": "아직 해금하지 않은 종이에요.",
  "not-ready": "아직 준비되지 않았어요.",
  "no-candidate": "지금은 진화할 수 없어요.",
  "need-choice": "진화할 모습을 골라 주세요.",
  "bad-choice": "고른 모습으로는 지금 진화할 수 없어요.",
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

// 영역 그리기 창을 연다. 적용하면 메인이 저장한다. 취소는 아무것도 바꾸지 않으므로 알리지 않는다
async function regionDraw(): Promise<void> {
  if (busy) return;
  busy = true;
  let reply: ManageReply;
  try {
    reply = await window.pokebuddyManage.drawRegion();
    await refresh();
  } finally {
    busy = false;
  }
  notice = reply.ok || reply.reason === "cancelled" ? "" : REASON[reply.reason] ?? reply.reason;
  drawDialog();
}

async function agent(name: string, action: "connect" | "disconnect" | "check"): Promise<void> {
  const reply = await window.pokebuddyManage.agents({ name, action });
  agentRows = reply.list;
  notice = reply.ok ? "" : (REASON[reply.reason] ?? reply.reason);
  drawDialog();
}

async function loadDex(): Promise<void> {
  dexRows = await window.pokebuddyManage.dex();
  if (dexPick) dexDetail = await window.pokebuddyManage.dexDetail(dexPick);
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

// 알림 배너의 `바로가기` — 부화는 돌보미집, 진화는 개체 상세, 업적은 업적 창의 그 줄 (docs/specs/s5.md "알림 배너의 개별 표시")
function goTo(route: ManageRoute): void {
  if (route.to === "daycare") {
    close();
    tab = "box";
    draw();
    bodyEl.querySelector(".daycare")?.scrollIntoView({ block: "start" });
  } else if (route.to === "pet") {
    if (petOf(route.petId)) openPet(route.petId);
  } else {
    open({ kind: "achievements" });
    dialogEl.querySelector(`.achievement[data-id="${CSS.escape(route.id)}"]`)?.scrollIntoView({ block: "nearest" });
  }
}

// 디스크에 있는 그림을 전부 받아 캐시에 채운다. 받은 그림은 미리 디코딩해 둔다 —
// 같은 주소의 그림은 문서가 이미 가진 그림이 되어, 칸을 그리는 순간 바로 보인다
const warmed: HTMLImageElement[] = [];
async function loadArt(): Promise<void> {
  let got: Record<string, string> = {};
  try {
    got = await window.pokebuddyManage.art();
  } catch {
    return; // 그림 없이도 창은 돈다 — 칸을 그린 뒤 하나씩 청하는 길이 남아 있다
  }
  for (const [key, uri] of Object.entries(got)) (key === "egg" || key.startsWith("item:") ? iconCache : portraitCache).set(key, uri);
  for (const uri of new Set(Object.values(got))) {
    const img = new Image();
    img.src = uri;
    warmed.push(img);
    void img.decode().catch(() => undefined);
  }
}

// 첫 화면을 그린 뒤에 옮긴다 — 창을 새로 열면서 온 목적지는 스냅샷보다 먼저 올 수 있다
const firstDraw = loadArt().then(refresh);
window.pokebuddyManage.onRoute((route) => void firstDraw.then(() => refresh()).then(() => goTo(route)));
// 시간이 흐르면 만복도·쿨타임·알 준비가 바뀐다. 창이 떠 있는 동안 주기적으로 다시 읽는다
setInterval(() => void refresh().then(drawDialog), 5000);
