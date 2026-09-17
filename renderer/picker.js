// 첫 실행 — 스타터 선택 창. 목록·문구는 메인이 언어에 맞춰 준다 (main.js pickerPayload).
// 고르고 "시작"을 누르면 슬러그를 메인에 보낸다. 창을 그냥 닫으면 메인이 시작하지 않는다
const list = document.getElementById("list");
const title = document.getElementById("title");
const start = document.getElementById("start");
const chosen = document.getElementById("chosen");

let picked = null;

function pick(slug, name, cell) {
  picked = slug;
  for (const c of list.querySelectorAll(".cell.pick")) c.classList.remove("pick");
  cell.classList.add("pick");
  chosen.textContent = name;
  start.disabled = false;
}

window.pokebuddy.pickerList().then(({ title: heading, start: startLabel, groups }) => {
  title.textContent = heading;
  document.title = heading;
  start.textContent = startLabel;
  for (const group of groups) {
    const gen = document.createElement("div");
    gen.className = "gen";
    gen.textContent = group.label;
    list.appendChild(gen);
    const row = document.createElement("div");
    row.className = "row";
    for (const item of group.items) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.textContent = item.name;
      // 한국어 이름 아래 영어 슬러그를 작게 — 같은 이름을 CLI 에서 칠 때 쓰는 글자다
      if (item.name !== item.slug) {
        const small = document.createElement("small");
        small.textContent = item.slug;
        cell.appendChild(small);
      }
      cell.addEventListener("click", () => pick(item.slug, item.name, cell));
      cell.addEventListener("dblclick", () => {
        pick(item.slug, item.name, cell);
        window.pokebuddy.pickerStart(item.slug);
      });
      row.appendChild(cell);
    }
    list.appendChild(row);
  }
});

start.addEventListener("click", () => {
  if (picked) window.pokebuddy.pickerStart(picked);
});
