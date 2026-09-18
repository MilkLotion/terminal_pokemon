// 트레이 — 동반자만. 늘 떠 있는 펫이라 끝낼 길이 트레이·우클릭뿐이다 (전역 단축키는 잡지 않는다)
import { Menu, Tray, nativeImage, type MenuItemConstructorOptions, type NativeImage } from "electron";

export interface TrayOptions {
  icon: string | null; // 공식 앱 로고 PNG 경로
  tooltip: string;
  template: () => MenuItemConstructorOptions[];
}

export interface TrayHandle {
  refresh(): void; // 메뉴를 다시 만든다 (숨김·고스트 체크 상태)
  setIcon(file: string | null): void;
  destroy(): void;
}

// 트레이 아이콘 — 실행 중인 펫이 바뀌어도 공식 앱 로고를 유지한다
export function trayIcon(file: string | null): NativeImage {
  const size = process.platform === "darwin" ? 18 : 16;
  try {
    if (file) {
      return nativeImage.createFromPath(file).resize({ width: size, height: size });
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
    setIcon(file) {
      tray?.setImage(trayIcon(file));
    },
    destroy() {
      tray?.destroy();
      tray = null;
    },
  };
}
