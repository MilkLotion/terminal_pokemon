// 첫 실행 선택 창 — 스타터 29종을 세대별로. 고르면 슬러그, 닫으면 null. 문서는 src/renderer/picker.html (C 단위), 문구·목록은 여기서 준다
import { BrowserWindow, ipcMain } from "electron";
import type { PickerPayload, StageChannel } from "../shared/stage";
import { windowIcon } from "./paths";
import { petName, t } from "./text";

const CH = {
  list: "picker:list",
  start: "picker:start",
} satisfies Record<string, StageChannel>;

export interface PickerOptions {
  preload: string;
  html: string;
  starters: string[]; // data/unlocks.json 의 starter 표시 순서 — 세대별 3종 × 9 + 피카츄·이브이
  onPicking(on: boolean): void; // 선택 창이 열려 있는 동안 window-all-closed 로 끝나지 않게
}

// 선택 창에 줄 목록 — 세대별 3종 × 9 + 나머지. 이름은 지금 언어로
export function pickerPayload(starters: string[]): PickerPayload {
  const groups: { label: string; slugs: string[] }[] = [];
  for (let g = 0; g < 9; g++) groups.push({ label: t("starter.gen", { n: g + 1 }), slugs: starters.slice(g * 3, g * 3 + 3) });
  groups.push({ label: t("starter.others"), slugs: starters.slice(27) });
  return {
    title: t("starter.title"),
    start: t("starter.start"),
    groups: groups
      .filter((g) => g.slugs.length)
      .map((g) => ({ label: g.label, items: g.slugs.map((slug) => ({ slug, name: petName(slug) })) })),
  };
}

export function pickStarter(opts: PickerOptions): Promise<string | null> {
  return new Promise((resolve) => {
    opts.onPicking(true);
    const picker = new BrowserWindow({
      width: 560,
      height: 640,
      title: "pokebuddy",
      resizable: false,
      minimizable: false,
      fullscreenable: false,
      icon: windowIcon(),
      webPreferences: { preload: opts.preload },
    });
    let done = false;
    const finish = (slug: string | null): void => {
      if (done) return;
      done = true;
      opts.onPicking(false);
      ipcMain.removeHandler(CH.list);
      ipcMain.removeListener(CH.start, onStart);
      resolve(slug);
      if (!picker.isDestroyed()) picker.close();
    };
    const onStart = (_e: unknown, slug: unknown): void => finish(typeof slug === "string" && opts.starters.includes(slug) ? slug : null);
    ipcMain.handle(CH.list, () => pickerPayload(opts.starters));
    ipcMain.on(CH.start, onStart);
    picker.on("closed", () => finish(null));
    void picker.loadFile(opts.html);
  });
}
