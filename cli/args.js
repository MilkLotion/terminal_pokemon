// pkmon 인자 해석 — 파일·프로세스를 건드리지 않는 순수 함수라 따로 시험할 수 있다.
//
//   pkmon <펫> [이름=값 ...] [--] [<명령> [인자 ...]]
//   pkmon [--pet <펫>] [--dot 3] ... [--] <명령>
//   pkmon setup | uninstall | status | help
//
// 인자 경계는 env(1) 과 같다 — 우리 옵션은 앞에 오고, 옵션 모양이 아닌 첫 단어부터가 대상 명령이다.
// '--' 는 있어도 되고 없어도 된다. PowerShell 은 스크립트에 인자를 넘길 때 '--' 를 삼키기 때문에
// '--' 에만 기대면 Windows 에서 `pkmon eevee -- codex` 가 "알 수 없는 옵션: codex" 가 된다.
// 대상 명령의 인자는 한 글자도 건드리지 않는다.

const USAGE = `사용:
  pkmon <펫> [이름=값 ...] [--] [<명령> [인자 ...]]
  pkmon setup [--dry-run] [--no-editor]                 Claude 훅·에디터 확장 설치
  pkmon uninstall [--dry-run] [--purge] [--no-editor]   설치한 것 되돌리기 (--purge 면 설정·캐시까지)
  pkmon status [펫]                                     지금 판정 상태와 PMD 저작자 보기

예:
  pkmon eevee                     명령을 생략하면 claude
  pkmon eevee codex               다른 명령 (-- 는 있어도 되고 없어도 된다)
  pkmon eevee dot=3 buddy=calm    크게, 덜 돌아다니게
  pkmon eevee art=showdown        원본 GIF (동작은 하나뿐)
  pkmon zapdos+pikachu            여러 마리 (+ 또는 쉼표 — PowerShell 에서 쉼표는 따옴표로 감싼다)

옵션 (이름=값 · --이름 값):
  pos=fix|free   art=pmd|showdown|sheet   buddy=on|calm|off
  dot=<숫자>     fps=<숫자>   keep=on|off   click=on|off   scale=<숫자>
  gif=off|on     (예전 옵션 — art=sheet · art=showdown)`;

// 옵션 이름 → 펫 환경변수. 값이 비면 넘기지 않는다
const OPTIONS = {
  pet: null, // 펫 이름은 환경변수가 아니라 마리마다 따로 넘긴다
  scale: "PKMON_SCALE",
  pos: "PKMON_POS",
  gif: "PKMON_USE_GIF",
  art: "PKMON_ART",
  buddy: "PKMON_BUDDY",
  dot: "PKMON_DOT_SIZE",
  fps: "PKMON_FPS",
  keep: "PKMON_KEEP_VISIBLE",
  click: "PKMON_CLICK_THROUGH",
};
const ALIASES = { pkmon: "pet", pokemon: "pet" };
// 옵션 이름은 대소문자를 가리지 않는다 (예전 PowerShell 판이 그랬다). 프로토타입 이름(constructor 등)은 거른다
const optionName = (raw) => {
  const name = raw.toLowerCase();
  const key = Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
  return Object.hasOwn(OPTIONS, key) ? key : null;
};
// 하위 명령별로 받는 플래그 — 오타(--dryrun)가 조용히 "진짜 실행"이 되지 않게 모르는 플래그는 멈춘다
const SUBCOMMANDS = {
  setup: ["--dry-run", "--no-editor"],
  uninstall: ["--dry-run", "--purge", "--no-editor"],
  status: [],
  help: [],
};

// 반환: { kind: "run" | "setup" | "uninstall" | "status" | "help" | "version", opts, command, flags, rest, error }
function parseArgs(argv) {
  const args = [...argv];

  if (args[0] === "-h" || args[0] === "--help") return { kind: "help" };
  if (args[0] === "-v" || args[0] === "--version") return { kind: "version" };
  // 하위 명령 — 포켓몬 이름과 겹치지 않는 단어만 쓴다
  if (Object.hasOwn(SUBCOMMANDS, args[0])) {
    const kind = args.shift();
    const flags = new Set(args.filter((a) => a.startsWith("-")));
    const unknown = [...flags].filter((f) => !SUBCOMMANDS[kind].includes(f));
    if (unknown.length) return { kind: "run", error: `pkmon ${kind} 에 없는 옵션: ${unknown.join(" ")}` };
    const rest = args.filter((a) => !a.startsWith("-"));
    return { kind, flags, rest };
  }

  const opts = {};
  // 첫 인자가 옵션도 이름=값 도 '--' 도 아니면 펫 이름으로 받는다 (pkmon eevee -- claude)
  if (args.length && !args[0].startsWith("-") && !args[0].includes("=")) opts.pet = args.shift();

  while (args.length) {
    const a = args[0];
    if (a === "--") {
      args.shift();
      break;
    }
    if (a === "-h" || a === "--help") return { kind: "help" };

    const long = a.match(/^--([A-Za-z]+)$/);
    if (long) {
      const key = optionName(long[1]);
      if (!key) return { kind: "run", error: `알 수 없는 옵션: ${a}` };
      if (args.length < 2) return { kind: "run", error: `${a} 에 값이 없음` };
      opts[key] = args[1];
      args.splice(0, 2);
      continue;
    }
    // env(1) 처럼 이름=값 도 받는다
    const kv = a.match(/^([A-Za-z]+)=(.*)$/);
    if (kv) {
      const key = optionName(kv[1]);
      // 이름=값 모양의 명령은 사실상 없다 — 오타로 보고 알린다 (조용히 명령으로 실행해 "명령 없음" 이 되지 않게)
      if (!key) return { kind: "run", error: `알 수 없는 옵션: ${a}` };
      opts[key] = kv[2];
      args.shift();
      continue;
    }
    if (a.startsWith("-")) return { kind: "run", error: `알 수 없는 옵션: ${a}` };
    break; // 옵션 모양이 아닌 첫 단어 — 여기부터 대상 명령
  }

  // 명령을 생략하면 claude — 이 도구를 쓰는 대부분의 경우다
  const command = args.length ? args : ["claude"];
  if (!opts.pet) return { kind: "run", error: "펫 이름이 없음 — 사용: pkmon eevee -- claude" };
  if (!command[0]) return { kind: "run", error: "명령이 비어 있음" };
  return { kind: "run", opts, command };
}

// 옵션 → 펫 프로세스에 넘길 환경변수 (빈 값은 빼서, 설정 파일 값을 덮지 않게 한다)
function optionEnv(opts) {
  const env = {};
  for (const [key, name] of Object.entries(OPTIONS)) {
    if (name && opts[key] != null && opts[key] !== "") env[name] = String(opts[key]);
  }
  return env;
}

// 펫 이름 목록 — 쉼표와 + 둘 다 받는다. PowerShell 은 따옴표 없는 a,b 를 배열로 쪼개므로 + 가 안전하다
const petList = (pet) =>
  String(pet || "")
    .split(/[,+]/)
    .map((s) => s.trim())
    .filter(Boolean);

module.exports = { parseArgs, optionEnv, petList, USAGE };
