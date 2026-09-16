// pkmon 인자 해석 — 파일·프로세스를 건드리지 않는 순수 함수라 따로 시험할 수 있다.
//
//   pkmon <펫> [이름=값 ...]
//   pkmon [--pet <펫>] [--dot 3] ...
//   pkmon stop [펫 ...|all] | setup | uninstall | status | help
//
// pkmon 은 명령을 실행하지 않는다 — 터미널에서 pkmon eevee, CLI LLM 안에서 !pkmon eevee 로 그 세션에 펫을 붙인다 (cli/run.js).
// 옵션 뒤에 남는 단어는 예전 문법(pkmon eevee codex)이거나 따옴표 없는 쉼표가 쪼갠 펫 이름이라 멈추고 알린다.

const USAGE = `사용 — 터미널에서 그대로, CLI LLM(claude·codex·gemini) 안에서는 앞에 ! 를 붙인다:
  pkmon <펫> [이름=값 ...]                              이 세션에 펫 더하기 — 떠 있는 펫 이름이면 그 펫을 바꾼다
  pkmon stop [펫 ...|all]                               이 세션의 펫 내리기 — 여러 마리면 체크리스트로 고른다
  pkmon setup [--dry-run] [--no-editor]                 CLI LLM 상태 훅·에디터 확장 설치
  pkmon uninstall [--dry-run] [--purge] [--no-editor]   설치한 것 되돌리기 (--purge 면 설정·캐시까지)
  pkmon status [펫]                                     지금 판정 상태와 PMD 저작자 보기

예:
  pkmon eevee                     터미널 — 셸이 끝나면 펫도 사라진다
  !pkmon eevee                    CLI LLM 안 — 그 CLI 가 끝나면 사라지고, 일하는 상태에 따라 동작이 바뀐다
  !pkmon eevee dot=3 buddy=calm   크게, 덜 돌아다니게 (떠 있던 펫이 이걸로 바뀐다)
  !pkmon eevee art=showdown       원본 GIF (동작은 하나뿐)
  !pkmon zapdos+pikachu           여러 마리 (+ 또는 쉼표 — PowerShell 에서 쉼표는 따옴표로 감싼다)
  !pkmon stop pikachu             한 마리 내리기 (!pkmon stop all 은 전부)

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
  stop: ["--all"],
  setup: ["--dry-run", "--no-editor"],
  uninstall: ["--dry-run", "--purge", "--no-editor"],
  status: [],
  help: [],
};

// 반환: { kind: "run" | "stop" | "setup" | "uninstall" | "status" | "help" | "version", opts, flags, rest, error }
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
  // 첫 인자가 옵션도 이름=값 도 아니면 펫 이름으로 받는다 (pkmon eevee dot=3)
  if (args.length && !args[0].startsWith("-") && !args[0].includes("=")) opts.pet = args.shift();

  while (args.length) {
    const a = args[0];
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
      if (!key) return { kind: "run", error: `알 수 없는 옵션: ${a}` };
      opts[key] = kv[2];
      args.shift();
      continue;
    }
    if (a.startsWith("-") && a !== "--") return { kind: "run", error: `알 수 없는 옵션: ${a}` };
    // 옵션 모양이 아닌 단어 — 예전 문법(pkmon eevee codex · pkmon eevee -- claude)이거나,
    // PowerShell 이 따옴표 없는 zapdos,pikachu 를 쪼갠 것
    const word = a === "--" ? args[1] || a : a;
    const pet = opts.pet || "eevee";
    return {
      kind: "run",
      error:
        `알 수 없는 인자: ${word} — pkmon 은 명령을 실행하지 않는다. 명령(CLI)을 먼저 켜고 그 안에서 !pkmon ${pet} 로 띄운다\n` +
        `  ${word} 가 펫 이름이었다면 ${pet}+${word} 처럼 + 로 잇는다`,
    };
  }

  if (!opts.pet) return { kind: "run", error: "펫 이름이 없음 — 사용: pkmon eevee (CLI LLM 안에서는 !pkmon eevee)" };
  return { kind: "run", opts };
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
