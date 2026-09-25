// 첫 실행 — 첫 포켓몬 선택 창. 목록·문구는 메인이 언어에 맞춰 준다 (picker:list).
// 고르고 `함께하기` 를 누르면 슬러그를 메인에 보낸다 (picker:start). 창을 그냥 닫으면 메인이 시작하지 않는다.
// 카드를 두 번 누르면 바로 시작한다
import type { PickerItem, PickerPayload } from "../shared/stage.js";

// 문서 요소 — 없으면 창을 쓸 수 없으니 바로 던진다
function need<T extends HTMLElement>(id: string, ctor: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof ctor)) throw new Error(`picker.html 에 #${id} 가 없다`);
  return el;
}
const list = need("list", HTMLElement);
const title = need("title", HTMLElement);
const subtitle = need("subtitle", HTMLElement);
const start = need("start", HTMLButtonElement);
const chosenName = need("chosen-name", HTMLElement);
const chosenNote = need("chosen-note", HTMLElement);

let picked: string | null = null;

function pick(item: PickerItem, card: HTMLElement) {
  picked = item.slug;
  for (const c of list.querySelectorAll(".card[aria-pressed='true']")) c.setAttribute("aria-pressed", "false");
  card.setAttribute("aria-pressed", "true");
  chosenName.hidden = false;
  chosenName.textContent = item.name;
  chosenNote.textContent = item.evolution;
  chosenNote.title = item.evolution;
  start.disabled = false;
}

function card(item: PickerItem): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card";
  b.setAttribute("aria-pressed", "false");
  b.dataset.slug = item.slug; // 화면에는 보이지 않는다. E2E 가 종을 찾을 때 쓴다
  const portrait = document.createElement("div");
  portrait.className = "portrait";
  portrait.setAttribute("aria-hidden", "true");
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.name;
  b.append(portrait, name);
  b.addEventListener("click", () => pick(item, b));
  b.addEventListener("dblclick", () => {
    pick(item, b);
    window.pokebuddy.pickerStart(item.slug);
  });
  return b;
}

function render(payload: PickerPayload) {
  title.textContent = payload.title;
  subtitle.textContent = payload.subtitle;
  document.title = payload.title;
  start.textContent = payload.start;
  chosenNote.textContent = payload.empty;
  list.setAttribute("aria-label", payload.title);
  list.replaceChildren(...payload.items.map(card));
}

void window.pokebuddy.pickerList().then(render);

start.addEventListener("click", () => {
  if (picked) window.pokebuddy.pickerStart(picked);
});
