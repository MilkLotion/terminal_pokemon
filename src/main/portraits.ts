// 포켓몬 초상 — PokeAPI sprites 의 기본 그림(96 × 96 PNG)을 받아 캐시하고 화면에 data URI 로 준다
//
// 출처는 https://github.com/PokeAPI/sprites 다(저장소 CC0, 그림 저작권은 The Pokémon Company). 2026-09-25 사용자 지시로 PMD 초상에서 바꿨다.
// 저장소에는 넣지 않고 받는 사람 컴퓨터에 캐시한다 (docs/guide.md "관리 창의 초상").
// 경로: sprites/pokemon/<도감>.png, 이로치는 sprites/pokemon/shiny/<도감>.png. 이로치 그림이 없으면 보통 그림을 쓴다.
// 캐시: ~/.claude/pokebuddy/sprites/<4자리>.png · <4자리>-shiny.png. 못 받은 종은 이 프로세스가 끝날 때까지 다시 받지 않는다.
// 도구·알 그림(icons)도 같은 저장소에서 받는다: sprites/items/<식별자>.png, sprites/pokemon/egg.png. 없으면(404) 빈 칸이다.
// 설치 파일에는 그림을 넣지 않는다 — 그림 저작권은 The Pokémon Company 에 있어 공개 릴리스로 재배포하지 않는다(2026-09-26 사용자 결정).
// 대신 동반자가 켜질 때 빠진 그림을 뒤에서 모두 받아 캐시에 둔다(prefetch). 첫 실행이면 첫 포켓몬을 고르는 동안 받는다.
// 앱 안 sprites/ 가 있으면(저장소 실행의 .cache/sprites) 그곳을 먼저 본다.
// 관리 창·선택 창의 CSP 는 img-src data: 만 허용한다. 그래서 파일 경로가 아니라 data URI 로 준다
import fs from "node:fs";
import path from "node:path";
import { profile, slugs } from "../dex/species.js";
import { loadJson, isMetaKey } from "../dex/data.js";

// 도구 식별자 — 가방·상점 도구와 진화용 도구 (data/items.json · data/evo-items.json)
function itemIds(): string[] {
  const keys = [...Object.keys(loadJson<Record<string, unknown>>("items.json")), ...Object.keys(loadJson<Record<string, unknown>>("evo-items.json"))];
  return [...new Set(keys.filter((k) => !isMetaKey(k) && /^[a-z0-9-]+$/.test(k)))];
}

interface FetchModule {
  cached(file: string, url: string, validate?: (buf: Buffer) => boolean): Promise<{ buf: Buffer } | null>;
}
const { cached } = require("../../art/fetch.js") as FetchModule;

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites";
const BASE = `${SPRITES}/pokemon`;
// 한 번에 받는 수 — 도감처럼 칸이 많아도 네트워크를 한꺼번에 쓰지 않는다
const PARALLEL = 4;
// 미리 받기의 동시 요청 수 — 그림이 작아(평균 1KB) 요청 수가 비용이다. 16 이면 2천 장이 이 연결에서 10초 안팎이었다(2026-09-26 측정)
const PREFETCH_PARALLEL = 16;

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
  // 디스크에 이미 있는 그림 전부 — 초상 열쇠(slug · slug:shiny)와 도구·알 열쇠. 네트워크는 쓰지 않는다
  // 관리 창이 첫 화면 전에 한 번 받아 둔다. 상점·상세에 들어갈 때 그림이 하나씩 차오르지 않게 하려는 것이다
  all(): Promise<Record<string, string>>;
  // 캐시에 없는 그림을 모두 받는다 — 보통·이로치 초상, 도구, 알. 받은 수·없는 수(404)·실패 수를 돌려준다
  prefetch(onProgress?: (done: number, total: number) => void): Promise<{ got: number; had: number; missing: number; failed: number }>;
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

  // 디스크에서만 읽는다 — 앱에 든 그림, 캐시 순서. 없으면 null. 비동기다 — 창을 처음 열 때 메인이 멈추지 않게
  async function diskUri(rel: string): Promise<string | null> {
    const file = path.join(dir, rel);
    const known = memo.get(file);
    if (known) return known;
    for (const root of bundled ? [bundled, dir] : [dir]) {
      try {
        const buf = await fs.promises.readFile(path.join(root, rel));
        if (!isPng(buf)) continue;
        const uri = `data:image/png;base64,${buf.toString("base64")}`;
        memo.set(file, uri);
        return uri;
      } catch {
        // 이 폴더에 없는 그림
      }
    }
    return null;
  }

  // 폴더 안 파일 이름 — 없는 폴더는 빈 목록
  const names = (sub: string): string[] => {
    const out = new Set<string>();
    for (const root of bundled ? [bundled, dir] : [dir]) {
      try {
        for (const n of fs.readdirSync(path.join(root, sub))) if (n.endsWith(".png")) out.add(n);
      } catch {
        // 폴더 없음
      }
    }
    return [...out];
  };

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
    async prefetch(onProgress) {
      const jobs: { rel: string; url: string }[] = [];
      const dexes = [...new Set(slugs().map((slug) => profile(slug).dex).filter((d) => d > 0))].sort((a, b) => a - b);
      for (const dex of dexes) {
        const d = String(dex).padStart(4, "0");
        jobs.push({ rel: `${d}.png`, url: portraitUrl(dex, false) }, { rel: `${d}-shiny.png`, url: portraitUrl(dex, true) });
      }
      jobs.push({ rel: "egg.png", url: `${BASE}/egg.png` });
      for (const id of itemIds()) jobs.push({ rel: `items/${id}.png`, url: `${SPRITES}/items/${id}.png` });
      const count = { got: 0, had: 0, missing: 0, failed: 0 };
      // 그림이 없다고(404) 확인한 것 — 켤 때마다 다시 묻지 않게 캐시 폴더에 적어 둔다
      const missingFile = path.join(dir, "missing.json");
      let known: string[] = [];
      try {
        const raw: unknown = JSON.parse(fs.readFileSync(missingFile, "utf8"));
        if (Array.isArray(raw)) known = raw.filter((x): x is string => typeof x === "string");
      } catch {
        // 아직 없음
      }
      const absent = new Set(known);
      const before = absent.size;
      let next = 0;
      let done = 0;
      const worker = async (): Promise<void> => {
        while (next < jobs.length) {
          const job = jobs[next++];
          if (!job) break;
          const file = path.join(dir, job.rel);
          if (fs.existsSync(file) || (bundled && fs.existsSync(path.join(bundled, job.rel)))) count.had++;
          else if (absent.has(job.rel)) count.missing++;
          else {
            try {
              const got = await cached(file, job.url, isPng);
              if (got) count.got++;
              else {
                count.missing++; // 404 — 그림이 없는 도구 등
                absent.add(job.rel);
              }
            } catch {
              count.failed++; // 네트워크 — 다음 실행에서 다시 받는다
            }
          }
          onProgress?.(++done, jobs.length);
        }
      };
      await Promise.all(Array.from({ length: PREFETCH_PARALLEL }, worker));
      if (absent.size !== before) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(missingFile, JSON.stringify([...absent].sort()));
        } catch {
          // 적지 못해도 다음에 다시 물을 뿐이다
        }
      }
      return count;
    },
    async all() {
      const out: Record<string, string> = {};
      const files = new Set(names(""));
      const read = (rel: string): Promise<string | null> => (files.has(rel) ? diskUri(rel) : Promise.resolve(null));
      await Promise.all(
        slugs().map(async (slug) => {
          const dex = profile(slug).dex;
          if (!dex) return;
          const d = String(dex).padStart(4, "0");
          const plain = await read(`${d}.png`);
          if (!plain) return;
          out[slug] = plain;
          // 이로치 그림이 없으면 보통 그림 — get 과 같은 규칙
          out[`${slug}:shiny`] = (await read(`${d}-shiny.png`)) ?? plain;
        }),
      );
      const egg = await read("egg.png");
      if (egg) out.egg = egg;
      await Promise.all(
        names("items").map(async (n) => {
          const uri = await diskUri(`items/${n}`);
          if (uri) out[`item:${n.slice(0, -4)}`] = uri;
        }),
      );
      return out;
    },
  };
}
