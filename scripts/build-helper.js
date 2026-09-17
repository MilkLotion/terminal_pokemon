// 창 추적 헬퍼(helpers/winbounds)를 mac 용 universal 바이너리로 빌드한다 — arm64 와 x86_64 를 한 파일에.
// 배포 패키지에 미리 넣어, 받는 사람이 Xcode 없이도 쓰고 Intel 맥에서도 돌게 한다.
//
//   node scripts/build-helper.js          universal (배포용, npm pack 때 자동)
//   node scripts/build-helper.js --native  이 컴퓨터 아키텍처만 (git clone 설치 때)
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HELPERS = path.join(__dirname, "..", "helpers");
const SOURCE = path.join(HELPERS, "winbounds.swift");
const OUT = path.join(HELPERS, "winbounds");
// 최소 지원 macOS — arm64 는 11 부터 존재한다
const TARGETS = ["arm64-apple-macos11", "x86_64-apple-macos10.15"];

function build({ native = false } = {}) {
  if (process.platform !== "darwin") throw new Error("mac 에서만 빌드할 수 있다");
  if (native) {
    execFileSync("swiftc", ["-O", "-o", OUT, SOURCE], { stdio: "inherit" });
    return OUT;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pokebuddy-helper-"));
  try {
    const slices = TARGETS.map((target) => {
      const out = path.join(tmp, target);
      execFileSync("swiftc", ["-O", "-target", target, "-o", out, SOURCE], { stdio: "inherit" });
      return out;
    });
    execFileSync("lipo", ["-create", ...slices, "-output", OUT], { stdio: "inherit" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // lipo 로 합치면 조각마다 붙어 있던 서명이 풀린다. Apple Silicon 은 서명 없는 실행 파일을 거부할 수 있어
  // ad-hoc 서명을 다시 붙인다 (개발자 인증서가 필요 없는 로컬 서명)
  execFileSync("codesign", ["--force", "--sign", "-", OUT], { stdio: "inherit" });
  // 두 아키텍처가 다 들어갔는지 확인한다 — 빠지면 배포본이 한쪽 맥에서 조용히 창 추적을 못 한다
  const archs = execFileSync("lipo", ["-archs", OUT], { encoding: "utf8" }).trim().split(/\s+/);
  for (const need of ["arm64", "x86_64"]) {
    if (!archs.includes(need)) throw new Error(`헬퍼에 ${need} 가 빠짐 (${archs.join(", ")})`);
  }
  return OUT;
}

if (require.main === module) {
  const out = build({ native: process.argv.includes("--native") });
  process.stdout.write(`헬퍼 빌드: ${out}\n`);
}

module.exports = { build };
