// 트레이 — 동반자만. 늘 떠 있는 펫이라 끝낼 길이 트레이·우클릭뿐이다 (전역 단축키는 잡지 않는다)
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from "electron";
import type { SpriteSheet } from "../shared/stage";

export interface TrayOptions {
  icon: SpriteSheet | null; // 첫 shown 마리의 Idle 시트 — 첫 프레임을 잘라 쓴다
  tooltip: string;
  template: () => MenuItemConstructorOptions[];
}

export interface TrayHandle {
  refresh(): void; // 메뉴를 다시 만든다 (숨김·고스트 체크 상태)
  setIcon(sheet: SpriteSheet | null): void;
  destroy(): void;
}

// 트레이 아이콘 — 펫의 서 있는 그림 첫 프레임을 잘라 쓴다. 그림이 없으면 흰 네모 — 빈 아이콘은 mac 에서 보이지 않는다
export function trayIcon(sheet: SpriteSheet | null): NativeImage {
  const size = process.platform === "darwin" ? 18 : 16;
  try {
    if (sheet) {
      return nativeImage
        .createFromDataURL(sheet.dataUrl)
        .crop({ x: 0, y: 0, width: sheet.fw, height: sheet.fh })
        .resize({ height: size });
    }
  } catch {
    // 잘라내기 실패 — 아래 대체
  }
  return nativeImage.createFromBitmap(Buffer.alloc(size * size * 4, 0xff), { width: size, height: size });
}

export function createTray(opts: TrayOptions): TrayHandle | null {
  let tray: Tray | null = null;
  try {
    tray = new Tray(trayIcon(opts.icon));
    tray.setToolTip(opts.tooltip);
    tray.setContextMenu(Menu.buildFromTemplate(opts.template()));
    // Windows 는 왼쪽 클릭에 메뉴가 열리지 않는다 — 어느 버튼이든 메뉴
    tray.on("click", () => tray?.popUpContextMenu());
  } catch (e) {
    process.stderr.write(`트레이 아이콘을 만들지 못함 — ${e instanceof Error ? e.message : String(e)}. 우클릭 메뉴나 pokebuddy companion stop 으로 내린다\n`);
    return null;
  }
  return {
    refresh() {
      tray?.setContextMenu(Menu.buildFromTemplate(opts.template()));
    },
    setIcon(sheet) {
      tray?.setImage(trayIcon(sheet));
    },
    destroy() {
      tray?.destroy();
      tray = null;
    },
  };
}
