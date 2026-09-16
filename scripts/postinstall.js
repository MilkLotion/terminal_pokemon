// npm install 뒤에 도는 스크립트 — 어떤 경우에도 설치를 실패시키지 않는다.
//
// 1. Electron 실행 파일을 미리 받는다. Electron 44 부터는 설치 때 받지 않고 처음 require 할 때 받는데,
//    그러면 사용자가 처음 !pkmon 을 칠 때 펫이 뜨기 전에 100MB 다운로드가 끼어든다.
//    여기서 실패해도(오프라인 등) 설치는 성공시키고, pkmon setup 이 다시 받는다.
// 2. npm 배포본에는 창 추적 헬퍼가 미리 빌드돼 들어 있다. git clone 으로 받았으면 헬퍼가 없으니,
//    Swift 컴파일러가 있을 때만 이 컴퓨터용으로 빌드한다.
const fs = require("fs");
const path = require("path");

try {
  try {
    require("electron");
  } catch {
    process.stdout.write("Electron 을 미리 받지 못함 — 네트워크가 되는 곳에서 pkmon setup 을 실행하면 받는다\n");
  }
  const helper = path.join(__dirname, "..", "helpers", "winbounds");
  if (process.platform === "darwin" && !fs.existsSync(helper)) {
    try {
      require("./build-helper.js").build({ native: true });
    } catch {
      process.stdout.write("창 추적 헬퍼 빌드 생략 — swiftc 없음 (xcode-select --install 후 npm run build:helper)\n");
    }
  }
  process.stdout.write("pkmon 설치 완료 — 처음 한 번: pkmon setup\n");
} catch {
  // 설치 후 안내 실패는 무시
}
