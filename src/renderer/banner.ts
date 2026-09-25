// 알림 배너 창 — 메인이 준 배너 하나를 그린다. 문구와 목적지는 메인이 정한다 (src/notify/banner.ts)
//
// 배너 본문 클릭 동작은 없다. `바로가기` 만 누른다 (docs/specs/s5.md "알림 배너의 개별 표시")
import type { BannerView } from "../shared/manage.js";

function need<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`banner: #${id} 없음`);
  return el;
}

const bannerEl = need("banner", HTMLElement);
const titleEl = need("title", HTMLElement);
const targetEl = need("target", HTMLElement);
const nameEl = need("name", HTMLElement);
const goEl = need("go", HTMLButtonElement);

const api = window.pokebuddyBanner;
let key: string | null = null;

api.onShow((view: BannerView) => {
  key = view.key;
  titleEl.textContent = view.title;
  targetEl.className = `target ${view.kind}`;
  targetEl.textContent = view.kind === "achievement" ? "A" : "";
  nameEl.textContent = view.target;
  nameEl.title = view.target;
  goEl.textContent = view.go;
  bannerEl.hidden = false;
  // 앞 배너 때 올려 둔 커서가 그대로면 mouseenter 가 다시 오지 않는다. 새 배너도 멈춰 둔다
  if (bannerEl.matches(":hover")) api.hover(true);
});

goEl.addEventListener("click", () => {
  if (key) api.go(key);
});
bannerEl.addEventListener("mouseenter", () => api.hover(true));
bannerEl.addEventListener("mouseleave", () => api.hover(false));
