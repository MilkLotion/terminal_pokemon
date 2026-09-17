// Electron 화면 검사 — 숨긴 창·임시 사용자 폴더·로컬 mock 시트만 사용
// npm run build 뒤 electron dist/tools/smoke-renderer.js
import { app, BrowserWindow, Menu } from "electron";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gameMenu } from "../main/game-menu";
import { empty, emptyPet } from "../save/store";
import { advance } from "../dex/progress";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-renderer-"));
const preload = path.join(dir, "fixture.cjs");
fs.writeFileSync(preload, `
const callbacks = {};
window.stageTest = { callbacks, hit: null, messages: [] };
window.pokebuddy = {
  ready() {}, log() {},
  onInit(cb) { callbacks.init = cb; }, onSheets(cb) { callbacks.sheets = cb; },
  onFrame(cb) { callbacks.frame = cb; }, onHover(cb) { callbacks.hover = cb; },
  onClickThrough(cb) { callbacks.ct = cb; },
  hit(id) { window.stageTest.hit = id; },
  pointer(msg) { window.stageTest.messages.push(msg); }
};
`);
app.setPath("userData", path.join(dir, "user-data"));
app.disableHardwareAcceleration();
void app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { preload, contextIsolation: false, offscreen: true, backgroundThrottling: false } });
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
    await win.loadFile(path.resolve(__dirname, "../../src/renderer/stage.html"));
    await win.webContents.executeJavaScript(`(() => {
      const cb = window.stageTest.callbacks;
      cb.init({ size: { w: 800, h: 600 }, debug: false });
      for (const [look, color, width] of [['red', '#ff0000', 40], ['blue', '#0000ff', 20]]) {
        const c = document.createElement('canvas'); c.width = 40; c.height = 40;
        const ctx = c.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, 40);
        cb.sheets({ look, cell: { w: 40, h: 40 }, body: { w: 40, h: 40 },
          anims: { Idle: { fw: 40, fh: 40, rows: 1, frames: [{ x: 0, ms: 1000 }], dataUrl: c.toDataURL() } },
          clips: { idle: { anim: 'Idle', row: 0, mode: 'loop' } } });
      }
      cb.frame({ at: 1, state: 'idle', pets: [
        { id: 'first', look: 'red', zoom: 2, x: 100, y: 100, play: null, held: true },
        { id: 'last', look: 'blue', zoom: 2, x: 100, y: 100, play: null, held: false }
      ] });
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const overlap = await win.webContents.executeJavaScript(`(() => {
      const canvas = document.getElementById('stage'); const ctx = canvas.getContext('2d');
      const pixel = (x, y) => Array.from(ctx.getImageData(x * devicePixelRatio, y * devicePixelRatio, 1, 1).data);
      const fixture = window.stageTest;
      fixture.callbacks.hover({ x: 110, y: 110 }); const front = fixture.hit;
      fixture.callbacks.hover({ x: 165, y: 110 }); const through = fixture.hit;
      document.body.dispatchEvent(new MouseEvent('contextmenu', { clientX: 110, clientY: 110, bubbles: true }));
      return { color: pixel(110, 110), backColor: pixel(165, 110), front, through, menu: fixture.messages.at(-1) };
    })()`) as { color: number[]; backColor: number[]; front: string; through: string; menu: { id: string; type: string } };
    assert.deepEqual(overlap.color, [0, 0, 255, 255], "나중에 소환한 마리가 앞에 그려짐");
    assert.deepEqual(overlap.backColor, [255, 0, 0, 255], "앞 그림의 투명 부분에서 뒤 그림 노출");
    assert.equal(overlap.front, "last", "겹친 위치의 히트는 앞 마리");
    assert.equal(overlap.through, "first", "투명 부분의 히트는 뒤 마리");
    assert.equal(overlap.menu.id, "last", "우클릭도 앞 마리 선택");
    assert.equal(overlap.menu.type, "menu");
    const overlapShot = path.join(dir, "overlap.png");
    fs.writeFileSync(overlapShot, (await win.webContents.capturePage()).toPNG());
    process.stdout.write(`겹침 화면 통과: 픽셀·투명 부분·히트·우클릭 · ${overlapShot}\n`);
    const save = empty(Date.now());
    save.party = [emptyPet({ id: "p1", species: "eevee", now: Date.now() })];
    save.party[0]!.affinity = 500;
    save.points = 1000;
    advance(save, Date.now());
    const menu = Menu.buildFromTemplate(gameMenu(save, () => {}));
    assert.equal(menu.items.length, 3, "Electron의 실제 상점·파티·도감 메뉴 생성");
    if (process.env.POKEBUDDY_SMOKE_ART) {
      const artDir = process.env.POKEBUDDY_SMOKE_ART;
      const sheets = ["eevee", "eevee-shiny", "umbreon"].map((name) => JSON.parse(fs.readFileSync(path.join(artDir, `${name}.json`), "utf8")));
      await win.webContents.executeJavaScript(`(() => {
        const cb = window.stageTest.callbacks;
        const sheets = ${JSON.stringify(sheets)};
        for (const sheet of sheets) cb.sheets(sheet);
        cb.frame({ at: 2, state: 'idle', pets: sheets.map((s, i) => ({ id: 'real-' + i, look: s.look, zoom: 3, x: 100 + i * 150, y: 200, play: null, held: false })) });
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const counts = await win.webContents.executeJavaScript(`(() => {
        const ctx = document.getElementById('stage').getContext('2d');
        return [100, 250, 400].map(x => {
          const data = ctx.getImageData(x * devicePixelRatio, 200 * devicePixelRatio, 140 * devicePixelRatio, 150 * devicePixelRatio).data;
          let n = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) n++; return n;
        });
      })()`) as number[];
      assert.ok(counts.every((n) => n > 100), "일반색·다른 색·진화한 종의 실제 그림 렌더링");
      const realShot = path.join(dir, "real-sprites.png");
      fs.writeFileSync(realShot, (await win.webContents.capturePage()).toPNG());
      process.stdout.write(`실제 PMD 화면 통과: ${counts.join('/')} 픽셀 · ${realShot}\n`);
    }
    win.destroy();
    app.exit(0);
  } catch (e) {
    console.error(e);
    win.destroy();
    app.exit(1);
  }
});
