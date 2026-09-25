// 포켓몬 초상 — PokeAPI sprites 의 기본 그림(96 × 96 PNG)을 받아 캐시하고 화면에 data URI 로 준다
//
// 출처는 https://github.com/PokeAPI/sprites 다(저장소 CC0, 그림 저작권은 The Pokémon Company). 2026-09-25 사용자 지시로 PMD 초상에서 바꿨다.
// 저장소에는 넣지 않고 받는 사람 컴퓨터에 캐시한다 (docs/guide.md "관리 창의 초상").
// 경로: sprites/pokemon/<도감>.png, 이로치는 sprites/pokemon/shiny/<도감>.png. 이로치 그림이 없으면 보통 그림을 쓴다.
// 캐시: ~/.claude/pokebuddy/sprites/<4자리>.png · <4자리>-shiny.png. 못 받은 종은 이 프로세스가 끝날 때까지 다시 받지 않는다.
// 도구·알 그림(icons)도 같은 저장소에서 받는다: sprites/items/<식별자>.png, sprites/pokemon/egg.png. 없으면(404) 빈 칸이다.
// 설치 파일에는 그림이 미리 들어 있다(앱 안 sprites/ — scripts/fetch-sprites.cjs · build-exe.cjs). 그곳을 먼저 보고, 없으면 캐시·네트워크다.
// 관리 창·선택 창의 CSP 는 img-src data: 만 허용한다. 그래서 파일 경로가 아니라 data URI 로 준다
import fs from "node:fs";
import path from "node:path";
import { profile } from "../dex/species.js";

interface FetchModule {
  cached(file: string, url: string, validate?: (buf: Buffer) => boolean): Promise<{ buf: Buffer } | null>;
}
const { cached } = require("../../art/fetch.js") as FetchModule;

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const BASE = `${SPRITES}/pokemon`;
// 한 번에 받는 수 — 도감처럼 칸이 많아도 네트워크를 한꺼번에 쓰지 않는다
const PARALLEL = 4;

export interface PortraitAsk {
  slug: string;
  shiny: boolean;
}

// 초상 한 장의 이름 — 화면이 결과를 찾는 열쇠다
export const portraitKey = (a: PortraitAsk): string => (a.shiny ? `${a.slug}:shiny` : a.slug);

// 받을 주소 — 도감 번호 그대로(앞의 0 없음)
export const portraitUrl = (dex: number, shiny: boolean): string => (shiny ? `${BASE}/shiny/${dex}.png` : `${BASE}/${dex}.png`);

// 도구·알 그림의 열쇠 → 받을 주소. 열쇠는 "egg" 또는 "item:<식별자>" 다. 모르는 열쇠는 null
export function iconUrl(key: string): string | null {
  if (key === "egg") return `${BASE}/egg.png`;
  const m = /^item:([a-z0-9-]+)$/.exec(key);
  return m ? `${SPRITES}/items/${m[1]}.png` : null;
}

const isPng = (buf: Buffer): boolean => buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

export interface Portraits {
  get(asks: PortraitAsk[]): Promise<Record<string, string | null>>;
  icons(keys: string[]): Promise<Record<string, string | null>>; // 도구·알 그림 — iconUrl 의 열쇠
}

// dir 은 사용자 캐시, bundled 는 앱에 들어 있는 그림 폴더(없어도 된다). 두 폴더의 파일 이름은 같다
export function createPortraits(dir: string, bundled?: string): Portraits {
  const missing = new Set<string>(); // 못 받은 파일 — 다시 청하지 않는다
  const memo = new Map<string, string>(); // 이미 읽은 data URI
  let running = 0;
  const waiting: (() => void)[] = [];
  const slot = async <T>(job: () => Promise<T>): Promise<T> => {
    if (running >= PARALLEL) await new Promise<void>((r) => waiting.push(r));
    running++;
    try {
      return await job();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };

  // 파일 하나 — 앱에 든 그림, 캐시 순서로 읽고, 둘 다 없으면 받아 캐시에 둔다. rel 은 두 폴더 안의 이름이다
  async function fileUri(rel: string, url: string): Promise<string | null> {
    const file = path.join(dir, rel);
    const known = memo.get(file);
    if (known) return known;
    if (missing.has(file)) return null;
    if (bundled) {
      try {
        const buf = fs.readFileSync(path.join(bundled, rel));
        if (isPng(buf)) {
          const uri = `data:image/png;base64,${buf.toString("base64")}`;
          memo.set(file, uri);
          return uri;
        }
      } catch {
        // 앱에 없는 그림 — 캐시와 네트워크로 간다
      }
    }
    const got = await slot(() => cached(file, url, isPng));
    if (!got) {
      missing.add(file);
      return null;
    }
    const uri = `data:image/png;base64,${got.buf.toString("base64")}`;
    memo.set(file, uri);
    return uri;
  }

  const one = (dex: number, shiny: boolean): Promise<string | null> => {
    const d = String(dex).padStart(4, "0");
    return fileUri(shiny ? `${d}-shiny.png` : `${d}.png`, portraitUrl(dex, shiny));
  };

  return {
    async get(asks) {
      const out: Record<string, string | null> = {};
      await Promise.all(
        asks.map(async (a) => {
          const dex = profile(a.slug).dex;
          if (!dex) {
            out[portraitKey(a)] = null;
            return;
          }
          out[portraitKey(a)] = (a.shiny ? await one(dex, true) : null) ?? (await one(dex, false));
        }),
      );
      return out;
    },
    async icons(keys) {
      const out: Record<string, string | null> = {};
      await Promise.all(
        keys.map(async (key) => {
          const url = iconUrl(key);
          out[key] = url ? await fileUri(key === "egg" ? "egg.png" : `items/${key.slice(5)}.png`, url) : null;
        }),
      );
      return out;
    },
  };
}
