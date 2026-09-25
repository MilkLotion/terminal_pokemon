// S4 명령 진입. 게임 저장은 writer만 변경
import { PATHS } from "../main/paths";
import { send } from "../save/mailbox";
import type { Command, CommandName } from "../shared/types";

const allowed: CommandName[] = ["snapshot", "shop.buy", "evolve", "pet.look", "pet.set", "feed", "play", "party.show", "party.hide"];

export async function game(argv: string[]): Promise<void> {
  const [name = "snapshot", target, ...fields] = argv;
  if (name === "--help") {
    process.stdout.write('pokebuddy game <command> [pet-id|-] [key=value ... | JSON]\nCommands: snapshot, shop.buy, evolve, pet.look, pet.set, feed, play, party.show, party.hide\nExample: pokebuddy game shop.buy - item=slot\n');
    return;
  }
  try {
    if (!allowed.includes(name as CommandName)) throw new Error("Unknown command. Use pokebuddy game --help.");
    const args: unknown = fields.length === 1 && fields[0]!.startsWith("{") ? JSON.parse(fields[0]!) : Object.fromEntries(fields.map((field) => {
      const at = field.indexOf("=");
      if (at <= 0) throw new Error("Use key=value for each argument.");
      const key = field.slice(0, at), value = field.slice(at + 1);
      // 참·거짓과 숫자는 그 값으로 넘긴다 — `size=3` 은 3 이다
      return [key, value === "true" ? true : value === "false" ? false : /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value];
    }));
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Use a JSON object for arguments.");
    const command: Command = { cmd: name as CommandName, from: "cli", args: args as Record<string, unknown> };
    if (target && target !== "-") command.target = target;
    const result = await send(PATHS.mailbox, command);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 2;
  }
}
