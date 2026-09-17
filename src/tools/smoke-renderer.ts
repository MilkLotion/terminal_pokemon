// Electron 화면 검사 — 숨긴 창·임시 사용자 폴더·로컬 mock 시트만 사용
// npm run build 뒤 electron dist/tools/smoke-renderer.js
import { app, BrowserWindow } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-renderer-"));
app.setPath("userData", path.join(dir, "user-data"));
app.disableHardwareAcceleration();
void app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    await win.loadFile(path.resolve(__dirname, "../../src/renderer/stage.html"), { query: { mock: "1" } });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const result = await win.webContents.executeJavaScript(`(() => {
      const canvas = document.getElementById('stage');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]) colored++;
      return { colored, debug: document.getElementById('debug').textContent };
    })()`) as { colored: number; debug: string };
    assert.ok(result.colored > 100, "캔버스에 마리가 그려짐");
    for (const look of ["mock-a", "mock-b", "mock-c"]) assert.ok(result.debug.includes(look), `${look} 시트 로드`);
    const screenshot = path.join(dir, "stage.png");
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    process.stdout.write(`renderer 통과: ${result.colored} 픽셀 · ${screenshot}\n`);
    win.destroy();
    app.exit(0);
  } catch (e) {
    console.error(e);
    win.destroy();
    app.exit(1);
  }
});
