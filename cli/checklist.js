// 터미널 체크리스트 — 항목을 골라 all · selected · close 중 하나로 끝낸다 (pokebuddy stop)
//
//   pokebuddy stop
//   ---
//   > [x] eevee
//     [ ] pikachu
//   ---
//   >all  >selected  >close
//
//   ↑↓ 이동 · space 선택 · ←→ 버튼 · enter 실행 · a 전부 · s 선택한 것 · esc·q 닫기
//
// 키 입력을 받을 수 있는 터미널(TTY)에서만 쓴다 — CLI LLM 의 ! 명령은 표준입력이 터미널이 아니다.
// 입출력 스트림을 받으므로 가짜 스트림에 키를 흘려 시험할 수 있다
const readline = require("readline");

const BUTTONS = ["all", "selected", "close"];
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const invert = (text) => `\x1b[7m${text}\x1b[27m`;
const dim = (text) => `\x1b[2m${text}\x1b[22m`;

// items 는 보여 줄 이름들. 반환: Promise<고른 항목의 번호(0부터) 배열> — close·esc·Ctrl+C 면 빈 배열
function checklist({ title, items, input = process.stdin, output = process.stdout }) {
  return new Promise((resolve) => {
    const checked = new Set();
    let row = 0; // 0 ~ items.length-1 은 항목, items.length 는 버튼 줄
    let button = 0;
    let note = "";
    let drawn = 0; // 지난번에 그린 줄 수 — 그만큼 올라가 다시 그린다

    const draw = () => {
      const lines = [title, "---"];
      items.forEach((item, i) => {
        const line = `${row === i ? ">" : " "} [${checked.has(i) ? "x" : " "}] ${item}`;
        lines.push(row === i ? invert(line) : line);
      });
      lines.push("---");
      lines.push(BUTTONS.map((label, i) => (row === items.length && button === i ? invert(`>${label}`) : `>${label}`)).join("  "));
      lines.push(dim("↑↓ 이동 · space 선택 · ←→ 버튼 · enter 실행 · esc 닫기") + (note ? `  ${note}` : ""));
      // 맨 윗줄로 올라가 그 아래를 지우고 다시 쓴다
      output.write(`${drawn ? `\x1b[${drawn}A` : ""}\r\x1b[J${lines.join("\n")}\n`);
      drawn = lines.length;
    };

    const finish = (picked) => {
      input.removeListener("keypress", onKey);
      if (typeof input.setRawMode === "function") input.setRawMode(false);
      input.pause();
      output.write(SHOW_CURSOR);
      resolve(picked);
    };

    const press = (label) => {
      if (label === "all") return finish(items.map((_, i) => i));
      if (label === "close") return finish([]);
      if (!checked.size) {
        note = "선택한 것이 없음 — space 로 고른다";
        return draw();
      }
      return finish([...checked].sort((a, b) => a - b));
    };

    function onKey(str, key = {}) {
      note = "";
      const onButtons = row === items.length;
      if (key.ctrl && key.name === "c") return finish([]);
      switch (key.name) {
        case "up":
        case "k":
          row = Math.max(0, row - 1);
          break;
        case "down":
        case "j":
          row = Math.min(items.length, row + 1);
          break;
        case "left":
          if (onButtons) button = Math.max(0, button - 1);
          break;
        case "right":
        case "tab":
          if (onButtons) button = Math.min(BUTTONS.length - 1, button + 1);
          else row = items.length; // 항목에서 → 는 버튼 줄로
          break;
        case "space":
        case "return":
        case "enter":
          if (onButtons) return press(BUTTONS[button]);
          if (checked.has(row)) checked.delete(row);
          else checked.add(row);
          break;
        case "a":
          return press("all");
        case "s":
          return press("selected");
        case "q":
        case "escape":
          return finish([]);
        default:
          return undefined; // 모르는 키는 다시 그리지 않는다
      }
      return draw();
    }

    readline.emitKeypressEvents(input);
    if (typeof input.setRawMode === "function") input.setRawMode(true);
    input.on("keypress", onKey);
    input.resume();
    output.write(HIDE_CURSOR);
    draw();
  });
}

module.exports = { checklist };
