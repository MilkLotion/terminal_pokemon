# terminal_pokemon

터미널 위에 떠 있는 포켓몬 펫. 테두리 없는 투명 창이라 VS Code 터미널 위에 겹쳐 놓을 수 있다.
명령을 실행하는 동안 함께 뜨고, 명령이 끝나면 같이 사라진다. macOS · Windows 에서 동작한다.

```bash
pkmon eevee             # 명령을 생략하면 claude
pkmon zapdos+pikachu    # 여러 마리
pkmon eevee codex       # 다른 명령을 감쌀 때
```

펫은 Claude 가 일하는 상태에 따라 동작이 바뀌고(걷기·두리번·쓰러짐…), 한가할 때는 창 안을 가끔 돌아다니다가
3분 동안 아무 입력이 없으면 잠든다. 집어 들면 아파하고, 콕 찌르면 반응한다 — [buddy](#buddy--돌아다니고-졸고-반응하기).

포켓몬 이미지는 이 저장소에 없다. 실행할 때 한 번 내려받아 캐시한다.

| 그림 (`art=`) | 출처 | 특징 |
|---|---|---|
| `pmd` (기본) | [PMDCollab/SpriteCollab](https://sprites.pmdcollab.org) | 동작이 종마다 10~40종 — 상태별 동작·buddy 가 된다. 도트가 작고 각지다 |
| `showdown` | [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/) 원본 GIF | 화질이 가장 좋지만 동작이 하나뿐 |
| `sheet` | [codex-pokepets](https://github.com/dnnyngyen/codex-pokepets) 스프라이트시트 | 로컬 파일. 상태별 줄 9개 |

못 받으면 `pmd → showdown → sheet` 순서로 내려간다.
포켓몬 권리는 Nintendo / Game Freak / Creatures Inc. 에 있으며 개인·비상업 팬 용도로만 쓴다.
PMD 스프라이트는 **CC BY-NC 4.0** 이다 — [라이선스](#라이선스) 참고.

## 요구사항

- Node.js 22.12 이상 — Electron 44 설치기가 요구한다 (그보다 낮으면 설치는 끝나도 펫이 뜨지 않는다)
- macOS(Apple Silicon·Intel) 또는 Windows
- Claude Code 상태 연동을 쓰려면 Claude Code, 탭별 표시를 쓰려면 VS Code 계열 에디터

## 설치

```bash
npm install -g terminal-pkmon
pkmon setup
```

(npm 에 게시하기 전에는 [배포](#배포-관리자용) 절에서 만든 `.tgz` 파일로 `npm install -g ./terminal-pkmon-<버전>.tgz`)

- `npm install` 이 Electron(약 100MB)까지 받는다. mac 창 추적 헬퍼는 패키지에 미리 빌드돼 있다(universal).
- `pkmon setup` 은 처음 한 번만 하면 된다. 하는 일:
  - Claude Code 훅 설치 — `~/.claude/scripts/hooks/pkmon-state.cjs` 복사, `~/.claude/settings.json` 에 7개 이벤트 등록.
    **바꾸기 전에 백업을 남기고, 이미 있는 항목은 건드리지 않고, 여러 번 실행해도 결과가 같다.**
  - VS Code 계열 에디터(VS Code·Cursor·Windsurf·Antigravity…)에 탭 구분 확장 설치 — CLI 를 PATH 나 앱 안에서 찾는다
  - 펫 데이터 폴더 `~/.claude/pkmon` 생성
- 무엇을 바꿀지 먼저 보려면 `pkmon setup --dry-run`. 에디터 확장을 빼려면 `--no-editor`.

지우기:

```bash
pkmon uninstall            # 훅 등록·훅 파일·에디터 확장 제거 (설정·그림 캐시는 남김)
pkmon uninstall --purge    # ~/.claude/pkmon 까지
npm uninstall -g terminal-pkmon
```

### 저장소에서 바로 쓰기 (개발용)

```bash
git clone https://github.com/MilkLotion/terminal_pokemon.git
cd terminal_pokemon
npm install                # mac 은 Swift 컴파일러가 있으면 헬퍼를 이 컴퓨터용으로 빌드한다
bin/pkmon setup
```

`pkmon` 을 PATH 에 올린다 — mac 은 `~/.zshrc` 에 `source <클론한 경로>/shell/pkmon.zsh`,
Windows 는 PowerShell 프로필에 `$env:PATH = "<클론한 경로>\bin;$env:PATH"` (`bin/pkmon.ps1` 이 받는다).

> **`claude`·`codex` 를 셸 함수로 덮지 않는다.**
> 남의 명령에 없는 문법을 얹는 것은 관례가 아니다 — `pyenv`·`conda` 는 기존 서브커맨드를
> 가로챌 뿐 문법을 늘리지 않고, `direnv`·`singularity` 는 환경변수를 쓴다.
> 덮어쓰면 프롬프트 토큰을 먹거나(`claude fix fps=30 bug` 에서 단어가 사라진다)
> 셸 스냅샷에서 깨진다. `pkmon` 은 `env(1)`·`nice(1)`·`timeout(1)` 과 같은 별도 명령이다.

## 사용

```
pkmon <펫> [이름=값 ...] [--] [<명령> [인자 ...]]
```

```bash
pkmon pikachu                          # 명령을 생략하면 claude
pkmon charizard-3d codex               # 다른 명령
pkmon zapdos+pikachu                   # 여러 마리 — 나란히 뜬다 (쉼표도 되지만 PowerShell 에서는 따옴표로 감싼다)
pkmon eevee pos=free                   # 창 밖에도 둘 수 있게 (기본은 pos=fix)
pkmon eevee dot=3                      # 크게 — PMD 는 도트가 작아 3~4 를 권한다
pkmon eevee buddy=calm                 # 덜 돌아다니게 (off 면 제자리)
pkmon eevee art=showdown               # 원본 GIF — 화질 우선, 동작은 하나
pkmon eevee claude -p "고쳐줘"          # 대상 명령의 인자는 그대로 넘어간다
```

인자 경계는 `env(1)` 과 같다 — **우리 옵션(`이름=값` · `--이름 값`)이 앞에 오고, 옵션 모양이 아닌 첫 단어부터가
대상 명령이다.** 그 뒤는 한 글자도 건드리지 않고 그대로 넘긴다. 경계를 분명히 하고 싶으면 `--` 를 넣어도 된다.
(`--` 를 필수로 두지 않는 건 PowerShell 이 스크립트에 인자를 넘길 때 `--` 를 지워 버리기 때문이다)

```
env    FOO=1        cmd args
pkmon  eevee dot=3  cmd args
```

Windows PowerShell 에서 `pkmon` 이 "이 시스템에서 스크립트를 실행할 수 없으므로" 로 막히면
npm 이 만든 `pkmon.ps1` 이 실행 정책에 걸린 것이다. `pkmon.cmd eevee` 처럼 부르거나,
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` 로 풀면 된다.

### 옵션

| 옵션 | 값 | 뜻 |
|---|---|---|
| (첫 인자) | 펫 이름 | `+` 나 쉼표로 여러 마리. `--pet <이름>` 으로도 준다 |
| `pos=` | `fix`(기본) · `free` | 따라가는 창 안에 가둘지 |
| `art=` | `pmd`(기본) · `showdown` · `sheet` | 그림 소스 |
| `buddy=` | `on`(기본) · `calm` · `off` | 돌아다니기·졸기·만지기 반응. `pmd` 에서만 동작 |
| `dot=` | 숫자 | 도트 한 칸을 몇 px 로 볼지 (펫 크기). PMD 는 3~4 권장 |
| `fps=` | 숫자 | `sheet` 재생 속도 |
| `gif=` | `off` · `on` | 예전 옵션 — `art=sheet` · `art=showdown` 과 같다 |
| `keep=` | `on` · `off` | 다른 앱을 봐도 숨지 않기 |
| `click=` | `on` · `off` | 펫 위 클릭을 아래 터미널로 통과 |

`이름=값` 과 `--이름 값` 둘 다 받는다. `on`/`off` 자리에는 `true`/`false`, `1`/`0`, `yes`/`no` 도 쓸 수 있다.
**이번 실행에만 적용되고 설정 파일에는 저장되지 않는다.**

환경변수로도 같은 값을 줄 수 있다 — 스크립트나 CI 에서 편하다.

| 환경변수 | 대응 옵션 |
|---|---|
| `PKMON_SLUG` | 펫 이름 |
| `PKMON_POS` | `pos=` |
| `PKMON_ART` | `art=` |
| `PKMON_BUDDY` | `buddy=` |
| `PKMON_DOT_SIZE` | `dot=` |
| `PKMON_FPS` | `fps=` |
| `PKMON_KEEP_VISIBLE` | `keep=` |
| `PKMON_CLICK_THROUGH` | `click=` |
| `PKMON_DEBUG=1` | 판정 로그를 파일로 남긴다 (경로를 알려 준다) |
| `PKMON_USE_GIF` | `gif=` (예전 옵션) |

- 펫을 드래그해 원하는 자리에 놓으면 위치가 기억된다. 펫마다 따로 기억한다. buddy 는 거기를 집으로 삼는다.
- 여러 마리를 띄우면 겹치지 않게 옆으로 밀려서 배치된다.

| 단축키 | 동작 |
|---|---|
| `Cmd/Ctrl + Alt + P` | 클릭 통과 — 펫 위를 눌러도 아래 터미널이 조작된다 |
| `Cmd/Ctrl + Alt + K` | 항상 보이기 |
| `Cmd/Ctrl + Alt + H` | 숨기기·보이기 |
| `Cmd/Ctrl + Alt + Q` | 종료 |

### 펫 이름

[codex-pokepets 의 `pets/` 폴더명](https://github.com/dnnyngyen/codex-pokepets/tree/main/pets)을 쓴다.
PMD 는 같은 이름을 도감 번호로 바꿔 받는다(`lib/dex.json`) — `gengar` 와 `gengar-3d` 는 PMD 에서 같은 그림이다.

| 입력 | 결과 |
|---|---|
| `pikachu` · `Pikachu` | 대문자로 적어도 소문자로 맞춘다 |
| `gengar` | 2D 도트 |
| `gengar-3d` | 3D |
| `cinderace` | 2D 가 없는 6세대 이후는 `cinderace-3d` 로 자동 대체 |
| `rotom-wash` · `deoxys-attack` · `unown-z` | 폼은 PokeAPI 표기 |

메가·거다이맥스 폼은 없다(`charizard-mega-x` 같은 이름은 실패한다). 없는 이름을 넣으면 그 펫만 건너뛰고
비슷한 이름을 알려 준다. 명령 자체는 그대로 실행된다.

## 설정

설정은 **`~/.claude/pkmon/config.json` 한 파일**이 전부다. 펫을 옮기거나 단축키로 값을 바꾸면 자동으로 생긴다.
프로그램 폴더가 아니라 홈에 두는 건, npm 으로 업데이트해도 위치·설정이 지워지지 않게 하려는 것이다.
(예전 버전의 `pkmon.config.json` 은 처음 실행할 때 이리로 복사해 온다. 형식은 저장소의 `pkmon.config.example.json` 참고)
기본값과 경로는 전부 `config.js` 한 곳에 있고, 펫(`main.js`)과 명령(`cli/`)이 모두 그것을 참고한다.

| 항목 | 기본 | 설명 |
|---|---|---|
| `slug` | `pikachu` | 펫 이름 |
| `dotSize` | `2` | 도트 한 칸을 몇 px 로 볼지 — 펫 크기를 좌우한다. PMD 는 정수 배율(3~4 권장), `sheet` 는 `0` 이면 원본 그대로 |
| `art` | `pmd` | 그림 소스 — `pmd` · `showdown` · `sheet` |
| `buddy` | `on` | `on` · `calm`(덜 돌아다님) · `off`(제자리) |
| `keepVisible` | `false` | `true` 면 다른 앱을 봐도 펫이 남는다 (`Cmd/Ctrl + Alt + K`) |
| `clickThrough` | `false` | `true` 면 펫 위를 클릭해도 아래 터미널이 눌린다. 대신 드래그로 못 옮긴다 (`Cmd/Ctrl + Alt + P`) |
| `pos` | `fix` | `fix` 는 따라가는 창 안에만 둔다. `free` 는 화면 아무 데나 |
| `fps` | `7` | `sheet` 에서만 쓰는 프레임 속도 |

예전 설정의 `useGif: "off"` 는 `art: "sheet"` 로 읽는다.
`window` 항목은 드래그할 때 자동으로 저장되는 위치라 직접 적을 일이 없다.
그 밖의 값(따라갈 앱, 왕복 재생, 움직임 보정 등)은 손댈 일이 거의 없어 `config.js` 의 `INTERNAL` 에 두었다.
`art=sheet` 를 쓰려면 [codex-pokepets](https://github.com/dnnyngyen/codex-pokepets) 를 클론하고 `PKMON_SOURCE` 에 그 경로를 준다.

한 번만 다르게 쓰려면 위의 **명령줄 옵션**을 쓴다. 환경변수로도 같은 값을 줄 수 있다 —
둘 다 파일에는 저장되지 않는다.

```bash
pkmon gengar keep=on       # 이번만 항상 보이기
pkmon gengar art=sheet     # 이번만 스프라이트시트
pkmon gengar dot=3         # 이번만 크게
```

| 환경변수 | 대응 옵션 |
|---|---|
| `PKMON_SLUG` | `pkmon=` |
| `PKMON_POS` | `pos=` |
| `PKMON_ART` | `art=` |
| `PKMON_BUDDY` | `buddy=` |
| `PKMON_DOT_SIZE` | `dot=` |
| `PKMON_FPS` | `fps=` |
| `PKMON_KEEP_VISIBLE` | `keep=` |
| `PKMON_CLICK_THROUGH` | `click=` |
| `PKMON_DEBUG=1` | 판정 로그를 파일로 남긴다 (경로를 알려 준다) |

## 언제 보이고 언제 숨는가

펫은 자기 IDE 창에 붙어 있고, **그 위로 올라온 창에 겹친 부분만 가려진다.** 가림을 계산하지
않는다 — z-order 에 알맞게 꽂아 두고 OS 에 맡긴다.

자리는 두 가지로 갈린다.

| 내 창이 화면 맨 앞 | `alwaysOnTop(floating)` — 그 위에 있어야 할 창이 없다. 창을 클릭해도 묻히지 않는다 |
|---|---|
| 내 창이 뒤에 있음 | 일반 레벨 + `moveAbove(내 창)` — 내 창 **바로 위**에 꽂는다. 그 위의 창들이 자연히 가린다 |

두 번째가 핵심이다. `moveAbove("window:<창번호>:0")` 는 **다른 앱의 창 바로 위에** 우리 창을
꽂아 준다. mac 은 `CGWindowNumber`, Windows 는 `HWND` 를 쓴다.

어느 쪽인지는 확장 기록의 `focused` 하나로 정해진다. 그래서 창을 오갈 때 `winbounds` 를 다시
돌릴 필요가 없고, `fs.watch` 로 **12ms**(실측 중앙값) 만에 자리가 바뀐다.

> `moveTop()` 은 쓰면 안 된다. dock 을 숨긴 백그라운드 앱에서는 창을 활성 앱 **아래로**
> 밀어넣는다. 실측으로 재현했다.

표시 여부는 **터미널 탭**만 본다.

| 상황 | 결과 |
|---|---|
| 내 탭을 보고 있음 | 표시 |
| 같은 창의 다른 탭으로 이동 | 숨김 |
| **다른 IDE 창으로 이동** | **내 창에 그대로 남는다** — 겹친 부분만 가려진다 |
| 크롬 등 다른 앱으로 이동 | 그대로 남는다 — 겹치면 가려진다 |
| 내 창이 다른 Space·최소화 | 숨김 |

표시가 바뀌는 판정은 **두 번 연속 같게 나왔을 때만** 반영한다. 한 번의 경합이 깜빡임으로
보이지 않게 하기 위해서다. 다만 **확장이 알려 준 탭 전환은 경합이 아니라 확정 신호**라
디바운스를 건너뛰고 바로 반영한다 — 실측 14~16ms.

`Cmd+Alt+K`(항상 보이기)는 "숨기지 않는다"는 뜻이지 "맨 위에 띄운다"가 아니다.
내 창이 뒤에 있으면 그 위의 창에 여전히 가려진다.

### 어느 창을 따라가는가 — 앱 목록을 두지 않는다

펫은 **자기 프로세스의 조상에서 창 주인을 직접 찾는다.** 터미널을 띄운 프로그램이 무엇이든
내 셸의 조상이고, 그 프로세스가 창을 소유하기 때문이다. 그래서 지원 목록이 필요 없다.

```
셸 29321 → Code (pid 2108)
셸 62643 → cmux (pid 62628)
```

두 방향을 본다.

1. **창 주인이 내 조상** — VS Code·Cursor·Antigravity·cmux·Orca·iTerm2·Ghostty·Warp·
   Windows Terminal 등 대부분이 여기 해당한다
2. **창 주인이 내 조상의 자손** — Windows 고전 콘솔. `conhost.exe` 가 창을 갖는데 그건
   `cmd.exe` 의 *자식*이라 1번으로는 안 걸린다

둘 다 실패하는 경우(`tmux`·`screen`·원격 세션처럼 조상 관계가 끊길 때)에만 터미널 종류
(`TERM_PROGRAM` 등)에서 받은 앱 이름을 대비책으로 쓴다.

내 터미널이 **그 프로그램의 어느 창에 있는지**는 명령을 친 순간에 확정된다 — 그때 그 창이
화면 맨 앞이기 때문이다. 창 고유 ID 를 박아 두고 이후로는 그 ID 만 따라간다.

- mac 은 `helpers/winbounds`(Swift, `npm install` 때 자동 빌드)가 창 목록을 읽는다.
  **접근성 권한은 필요 없다.**
- Windows 는 `helpers/winbounds.ps1` 이 `EnumWindows` 로 창을 열거한다.
- `pos=fix`(기본)면 펫이 창 밖으로 나가지 않는다.
- 0.4초마다 창 위치를 읽어 오른쪽 아래 모서리에 붙인다. 창을 옮기거나 크기를 바꾸면 같이 움직인다.

### 지원 범위

| 기능 | 어디서 되는가 |
|---|---|
| 창을 따라다니기 · 겹침 처리 · 상태 반응 | **터미널을 띄우는 프로그램 전부** |
| 터미널 **탭** 단위 구분 | VS Code 계열만 (`vscode-extension` 설치 시) |

탭 구분이 VS Code 전용인 이유는 "지금 어느 탭을 보고 있는가"를 바깥에서 알 방법이 없기
때문이다. 확장이 없으면 창 단위로 동작한다 — 그 창에 있는 펫이 함께 나타났다 사라진다.

## 터미널 탭별로 보이기 (VS Code 계열)

터미널 탭마다 다른 펫을 띄우고, 그 탭을 보고 있을 때만 그 펫이 나타나게 할 수 있다.
`pkmon setup` 이 확장을 설치한다. 에디터 CLI 를 못 찾았다면 에디터의 확장 보기 → … → "VSIX 에서 설치" 로
패키지 안의 `vscode-extension/pkmon-active-terminal-*.vsix` 를 고른다. 설치 뒤 열려 있던 창은 다시 불러와야 한다.

```bash
# 1번 탭
pkmon pikachu
# 2번 탭
pkmon zapdos
```

확장은 **선택**이다. 없으면 탭 축이 꺼지고 창 단위로만 동작한다 — 그 창의 펫이 함께 보인다.
VS Code 가 아닌 프로그램에서는 애초에 탭을 구분할 방법이 없으므로 창 단위로만 동작한다.

터미널 번호는 조상 프로세스 체인으로 맞춘다. `tmux` 나 중첩 셸을 거쳐도 탭을 제대로 찾는다.

## Claude Code 상태 연동 (선택)

`pkmon setup` 이 훅을 설치·등록한다. 훅이 없으면 상태별 동작 없이 대기 동작과 buddy 만 돈다.

직접 등록하려면 `hooks/pkmon-state.cjs` 를 `~/.claude/scripts/hooks/` 에 복사하고,
`~/.claude/settings.json` 의 `hooks` 에 아래 7개 이벤트를 **병합**한다(이미 있는 이벤트 배열은 끝에 항목만 추가).
모든 항목의 내용은 같다.

```json
{
  "matcher": "",
  "hooks": [
    {
      "type": "command",
      "command": "node <홈 경로>/.claude/scripts/hooks/pkmon-state.cjs",
      "async": true,
      "timeout": 5
    }
  ]
}
```

| 이벤트 | 비고 |
|---|---|
| `SessionStart` · `Stop` · `StopFailure` | `matcher` 없이 |
| `UserPromptSubmit` | `matcher` 는 빈 문자열 |
| `PreToolUse` · `PermissionRequest` · `PostToolUseFailure` | `matcher` 는 `".*"` |

| Claude Code 상태 | 펫 상태 | PMD 동작 (앞에서부터 가진 것) |
|---|---|---|
| 세션 시작 · 응답 완료 | `waving` (6초·4초) → 대기 | `Pose` 한 번 · `Charge` · `Nod` |
| 프롬프트 입력 · 도구 실행 | `running` | `Walk`(옆모습) · `Hop` |
| 권한 확인 대기 | `waiting` | `Rotate` · `LookUp` · `Nod` |
| 도구 실패 · API 오류 | `failed` (6~10초) | `Faint`(쓰러진 채) · `Trip` · `Cringe` · `Hurt` |
| 그 밖 | `idle` | `Idle` |

동작이 적은 펫은 조용히 다음 후보로 내려가고, 끝까지 없으면 `Idle` 을 쓴다.

훅은 세션마다 `~/.claude/pkmon/state/<세션>.json` 에 상태를 남기고, 자기를 띄운 프로세스 조상
(훅 → claude → 터미널 셸)도 함께 적는다. 펫은 그 목록에 자기 터미널 셸 번호가 있는 기록만 따라가므로,
같은 프로젝트를 여러 터미널에서 열어도 섞이지 않는다.

훅은 마지막 프롬프트 시각(`promptAt`)도 이어서 적는다. buddy 가 "사용자가 마지막으로 뭔가 한 때"를
알아야 잠들 수 있어서다. 업데이트한 뒤에는 `pkmon setup` 을 다시 실행하면 훅 파일이 새 버전으로 바뀐다.

`art=showdown` 은 그림이 하나뿐이라 상태별 동작 구분이 없다.

### 상태에 따라 동작이 달라지는 방식

- `pmd` — 상태마다 **다른 동작 시트**를 재생한다. 프레임마다 길이가 다른 원본 타이밍(AnimData.xml)을 그대로 쓴다.
  한 번만 보여 줄 동작(`Pose`)은 끝나면 대기로 돌아가고, 쓰러짐(`Faint`)은 마지막 자세로 멈춰 있다.
- `sheet` — 9줄 격자에서 상태에 맞는 줄을 재생한다.
- `showdown` — 원본 GIF 한 장이라 상태와 무관하게 같은 그림이다.

## buddy — 돌아다니고, 졸고, 반응하기

`art=pmd` 일 때 기본으로 켜진다. 상태 표시기가 아니라 옆에 있는 친구처럼 보이게 하는 게 목적이다.

| 언제 | 무엇을 |
|---|---|
| 한가할 때 (Claude `idle`) | 가끔 창 안 아무 데로나 걷는다. 한 번에 260px 까지라 여러 번에 걸쳐 창 전체를 돌아다닌다 |
| 걷지 않을 때 | 가끔 두리번(`LookUp`·`Rotate`·`Nod`) |
| 입력 150초 없음 | 새로 움직이지 않는다 |
| 입력 180초 없음 | 그 자리에서 잔다 (`Sleep`) |
| 깨는 신호 | 프롬프트 전송 · 작업이 끝남 · 창/터미널 포커스 변화 · 펫을 만짐 · Claude 가 일을 시작함 |
| 집어 들 때 | 아파한다(`Hurt`) → 끄는 방향을 보며 버둥거린다 |
| 내려놓을 때 | 폴짝(`Hop`) · 끄덕(`Nod`) · `Pose` 중 가진 첫 것. 놓은 자리가 새 집이 된다 |
| 콕 누를 때 | `Nod`·`Pose`·`Hop`·`LookUp` 중 하나 (자고 있었으면 먼저 깬다) |
| Claude 가 일할 때 | 걷던 자리에 멈추고 상태 동작에 맡긴다. 그 사이 만지면 짧게 반응하고 돌아간다 |

빈도는 일부러 낮다. 한 번 움직인 뒤 최소 20초는 쉬고, 그 뒤 평균 2분쯤 지나 다음 행동을 한다(규칙적으로
보이지 않게 지수분포로 뽑는다). 최근에 사용자가 뭔가 했으면 조금 자주, 오래 조용했으면 더 드물게 움직인다.
숨었다 다시 보일 때도 20초는 가만히 있는다. 드래그로 놓은 자리는 집으로 기억되어, 다음에 띄울 때 거기서 시작한다.

- `buddy=calm` — 무작위 대기 시간 2.2배(최소 20초 쉬는 건 같다), 두리번도 절반
- `Hop` 은 칸이 커서 대부분의 펫에서 빠진다(아래 창 크기 참고) — 그럴 땐 다음 후보를 쓴다
- `buddy=off` — 제자리에서 상태 동작만
- 펫이 보이지 않을 때(다른 탭·다른 앱)는 돌아다니지 않는다. 자는 시계는 계속 간다
- 동작이 부족한 펫은 없는 반응을 조용히 건너뛴다. `Walk` 가 없으면 산책하지 않는다(순간이동은 안 한다)
- 창 크기는 모든 동작 중 가장 큰 칸으로 고정된다. 점프(`Hop`)처럼 칸이 큰 동작은 창을 키워 IDE 클릭을 막으므로 뺀다
- **클릭 통과(`click=on`)를 켜면 클릭이 아래로 가서 만지기 반응이 없다.** 옮길 수도 없다

판단은 `buddy/brain.js`(창·Electron 을 모르는 순수 로직), 메인에 붙이는 층은 `buddy/body.js` 에 있다.
시험할 때는 `PKMON_BUDDY_TIMESCALE=0.05` 로 시간을 20배 빠르게 돌릴 수 있다(9초 만에 잠든다).

## 그림에 대한 메모

실측해서 정한 동작들이라 근거를 남겨 둔다.

### PMD 를 기본으로 쓰는 이유

GIF 는 애니메이션이 하나라 상태를 그림으로 나눌 수 없다. CSS 로 누르거나 흔들어 흉내 내 봤지만 어색해서 뺐다.
PMDCollab 은 종마다 동작이 따로 있는 거의 유일한 오픈 스프라이트 모음이다(1025종 중 979종, 이브이 34종).

- `https://spriteserver.pmdcollab.org/assets/<도감4자리>/sprites.zip` 을 받아 `~/.claude/pkmon/pmd/` 에 캐시한다.
  풀지 않고 메모리에서 읽는다
- 스프라이트가 없는 종은 404 가 아니라 **200 + 빈 ZIP** 을 준다. 크기·내용을 검사해 캐시에 눌러앉지 않게 한다
- 저작자 목록(`credits.txt`)은 ZIP 에 없어 GitHub 에서 따로 받는다 — `pkmon status <펫>` 이 보여 준다
- 칸 크기가 동작마다 달라도 기준점이 `(칸너비/2, 칸높이/2+4)` 로 같아서, 고정 캔버스 가운데에 놓으면 발 위치가 맞는다

### 원본 GIF (art=showdown)

스프라이트시트는 8칸 격자에 맞추느라 원본을 6장으로 줄여서 사이클이 잘려 있다.

| 펫 | 원본 GIF | 스프라이트시트 |
|---|---|---|
| 썬더 3D | 30장 · 40ms 간격 · 루프 이어짐 | 6장 · 루프 끊김 |
| 팬텀 2D | 60장 | 6장 |
| 로토무-워시 2D | 88장 | 6장 |

주소는 3D 가 `sprites/ani/<이름>.gif`, 2D 가 `sprites/gen5ani/<슬러그>.gif` 다. 폼도 이름으로 구분된다.
처음 띄울 때 그 펫 GIF 하나만 받아 `~/.claude/pkmon/gifs/` 에 캐시하고, 이후에는 네트워크를 쓰지 않는다.
못 받으면(오프라인·404) 스프라이트시트로 넘어간다. 화질은 가장 좋지만 상태별 동작·buddy 는 없다.

### 도트 굵기 통일 (dotSize) — sheet

펫마다 원본 해상도가 다른데 스프라이트시트는 전부 비슷한 크기로 키워 넣어서, 같은 창에서도
도트 굵기가 최대 2배까지 차이 난다(팬텀 64px→2px, 이브이 33px→4px). `dotSize` 에 맞춰 펫마다
배율을 바꿔 굵기를 맞추고, 크기가 달라져도 어색하지 않게 바닥선을 맞춰 그린다.

대신 원본 해상도가 낮은 펫은 화면에서 작아진다. 도트 굵기와 몸집 비율은 동시에 맞출 수 없다.
원본 그대로 보려면 `dotSize` 를 `0` 으로 둔다.

### 왕복 재생 (pingPong)

3D 스프라이트시트는 올리는 동작만 담겨 있어 앞으로만 돌리면 날개를 들다가 처음으로 튄다.
연속 프레임은 6~7씩 변하는데 마지막 → 첫 프레임만 13.9로 튄다. 그래서 루프가 끊긴 스프라이트는
`0,1,2,3,4,5,4,3,2,1` 순서로 왕복 재생한다. 이름이 `-3d` 로 끝나면 왕복으로 확정하는데,
표본 15마리에서 3D 배수 중앙값 3.4(최소 2.0), 2D 1.6(최대 3.1)로 수치만으로는 갈리지 않기 때문이다.

### 움직임 보정 (motionAssist)

3D 스프라이트시트는 기다림·작업 중·검토 줄이 대기 줄과 완전히 같은 그림이라 상태를 표현하지 못한다.
그래서 펫 쪽에서 위아래 움직임을 더할 수 있게 해 두었지만, 이미 움직이는 스프라이트에 덧붙이면
어색해서 기본은 꺼 둔다(`off`). 거의 정지해 보이는 펫에만 `auto`·`on` 을 쓴다.

## 문제 확인

```bash
pkmon status
```

설정 값, 이 터미널의 프로세스 체인, 살아 있는 IDE 창 기록 전부, 탭 축 판정, 세션별 상태와 마지막 프롬프트,
"이 터미널 펫이 보여야 할 동작", PMD 캐시·저작자, 떠 있는 펫 수를 한 번에 보여 준다.
`pkmon status eevee` 처럼 펫 이름을 주면 그 펫의 PMD 저작자를 보여 준다. 훅이 덜 설치됐으면 그것도 알려 준다.
판정 로직은 펫과 **같은 코드**(`lib/state.js`)를 쓰므로 실제 동작과 어긋나지 않는다.

펫이 어느 창에 붙었는지까지 보려면 디버그 모드로 띄운다.

```bash
PKMON_DEBUG=1 pkmon eevee
```

로그 파일 경로를 알려 준다.

폴링마다 `{want, visible, tab, anchorId, target, head, state, pos, roam, driftMax}` 를 찍는다.
`tab` 이 `null` 이면 확장 기록을 못 찾은 것이다. `roam` 은 집에서 산책 나간 거리,
`driftMax` 는 창을 옮기라고 지시한 자리와 실제 자리의 최대 차이다 — 3 을 넘으면 드래그 판정이 흔들린다.
buddy 가 켜져 있으면 `{buddy: 단계, act: 동작/방향/방식, idleSec, roam}` 도 단계가 바뀔 때마다 찍는다.

## 배포 (관리자용)

```bash
npm pack          # mac 에서 — universal 헬퍼와 확장 vsix 를 빌드해 넣는다 (prepack)
npm install -g ./terminal-pkmon-<버전>.tgz   # 올리기 전에 이 파일로 설치해 확인
```

- **mac 에서 만든다.** 헬퍼는 Swift·lipo·codesign 이 필요해서 다른 OS 에서는 `npm pack` 이 멈춘다
- 게시 전 할 일: `package.json` 의 `"private": true` 제거(실수로 게시하지 않게 막아 둔 줄), 버전 올리기,
  Windows 실기에서 `pkmon setup` · `pkmon eevee` 확인
- 확장을 고쳤으면 `vscode-extension/package.json` 의 버전도 올린다 — `pkmon setup` 은 같은 버전도 덮어 설치하지만, 버전이 같으면 사용자가 어느 쪽인지 구분할 수 없다
- Electron 은 시험한 버전으로 고정해 두었다(`dependencies.electron`). 올릴 때는 펫 실행·드래그·산책을 다시 확인한다
- PMD 그림은 패키지에 들어가지 않는다(CC BY-NC). 받는 사람 컴퓨터에서 실행할 때 내려받는다

## 라이선스

코드는 MIT. 자세한 내용은 [LICENSE](LICENSE) 참고. 포켓몬 이미지는 이 저장소에 포함되어 있지 않다.

PMD 스프라이트는 [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) 기여자들의 작품이며
**CC BY-NC 4.0**(저작자 표시·비상업) 이다. MIT 와 섞일 수 없어 저장소에 넣지 않고, 실행할 때 사용자 컴퓨터로
받아 캐시만 한다. 펫별 저작자는 `pkmon status <펫>` 으로 확인한다. 이 도구로 만든 화면을 공유할 때는
저작자와 출처를 함께 밝힌다.
