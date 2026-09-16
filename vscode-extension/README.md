# pkmon active terminal

VS Code 에서 **지금 보고 있는 터미널**의 셸 PID 를 `~/.claude/pkmon/active-terminal.json` 에 기록한다.
terminal_pokemon 의 펫이 이 값을 자기 터미널 번호와 비교해, 그 탭을 볼 때만 나타난다.

기록 형식:

```json
{
  "pid": 53796,
  "name": "zsh",
  "windowId": "1a2b3c...",
  "terminals": [53796, 61204],
  "focused": true,
  "at": 1789520000.0
}
```

| 항목 | 뜻 |
|---|---|
| `pid` | 지금 활성 터미널의 셸 PID |
| `terminals` | 이 창에 열려 있는 터미널 전부. 펫이 "내 창 기록인가"를 가리는 데 쓴다 |
| `windowId` | 창 구분용 식별자 |

- 터미널 전환·열기·닫기, 창 포커스 변화 때 갱신하고, 그 사이에도 30초마다 다시 쓴다.
  펫은 이 간격으로 "확장이 살아 있는지"를 판단한다(2분 넘게 멈추면 없는 것으로 본다).
- **창이 뒤로 가면 기록하지 않는다.** 지우면 펫을 드래그하는 동안 같은 터미널의 다른 펫이 사라지기 때문에,
  마지막 활성 터미널을 그대로 남겨 둔다.
- 창이 여러 개면 각 창의 확장이 같은 파일에 쓴다. 그래서 `terminals` 를 함께 남겨, 펫이 남의 창 기록에
  숨지 않도록 한다.
- 이 확장이 없어도 펫은 동작한다. 탭 구분만 꺼질 뿐이다.

## 설치

```bash
cd vscode-extension
npx @vscode/vsce package --allow-missing-repository
code --install-extension pkmon-active-terminal-*.vsix
```

설치 후 명령 팔레트에서 `Developer: Reload Window` 를 실행해야 동작한다.
**창마다 확장이 따로 돌기 때문에, 열려 있는 VS Code 창을 전부 새로고침해야 한다.**
