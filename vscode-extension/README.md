# pokebuddy active terminal

VS Code 창마다 두 가지를 한다.

1. **창 기록** — 그 창의 터미널 상태를 **자기 파일 하나**에 적는다
2. **창 펫** — 창을 열 때 그 창의 pokebuddy 펫을 하나 띄운다 (0.3.0)

## 창 기록

```
~/.claude/pokebuddy/windows/<sessionId>-<확장호스트PID>.json
```

```json
{
  "v": 2,
  "windowId": "a1b303ee-…",
  "hostPid": 2108,
  "remote": null,
  "activeTerminal": 53796,
  "terminals": [53796, 61204],
  "focused": true,
  "at": 1789520000.0
}
```

| 항목 | 뜻 |
|---|---|
| `activeTerminal` | 지금 보고 있는 터미널의 셸 PID — 창 펫·동반자가 이 터미널의 에이전트 상태를 따른다 |
| `terminals` | 이 창에 열려 있는 터미널 전부. 세션 펫이 "내 창이 어느 것인가"를 찾는 데 쓴다 |
| `hostPid` | 확장 호스트 프로세스 번호. 펫이 "이 창이 아직 살아 있나"를 확인하고, 창 펫이 자기 창 기록을 찾는 데 쓴다 |
| `focused` | 이 창이 지금 포커스인가 — 동반자가 "맨 앞 창이 VS Code 인가"를 판정하는 근거 |

터미널 전환·열기·닫기, 창 포커스 변화 때 갱신하고, 그 사이에도 10초마다 다시 쓴다. 창을 닫으면 자기 파일을 지운다.
강제 종료돼 남은 기록은 다음 창이 켜질 때 청소한다(`hostPid` 가 죽었는지로 판단).

## 창 펫

창을 열면 그 창의 펫을 하나 띄운다. 펫은 그 창 위에만 보이고, 그 창의 활성 터미널에서 도는 CLI(claude·codex·gemini) 상태를 따른다.
창이 닫히면(확장 호스트 종료) 펫은 1초 안에 스스로 끝난다.

- **설정** `pokebuddy.autoLaunch` (기본 켬) — 끄면 자동으로 띄우지 않는다
- **명령 팔레트** `pokebuddy: 이 창에 펫 띄우기` · `pokebuddy: 이 창의 펫 내리기`
- 독립 동반자(`pokebuddy companion`)가 떠 있으면 띄우지 않는다 — 그 한 마리가 모든 창을 따른다. 동반자가 내려가면 10초 안에 창 펫을 되살린다
- 그림을 못 받아 곧바로 끝나는 펫을 무한 재기동하지 않게 자동으로는 3회까지만 띄운다. 명령으로 직접 띄우면 다시 센다

**띄우는 방법** — `pokebuddy` 명령을 부르지 않고 Electron 을 직접 띄운다. `pokebuddy setup` 이 적어 둔
`~/.claude/pokebuddy/cli.json`(`{ electron, project, version }`)의 경로를 쓴다. Dock 으로 띄운 VS Code 의 확장 호스트는
PATH 에 npm 전역 폴더가 없고 Node 버전도 다를 수 있어 명령 이름을 믿을 수 없다.
`project` 는 pokebuddy 패키지 폴더라 Electron 이 그 `package.json` 의 `main`(`dist/main/app.js`)을 연다 — git clone 으로 받았으면 `npm install`(빌드까지 한다) 또는 `npm run build` 가 먼저다.
환경변수 `POKEBUDDY_MODE=window` · `POKEBUDDY_HOST_PID`(이 확장 호스트) · `POKEBUDDY_ANCESTORS`(확장 호스트, 그 부모 = VS Code 메인)를 넘긴다.
펫은 저장(`~/.claude/pokebuddy/save.json`)의 파티를 그 창 크기의 투명한 무대 창 하나에 함께 그린다.
실행 파일이 없으면(Node 버전 관리자로 경로가 바뀜) 한 번 알린다 — `pokebuddy setup` 을 다시 돌리면 갱신된다.

## 이 확장이 하는 일과 하지 않는 일

확장은 **VS Code 안에서만 알 수 있는 것** — 어느 터미널 탭이 활성인가, 이 창이 포커스인가 — 만 알려주고, 이 창의 펫을 띄운다.
어느 창이 화면 맨 앞인지는 펫이 OS 에 직접 묻는다. 그건 파일로 주고받지 않는다.

이렇게 나눈 이유가 있다. "지금 어느 창이 앞인가"를 파일로 주고받으면, 창 하나가 크래시하면서
`focused: true` 인 기록을 남겼을 때 **다른 모든 창의 펫이 숨어 버린다.** OS 에 직접 물으면
그런 일이 없다.

`extensionKind: ["ui"]` — Remote-SSH·WSL·컨테이너에 붙어도 확장이 로컬에서 돈다.
원격에서 돌면 원격 홈에 파일을 써서 펫이 영영 못 읽는다. 원격 창의 터미널 pid 는 다른 컴퓨터 것이라 펫은 그 창에서 대기 동작만 한다.

## 설치

`pokebuddy setup` 이 설치한다. 직접 하려면:

```bash
node scripts/build-vsix.js
code --install-extension vscode-extension/pokebuddy-active-terminal-*.vsix
```

설치 후 명령 팔레트에서 `Developer: Reload Window` 를 실행해야 동작한다.
**창마다 확장이 따로 돌기 때문에, 열려 있는 VS Code 창을 전부 새로고침해야 한다.**

이 확장이 없어도 세션 펫은 동작한다. 탭 구분만 꺼지고, 창 단위로만 나타났다 사라진다.
