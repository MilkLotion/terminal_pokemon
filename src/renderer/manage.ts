// 관리 창 — 스냅샷을 받아 그리고, 조작은 명령으로 보낸다. 게임 규칙은 하나도 여기 두지 않는다.
//
// 값은 메인이 이미 화면이 읽을 모양으로 바꿔서 준다 (src/tx/snapshot.ts). 여기서는 배치와 글자만 만든다.
// 명령을 보내면 새 스냅샷을 다시 받아 그린다. 화면이 스스로 상태를 들고 있지 않는다.
// 지금은 파티 탭만 그린다. 나머지 탭은 자리만 둔다.
import type { ManageReply, PetView, SlotView, Snapshot } from "../shared/manage.js";

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

let tab: TabId = "party";
let view: Snapshot | null = null;
let openPetId: string | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

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

function petCard(slot: SlotView, pet: PetView): HTMLElement {
  const card = el("button", "slot");
  card.type = "button";

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
  card.addEventListener("click", () => openDetail(pet.id));
  card.title = `${pet.name} · ${ZONE_WORD[pet.zone] ?? pet.zone}${slot.index === 0 ? "" : ""}`;
  return card;
}

function blankCard(slot: SlotView): HTMLElement {
  const card = el("button", "slot blank");
  card.type = "button";
  if (slot.state === "locked") {
    card.classList.add("locked");
    card.disabled = true;
    card.append(el("strong", undefined, "잠긴 칸"), el("small", undefined, slot.unlockBy === "achievement" ? "업적 보상으로 열기" : "상점에서 구매"));
    return card;
  }
  card.append(el("strong", undefined, "빈 칸"), el("small", undefined, "박스에서 배치"));
  return card;
}

function drawParty(v: Snapshot): void {
  const head = el("div", "head");
  head.appendChild(el("h1", undefined, "파티"));
  head.appendChild(el("div", "sub", `${v.party.shown}마리 표시 중 · ${v.party.usable} / ${v.party.slots.length}칸 사용 가능`));
  bodyEl.appendChild(head);

  const grid = el("div", "grid");
  for (const slot of v.party.slots) grid.appendChild(slot.pet ? petCard(slot, slot.pet) : blankCard(slot));
  bodyEl.appendChild(grid);
}

function drawTabs(): void {
  tabsEl.replaceChildren();
  for (const t of TABS) {
    const b = el("button", undefined, t.label);
    b.type = "button";
    b.setAttribute("aria-selected", String(t.id === tab));
    b.addEventListener("click", () => {
      tab = t.id;
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
  if (tab === "party") {
    drawParty(view);
    return;
  }
  bodyEl.appendChild(el("div", "empty-note", "이 탭은 아직 만들지 않았습니다."));
}

// ── 개체 상세 ──────────────────────────────────────────────────────────────────

const petOf = (id: string): PetView | null => view?.party.slots.find((s) => s.pet?.id === id)?.pet ?? null;

function actionButton(label: string, primary: boolean, disabled: boolean, run: () => Promise<void>): HTMLButtonElement {
  const b = el("button", primary ? "act primary" : "act", label);
  b.type = "button";
  b.disabled = disabled;
  b.addEventListener("click", () => void run());
  return b;
}

function drawDetail(): void {
  const pet = openPetId ? petOf(openPetId) : null;
  if (!pet) {
    scrimEl.classList.remove("open");
    openPetId = null;
    return;
  }
  scrimEl.classList.add("open");
  dName.textContent = pet.name;
  dSub.textContent = `Lv.${pet.level} · ${pet.nature} · ${ZONE_WORD[pet.zone] ?? pet.zone}${pet.hidden ? " · 숨긴 상태" : ""}`;

  dMeters.replaceChildren(meter("친밀도", pet.affinity), meter("만복도", pet.fullness, pet.zone));

  dActions.replaceChildren(
    actionButton(pet.hidden ? "꺼내기" : "숨기기", true, false, () => send(pet.hidden ? "party.show" : "party.hide", pet.id)),
    actionButton(pet.feedReady ? "밥 주기" : `밥 주기 (${pet.feedInSec}초)`, false, !pet.feedReady || pet.fullness >= 100, () => send("feed", pet.id)),
    actionButton(pet.playReady ? "놀아주기" : "놀아주기 (쿨타임)", false, !pet.playReady, () => send("play", pet.id)),
    actionButton("박스에 보관", false, false, () => send("party.keep", pet.id)),
    actionButton("닫기", false, false, async () => {
      openPetId = null;
      scrimEl.classList.remove("open");
    }),
  );
}

function openDetail(id: string): void {
  openPetId = id;
  dNotice.className = "notice";
  dNotice.textContent = "";
  drawDetail();
}

// 실패 이유 → 화면 문구. 모르는 이유는 그대로 보여 무엇이 빠졌는지 드러나게 한다
const REASON: Record<string, string> = {
  cooldown: "아직 쉬는 시간이에요.",
  full: "이미 배가 불러요.",
  already: "이미 그 상태예요.",
  "no-slot": "그 칸이 없어요.",
  "not-in-party": "파티에 없어요.",
  "save-failed": "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

// 조작 하나마다 새 요청이다. 같은 순간의 두 클릭이 하나로 합쳐지지 않게 보내는 쪽이 식별자를 만든다.
// 같은 값으로 다시 보내면 실행기가 한 번만 반영한다 (docs/specs/modules.md "거래 실행기")
let seq = 0;
const nextReqId = (cmd: string, target: string): string => `ui:${Date.now()}:${++seq}:${cmd}:${target}`;

async function send(cmd: string, target: string): Promise<void> {
  const reply: ManageReply = await window.pokebuddyManage.command({ cmd, target, args: { reqId: nextReqId(cmd, target) } });
  await refresh();
  if (reply.ok) {
    dNotice.className = "notice";
    dNotice.textContent = "";
    // 보관하면 파티에서 사라지므로 창을 닫는다
    if (cmd === "party.keep") {
      openPetId = null;
      scrimEl.classList.remove("open");
      return;
    }
  } else {
    dNotice.className = "notice bad";
    dNotice.textContent = REASON[reply.reason] ?? reply.reason;
  }
  drawDetail();
}

async function refresh(): Promise<void> {
  view = await window.pokebuddyManage.snapshot();
  draw();
}

scrimEl.addEventListener("click", (e) => {
  if (e.target !== scrimEl) return;
  openPetId = null;
  scrimEl.classList.remove("open");
});

void refresh();
// 시간이 흐르면 만복도와 쿨타임이 바뀐다. 창이 떠 있는 동안 주기적으로 다시 읽는다
setInterval(() => void refresh().then(() => drawDetail()), 5000);
