# terminal_pokemon

터미널 위에 떠 있는 포켓몬 펫. 테두리 없는 투명 창이라 VS Code 터미널 위에 겹쳐 놓을 수 있다.
`claude`·`codex` 를 실행할 때 함께 뜨고, 명령이 끝나면 같이 사라진다. macOS · Windows 에서 동작한다.

```bash
claude pkmon=gengar          # 2D 도트 팬텀
claude pkmon=zapdos-3d       # 3D 썬더
claude pkmon=zapdos,pikachu  # 여러 마리
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

셸에 래퍼를 등록한다. mac/Linux 는 `~/.zshrc` 에 한 줄을 추가한다.

```bash
source <클론한 경로>/shell/pkmon.zsh
```

Windows 는 PowerShell 프로필(`$PROFILE`)에 dot-source 한다.

```powershell
. "<클론한 경로>/shell/pkmon.ps1"
```

래퍼는 자기 파일 위치에서 프로젝트 경로를 찾는다. 다른 곳을 가리키려면 `PKMON_HOME` 환경변수를 쓴다.

## 사용

```bash
claude pkmon=pikachu
codex pkmon=charizard-3d
claude pkmon=zapdos,pikachu   # 쉼표로 여러 마리 — 나란히 뜬다
claude pkmon=eevee pos=free   # 창 밖에도 둘 수 있게 (기본은 pos=fix)
claude                        # pkmon= 없으면 평소와 동일
```

- 펫을 드래그해 원하는 자리에 놓으면 위치가 기억된다.
- 여러 마리를 띄우면 겹치지 않게 옆으로 밀려서 배치된다.
- 래퍼 없이 직접 쓰려면 `bin/pkmon --pet pikachu -- <명령>`.

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

한 번만 다르게 쓰려면 환경변수를 쓴다 — 파일에는 저장되지 않는다.

```bash
PKMON_KEEP_VISIBLE=1 claude pkmon=gengar   # 이번만 항상 보이기
PKMON_USE_GIF=off claude pkmon=gengar      # 이번만 스프라이트시트
PKMON_DOT_SIZE=3 claude pkmon=gengar       # 이번만 크게
```

## 창 따라가기

펫은 자기를 띄운 터미널이 있는 창을 따라간다. 0.4초마다 창 위치를 읽어 오른쪽 아래 모서리에 붙이고,
창을 옮기거나 크기를 바꾸면 같이 움직인다. 다른 창이 앞에 나와도 끌려가지 않는다.

- mac 은 `helpers/winbounds`(Swift, `npm install` 때 자동 빌드)로 창 위치를 읽는다. **접근성 권한은 필요 없다.**
- Windows 는 `helpers/winbounds.ps1` 을 쓴다.
- `pos=fix`(기본)면 펫이 창 밖으로 나가지 않는다. 드래그로 밖에 놓아도 경계 안으로 되돌아온다.
- 헬퍼가 없으면 따라가기 없이 그냥 떠 있는 창으로 동작한다.

## 터미널 탭별로 보이기

터미널 탭마다 다른 펫을 띄우고, 그 탭을 보고 있을 때만 그 펫이 나타나게 할 수 있다.
`vscode-extension/` 의 확장이 지금 활성 터미널의 셸 PID 를 `~/.claude/pkmon/active-terminal.json` 에
기록하고(30초마다 갱신), 펫은 자기 터미널 번호와 비교한다. 설치는 `vscode-extension/README.md` 참고.

```bash
# 1번 탭
claude pkmon=pikachu
# 2번 탭
claude pkmon=zapdos
```

표시 규칙은 **탭이 우선**이다.

| 상황 | 결과 |
|---|---|
| 내 탭을 보고 있음 | 표시 |
| 같은 창의 다른 탭으로 이동 | 숨김 |
| 다른 앱(크롬 등)으로 이동 | 표시 유지 — 마지막으로 본 탭이 내 탭이므로 |
| 다른 VS Code 창으로 이동 | 자기 창에 그대로 남는다 |
| 확장이 없거나 기록이 2분 넘게 멈춤 | 앱 기준으로 판단 (`keepVisible` 이 꺼져 있으면 그 앱이 맨 앞일 때만 표시) |

확장을 설치하지 않으면 같은 창의 모든 펫이 동시에 보인다.

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
bin/pkmon-status
```

설정 파일 경로와 현재 값, 이 터미널의 셸 번호, 활성 터미널 기록, 세션별 상태,
"이 터미널 펫이 보여야 할 동작", 떠 있는 펫 수를 한 번에 보여 준다.

## 라이선스

MIT. 자세한 내용은 [LICENSE](LICENSE) 참고. 포켓몬 이미지는 이 저장소에 포함되어 있지 않다.
