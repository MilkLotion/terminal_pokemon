# pokebuddy 설명서

설치·명령·설정부터 동작 원리와 실측 근거까지 전부 담은 문서다. 요약은 [README](../README.md).

터미널 위에 떠 있는 포켓몬 펫. 테두리 없는 투명 창이라 VS Code 터미널 위에 겹쳐 놓을 수 있다.
일반 터미널에서 그대로, 또는 CLI LLM(Claude Code · Codex CLI · Gemini CLI …) 안에서 `!` 로 불러낸다. macOS · Windows 에서 동작한다.

```
pokebuddy eevee             # 일반 터미널 — 셸이 끝나면 사라진다
!pokebuddy eevee            # CLI LLM 입력창에서 — 그 CLI 가 끝나면 사라진다
!pokebuddy pikachu          # 더 띄우기 — 이 세션에 여러 마리
!pokebuddy eevee dot=3      # 떠 있는 펫 이름이면 그 펫만 바뀐다 (크게)
!pokebuddy stop             # 내리기 — 여러 마리면 골라서
pokebuddy companion eevee   # 동반자 — 세션에 묶이지 않고 맨 앞 터미널 창을 따른다. 항상 위 (아래 [동반자])
```

어디서 띄우든 펫은 창 안을 가끔 돌아다니고 두리번거리다가 5분 동안 아무 입력이 없으면 잠든다.
집어 들면 아파하고, 콕 찌르면 반응한다 — [buddy](#buddy--돌아다니고-졸고-반응하기).
**CLI LLM 안에서 띄우면** 거기에 더해 그 CLI 가 일하는 상태에 따라 동작이 바뀐다(작업 중 걷기 · 승인 대기 두리번 · 실패하면 쓰러짐 …) —
[CLI LLM 상태 연동](#cli-llm-상태-연동).

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
- 상태 연동을 쓰려면 Claude Code · Codex CLI 0.124 이상 · Gemini CLI 0.26 이상 중 하나. 탭별 표시를 쓰려면 VS Code 계열 에디터

## 설치

```bash
npm install -g pokebuddy
pokebuddy setup
```

(npm 에 게시하기 전에는 [배포](#배포-관리자용) 절에서 만든 `.tgz` 파일로 `npm install -g ./pokebuddy-<버전>.tgz`)

- `npm install` 이 Electron(약 100MB)까지 받는다. mac 창 추적 헬퍼는 패키지에 미리 빌드돼 있다(universal).
- `pokebuddy setup` 은 처음 한 번만 하면 된다. 하는 일:
  - 상태 훅 설치 — `~/.claude/scripts/hooks/pokebuddy-state.cjs` 를 복사하고, 쓰고 있는 CLI(설정 폴더가 있는 것)마다 등록한다.
    Claude Code `~/.claude/settings.json` · Gemini CLI `~/.gemini/settings.json` · Codex CLI `~/.codex/hooks.json`.
    **바꾸기 전에 백업을 남기고, 이미 있는 항목은 건드리지 않고, 여러 번 실행해도 결과가 같다.**
    CLI 를 나중에 설치했으면 `pokebuddy setup` 을 다시 실행한다
  - VS Code 계열 에디터(VS Code·Cursor·Windsurf·Antigravity…)에 확장 설치 — 탭 구분과 창마다 펫 띄우기. 에디터 CLI 를 PATH 나 앱 안에서 찾는다
  - 펫 데이터 폴더 `~/.claude/pokebuddy` 생성
  - 실행 경로 기록 `~/.claude/pokebuddy/cli.json` — 확장이 창마다 펫을 직접 띄우는 데 쓴다 (Node 버전 관리자로 경로가 바뀌면 setup 을 다시)
- 무엇을 바꿀지 먼저 보려면 `pokebuddy setup --dry-run`. 에디터 확장을 빼려면 `--no-editor`.

지우기:

```bash
pokebuddy uninstall            # 훅 등록·훅 파일·에디터 확장 제거 (설정·그림 캐시는 남김)
pokebuddy uninstall --purge    # ~/.claude/pokebuddy 까지
npm uninstall -g pokebuddy
```

### 옛 이름에서 옮겨 오기

예전 이름은 `termimon`, 그 전은 `pkmon`(패키지 `terminal-pkmon`)이다. npm 에 있는 `termimon` 패키지는 이름만 같은 다른 프로젝트(터미널 몬스터 배틀 게임)라 이름을 바꿨다.
새로 설치하고 `pokebuddy setup` 을 한 번 실행하면 두 이름의 흔적을 함께 정리한다.

| 옛 흔적 | setup 이 하는 일 |
|---|---|
| 데이터 폴더 `~/.claude/termimon` · `~/.claude/pkmon` | 설정·위치(`config.json`)와 그림 캐시(`pmd/`·`gifs/`)를 `~/.claude/pokebuddy` 로 가져온 뒤 옛 폴더를 지운다. 둘 다 있으면 항목마다 `termimon` 쪽을 먼저 쓴다. 새 폴더에 없는 것이 있으면 남긴다 |
| 훅 등록 `termimon-state.cjs` · `pkmon-state.cjs` | CLI 마다 옛 등록을 걷고 `pokebuddy-state.cjs` 로 다시 등록한다. 같은 묶음의 다른 훅은 남긴다 |
| 훅 파일 `~/.claude/scripts/hooks/` 의 위 두 파일 | 옛 등록을 다 걷었을 때만 지운다 |
| 에디터 확장 `local.termimon-active-terminal` · `local.pkmon-active-terminal` | 설치돼 있으면 제거한다. 열려 있는 창은 다시 불러와야 옛 확장이 멈춘다 |

- 데이터 폴더는 `setup` 전에 아무 `pokebuddy` 명령을 실행해도 먼저 가져온다. 옛 폴더를 지우는 것은 `setup` 만 한다
- 떠 있는 옛 펫이 있으면 Windows 에서 옛 폴더 일부(`electron/`)가 지워지지 않는다. 옛 펫을 내린 뒤 `setup` 을 다시 실행한다
- 환경변수는 `POKEBUDDY_*` 다. 옛 이름(`TERMIMON_*` · `PKMON_*`)은 읽지 않는다
- 옛 명령은 따로 지운다 — `.tgz` 로 설치한 `termimon` 은 `npm uninstall -g termimon`, `pkmon` 은 `npm uninstall -g terminal-pkmon`.
  git clone 이면 PATH 설정의 `shell/termimon.zsh` · `shell/pkmon.zsh` 를 `shell/pokebuddy.zsh` 로 고친다

### 저장소에서 바로 쓰기 (개발용)

```bash
git clone https://github.com/MilkLotion/terminal_pokemon.git
cd terminal_pokemon
npm install              # mac 은 Swift 컴파일러가 있으면 헬퍼를 이 컴퓨터용으로 빌드한다
bin/pokebuddy setup      # 탭 구분 확장 vsix 가 없으면 먼저 묶어서 설치한다 (Windows cmd 는 bin\pokebuddy.cmd setup)
```

`pokebuddy` 를 PATH 에 올린다. **CLI LLM 의 `!` 명령이 도는 셸에서 찾을 수 있어야 한다.**
claude 는 bash(Windows 는 Git Bash), codex · gemini 는 mac 에서 로그인 셸 · bash, Windows 에서 PowerShell 을 쓴다.

- mac — `~/.zshrc` 에 `source <클론한 경로>/shell/pokebuddy.zsh`
- Windows — Git Bash 용 `~/.bashrc` 에 `export PATH="<클론한 경로>/bin:$PATH"` (`C:\…` 대신 `/c/…` 로 적는다),
  PowerShell 용으로는 사용자 환경 변수 `Path` 에 `<클론한 경로>\bin` 을 더한다 (`bin/pokebuddy.ps1` · `bin/pokebuddy.cmd` 가 받는다).
  gemini 는 PowerShell 을 프로필 없이(`-NoProfile`) 띄우므로 프로필에 적은 PATH 는 보이지 않는다
- 스크립트 실행이 막힌 PowerShell 에서는 `pokebuddy.cmd eevee` 처럼 부른다
- PATH 없이 저장소 폴더에서 CLI 를 열었다면 `!node bin/pokebuddy eevee` 로도 된다

> **`claude`·`codex` 를 셸 함수로 덮지 않는다.**
> 남의 명령에 없는 문법을 얹는 것은 관례가 아니다 — `pyenv`·`conda` 는 기존 서브커맨드를
> 가로챌 뿐 문법을 늘리지 않고, `direnv`·`singularity` 는 환경변수를 쓴다.
> 덮어쓰면 프롬프트 토큰을 먹거나(`claude fix fps=30 bug` 에서 단어가 사라진다)
> 셸 스냅샷에서 깨진다. 펫은 CLI 안에서 `!pokebuddy` 로 따로 불러낸다.

## 사용

일반 터미널에서는 그대로 치고, CLI LLM 은 평소처럼 띄운 뒤 입력창에서 `!` 를 붙여 실행한다.

```
pokebuddy <펫> [이름=값 ...]
pokebuddy stop [펫 ...|all]
```

```
!pokebuddy pikachu                         # 이 세션에 펫
!pokebuddy eevee                           # 한 마리 더 — 옆자리에 나란히 뜬다
!pokebuddy zapdos+pikachu                  # 한 번에 여러 마리 (쉼표도 되지만 PowerShell 에서는 따옴표로 감싼다)
!pokebuddy eevee pos=free                  # 창 밖에도 둘 수 있게 (기본은 pos=fix)
!pokebuddy eevee dot=3                     # 크게 — PMD 는 도트가 작아 3~4 를 권한다
!pokebuddy eevee buddy=calm                # 덜 돌아다니게 (off 면 제자리)
!pokebuddy eevee art=showdown              # 원본 GIF — 화질 우선, 동작은 하나
!pokebuddy stop pikachu                    # 그 펫만 내리기 (여러 마리는 eevee+pikachu)
!pokebuddy stop all                        # 전부 내리기
pokebuddy stop                             # 여러 마리면 체크리스트로 고르기 (일반 터미널)
```

| 상황 | 결과 |
|---|---|
| 일반 터미널에서 `pokebuddy eevee` | 그 터미널 셸에 붙는다. 셸이 끝나면 사라진다. 기본 동작(산책·두리번·수면·만지기 반응)만 — 같은 터미널에서 나중에 CLI 를 켜도 그 상태는 따르지 않는다 |
| CLI LLM 안에서 `!pokebuddy eevee` | 그 CLI 세션에 붙는다. CLI 를 끝내면 1초 안에 사라진다. 기본 동작 + 그 CLI 의 상태에 반응 |
| 같은 세션에서 다른 펫 `pokebuddy pikachu` | 떠 있는 펫 옆에 더한다 |
| 같은 세션에서 떠 있는 펫 `pokebuddy eevee dot=3` | 그 펫만 내리고 같은 자리에 다시 띄운다 — 옵션만 바꿀 때 |
| 다른 터미널 탭·다른 CLI | 세션마다 따로다. 한쪽의 `stop`·바꾸기가 다른 쪽 펫을 건드리지 않는다 |

### 내리기

| 명령 | 결과 |
|---|---|
| `pokebuddy stop eevee` · `pokebuddy stop eevee+pikachu` | 그 펫만 |
| `pokebuddy stop all` | 이 세션의 펫 전부 |
| `pokebuddy stop` — 한 마리일 때 | 그 펫을 바로 내린다 |
| `pokebuddy stop` — 여러 마리일 때 | 일반 터미널이면 체크리스트가 뜬다. CLI 안의 `!` 명령이면 목록과 고르는 명령을 보여 준다 |

```
pokebuddy stop
---
> [x] eevee
  [ ] pikachu
  [ ] zapdos
---
>all  >selected  >close
↑↓ 이동 · space 선택 · ←→ 버튼 · enter 실행 · esc 닫기
```

`a` 는 all, `s` 는 selected 와 같다. CLI LLM 의 `!` 명령은 표준입력이 터미널이 아니라 키를 받을 수 없어서
(claude·codex 에서 확인) 체크리스트 대신 `!pokebuddy stop <이름>` · `!pokebuddy stop all` 을 안내한다.

명령은 펫 창이 뜰 때까지만 기다렸다가 `펫을 띄움: eevee` 한 줄을 남기고 돌아온다(보통 1초 안팎,
처음 받는 펫은 그림을 내려받느라 몇 초). 그림을 못 받는 등 뜨지 못하면 그 자리에서 이유를 알려 준다.
훅이 없는 CLI(훅 이전 버전의 codex 등)나 처음 보는 CLI 에서도 펫은 뜨고 그 CLI 와 함께 사라진다 — 상태 반응만 없다.
pokebuddy 는 명령을 감싸 실행하지 않는다 — 왜 그런지는 [펫은 언제 끝나는가](#펫은-언제-끝나는가).

Windows PowerShell 에서 `pokebuddy` 가 "이 시스템에서 스크립트를 실행할 수 없으므로" 로 막히면
npm 이 만든 `pokebuddy.ps1` 이 실행 정책에 걸린 것이다. `pokebuddy.cmd eevee` 처럼 부르거나,
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
| `POKEBUDDY_SLUG` | 펫 이름 |
| `POKEBUDDY_POS` | `pos=` |
| `POKEBUDDY_ART` | `art=` |
| `POKEBUDDY_BUDDY` | `buddy=` |
| `POKEBUDDY_DOT_SIZE` | `dot=` |
| `POKEBUDDY_FPS` | `fps=` |
| `POKEBUDDY_KEEP_VISIBLE` | `keep=` |
| `POKEBUDDY_CLICK_THROUGH` | `click=` |
| `POKEBUDDY_DEBUG=1` | 판정 로그를 파일로 남긴다 (경로를 알려 준다) |
| `POKEBUDDY_USE_GIF` | `gif=` (예전 옵션) |

- 펫을 드래그해 원하는 자리에 놓으면 위치가 기억된다. 펫마다 따로 기억한다. buddy 는 거기를 집으로 삼는다.
- 여러 마리를 띄우면 겹치지 않게 옆으로 밀려서 배치된다. 한 마리를 내린 빈자리에는 다음에 띄운 펫이 들어간다.
- 전역 단축키는 한 번에 한 펫만 잡을 수 있다(먼저 뜬 펫). 그 펫이 내려가면 남은 펫이 3초 안에 이어받는다.

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
비슷한 이름을 알려 준다. 나머지 펫은 그대로 뜬다.

## 설정

설정은 **`~/.claude/pokebuddy/config.json` 한 파일**이 전부다. 펫을 옮기거나 단축키로 값을 바꾸면 자동으로 생긴다.
프로그램 폴더가 아니라 홈에 두는 건, npm 으로 업데이트해도 위치·설정이 지워지지 않게 하려는 것이다.
(예전 버전이 프로그램 폴더에 두던 `pkmon.config.json` 은 처음 실행할 때 이리로 복사해 온다. 형식은 저장소의 `pokebuddy.config.example.json` 참고)
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
`art=sheet` 를 쓰려면 [codex-pokepets](https://github.com/dnnyngyen/codex-pokepets) 를 클론하고 `POKEBUDDY_SOURCE` 에 그 경로를 준다.

한 번만 다르게 쓰려면 위의 **명령줄 옵션**을 쓴다. 환경변수로도 같은 값을 줄 수 있다 —
둘 다 파일에는 저장되지 않는다.

```
!pokebuddy gengar keep=on      # 이번만 항상 보이기
!pokebuddy gengar art=sheet    # 이번만 스프라이트시트
!pokebuddy gengar dot=3        # 이번만 크게
```

| 환경변수 | 대응 옵션 |
|---|---|
| `POKEBUDDY_SLUG` | `pokebuddy=` |
| `POKEBUDDY_POS` | `pos=` |
| `POKEBUDDY_ART` | `art=` |
| `POKEBUDDY_BUDDY` | `buddy=` |
| `POKEBUDDY_DOT_SIZE` | `dot=` |
| `POKEBUDDY_FPS` | `fps=` |
| `POKEBUDDY_KEEP_VISIBLE` | `keep=` |
| `POKEBUDDY_CLICK_THROUGH` | `click=` |
| `POKEBUDDY_DEBUG=1` | 판정 로그를 파일로 남긴다 (경로를 알려 준다) |

## 펫은 언제 끝나는가

`pokebuddy eevee` 는 펫을 **따로 띄우고 곧바로 끝난다.** 펫을 끝내 줄 부모가 없으므로 펫이 스스로 본다.

| 끝나는 때 | 확인 방법 |
|---|---|
| 펫을 띄운 CLI 가 끝남 (CLI 안에서 띄운 경우) | 1초마다 그 프로세스가 살아 있는지 |
| 터미널 탭이 닫힘 · 셸이 끝남 (CLI 가 정리 못 하고 죽은 경우 포함) | 1초마다 터미널 셸이 살아 있는지 |
| `pokebuddy stop` · 같은 펫을 옵션만 바꿔 다시 띄움 | 자기 pid 파일이 사라졌는지 — 폴더 감시로 바로 안다 |
| `Cmd/Ctrl + Alt + Q` | 단축키 |

### 어느 프로세스가 세션인가 — 앱 목록을 두지 않는다

CLI LLM 은 `!` 명령을 셸로 돌린다. 그래서 pokebuddy 의 조상은 이렇게 생겼다.

```
claude  pokebuddy → bash → bash → bash → claude.exe → bash → bash → bash → Code.exe
codex   pokebuddy → powershell → codex.exe → node(codex.js) → powershell → Code.exe
gemini  pokebuddy → pwsh → node(gemini) → node(gemini) → bash → Code.exe
터미널  pokebuddy → bash → bash → bash → Code.exe
```

셸을 건너뛰고 **셸이 아닌 프로세스가 이어지는 구간**을 찾는다. **그 위에 다시 셸이 있으면** 그 구간이 세션이다 —
셸에서 띄운 프로그램이 셸을 거쳐 우리를 불렀다는 뜻이다. 구간은 여러 겹일 수 있다(codex 는 `node` 가 `codex.exe` 를 띄우고,
gemini 는 `node` 가 자기 자신을 다시 띄운다). 펫은 가장 바깥 것과 함께 산다.
위에 셸이 없으면(`Code.exe`·mac Terminal 의 `login`·Windows Terminal) 그건 터미널 프로그램 쪽이고,
셸에서 바로 `pokebuddy` 를 친 것이라 그 셸에 붙는다. 네이티브든 npm(`node`)이든, 처음 보는 CLI 든 같은 규칙으로 잡힌다.
터미널 탭의 셸은 탭 구분 확장 기록으로 바로잡는다(Git Bash 는 탭 하나가 `bash.exe` 여러 개로 보인다).

**Git Bash 에서는 Windows 쪽 부모 관계가 끊길 수 있다.** 셸 스크립트를 실행하면(npm 이 만든 `codex` 래퍼가 sh 스크립트다)
`node(codex.js) → sh.exe → (이미 끝난 중간 프로세스)` 가 되어 체인이 터미널 탭에 닿지 않는다. 그대로 두면 펫이 자기 탭을 몰라
**그 창의 모든 탭에서 보인다.** 그래서 두 겹으로 막는다.

1. 끊긴 곳이 Git Bash(MSYS) 프로세스면 옆의 `ps.exe` 로 MSYS 가 따로 기억하는 부모를 읽어 잇는다 —
   `node → sh.exe → bash(usr\bin) → bash(터미널 탭)`. 여러 번 끊겨도 잇는다(30ms 안팎, 끊겼을 때만)
2. 그래도 못 찾으면 명령을 친 순간 포커스된 VS Code 창의 활성 탭을 내 탭으로 잡는다 — 방금 `!pokebuddy` 를 친 곳이 그 탭이다

어느 쪽으로 잡았는지는 `pokebuddy status` 의 "이 터미널 셸 번호" 줄에 나온다.

펫은 부모(pokebuddy)가 곧바로 끝나서 자기 조상을 스스로 구할 수 없다 — Windows 는 부모 관계가 끊긴 채 남고,
mac 은 `launchd` 밑으로 옮겨진다. 그래서 pokebuddy 가 구한 조상 체인을 환경변수로 넘겨받는다.

- **죽이지 않고 pid 파일을 지운다.** `pokebuddy stop` 이 프로세스를 직접 죽이면 Windows 에서는 정리 없이 끊기고,
  이미 끝난 펫의 번호가 다른 프로세스에 재사용됐을 수도 있다. 파일은 `<임시 폴더>/pokebuddy-pets/<세션>-<pid>-<순번>-<펫 이름>.pid` — 이름은 `stop <이름>` 이, 순번은 옆자리 배치가 쓴다
- **같은 펫을 바꿀 때 옛 펫이 끝나길 기다린다.** 전역 단축키는 먼저 잡은 펫만 쓸 수 있어서, 옛 펫이 남아 있으면 새 펫이 단축키를 못 받는다.
  못 잡은 펫은 3초마다 다시 잡아 본다 — 쥐고 있던 펫이 내려가도 단축키가 사라지지 않는다
- **출력을 물려주지 않는다.** CLI 는 `!` 명령의 출력이 닫힐 때까지 기다리므로 펫이 출력을 잡고 있으면 입력창이 돌아오지 않는다.
  mac 은 새 세션(detached)으로 띄운다 — 같은 프로세스 그룹이면 CLI 쪽 신호에 같이 죽는다
- **Windows 는 PowerShell `Start-Process` 로 띄운다.** node 가 직접 띄우면(CreateProcess) 상속 가능한 핸들이 전부 넘어가서,
  pokebuddy 가 받은 출력 파이프까지 펫이 쥔다. codex 처럼 `!` 명령을 PowerShell 로 돌려 출력을 파이프로 받는 CLI 는
  펫이 끝날 때까지 명령이 안 끝난다(6초 사는 자식에 6.2초 실측). `Start-Process` 는 핸들을 넘기지 않는다(0.37초).
  디버그 로그도 그래서 펫이 직접 파일에 쓴다(`POKEBUDDY_LOG`)

> **명령을 감싸 띄우지 않는 이유.** 예전에는 `pokebuddy eevee` 가 claude 를 자식으로 띄웠다.
> 그러면 claude 의 부모가 터미널 셸이 아니라 pokebuddy(node)가 되는데, 그렇게 뜬 claude 는 화면이 달랐다 —
> 상태줄의 컬러 이모지가 `♦` 로 나오고 터미널 탭 제목이 바뀌지 않았다(Windows · VS Code 실측).
> claude 는 평소처럼 띄우고 펫만 옆에서 불러내면 claude 쪽은 아무것도 달라지지 않는다.

## 동반자 — 독립 실행과 VS Code 창

세션 펫(`pokebuddy <종>`·`!pokebuddy <종>`)은 자기를 띄운 세션에 묶여 살고 죽는다. **동반자는 세션에 묶이지 않는다** — 어느 터미널을 보든 그 창의 에이전트 상태를 따른다. 두 가지로 띄운다.

| 형태 | 띄우기 | 어디에 | 상태 | 끝나는 때 |
|---|---|---|---|---|
| 독립 실행 | `pokebuddy companion [<펫>] [옵션]` | **항상 위.** 맨 앞 창이 터미널 호스트면 그 창 오른쪽 아래, 아니면 마지막 자리에 그대로 | 맨 앞 창의 활성 터미널에서 도는 CLI | 트레이 · 우클릭 "동반자 내리기" · `pokebuddy companion stop` |
| VS Code 창 | 확장(0.3.0)이 창을 열 때 자동 (설정 `pokebuddy.autoLaunch`) | 그 창 위에만 — 세션 펫과 같은 z-order | 그 창의 활성 터미널에서 도는 CLI | 창 닫힘(확장 호스트 종료) · 명령 팔레트 "pokebuddy: 이 창의 펫 내리기" |

기존 세션 펫은 그대로다. 두 형태와 함께 떠도 서로 건드리지 않는다 — 기본 자리가 몸 너비만큼 어긋나고, 전역 단축키는 세션·창 펫 몫이다(동반자는 잡지 않는다).
펫 이름을 주지 않으면 설정의 `slug`. 옵션(`dot=` 등)은 세션 펫과 같고 이번 실행에만 적용된다.

### 무엇을 따르는가 — 매 폴링 다시 고른다

세션 펫은 기동 때 환경변수로 받은 pid(부른 CLI·터미널 셸)만 본다. 동반자는 0.4초마다 다시 고른다 (`lib/follow.js`).

1. 창 추적 헬퍼가 창 목록과 **맨 앞 앱의 pid**(`frontPid`)를 준다. 이름(`frontmost`)만으로는 펫끼리(전부 Electron) 가를 수 없어 pid 로 고른다. 펫 자신·다른 펫이면 맨 앞 창이 없는 것으로 친다. Windows 는 포그라운드 HWND(`frontId`)가 목록에 있으면 그 창
2. 그 창의 주인이 터미널 호스트인가 (`hostOf`)
   - **(a)** 포커스된 VS Code 창 기록이 있으면 → 그 창의 `activeTerminal`(활성 터미널 셸 pid)을 따른다. 원격 창(SSH·WSL)은 pid 가 다른 컴퓨터 것이라 붙기만 하고 대기
   - **(b)** 훅 기록 중 조상(`ancestors`)에 창 주인 pid 가 든 것이 있으면 → 그 앱(iTerm2 등)에서 CLI 를 띄운 적 있다. 창 주인 pid 를 따른다. 같은 앱의 여러 탭은 가르지 못해 최신 기록을 따른다
   - **(c)** 알려진 터미널 앱 이름(`KNOWN_TERMINAL_APPS`)이면 → 붙기만 하고 대기
   - **(d)** 아니면(브라우저 등) → 앵커와 따르던 pid 를 그대로 둔다. 펫은 마지막 자리에 남는다. 그 창이 목록에 없으면(다른 Space) 마지막 위치 그대로
3. 따르는 pid 를 조상으로 가진 **최신** 훅 기록의 상태가 펫 상태다 (`lib/state.js stateFor`). 조상을 못 적은 기록은 거른다 — "아무 기록에나 맞음"이 되면 남의 창 상태를 따른다

창 펫은 (a) 만 쓴다 — 확장이 넘긴 자기 확장 호스트 pid 로 창 기록을 찾고, 그 창의 `activeTerminal` 을 따른다. 창 주인·내 창 확정은 세션 펫과 같은 경로다(조상이 `[확장 호스트, VS Code 메인]` 이라 바로 맞는다). 탭 축은 보지 않는다 — 그 창의 어느 탭을 보든 펫은 있다.

터미널 호스트를 한 번도 못 본 독립 펫은 자기 디스플레이의 작업 영역 오른쪽 아래에 뜬다. 이때 옮긴 자리는 저장하지 않는다 — 진짜 창이 오면 창 기준 오프셋이어야 한다.
Windows 프로세스 표는 읽지 않는다 — 조상 체인은 훅이 세션 시작 때 적어 두었다.

### 수명과 충돌

- 독립 펫은 기기당 하나 — Electron 단일 인스턴스 잠금 + `~/.claude/pokebuddy/companion.lock`(`pid` 한 줄, 창을 만들면 `ready`). 확장·CLI 는 파일 존재가 아니라 안에 적힌 pid 의 생존으로 "떠 있나"를 판정한다(크래시가 남긴 lock 에 막히지 않게). `companion stop` 은 이 파일을 지우고, 펫은 그걸 보고 스스로 끝난다
- 창 펫은 `<임시 폴더>/pokebuddy-pets/w-<확장 호스트 pid>-<pid>.pid` 를 스스로 만든다. 확장 호스트가 끝나거나(1초), 창 기록이 사라지거나(2초), 이 파일이 지워지면 끝난다. 세션 펫 파일(숫자로 시작)과 모양이 달라 `pokebuddy stop` 목록에 섞이지 않는다
- 독립 펫이 뜨면 창 펫을 전부 내린다(`pokebuddy companion`). 확장은 독립 펫이 살아 있는 동안 창 펫을 띄우지 않고, 내려가면 10초 심장박동에서 되살린다
- Reload Window — 옛 확장 호스트가 죽어 옛 펫이 1초 안에 끝나고, 새 호스트가 자기 pid 로 새 펫을 띄운다. 키가 호스트 pid 라 경합이 없다(잠깐 두 마리가 겹칠 수 있다)
- 그림을 못 받아 곧바로 끝나는 펫(exit 3)을 무한 재기동하지 않게 확장은 호스트 수명 안에 3회까지만 자동으로 띄운다. 명령 팔레트로 직접 띄우면 다시 센다
- 집(자리)은 모드별로 기억한다 — `config.json` 의 `windows["companion:<종>"]` · `windows["w:<종>"]` · 세션 펫 `windows["<종>#<순번>"]`

### 확장이 펫을 띄우는 방법

확장은 `pokebuddy` 명령을 부르지 않고 **Electron 을 직접** 띄운다 — `pokebuddy setup` 이 적어 둔 `~/.claude/pokebuddy/cli.json`(`{ electron, project, version }`)의 경로로.
Dock 으로 띄운 VS Code 의 확장 호스트는 PATH 에 npm 전역 폴더가 없고 Node 버전도 다를 수 있어 명령 이름을 믿을 수 없다.
환경변수로 `POKEBUDDY_MODE=window`, `POKEBUDDY_HOST_PID`(확장 호스트), `POKEBUDDY_ANCESTORS`(확장 호스트와 그 부모 = VS Code 메인)를 넘긴다.
첫 창 기록을 쓴 뒤에 띄운다 — 펫은 뜨자마자 그 기록을 찾는다.
Node 버전 관리자로 경로가 바뀌어 실행 파일이 없으면 확장이 한 번 알린다 — `pokebuddy setup` 을 다시 돌리면 갱신된다.

### 게임 — 친밀도와 기분

동반자·창 펫은 친밀도가 쌓인다 (세션 펫은 게임을 모른다). 코어는 `game/` — 규칙 숫자는 전부 `game/economy.js` 의 `RULES` 한 곳에 있고 아직 자리표시자다.

- **첫 실행** — 저장(`~/.claude/pokebuddy/save.json`)이 없으면 포켓몬 선택 창이 뜬다(스타터 29종 — 세대별 3종 + 피카츄·이브이). 고르면 그 종으로 펫이 뜨고, 창을 닫으면 시작하지 않는다. `pokebuddy companion eevee` 처럼 이름을 주면 선택 창 없이 그 종으로 시작한다. 저장이 있으면 **저장된 종이 명령의 이름보다 먼저다**
- **친밀도 원천** (하루 총량 150 — 넘으면 기분만 오른다)

| 원천 | 양 | 제한 |
|---|---|---|
| 켜 두기 — 펫이 보이는 시간 | +1 / 10분 | 하루 30 |
| 일한 시간 — 에이전트가 `running` | +1 / 분 | 하루 60 |
| 턴 완료 — `waving` 으로 바뀔 때 | +2 | 하루 20회 |
| 밥 주기 (우클릭) | +15 | 4시간마다 |
| 놀아주기 (우클릭) | +10 | 2시간마다 |
| 콕 찌르기 (클릭) | +1 | 하루 10회 |

- **기분** 0~100, 시작 60 — 밥 +10 · 놀기 +5 · 방치 −1/시간(보이는 동안만) · 에이전트 실패 −5(시간당 −10 까지). 메뉴에는 숫자 대신 말(최고·좋음·보통·시들·우울). 친밀도는 절대 줄지 않는다
- **하루** — 날짜가 바뀌면 상한이 리셋된다. 어제 교감(밥·놀기·찌르기)했으면 연속(streak) +1, 오늘 첫 교감에 포인트 5×연속(상한 30). 포인트는 진화(다음 단계)까지 쓸 곳이 없다
- **단계** — 친밀도 500·1500 에서 진화 준비. 실제 진화는 다음 단계
- **저장을 쓰는 펫은 하나** — `save.lock` 을 먼저 잡은 펫이 쓴다. 독립 펫이 살아 있으면 창 펫은 잠금을 내준다(독립 펫 우선). 나머지 펫과 CLI 는 읽기 전용이고, 밥·놀기 같은 요청은 `mailbox/` 폴더에 파일로 넣어 쓰는 펫이 처리한다. 매 10초 시계로 쌓이는 시간은 값이 바뀔 때만 파일에 쓴다(10분·1분 단위)
- **토큰** — Claude Code 는 상태 훅이 턴 끝(`Stop`)마다 대화 기록(`transcript_path`)에서 새 응답의 토큰(입력·출력·캐시 읽기·캐시 쓰기)만 읽어 세션 기록에 누적한다(`usage` · `usageOffset`). 세션 시작(재개 포함) 시점의 크기를 기준으로 잡아 옛 대화는 세지 않고, 아직 쓰는 중인 마지막 줄은 다음에 읽는다. 펫은 증분만 본다(`src/agents/usage`). 2판(무대·성격)에서 이 토큰이 친밀도·포인트의 원천이 된다 — 지금 펫은 아직 시간으로 센다
- **시각은 전부 ms** (`Date.now()`). 저장 스키마는 `docs/design.md` 의 JSON 에 `daily.presence·work·turns` 와 누적기 `acc` 가 더 있다. 파손된 저장은 `.bak` 으로 옮기고 새로 시작한다 — 진행을 잃는 유일한 경로라 stderr 에 알린다
- **확인** — `pokebuddy status` 의 "게임" 줄(종·친밀도·기분·포인트·오늘·연속). 규칙 자체 확인은 `npm run selftest`(저장·도감·에이전트·옛 게임 코어 4벌)
- 밥·놀기의 연출(열매로 걸어가 먹기·커서 쫓기)은 아직 만졌을 때의 반응과 같다 [스펙 미확정]

### 트레이와 우클릭 메뉴

- 독립 펫은 트레이 아이콘을 하나 둔다 — 펫의 서 있는 그림 첫 프레임을 잘라 쓴다. 메뉴: 잠시 숨기기/다시 보이기 · 고스트 모드(마우스 클릭을 무시) · 설정 파일 열기 · 종료
- 모든 펫에 우클릭 메뉴가 있다(PMD 그림에 buddy 가 켜진 펫) — 이름 · 잠시 숨기기 · 종료. 끝내기는 어느 펫이든 "종료". 호칭(펫·동반자)은 메뉴에 쓰지 않고 동사만 쓴다. 고스트 모드는 설정 항목이라 우클릭에는 없다 — 켜면 우클릭이 안 되니 끌 수 없어서다. 설정창이 생기기 전까지는 트레이에, 트레이가 없는 펫은 단축키로
- 독립 펫의 고스트 모드(클릭 통과) 토글은 저장하지 않는다 — 전역 설정이라 세션 펫의 다음 실행까지 번진다. 모드별 설정은 설정창(다음 단계)에서

### 언어와 이름

- 화면 문구는 `lib/i18n/<언어>.json` 에서 키로 가져온다 (`lib/i18n.js t()`). 기본 한국어(`ko`), 영어(`en`). 언어는 `POKEBUDDY_LANG` → `config.json` 의 `lang` → `ko` 순. 없는 키는 한국어 → 키 이름으로 떨어져 화면이 비지 않는다
- 코어(game/)는 문구가 아니라 코드(`reason` · `nextAt`)를 돌려주고 문구는 UI 가 만든다 — 언어를 더할 때 코어를 건드리지 않게
- 포켓몬 이름은 `lib/names.json` — 슬러그(eevee · rotom-wash) → `{ ko, en }`. `npm run data:build`(`dist/tools/build-names.js`, 원본 `src/tools/build-names.ts`) 가 PokeAPI 의 CSV(종 이름표 + 폼 이름표)에서 한 번 뽑아 동봉한다. 폼 슬러그는 폼 이름표(워시로토무 · Wash Rotom), `-3d` 는 같은 종으로 본다. 표에 없는 이름은 슬러그 그대로
- CLI 의 안내문은 아직 한국어 그대로 — 터미널 쪽은 설정창 단계에서 같은 표로 옮긴다

### 제약

- Windows Git Bash 탭 — 훅의 조상 체인이 `sh.exe` 에서 끊겨 동반자·창 펫이 대기로 본다(세션 펫은 CLI pid 로 살았다). [스펙 미확정]
- 원격 창(SSH·WSL·컨테이너) — pid 를 대조할 수 없어 대기
- Windows 에서 포커스를 받지 않는 창의 우클릭 메뉴가 바로 닫힐 수 있다 — 그러면 트레이·단축키로. [확인 필요]
- 확인은 `pokebuddy status` 의 "동반자 · 창 펫 · 실행 경로 기록" 줄, 판정 로그는 `POKEBUDDY_DEBUG=1 pokebuddy companion` (`front` · `host` · `pids` 가 찍힌다)

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

Windows 는 조상을 **셸(`explorer`)에서 끊는다.** 시작 메뉴로 띄운 PowerShell 을 Windows Terminal 이 넘겨받으면
(Windows 11 기본) 셸의 조상에 터미널 창 주인이 없고 바로 `explorer` 가 나온다. 거기까지 보면 펫이 파일 탐색기나
바탕화면 창을 따라간다. 끊고 나면 위의 대비책으로 넘어간다 — 넘겨받은 셸에는 `WT_SESSION` 도 없으므로
명령을 친 순간 화면 맨 앞 창(그 터미널 창)을 따라간다.

내 터미널이 **그 프로그램의 어느 창에 있는지**는 명령을 친 순간에 확정된다 — 그때 그 창이
화면 맨 앞이기 때문이다. 창 고유 ID 를 박아 두고 이후로는 그 ID 만 따라간다.

- mac 은 `helpers/winbounds`(Swift, `npm install` 때 자동 빌드)가 창 목록을 읽는다.
  **접근성 권한은 필요 없다.**
- Windows 는 `helpers/winbounds.ps1` 이 `EnumWindows` 로 창을 열거한다.
  - 펫마다 PowerShell 을 **한 번 띄워 두고** 한 줄씩 묻는다(`-Serve`). 폴링마다 새로 띄우면 기동·C# 컴파일에
    수백 ms~수 초가 들어, 느린 컴퓨터에서는 타임아웃이 쌓여 펫이 숨는다. 띄워 두면 한 번에 1ms 안쪽이다
  - 잠든 UWP 앱·다른 가상 데스크톱의 창(cloaked)은 뺀다. 좌표는 보이지 않는 크기 조절 테두리를 뺀 실제 테두리다
  - 헬퍼 좌표는 물리 픽셀이라 Electron 좌표(DIP)로 바꿔 쓴다 — 배율 125%·150% 모니터에서도 창에 붙는다
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
`pokebuddy setup` 이 확장을 설치한다. 에디터 CLI 를 못 찾았다면 에디터의 확장 보기 → … → "VSIX 에서 설치" 로
패키지 안의 `vscode-extension/pokebuddy-active-terminal-*.vsix` 를 고른다. 설치 뒤 열려 있던 창은 다시 불러와야 한다.

```
# 1번 탭의 claude
!pokebuddy pikachu
# 2번 탭의 gemini
!pokebuddy zapdos
# 3번 탭 (일반 터미널)
pokebuddy eevee
```

확장은 **선택**이다. 없으면 탭 축이 꺼지고 창 단위로만 동작한다 — 그 창의 펫이 함께 보인다.
VS Code 가 아닌 프로그램에서는 애초에 탭을 구분할 방법이 없으므로 창 단위로만 동작한다.

터미널 번호는 조상 프로세스 체인으로 맞춘다. `tmux` 나 중첩 셸을 거쳐도 탭을 제대로 찾는다.

## CLI LLM 상태 연동

CLI LLM 안에서 `!pokebuddy` 로 띄우면, 그 CLI 의 훅이 알려 주는 상태에 따라 동작이 바뀐다.
`pokebuddy setup` 이 쓰고 있는 CLI 마다 훅을 등록한다. 훅이 없는 CLI 나 일반 터미널에서는 상태별 동작 없이 기본 동작(buddy)만 돈다.
훅 스크립트는 `src/hooks/pokebuddy-state.ts` 하나이고(빌드 → `dist/hooks/pokebuddy-state.js`, 설치 이름은 `pokebuddy-state.cjs`), CLI 마다 이벤트 이름만 다르다.

| 펫 상태 | Claude Code | Codex CLI (0.124+) | Gemini CLI (0.26+) | PMD 동작 (앞에서부터 가진 것) |
|---|---|---|---|---|
| `waving` (6초·4초) → 대기 | `SessionStart` · `Stop` | `SessionStart` · `Stop` | `SessionStart` · `AfterAgent` | `Pose`(2초 되풀이) · `Charge` · `Nod` |
| `running` | `UserPromptSubmit` · `PreToolUse` · `PostToolUse` · `PostToolUseFailure`(셸 명령의 0 아닌 종료 코드) | `UserPromptSubmit` · `PreToolUse` · `PostToolUse` | `BeforeAgent` · `AfterTool` | buddy 의 [작업 모드](#buddy--돌아다니고-졸고-반응하기). `buddy=off` 면 `Walk`(옆모습) · `Hop` |
| `waiting` | `PermissionRequest` · `PreToolUse`(`AskUserQuestion` · `ExitPlanMode`) | `PermissionRequest` | `Notification`(`ToolPermission`) | `Rotate` · `LookUp` · `Nod` |
| `failed` (6~10초) | `PostToolUseFailure`(그 밖) · `StopFailure` | `PostToolUse`(종료 코드·오류 표시가 있을 때) | `AfterTool`(`tool_response.error`) | `Faint`(쓰러진 채) · `Trip` · `Cringe` · `Hurt` |
| `idle` | 그 밖 · `PostToolUseFailure`(`is_interrupt` — Esc) | `Interrupt` · `SessionEnd` | `SessionEnd` | `Idle` |

동작이 적은 펫은 조용히 다음 후보로 내려가고, 끝까지 없으면 `Idle` 을 쓴다.

Claude Code 의 도구 실패(`PostToolUseFailure`)는 입력의 `error` · `is_interrupt` 로 가른다(실측).

- 셸 명령(Bash · PowerShell)이 0 아닌 코드로 끝나면 `error` 가 `Exit code N` 으로 시작한다. 검사 명령(`test` · `diff` 등)의
  흔한 결과라 작업이 이어지는 것으로 본다 — 실패로 치면 한 턴에 몇 번씩 쓰러져 진짜 실패가 묻힌다(최근 대화 74턴 중 53턴에 한 번 이상).
  grep 이 못 찾은 것(종료 코드 1)은 claude 가 실패로 알리지도 않는다
- `is_interrupt` 는 Esc 로 도구를 멈춘 것이다. 턴이 끝났는데 `Stop` 이 오지 않으므로 대기로 돌린다.
  도구가 돌지 않을 때(응답을 쓰는 중) Esc 를 누르면 알리는 이벤트가 없어, 작업 중이 10분 뒤에야 대기로 풀린다
- 승인한 도구가 끝나면 `PostToolUse` 가 작업 중으로 되돌린다. 없으면 긴 명령이 도는 내내 기다리는 것처럼 보인다

CLI 마다 다른 점:

| CLI | 등록 위치 | 알아 둘 것 |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | `async` 훅이라 claude 를 기다리게 하지 않는다 |
| Codex CLI | `~/.codex/hooks.json` | 훅은 0.124 부터. 0.129 이상은 새 훅을 codex 의 `/hooks` 에서 **한 번 승인해야 돈다**. 0.148 전에는 `async` 훅을 건너뛰어 동기로 등록한다 |
| Gemini CLI | `~/.gemini/settings.json` | 훅을 모두 기다린다(`async` 없음). Windows 에서 훅 한 번에 약 0.2초(PowerShell 기동 포함 실측) — 프롬프트·도구 한 번마다 그만큼 늦어진다. 그래서 도구 전·모델 호출 이벤트는 등록하지 않는다. `hooksConfig.enabled` 가 `false` 면 꺼진다 |

codex 의 API 오류로 끝난 턴, gemini 의 API 오류는 따로 알리는 이벤트가 없어 `failed` 로 보이지 않는다.

훅은 세션마다 `~/.claude/pokebuddy/state/<세션>.json` 에 상태를 남기고, 자기를 띄운 프로세스 조상
(훅 → CLI → 터미널 셸)도 함께 적는다. 펫은 **자기를 부른 CLI 가 조상에 있는 기록**만 따라가므로,
같은 프로젝트를 여러 터미널·여러 CLI 에서 열어도 섞이지 않는다.
셸에서 바로 띄운 펫은 상태 기록을 읽지 않는다 — 상태 반응은 CLI 안에서 `!pokebuddy` 로 띄운 펫만 한다.
Windows 는 조상을 구하는 데 PowerShell 을 띄워야 해서(수백 ms) 세션 시작 때 한 번 구하고 이후 이벤트는 이어 쓴다.
훅은 아무것도 출력하지 않는다 — claude 는 일부 훅의 출력을 대화에 넣고, gemini 는 출력을 훅 결과로 읽는다.

훅은 마지막 프롬프트 시각(`promptAt`)도 이어서 적는다. buddy 가 "사용자가 마지막으로 뭔가 한 때"를
알아야 잠들 수 있어서다. 업데이트한 뒤에는 `pokebuddy setup` 을 다시 실행하면 훅 파일이 새 버전으로 바뀐다.

`art=showdown` 은 그림이 하나뿐이라 상태별 동작 구분이 없다.

### 상태에 따라 동작이 달라지는 방식

- `pmd` — 상태마다 **다른 동작 시트**를 재생한다. 프레임마다 길이가 다른 원본 타이밍(AnimData.xml)을 그대로 쓴다.
  한 번만 보여 줄 동작(`Pose`)은 2초가 될 때까지 되풀이한 뒤 대기로 돌아가고(인사 한 번이 0.4초라 한 번만 틀면 못 본다),
  쓰러짐(`Faint`)은 마지막 자세로 멈춰 있다. 작업 중(`running`)은 buddy 가 동작을 고른다.
- `sheet` — 9줄 격자에서 상태에 맞는 줄을 재생한다.
- `showdown` — 원본 GIF 한 장이라 상태와 무관하게 같은 그림이다.

## buddy — 돌아다니고, 졸고, 반응하기

`art=pmd` 일 때 기본으로 켜진다. 상태 표시기가 아니라 옆에 있는 친구처럼 보이게 하는 게 목적이다.
**일반 터미널에서도, CLI LLM 안에서도 똑같이 돈다** — CLI 의 상태가 없으면 늘 한가한(`idle`) 것으로 본다.

두 모드로 움직인다. **작업 동작은 한가할 때 쓰지 않는다** — 보기만 해도 CLI 가 일하는 중인지 갈리게 하려는 것이다.

| | 한가 (CLI `idle` · 일반 터미널) | 작업 (CLI `running`) |
|---|---|---|
| 리듬 | 3~7초 걷고, 걸어온 쪽을 잠깐 돌아본 뒤 7~20초 쉰다 | 0.5~1.8초만 숨을 고르고, 걷기와 작업 동작을 이어 간다 |
| 걷기 | 속도 0.6~1.0배. 셋 중 한 번쯤은 서지 않고 방향을 튼다 | 속도 1.3~1.8배, 1.5~4초. 묶음마다 55% 확률로 먼저 걸어간다 |
| 제자리 동작 | 쉬는 동안 0~3번 — `LookUp` · `Rotate` · `Nod` · `Sit` · `DeepBreath` · 두리번 | 한 묶음에 1~3개 — 공격(`Attack` · `Strike` · `Swing` · `Shoot` · `Hop` …)은 한 번 내지르고 0.3~0.8초 서 있고, 부드러운 동작(`Charge` · `Pull` · `Twirl` · `Appeal` …)은 1.2~2.6초 반복한다 |
| 잠 | 입력 270초 없으면 새로 움직이지 않고, 300초면 잔다(`Sleep`) | 자지 않는다. 자고 있었으면 깨서 곧바로 움직인다 |

| 언제 | 무엇을 |
|---|---|
| 한가 → 작업 | 쉬던 것 · 둘러보던 것을 접고 곧바로 작업 동작을 한다. 걷던 중이면 도착한 뒤 이어 간다 |
| 작업 → 한가 | 작업 동작을 접고 쉰다 |
| 깨는 신호 | 창/터미널 포커스 변화 · 펫을 만짐 · (CLI 훅이 있으면) 프롬프트 전송 · 작업이 끝남 · CLI 가 일을 시작함 |
| 집어 들 때 | 아파한다(`Hurt`) → 끄는 방향을 보며 버둥거린다 |
| 내려놓을 때 | 폴짝(`Hop`) · 끄덕(`Nod`) · `Pose` 중 가진 첫 것. 놓은 자리가 새 집이 된다 |
| 콕 누를 때 | `Nod`·`Pose`·`Hop`·`LookUp` 중 하나 (자고 있었으면 먼저 깬다) |
| 만지기 반응의 `Hop` | 몸 칸에 들어가는 펫만 쓴다. 작업 동작으로만 담긴 동작은 반응에 쓰지 않는다 — 한가할 때 작업 동작이 보이지 않게 |
| 승인 대기 · 턴 끝 · 실패 | 알림이라 걷던 자리에 멈추고 상태 동작에 맡긴다. 그 사이 만지면 짧게 반응하고 돌아간다 |

일반 터미널에서는 타이핑을 알 방법이 없다 — 입력으로 치는 건 포커스 변화와 펫을 만진 것뿐이라, 한 터미널에서 계속
치고 있어도 5분이 지나면 잠든다.

걸을 때마다 속도를 새로 뽑고 걷는 그림도 그 속도로 재생한다. 제자리 동작은 방향과 길이를 바꿔 가며 한다
(작업 동작은 공격이 보이게 옆모습까지). 시간·속도·동작은 모두 범위 안에서 무작위로 뽑아 규칙적으로 보이지 않게 한다.
숨었다 다시 보일 때도 잠깐(한가 7초 · 작업 0.5초)은 가만히 있는다. 드래그로 놓은 자리는 집으로 기억되어, 다음에 띄울 때 거기서 시작한다.

작업 동작은 펫마다 가진 것이 다르다 — 피카츄는 `Attack` · `Swing` · `Shoot` · `Hop`(한 번) · `Charge` · `Pull`(반복),
썬더는 `Attack` · `Strike` · `Swing` · `Shoot` · `SpAttack` · `Hop`(한 번) · `Charge`(반복).
한가할 때 동작은 표본 50종 중 27종이 5개를 다 가졌고, 나머지 23종은 `Rotate` 와 두리번뿐이다.

PMD 공격 동작은 게임에서 한 번 쓰는 0.3초 안팎의 동작이라 프레임이 17~33ms 이고 캐릭터가 칸 안에서 크게 움직인다.
그대로 반복하면 떨리거나 갈라져 보여서, 19종의 시트를 재서 동작마다 재생 방식을 정했다(`art/pmd.js` `WORK_PLAY`).
같은 이름의 동작은 종이 달라도 거의 같게 나왔다.

| 동작 | 실측 (50ms 이하 프레임 사이 중심 이동) | 처리 |
|---|---|---|
| `Attack` · `Strike` · `Swing` · `Hop` · `Shoot` | 15~22px · 11~16px · 12px · 0~17px — 내지르고 제자리로 온다 | 한 번 재생하고 서 있기 |
| `Charge` · `Pull` · `Twirl` · `Appeal` · `TailWhip` | 0~3px (`Charge` 19종 · `Pull` 11종 모두) | 반복 |
| `Double` | 33ms 마다 좌우 두 자리(37px)를 번갈아 그린다 — 19종 모두. 반복하면 두 마리로 보였다 | 쓰지 않는다 |
| `Shock` | 번개 효과로 그림 면적이 2.2배를 오간다 — 도트가 흩어져 보인다 | 쓰지 않는다 |
| `QuickStrike` | 한 프레임에 27~56px 순간이동 | 쓰지 않는다 |
| `LeapForth` | 앞으로 뛰쳐나간 자세로 끝난다(끝이 시작에서 16~25px) — 제자리로 돌아올 때 튄다 | 쓰지 않는다 |
| `Emit` | 2종 중 1종이 떤다(좌우로 5번 뒤집힘) | 쓰지 않는다 |

- `buddy=calm` — 쉬는 시간 2.2배(한가 15~44초 · 작업 1.1~4초), 한가할 때 제자리 동작 확률 절반
- `buddy=off` — 제자리에서 상태 동작만. 작업 동작을 불러오지 않아 창도 커지지 않는다
- 펫이 보이지 않을 때(다른 탭·다른 앱)는 돌아다니지 않는다. 자는 시계는 계속 간다
- 동작이 부족한 펫은 없는 반응을 조용히 건너뛴다. `Walk` 가 없으면 산책하지 않는다(순간이동은 안 한다)
- **창은 몸보다 크다.** 공격 동작은 몸을 내밀어 칸이 크다(피카츄 `Idle` 40x56 · `Attack` 80x80 · `Swing` 80x96).
  상태 동작 칸의 2배까지 받는다 — 표본 50종에서 `Attack` 40종 · `Swing` 31종이 들어오고 창 면적은 중앙값 2.7배(최대 4배).
  1.5배로는 `Attack` 이 9종뿐이었다. 몸(작업 동작을 뺀 칸, 상태 동작의 1.25배까지)은 예전 창 크기 그대로이고,
  집 · 산책 범위 · 창 안에 가두기 · 저장하는 자리 · 여러 마리 간격은 모두 몸으로 계산한다 — 창이 커져도 펫이 서는 자리는 같다
- **그림이 없는 곳의 클릭은 아래 창으로 통과한다.** 커서가 창 위에 있으면 메인이 40ms 마다 렌더러에 자리를 묻고, 렌더러가
  그 둘레 3px 안에 투명하지 않은 픽셀이 있는지 답한다. 통과 중에는 마우스 이벤트가 오지 않고, 펫이 걷거나 그림이 바뀌어
  커서 밑이 달라져도 이벤트는 생기지 않아서 메인이 주기적으로 묻는다. 누르고 · 들고 있는 동안은 통과로 바꾸지 않는다 — 떼기가 아래 창으로 가서 들린 채 남는다
- **클릭 통과(`click=on`)를 켜면 그림 위 클릭도 아래로 가서 만지기 반응이 없다.** 옮길 수도 없다
- Windows 는 `backgroundThrottling` 을 켜 둔다. 끄면 렌더러가 숨김 상태로 가지 않아, 창을 숨길 때 내려간 입력용 자식 창
  (`Chrome_RenderWidgetHostHWND`)이 다시 보일 때 올라오지 않는다. 누르기가 부모 창에 떨어지고, 포커스를 받지 않는 창
  (`focusable: false`)이라 Chromium 이 누르기를 버려 떼기만 온다 — 탭을 한 번 옮기면 잡기·클릭이 안 되던 원인이다(최소 시험 창으로 재현).
  켜 두면 숨은 동안만 타이머가 초당 1회로 느려지고, 다시 보이면 곧바로 제 속도로 돈다

판단은 `buddy/brain.js`(창·Electron 을 모르는 순수 로직), 메인에 붙이는 층은 `buddy/body.js` 에 있다.
시험할 때는 `POKEBUDDY_BUDDY_TIMESCALE=0.05` 로 시간을 20배 빠르게 돌릴 수 있다(15초 만에 잠든다).

## 그림에 대한 메모

실측해서 정한 동작들이라 근거를 남겨 둔다.

### PMD 를 기본으로 쓰는 이유

GIF 는 애니메이션이 하나라 상태를 그림으로 나눌 수 없다. CSS 로 누르거나 흔들어 흉내 내 봤지만 어색해서 뺐다.
PMDCollab 은 종마다 동작이 따로 있는 거의 유일한 오픈 스프라이트 모음이다(1025종 중 979종, 이브이 34종).

- `https://spriteserver.pmdcollab.org/assets/<도감4자리>/sprites.zip` 을 받아 `~/.claude/pokebuddy/pmd/` 에 캐시한다.
  풀지 않고 메모리에서 읽는다
- 스프라이트가 없는 종은 404 가 아니라 **200 + 빈 ZIP** 을 준다. 크기·내용을 검사해 캐시에 눌러앉지 않게 한다
- 저작자 목록(`credits.txt`)은 ZIP 에 없어 GitHub 에서 따로 받는다 — `pokebuddy status <펫>` 이 보여 준다
- 칸 크기가 동작마다 달라도 기준점이 `(칸너비/2, 칸높이/2+4)` 로 같아서, 고정 캔버스 가운데에 놓으면 발 위치가 맞는다

### 원본 GIF (art=showdown)

스프라이트시트는 8칸 격자에 맞추느라 원본을 6장으로 줄여서 사이클이 잘려 있다.

| 펫 | 원본 GIF | 스프라이트시트 |
|---|---|---|
| 썬더 3D | 30장 · 40ms 간격 · 루프 이어짐 | 6장 · 루프 끊김 |
| 팬텀 2D | 60장 | 6장 |
| 로토무-워시 2D | 88장 | 6장 |

주소는 3D 가 `sprites/ani/<이름>.gif`, 2D 가 `sprites/gen5ani/<슬러그>.gif` 다. 폼도 이름으로 구분된다.
처음 띄울 때 그 펫 GIF 하나만 받아 `~/.claude/pokebuddy/gifs/` 에 캐시하고, 이후에는 네트워크를 쓰지 않는다.
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

```
!pokebuddy status
```

펫을 띄운 곳(CLI 안이면 `!` 로, 일반 터미널이면 그대로)에서 실행해야 그 세션이 잡힌다. 설정 값, CLI 별 훅 등록 상태,
이 터미널의 프로세스 체인과 펫이 따라 사는 세션, 살아 있는 IDE 창 기록 전부, 탭 축 판정, 세션별 상태(어느 CLI 기록인지)와
마지막 프롬프트, "이 세션 펫이 보여야 할 동작", PMD 캐시·저작자, 떠 있는 펫 수를 한 번에 보여 준다.
`pokebuddy status eevee` 처럼 펫 이름을 주면 그 펫의 PMD 저작자를 보여 준다.
판정 로직은 펫과 **같은 코드**(`lib/state.js`)를 쓰므로 실제 동작과 어긋나지 않는다.

펫이 어느 창에 붙었는지까지 보려면 디버그 모드로 띄운다.

```
!POKEBUDDY_DEBUG=1 pokebuddy eevee               # bash · zsh (claude, mac 의 codex·gemini)
!$env:POKEBUDDY_DEBUG=1; pokebuddy eevee         # PowerShell (Windows 의 codex·gemini)
```

로그 파일 경로를 알려 준다.

폴링마다 `{want, visible, tab, anchorId, target, head, state, pos, roam, driftMax}` 를 찍는다.
`tab` 이 `null` 이면 확장 기록을 못 찾은 것이다. `roam` 은 집에서 산책 나간 거리,
`driftMax` 는 창을 옮기라고 지시한 자리와 실제 자리의 최대 차이다 — 3 을 넘으면 드래그 판정이 흔들린다.
buddy 가 켜져 있으면 `{buddy: 단계, rhythm: idle|work, act: 동작/방향/방식, idleSec, roam}` 도 단계나 동작이 바뀔 때마다 찍고,
그림 밖 클릭 통과가 바뀔 때마다 `{passing: true|false}` 를 찍는다.

## 배포 (관리자용)

```bash
npm pack          # mac 에서 — universal 헬퍼와 확장 vsix 를 빌드해 넣는다 (prepack)
npm install -g ./pokebuddy-<버전>.tgz   # 올리기 전에 이 파일로 설치해 확인
```

- **mac 에서 만든다.** 헬퍼는 Swift·lipo·codesign 이 필요해서 다른 OS 에서는 `npm pack` 이 멈춘다
- `.ps1` 파일(`helpers/winbounds.ps1` · `bin/pokebuddy.ps1`)은 **UTF-8 BOM 을 유지한다.** Windows PowerShell 5.1 은
  BOM 없는 스크립트를 시스템 코드 페이지(한국어 Windows 는 CP949)로 읽어, 한국어 주석이 줄바꿈을 삼키고
  다음 코드 줄이 주석이 된다. 헬퍼는 C# 컴파일이 실패해 창 목록이 비고 펫이 뜨지 않는다
- 게시 전 할 일: `package.json` 의 `"private": true` 제거(실수로 게시하지 않게 막아 둔 줄), 버전 올리기,
  Windows 실기에서 `pokebuddy setup` · 일반 터미널의 `pokebuddy eevee` · claude·codex·gemini 안의 `!pokebuddy eevee` · `!pokebuddy stop` · 일반 터미널의 `pokebuddy stop` 체크리스트 확인
- 확장을 고쳤으면 `vscode-extension/package.json` 의 버전도 올린다 — `pokebuddy setup` 은 같은 버전도 덮어 설치하지만, 버전이 같으면 사용자가 어느 쪽인지 구분할 수 없다
- Electron 은 시험한 버전으로 고정해 두었다(`dependencies.electron`). 올릴 때는 펫 실행·드래그·산책을 다시 확인한다
- PMD 그림은 패키지에 들어가지 않는다(CC BY-NC). 받는 사람 컴퓨터에서 실행할 때 내려받는다

## 라이선스

코드는 MIT. 자세한 내용은 [LICENSE](../LICENSE) 참고. 포켓몬 이미지는 이 저장소에 포함되어 있지 않다.

PMD 스프라이트는 [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab) 기여자들의 작품이며
**CC BY-NC 4.0**(저작자 표시·비상업) 이다. MIT 와 섞일 수 없어 저장소에 넣지 않고, 실행할 때 사용자 컴퓨터로
받아 캐시만 한다. 펫별 저작자는 `pokebuddy status <펫>` 으로 확인한다. 이 도구로 만든 화면을 공유할 때는
저작자와 출처를 함께 밝힌다.
