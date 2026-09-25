// Windows 설치 파일 만들기 — `npm run dist:win` → release/pokebuddy-Setup-<버전>.exe
//
// 1. npm run build 로 dist/ 를 만든다 (package.json 의 스크립트가 먼저 부른다)
// 2. release/app/ 에 실행에 필요한 파일만 복사한다. 목록은 package.json 의 `files` 와 같다
// 3. release/app/ 에 의존성이 없는 작은 package.json 을 만든다
// 4. electron-builder 로 release/app/ 을 묶는다
//
// 따로 모아 묶는 이유 — electron-builder 는 앱의 dependencies 에 electron 이 있으면 묶기를 거부한다.
// 루트 package.json 은 npm 판 CLI 가 실행 때 electron 을 쓰므로 dependencies 에 둔다. 그래서 루트를 바꾸지 않고 따로 모은다.
// asar 로 묶지 않는다 — 훅 원본 복사(cli/setup.js)와 창 추적 도우미(helpers/winbounds.ps1)가 실제 파일 경로를 쓴다.
// 코드 서명은 하지 않는다. 처음 실행 때 SmartScreen 경고가 뜬다 (docs/work/game-runtime/record.md "Windows 실행 파일의 설계")
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const release = path.join(root, "release");
const stage = path.join(release, "app");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

// 설치 파일에 넣지 않는 것 — VS Code 확장과 npm 설치 뒤 스크립트는 npm 판에만 쓴다
const SKIP = new Set(["vscode-extension/pokebuddy-active-terminal-*.vsix", "scripts/postinstall.js"]);

// `files` 한 줄을 실제 경로 목록으로. 끝의 `/` 는 폴더, `*` 는 한 폴더 안의 이름 맞추기만 쓴다
function expand(entry) {
  const clean = entry.replace(/\/$/, "");
  if (!clean.includes("*")) return fs.existsSync(path.join(root, clean)) ? [clean] : [];
  const dir = path.posix.dirname(clean);
  const pattern = new RegExp(`^${path.posix.basename(clean).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter((name) => pattern.test(name)).map((name) => `${dir}/${name}`);
}

function stageFiles() {
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  const copied = [];
  for (const entry of pkg.files) {
    if (SKIP.has(entry)) continue;
    for (const rel of expand(entry)) {
      fs.cpSync(path.join(root, rel), path.join(stage, rel), { recursive: true });
      copied.push(rel);
    }
  }
  // 자체 검사와 데이터 생성 도구는 실행에 쓰지 않는다
  fs.rmSync(path.join(stage, "dist", "tools"), { recursive: true, force: true });
  const appPkg = {
    name: pkg.name,
    productName: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    author: "MilkLotion",
    main: pkg.main,
  };
  fs.writeFileSync(path.join(stage, "package.json"), `${JSON.stringify(appPkg, null, 2)}\n`);
  return copied;
}

async function main() {
  const copied = stageFiles();
  process.stdout.write(`모은 파일: ${copied.join(", ")}\n`);
  const builder = require("electron-builder");
  const electronVersion = String(pkg.dependencies.electron).replace(/^[^\d]*/, "");
  const out = await builder.build({
    projectDir: stage,
    targets: builder.Platform.WINDOWS.createTarget("nsis", builder.Arch.x64),
    publish: "never",
    config: {
      appId: "io.github.milklotion.pokebuddy",
      productName: pkg.name,
      electronVersion,
      npmRebuild: false,
      asar: false,
      electronLanguages: ["ko", "en-US"], // 화면 언어 두 가지만 남긴다. Chromium 언어 파일이 50MB 가까이 된다
      directories: { output: release },
      files: ["**/*"],
      win: { icon: path.join(root, "assets", "logo", "out", "logo.ico") },
      // 원클릭 설치 — 묻지 않고 사용자 폴더(%LOCALAPPDATA%\Programs\pokebuddy)에 설치한 뒤 앱을 띄운다 (2026-09-25 사용자 선택).
      // 단계식 마법사는 "모든 사용자/나만" 화면을 끌 수 없어 쓰지 않는다
      nsis: {
        oneClick: true,
        perMachine: false, // 관리자 권한이 필요 없다
        runAfterFinish: true, // 설치가 끝나면 동반자를 띄운다. 처음이면 첫 포켓몬 선택 창이 뜬다
        installerIcon: path.join(root, "assets", "logo", "out", "logo.ico"),
        uninstallerIcon: path.join(root, "assets", "logo", "out", "logo.ico"),
        installerHeaderIcon: path.join(root, "assets", "logo", "out", "logo.ico"),
        shortcutName: pkg.name,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        deleteAppDataOnUninstall: false, // 저장(~/.claude/pokebuddy)은 지우지 않는다
        artifactName: "${productName}-Setup-${version}.${ext}",
      },
    },
  });
  process.stdout.write(`만든 파일:\n${out.map((f) => `  ${path.relative(root, f)}`).join("\n")}\n`);
}

main().catch((e) => {
  process.stderr.write(`설치 파일을 만들지 못했다: ${e && e.stack ? e.stack : String(e)}\n`);
  process.exit(1);
});
