// 관리 창만 띄워 보는 개발용 실행기 — npm run build 뒤 `npx electron scripts/dev-manage.cjs`
//
// 앱 전체를 띄우지 않는다. 임시 폴더에 보기용 저장을 만들고 관리 창 하나만 연다.
// 사용자의 저장(~/.claude/pokebuddy)은 건드리지 않는다.
// `--shot <파일>` 을 주면 창을 그려 PNG 로 저장하고 끝낸다. 화면을 눈으로 확인할 때 쓴다.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app } = require("electron");

const root = path.join(__dirname, "..");
const { createGame } = require(path.join(root, "dist/main/game-v3.js"));
const { openManage } = require(path.join(root, "dist/main/manage-window.js"));
const { preloadFile, rendererFile } = require(path.join(root, "dist/main/paths.js"));
const storeV3 = require(path.join(root, "dist/save/store-v3.js"));
const { empty } = require(path.join(root, "dist/save/v3.js"));

const shotAt = process.argv.indexOf("--shot");
const shotFile = shotAt >= 0 ? process.argv[shotAt + 1] : null;

// 보기용 저장 — 꺼낸 마리, 숨긴 마리, 빈 칸, 잠긴 칸이 한 화면에 다 나오게 만든다
function seed(now) {
  const save = empty(now);
  save.points.balance = 1240;
  const pet = (id, species, over) => ({
    id,
    species,
    shiny: false,
    nature: "hardy",
    size: 2,
    level: 12,
    exp: 2000,
    affinity: 80,
    affinityProgressMs: 0,
    fullness: 72,
    fullnessProgressMs: 0,
    mood: 60,
    feedCooldownMs: 0,
    playCooldownMs: 0,
    playWindowMs: 0,
    playStreak: 0,
    buffs: [],
    home: { dx: -24, dy: -60 },
    since: now,
    stage: 0,
    evolved: [],
    daily: { date: "", gained: 0, feeds: 0, plays: 0, pokes: 0, presence: 0, work: 0, turns: 0 },
    ...over,
  });
  save.pets.push(pet("p1", "pikachu", { level: 12, affinity: 85, fullness: 72 }));
  save.pets.push(pet("p2", "charmander", { level: 5, nature: "brave", affinity: 40, fullness: 33, feedCooldownMs: 90_000 }));
  save.starterPetId = "p1";
  save.party.slots[0] = { state: "pokemon", petId: "p1", hidden: false };
  save.party.slots[1] = { state: "pokemon", petId: "p2", hidden: true };
  save.dex = { unlocked: ["pikachu", "charmander"], obtained: ["pikachu", "charmander"], shinyObtained: [], discovered: {} };
  return save;
}

app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-dev-manage-"));
  const file = path.join(dir, "save-v3.json");
  storeV3.write(file, seed(Date.now()));

  const win = openManage({ preload: preloadFile(), html: rendererFile("manage.html"), game: createGame({ file }) });
  if (!shotFile) return;

  win.webContents.once("did-finish-load", () => {
    // 첫 스냅샷을 받아 그릴 시간을 준 뒤 찍는다
    setTimeout(() => {
      // --detail 이면 첫 칸을 눌러 개체 상세까지 찍는다
      const open = process.argv.includes("--detail")
        ? win.webContents
            .executeJavaScript("document.querySelector('.slot:not(.blank)').click(); true")
            .then(() => new Promise((r) => setTimeout(r, 800)))
        : Promise.resolve();
      open
        .then(() => win.webContents.capturePage())
        .then((img) => {
          fs.writeFileSync(shotFile, img.toPNG());
          process.stdout.write(`shot: ${shotFile}\n`);
          app.exit(0);
        })
        .catch((e) => {
          process.stderr.write(`capture failed: ${String(e)}\n`);
          app.exit(1);
        });
    }, 900);
  });
});
