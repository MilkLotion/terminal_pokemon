# pkmon active terminal

VS Code 창마다 **자기 파일 하나**에 그 창의 터미널 상태를 기록한다.

```
~/.claude/pkmon/windows/<sessionId>-<확장호스트PID>.json
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
| `activeTerminal` | 지금 보고 있는 터미널의 셸 PID |
| `terminals` | 이 창에 열려 있는 터미널 전부. 펫이 "내 창이 어느 것인가"를 찾는 데 쓴다 |
| `hostPid` | 확장 호스트 프로세스 번호. 펫이 "이 창이 아직 살아 있나"를 이걸로 확인한다 |
| `focused` | 이 창이 지금 포커스인가 |

## 이 확장이 하는 일과 하지 않는 일

확장은 **VS Code 안에서만 알 수 있는 것** — 어느 터미널 탭이 활성인가 — 만 알려준다.
어느 창이 화면 맨 앞인지는 펫이 OS 에 직접 묻는다. 그건 파일로 주고받지 않는다.

이렇게 나눈 이유가 있다. "지금 어느 창이 앞인가"를 파일로 주고받으면, 창 하나가 크래시하면서
`focused: true` 인 기록을 남겼을 때 **다른 모든 창의 펫이 숨어 버린다.** OS 에 직접 물으면
그런 일이 없다.

## 이전 버전과 달라진 점

- **창마다 파일이 따로다.** 예전에는 모든 창이 `active-terminal.json` 하나에 써서, 마지막에 쓴
  창의 내용만 남았다.
- **포커스가 없어도 기록한다.** 예전에는 포커스 없는 창이 아무것도 쓰지 않아서, 펫이
  "다른 IDE 창이 앞이다"와 "크롬이 앞이고 내 창은 뒤에 있다"를 구분할 수 없었다.
- **창을 닫으면 자기 파일을 지운다.** 강제 종료돼 남은 기록은 다음 창이 켜질 때 청소한다
  (`hostPid` 가 죽었는지로 판단).
- **`extensionKind: ["ui"]`** — Remote-SSH·WSL·컨테이너에 붙어도 확장이 로컬에서 돈다.
  원격에서 돌면 원격 홈에 파일을 써서 펫이 영영 못 읽는다.

## 기록 시점

터미널 전환·열기·닫기, 창 포커스 변화 때 갱신하고, 그 사이에도 10초마다 다시 쓴다.

## 설치

```bash
cd vscode-extension
npx @vscode/vsce package --allow-missing-repository
code --install-extension pkmon-active-terminal-*.vsix
```

설치 후 명령 팔레트에서 `Developer: Reload Window` 를 실행해야 동작한다.
**창마다 확장이 따로 돌기 때문에, 열려 있는 VS Code 창을 전부 새로고침해야 한다.**

이 확장이 없어도 펫은 동작한다. 탭 구분만 꺼지고, 창 단위로만 나타났다 사라진다.
