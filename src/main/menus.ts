// 우클릭·트레이 메뉴의 항목 — Electron 을 import 하지 않고 MenuItemConstructorOptions 모양의 객체만 돌려준다 (node 시험 가능).
// 문구는 언어 파일(lib/i18n)에서. 호칭(펫·동반자)은 쓰지 않고 동사만 (사용자 결정 2026-09-17).
// S2 우클릭 = 그 마리의 "이름 · 성격" 한 줄(비활성) · 잠시 숨기기/다시 보이기 · 종료. 밥·놀기는 S3 에서 핸들러와 함께 들어온다 (s2-plan 2.2 j)
// 고스트 모드(클릭 통과)는 트레이에만 — 켜면 펫을 우클릭할 수 없어 우클릭 메뉴에 있어도 끌 수 없다. 트레이가 없는 세션·창 펫은 단축키로 끈다
import type { MenuItemConstructorOptions } from "electron";
import { t } from "./text";

export interface PetMenuModel {
  name: string;
  nature: string | null; // 성격의 화면 이름 — 세션 샌드박스 펫처럼 없으면 이름만
  hidden: boolean;
}
export interface TrayMenuModel {
  name: string;
  hidden: boolean;
  ghost: boolean;
}
export interface MenuActions {
  toggleHidden(): void;
  quit(): void;
  toggleGhost?(): void;
  openConfig?(): void;
}

// 첫 줄 — "이브이 · 용감". 성격이 없으면 이름만
export const petLine = (model: Pick<PetMenuModel, "name" | "nature">): string =>
  model.nature ? t("menu.pet", { name: model.name, nature: model.nature }) : model.name;

export function petMenu(model: PetMenuModel, act: MenuActions): MenuItemConstructorOptions[] {
  return [
    { label: petLine(model), enabled: false },
    { type: "separator" },
    { label: t(model.hidden ? "menu.show" : "menu.hide"), click: () => act.toggleHidden() },
    { type: "separator" },
    { label: t("menu.quit"), click: () => act.quit() },
  ];
}

export function trayMenu(model: TrayMenuModel, act: MenuActions): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { label: model.name, enabled: false },
    { type: "separator" },
    { label: t(model.hidden ? "menu.show" : "menu.hide"), click: () => act.toggleHidden() },
    { label: t("menu.ghost"), type: "checkbox", checked: model.ghost, click: () => act.toggleGhost?.() },
    { label: t("menu.openConfig"), click: () => act.openConfig?.() },
    { type: "separator" },
    { label: t("menu.quit"), click: () => act.quit() },
  ];
  return items;
}
