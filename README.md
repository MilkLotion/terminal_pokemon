# terminal_pokemon

터미널 위에 떠 있는 포켓몬 펫. 테두리 없는 투명 창이라 VS Code 터미널 위에 겹쳐 놓을 수 있다.
명령을 실행하는 동안 함께 뜨고, 명령이 끝나면 같이 사라진다. macOS · Windows 에서 동작한다.

```bash
pkmon gengar            # 2D 도트 팬텀 — 명령을 생략하면 claude
pkmon zapdos-3d         # 3D 썬더
pkmon zapdos,pikachu    # 여러 마리
pkmon eevee -- codex    # 다른 명령을 감쌀 때
```

포켓몬 이미지는 이 저장소에 없다. 실행할 때 [Pokémon Showdown](https://play.pokemonshowdown.com/sprites/) 의
원본 애니메이션 GIF 를 한 번 내려받아 캐시하고, 없으면 [codex-pokepets](https://github.com/dnnyngyen/codex-pokepets)
스프라이트시트를 읽는다. 이미지 권리는 Nintendo / Game Freak / Creatures Inc. 에 있으며 개인·비상업 팬 용도로만 쓴다.

## 요구사항

- Node.js 18 이상 (내장 `fetch` 사용)
- macOS 또는 Windows
- (선택) [codex-pokepets](https://github.com/dnnyngyen/codex-pokepets) 클론 — GIF 를 못 받을 때의 대체 그림

## 설치

```bash
git clone https://github.com/MilkLotion/terminal_pokemon.git
cd terminal_pokemon
npm install
```

`npm install` 때 macOS 용 창 위치 헬퍼(Swift)가 자동으로 빌드된다. Swift 컴파일러가 없으면 이 단계만 건너뛴다.

`pkmon` 을 PATH 에 올린다. mac/Linux 는 `~/.zshrc` 에 한 줄을 넣거나,

```bash
source <클론한 경로>/shell/pkmon.zsh
```

심링크를 걸어도 된다.

```bash
ln -s <클론한 경로>/bin/pkmon ~/.local/bin/pkmon
```

Windows 는 `bin/pkmon.ps1` 을 쓴다. PowerShell 프로필(`$PROFILE`)에 한 줄:

```powershell
$env:PATH = "<클론한 경로>\bin;$env:PATH"
```

`pkmon` 은 자기 파일 위치에서 프로젝트 경로를 찾는다(심링크도 따라간다).
다른 곳을 가리키려면 `PKMON_HOME` 환경변수를 쓴다.

> **`claude`·`codex` 를 셸 함수로 덮지 않는다.**
> 남의 명령에 없는 문법을 얹는 것은 관례가 아니다 — `pyenv`·`conda` 는 기존 서브커맨드를
> 가로챌 뿐 문법을 늘리지 않고, `direnv`·`singularity` 는 환경변수를 쓴다.
> 덮어쓰면 프롬프트 토큰을 먹거나(`claude fix fps=30 bug` 에서 단어가 사라진다)
> 셸 스냅샷에서 깨진다. `pkmon` 은 `env(1)`·`nice(1)`·`timeout(1)` 과 같은 별도 명령이다.

## 사용

```
pkmon <펫> [이름=값 ...] [-- <명령> [인자 ...]]
```

```bash
pkmon pikachu                          # 명령을 생략하면 claude
pkmon charizard-3d -- codex
pkmon zapdos,pikachu                   # 쉼표로 여러 마리 — 나란히 뜬다
pkmon eevee pos=free                   # 창 밖에도 둘 수 있게 (기본은 pos=fix)
pkmon eevee gif=off                    # 스프라이트시트 — 상태마다 진짜 동작이 따로 있다
pkmon eevee -- claude -p "고쳐줘"       # 대상 명령의 인자는 '--' 뒤에
```

인자 경계는 `env(1)`·`nice(1)`·`timeout(1)` 과 같다 — **우리 옵션은 앞에, 대상 명령은 `--` 뒤에.**
`--` 뒤는 한 글자도 건드리지 않고 그대로 넘긴다.

```
env    FOO=1        cmd args
nice   -n 10        cmd args
pkmon  eevee gif=off -- cmd args
```

### 옵션

| 옵션 | 값 | 뜻 |
|---|---|---|
| (첫 인자) | 펫 이름 | 쉼표로 여러 마리. `--pet <이름>` 으로도 준다 |
| `pos=` | `fix`(기본) · `free` | 따라가는 창 안에 가둘지 |
| `gif=` | `auto`(기본) · `off` | `off` 면 스프라이트시트 — 상태별 동작 9종 |
| `dot=` | 숫자 | 도트 한 칸을 몇 px 로 볼지 (펫 크기) |
| `fps=` | 숫자 | 스프라이트시트 모드 재생 속도 |
| `keep=` | `on` · `off` | 다른 앱을 봐도 숨지 않기 |
| `click=` | `on` · `off` | 펫 위 클릭을 아래 터미널로 통과 |

`이름=값` 과 `--이름 값` 둘 다 받는다. `on`/`off` 자리에는 `true`/`false`, `1`/`0`, `yes`/`no` 도 쓸 수 있다.
**이번 실행에만 적용되고 설정 파일에는 저장되지 않는다.**

환경변수로도 같은 값을 줄 수 있다 — 스크립트나 CI 에서 편하다.

| 환경변수 | 대응 옵션 |
|---|---|
| `PKMON_SLUG` | 펫 이름 |
| `PKMON_POS` | `pos=` |
| `PKMON_USE_GIF` | `gif=` |
| `PKMON_DOT_SIZE` | `dot=` |
| `PKMON_FPS` | `fps=` |
| `PKMON_KEEP_VISIBLE` | `keep=` |
| `PKMON_CLICK_THROUGH` | `click=` |
| `PKMON_DEBUG=1` | 판정 로그를 파일로 남긴다 (경로를 알려 준다) |

- 펫을 드래그해 원하는 자리에 놓으면 위치가 기억된다. 펫마다 따로 기억한다.
- 여러 마리를 띄우면 겹치지 않게 옆으로 밀려서 배치된다.

| 단축키 | 동작 |
|---|---|
| `Cmd/Ctrl + Alt + P` | 클릭 통과 — 펫 위를 눌러도 아래 터미널이 조작된다 |
| `Cmd/Ctrl + Alt + K` | 항상 보이기 |
| `Cmd/Ctrl + Alt + H` | 숨기기·보이기 |
| `Cmd/Ctrl + Alt + Q` | 종료 |

### 펫 이름

[codex-pokepets 의 `pets/` 폴더명](https://github.com/dnnyngyen/codex-pokepets/tree/main/pets)을 쓴다.

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

설정은 **`pkmon.config.json` 한 파일**이 전부다. `pkmon.config.example.json` 을 복사해 쓴다.
기본값과 경로도 전부 `config.js` 한 곳에 있고, `main.js`·`bin/pkmon`·`bin/pkmon-status` 가 모두 그것을 참고한다.

| 항목 | 기본 | 설명 |
|---|---|---|
| `slug` | `pikachu` | 펫 이름 |
| `dotSize` | `2` | 도트 한 칸을 몇 px 로 볼지 — 펫 크기를 좌우한다. `0` 이면 원본 그대로 |
| `useGif` | `auto` | 원본 GIF 재생. `off` 면 스프라이트시트 |
| `keepVisible` | `false` | `true` 면 다른 앱을 봐도 펫이 남는다 (`Cmd/Ctrl + Alt + K`) |
| `clickThrough` | `false` | `true` 면 펫 위를 클릭해도 아래 터미널이 눌린다. 대신 드래그로 못 옮긴다 (`Cmd/Ctrl + Alt + P`) |
| `pos` | `fix` | `fix` 는 따라가는 창 안에만 둔다. `free` 는 화면 아무 데나 |
| `fps` | `7` | 스프라이트시트 모드에서만 쓰는 프레임 속도 |

`window` 항목은 드래그할 때 자동으로 저장되는 위치라 직접 적을 일이 없다.
그 밖의 값(스프라이트 저장소 경로, 따라갈 앱, 왕복 재생, 움직임 보정 등)은 손댈 일이 거의 없어
`config.js` 의 `INTERNAL` 에 두었다.

한 번만 다르게 쓰려면 위의 **명령줄 옵션**을 쓴다. 환경변수로도 같은 값을 줄 수 있다 —
둘 다 파일에는 저장되지 않는다.

```bash
pkmon gengar keep=on       # 이번만 항상 보이기
pkmon gengar gif=off       # 이번만 스프라이트시트
pkmon gengar dot=3         # 이번만 크게
```

| 환경변수 | 대응 옵션 |
|---|---|
| `PKMON_SLUG` | `pkmon=` |
| `PKMON_POS` | `pos=` |
| `PKMON_USE_GIF` | `gif=` |
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
설치는 `vscode-extension/README.md` 참고.

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

`hooks/pkmon-state.cjs` 를 설치하고 훅으로 등록하면 작업 상태에 따라 동작이 바뀐다.
훅이 없으면 대기 동작만 반복한다.

```bash
mkdir -p ~/.claude/scripts/hooks
cp hooks/pkmon-state.cjs ~/.claude/scripts/hooks/
```

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

| Claude Code 상태 | 펫 동작 |
|---|---|
| 세션 시작 | 손 흔들기 (6초) → 대기 |
| 프롬프트 입력 · 도구 실행 | 작업 중 |
| 권한 확인 대기 | 기다림 |
| 도구 실패 · API 오류 | 실패 (6~10초) |
| 응답 완료 | 손 흔들기 (4초) → 대기 |

훅은 세션마다 `~/.claude/pkmon/state/<세션>.json` 에 상태를 남기고, 자기를 띄운 프로세스 조상
(훅 → claude → 터미널 셸)도 함께 적는다. 펫은 그 목록에 자기 터미널 셸 번호가 있는 기록만 따라가므로,
같은 프로젝트를 여러 터미널에서 열어도 섞이지 않는다.

**GIF 모드에서는 그림이 하나뿐이라 상태별 동작 구분이 없다.** 상태에 따라 그림이 바뀌길 원하면
`useGif` 를 `off` 로 두고 스프라이트시트를 쓴다.

### 상태에 따라 동작이 달라지는 방식

스프라이트시트 모드는 상태마다 **진짜 그림**이 따로 있다(9줄 격자에서 줄을 바꿔 재생한다).

원본 GIF 모드는 애니메이션이 하나뿐이라 그림으로는 상태를 나눌 수 없다. 그래서 GIF 위에
CSS 동작을 얹는다.

| 상태 | 동작 |
|---|---|
| `idle` | 없음 |
| `running` | 위아래로 가볍게 눌렸다 펴짐 |
| `waiting` | 천천히 밝아졌다 어두워짐 (입력 대기라 눈에 띄어야 한다) |
| `waving` | 좌우로 짧게 눌림 |
| `failed` | 빠르게 떨림 + 붉은 톤 |
| `review` | 느리게 좌우로 눌림 + 밝기 변화 |

창이 그림 크기에 딱 맞아서 **넘치는 변형은 잘린다.** 그래서 위치를 옮기지 않고 줄이는 방향과
밝기만 쓴다.

## 그림에 대한 메모

실측해서 정한 동작들이라 근거를 남겨 둔다.

### 원본 GIF 를 기본으로 쓰는 이유

스프라이트시트는 8칸 격자에 맞추느라 원본을 6장으로 줄여서 사이클이 잘려 있다.

| 펫 | 원본 GIF | 스프라이트시트 |
|---|---|---|
| 썬더 3D | 30장 · 40ms 간격 · 루프 이어짐 | 6장 · 루프 끊김 |
| 팬텀 2D | 60장 | 6장 |
| 로토무-워시 2D | 88장 | 6장 |

주소는 3D 가 `sprites/ani/<이름>.gif`, 2D 가 `sprites/gen5ani/<슬러그>.gif` 다. 폼도 이름으로 구분된다.
처음 띄울 때 그 펫 GIF 하나만 받아 `~/.claude/pkmon/gifs/` 에 캐시하고, 이후에는 네트워크를 쓰지 않는다.
못 받으면(오프라인·404) 스프라이트시트로 넘어간다.

### 도트 굵기 통일 (dotSize)

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
pkmon-status
```

설정 값, 이 터미널의 프로세스 체인, 살아 있는 IDE 창 기록 전부, 탭 축 판정, 세션별 상태,
"이 터미널 펫이 보여야 할 동작", 떠 있는 펫 수를 한 번에 보여 준다.
판정 로직은 펫과 **같은 코드**(`lib/state.js`)를 쓰므로 실제 동작과 어긋나지 않는다.

펫이 어느 창에 붙었는지까지 보려면 디버그 모드로 띄운다.

```bash
PKMON_DEBUG=1 pkmon eevee
```

로그 파일 경로를 알려 준다.

폴링마다 `{want, visible, tab, front, anchorId, head}` 를 찍는다. `tab` 이 `null` 이면 확장
기록을 못 찾은 것이고, `front` 가 `false` 면 다른 창이 앞에 있다는 뜻이다.

## 라이선스

MIT. 자세한 내용은 [LICENSE](LICENSE) 참고. 포켓몬 이미지는 이 저장소에 포함되어 있지 않다.
