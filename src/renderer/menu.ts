// 앱이 그리는 메뉴 — 메인이 준 항목을 그리고 고른 항목의 번호를 돌려준다 (src/main/menu-window.ts).
// 방향키로 가리키고 Enter 로 고른다. Esc 는 닫기만 한다. 가리킨 항목은 옅은 배경이다 (Figma `Menu Item` Hover)
import type { MenuView } from "../shared/manage.js";

const menu = document.getElementById("menu");
if (!(menu instanceof HTMLElement)) throw new Error("menu.html 에 #menu 가 없다");
const api = window.pokebuddyMenu;

let buttons: HTMLButtonElement[] = [];
let at = -1; // 가리킨 항목 (buttons 안의 번호)

function point(i: number): void {
  at = i;
  buttons.forEach((b, n) => b.classList.toggle("on", n === i));
}

// 누를 수 있는 다음 항목 — 끝에서는 반대쪽으로 돈다
function step(dir: 1 | -1): void {
  if (!buttons.some((b) => !b.disabled)) return;
  let i = at;
  do i = (i + dir + buttons.length) % buttons.length;
  while (buttons[i]?.disabled);
  point(i);
}

api.onShow((items: MenuView[]) => {
  menu.replaceChildren();
  buttons = [];
  for (const item of items) {
    if (item.kind === "status") {
      const box = document.createElement("div");
      box.className = "status";
      const title = document.createElement("div");
      title.className = "title";
      title.textContent = item.title;
      box.appendChild(title);
      if (item.caption) {
        const caption = document.createElement("div");
        caption.className = "caption";
        caption.textContent = item.caption;
        box.appendChild(caption);
      }
      menu.appendChild(box);
      continue;
    }
    if (item.kind === "separator") {
      const sep = document.createElement("div");
      sep.className = "separator";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "item";
    b.setAttribute("role", "menuitem");
    b.disabled = item.disabled;
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = item.label;
    b.appendChild(label);
    if (item.hint) {
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = item.hint;
      b.appendChild(hint);
    }
    const index = buttons.length;
    b.addEventListener("mouseenter", () => {
      if (!b.disabled) point(index);
    });
    b.addEventListener("click", () => api.pick(item.id));
    buttons.push(b);
    menu.appendChild(b);
  }
  menu.focus();
  const box = document.body.getBoundingClientRect();
  api.size(box.width - 16, box.height - 16); // 그림자 자리(양쪽 8)를 뺀 메뉴 크기
});

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") step(1);
  else if (e.key === "ArrowUp") step(-1);
  else if (e.key === "Escape") api.pick(null);
  else if (e.key === "Enter" && at >= 0) buttons[at]?.click();
  else return;
  e.preventDefault();
});
