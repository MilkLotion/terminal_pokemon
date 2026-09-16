// 활성 터미널의 셸 PID 를 ~/.claude/pkmon/active-terminal.json 에 기록
// pkmon 펫이 이 값을 자기 터미널 번호와 비교해, 그 탭을 보고 있을 때만 나타난다
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PKMON_DIR = path.join(os.homedir(), ".claude", "pkmon");
const ACTIVE_FILE = path.join(PKMON_DIR, "active-terminal.json");

async function writeActive(terminal) {
  try {
    // 포커스 없는 창은 기록하지 않는다 — 마지막 활성 터미널을 그대로 남겨 둔다.
    // 지워 버리면 펫을 드래그하는 동안(=VS Code 가 뒤로 감) 같은 터미널의 다른 펫이 사라진다.
    if (!vscode.window.state.focused) return;

    fs.mkdirSync(PKMON_DIR, { recursive: true });
    const pid = terminal ? await terminal.processId : null;
    // 이 창에 열린 터미널 전부 — 펫이 "이 기록이 내 창 것인가"를 가리는 데 쓴다
    // (창이 여러 개면 각 창의 확장이 같은 파일에 쓰므로, 남의 창 기록에 숨지 않으려면 필요하다)
    const terminals = (
      await Promise.all(vscode.window.terminals.map((t) => Promise.resolve(t.processId).catch(() => null)))
    ).filter((p) => typeof p === "number");
    const payload = {
      pid: pid ?? null,
      name: terminal?.name ?? "",
      windowId: vscode.env.sessionId,
      terminals,
      focused: true,
      at: Date.now() / 1000,
    };
    const tmp = `${ACTIVE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, ACTIVE_FILE);
  } catch {
    // 기록 실패는 무시 — 펫은 기존 동작(항상 표시)으로 돌아감
  }
}

function activate(context) {
  writeActive(vscode.window.activeTerminal);
  // 30초마다 다시 기록 — 펫 쪽에서 "기록이 멈췄다 = 확장이 없다"를 구분할 수 있게 한다
  const heartbeat = setInterval(() => writeActive(vscode.window.activeTerminal), 30_000);
  context.subscriptions.push(
    { dispose: () => clearInterval(heartbeat) },
    vscode.window.onDidChangeActiveTerminal((t) => writeActive(t)),
    vscode.window.onDidOpenTerminal(() => writeActive(vscode.window.activeTerminal)),
    vscode.window.onDidCloseTerminal(() => writeActive(vscode.window.activeTerminal)),
    vscode.window.onDidChangeWindowState(() => writeActive(vscode.window.activeTerminal)),
  );
}

function deactivate() {
  writeActive(undefined);
}

module.exports = { activate, deactivate };
