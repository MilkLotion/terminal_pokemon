// 앱 아이콘(로고)을 텍스트 픽셀 지도에서 만든다 — PNG 8종 · SVG · ICO · ICNS. 의존성 없음(node:zlib 만).
//
//   npm run logo:build                          (= npm run build && node dist/tools/build-logo.js)
//   node dist/tools/build-logo.js [이름 ...]      인수 없으면 assets/logo/src/*.txt 전부 (.small.txt 는 짝으로만)
//
// 입력 assets/logo/src/<이름>.txt — 사람이 손으로 고치는 픽셀 지도
//   // 로 시작하는 줄과 빈 줄은 주석
//   팔레트  <기호> = #RRGGBB [// 메모]       기호는 공백·`.` 이 아닌 한 글자. `.` 은 투명으로 예약
//   격자    팔레트 뒤에 오는 W×H 줄. 줄 길이가 전부 같아야 하고 기호는 팔레트에 있어야 한다
//   <이름>.small.txt(16×16) 가 있으면 16·32px 은 그걸로, 나머지 크기는 <이름>.txt(32×32) 로 그린다
// 출력 assets/logo/out/
//   <이름>-<크기>.png   16 32 48 64 128 256 512 1024 — 최근접 확대만 (정수 배가 아니면 최근접 표본, 보간 없음)
//   <이름>.svg          픽셀마다 rect, 같은 색 가로 연속은 하나로 합침. viewBox 는 격자 크기, crispEdges
//   <이름>.ico          Windows — 16 32 48 256 을 PNG 페이로드로
//   <이름>.icns         macOS — ic04(16) ic05(32) 는 ARGB+PackBits, ic07 ic08 ic09 ic10 ic11 ic12 ic13 ic14 는 PNG
//                       Apple 의 iconutil 이 iconset 에서 만드는 조합과 같다. icp4·icp5·icp6 은 넣지 않는다 —
//                       macOS 26 의 iconutil 이 그 슬롯의 PNG 를 raw 픽셀로 읽어 노이즈가 됐다 (2026-09-17 실측).
//                       64px 1× 는 ic12(32@2x) 가 맡고, 48 은 Apple 의 현대 슬롯에 없다 (ICO 에만 담는다)
// 결정적 — 시각·난수 없음, deflate 수준 고정. 같은 입력이면 바이트까지 같다
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PROJECT_ROOT, must, runBuild } from "./pokeapi-csv";

export const SRC_DIR = path.join(PROJECT_ROOT, "assets", "logo", "src");
export const OUT_DIR = path.join(PROJECT_ROOT, "assets", "logo", "out");

// 만들 PNG 크기 — ICO·ICNS 가 여기서 골라 쓴다
export const PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const;
export type PngSize = (typeof PNG_SIZES)[number];

// small 지도가 맡는 최대 크기 (16·32)
const SMALL_MAX = 32;

// Windows ICO 에 담는 크기
const ICO_SIZES: readonly PngSize[] = [16, 32, 48, 256];

// macOS ICNS 청크 — 종류 → 픽셀 크기 · 페이로드 형식 (ic11~ic14 는 @2x 라 같은 픽셀 PNG 를 다시 쓴다)
type IcnsPayload = "argb" | "png";
const ICNS_TYPES: readonly (readonly [type: string, size: PngSize, payload: IcnsPayload])[] = [
  ["ic04", 16, "argb"],
  ["ic05", 32, "argb"],
  ["ic07", 128, "png"],
  ["ic08", 256, "png"],
  ["ic09", 512, "png"],
  ["ic10", 1024, "png"],
  ["ic11", 32, "png"],
  ["ic12", 64, "png"],
  ["ic13", 256, "png"],
  ["ic14", 512, "png"],
];

// 픽셀 지도 — RGBA 평면(width*height*4), 투명은 0,0,0,0
export interface PixelMap {
  width: number;
  height: number;
  rgba: Uint8Array;
  // 격자 문자 그대로 (SVG 가 색 병합에 쓴다) — 행마다 문자열, 팔레트 기호 또는 `.`
  rows: string[];
  palette: ReadonlyMap<string, string>;
}

// ── 지도 파싱 ────────────────────────────────────────────────

const PALETTE_LINE = /^(\S) = (#[0-9A-Fa-f]{6})\s*(?:\/\/.*)?$/;

// 텍스트 지도 → PixelMap. label 은 오류 메시지용(파일 이름)
export function parsePixelMap(text: string, label: string): PixelMap {
  const palette = new Map<string, string>();
  const rows: string[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = must(lines[i], `${label} ${i + 1}행`);
    const line = raw.trimEnd();
    if (line === "" || line.startsWith("//")) continue;
    const m = PALETTE_LINE.exec(line);
    if (m) {
      const key = must(m[1], "팔레트 기호");
      const hex = must(m[2], "팔레트 색").toUpperCase();
      if (key === ".") throw new Error(`${label} ${i + 1}행: '.' 은 투명으로 예약된 기호`);
      if (rows.length > 0) throw new Error(`${label} ${i + 1}행: 팔레트는 격자보다 앞에 온다`);
      if (palette.has(key)) throw new Error(`${label} ${i + 1}행: 기호 '${key}' 중복`);
      palette.set(key, hex);
      continue;
    }
    rows.push(line);
  }
  if (rows.length === 0) throw new Error(`${label}: 격자가 없다`);
  const width = must(rows[0], "첫 행").length;
  const height = rows.length;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = must(rows[y], `${label} 격자 ${y + 1}행`);
    if (row.length !== width) throw new Error(`${label} 격자 ${y + 1}행: 길이 ${row.length} — 첫 행 ${width} 과 다르다`);
    for (let x = 0; x < width; x++) {
      const ch = must(row[x], "격자 문자");
      if (ch === ".") continue;
      const hex = palette.get(ch);
      if (hex === undefined) throw new Error(`${label} 격자 ${y + 1}행 ${x + 1}열: 팔레트에 없는 기호 '${ch}'`);
      const o = (y * width + x) * 4;
      rgba[o] = parseInt(hex.slice(1, 3), 16);
      rgba[o + 1] = parseInt(hex.slice(3, 5), 16);
      rgba[o + 2] = parseInt(hex.slice(5, 7), 16);
      rgba[o + 3] = 255;
    }
  }
  return { width, height, rgba, rows, palette };
}

// ── 최근접 리샘플 ────────────────────────────────────────────

// size×size RGBA 로 최근접 표본 — 정수 배면 픽셀 복제, 아니면 보간 없이 가장 가까운 원본 픽셀
export function resampleNearest(map: PixelMap, size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * map.height) / size);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * map.width) / size);
      const si = (sy * map.width + sx) * 4;
      const di = (y * size + x) * 4;
      out[di] = must(map.rgba[si], "원본 R");
      out[di + 1] = must(map.rgba[si + 1], "원본 G");
      out[di + 2] = must(map.rgba[si + 2], "원본 B");
      out[di + 3] = must(map.rgba[si + 3], "원본 A");
    }
  }
  return out;
}

// ── PNG 인코더 ───────────────────────────────────────────────

const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = must(CRC_TABLE[(c ^ must(buf[i], "바이트")) & 0xff], "CRC 표") ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// PNG 청크 — 길이(4) 종류(4) 데이터 CRC(4, 종류+데이터)
function pngChunk(type: string, data: Uint8Array): Buffer {
  const typeBuf = Buffer.from(type, "latin1");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 8bit RGBA 비인터레이스 PNG — 행마다 필터 0, IDAT 하나
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`PNG 픽셀 길이 ${rgba.length} ≠ ${width}×${height}×4`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // 필터 0 (None)
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([PNG_SIGNATURE, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))]);
}

// ── SVG ──────────────────────────────────────────────────────

// 픽셀마다 rect — 같은 색이 가로로 이어지면 하나로. viewBox 는 격자 크기
export function toSvg(map: PixelMap): string {
  const rects: string[] = [];
  for (let y = 0; y < map.height; y++) {
    const row = must(map.rows[y], "행");
    let x = 0;
    while (x < map.width) {
      const ch = must(row[x], "문자");
      if (ch === ".") {
        x += 1;
        continue;
      }
      let run = 1;
      while (x + run < map.width && row[x + run] === ch) run += 1;
      const fill = must(map.palette.get(ch), `팔레트 '${ch}'`);
      rects.push(`  <rect x="${x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`);
      x += run;
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" width="512" height="512" shape-rendering="crispEdges">`,
    ...rects,
    `</svg>`,
    ``,
  ].join("\n");
}

// ── ICO (Windows) ────────────────────────────────────────────

// 디렉터리 항목 16바이트 × n 뒤에 PNG 페이로드. 256 은 너비·높이 칸에 0
export function encodeIco(entries: readonly { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  const dir: Buffer[] = [];
  const payloads: Buffer[] = [];
  let offset = 6 + 16 * entries.length;
  for (const { size, png } of entries) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e[2] = 0; // 팔레트 없음
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    payloads.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...dir, ...payloads]);
}

// ── ICNS (macOS) ─────────────────────────────────────────────

// Apple PackBits 변형 — 머리 바이트 h: h<128 → 뒤따르는 (h+1) 바이트 그대로, h≥128 → 다음 한 바이트를 (h-125) 번 반복.
// 같은 값 3개 이상이면 반복 묶음(최대 130), 아니면 그대로 묶음(최대 128). 탐욕적이라 결정적
export function packBits(data: Uint8Array): Buffer {
  const out: number[] = [];
  let i = 0;
  let literalStart = -1;
  const flushLiteral = (end: number): void => {
    if (literalStart < 0) return;
    for (let s = literalStart; s < end; s += 128) {
      const n = Math.min(128, end - s);
      out.push(n - 1);
      for (let k = s; k < s + n; k++) out.push(must(data[k], "PackBits 바이트"));
    }
    literalStart = -1;
  };
  while (i < data.length) {
    const v = must(data[i], "PackBits 바이트");
    let run = 1;
    while (i + run < data.length && run < 130 && data[i + run] === v) run += 1;
    if (run >= 3) {
      flushLiteral(i);
      out.push(run + 125, v);
      i += run;
    } else {
      if (literalStart < 0) literalStart = i;
      i += 1;
    }
  }
  flushLiteral(i);
  return Buffer.from(out);
}

// ic04·ic05 페이로드 — "ARGB" 매직 뒤에 A·R·G·B 채널을 따로 PackBits 로 눌러 이어 붙인다
export function encodeArgb(width: number, height: number, rgba: Uint8Array): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`ARGB 픽셀 길이 ${rgba.length} ≠ ${width}×${height}×4`);
  const n = width * height;
  const planes = [3, 0, 1, 2].map((ch) => {
    const plane = new Uint8Array(n);
    for (let p = 0; p < n; p++) plane[p] = must(rgba[p * 4 + ch], "채널 바이트");
    return packBits(plane);
  });
  return Buffer.concat([Buffer.from("ARGB", "latin1"), ...planes]);
}

// 'icns' + 전체 길이, 그 뒤 청크(종류 4 + 길이 4(헤더 포함) + 페이로드)
export function encodeIcns(entries: readonly { type: string; data: Buffer }[]): Buffer {
  const chunks = entries.map(({ type, data }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, "latin1");
    head.writeUInt32BE(8 + data.length, 4);
    return Buffer.concat([head, data]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, 4, "latin1");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

// ── 빌드 ─────────────────────────────────────────────────────

// 지도 한 쌍(main + 선택 small) 읽기
function readMaps(name: string): { main: PixelMap; small: PixelMap | undefined } {
  const mainFile = path.join(SRC_DIR, `${name}.txt`);
  const smallFile = path.join(SRC_DIR, `${name}.small.txt`);
  const main = parsePixelMap(fs.readFileSync(mainFile, "utf8"), `${name}.txt`);
  const small = fs.existsSync(smallFile) ? parsePixelMap(fs.readFileSync(smallFile, "utf8"), `${name}.small.txt`) : undefined;
  return { main, small };
}

// 시안 하나 → PNG 8 · SVG · ICO · ICNS. 쓴 파일 경로 목록 반환
export function buildLogo(name: string): string[] {
  const { main, small } = readMaps(name);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const written: string[] = [];
  const pngBySize = new Map<PngSize, Buffer>();
  const rgbaBySize = new Map<PngSize, Uint8Array>();
  for (const size of PNG_SIZES) {
    const map = small !== undefined && size <= SMALL_MAX ? small : main;
    const rgba = resampleNearest(map, size);
    const png = encodePng(size, size, rgba);
    pngBySize.set(size, png);
    rgbaBySize.set(size, rgba);
    const file = path.join(OUT_DIR, `${name}-${size}.png`);
    fs.writeFileSync(file, png);
    written.push(file);
  }
  const pick = (size: PngSize): Buffer => must(pngBySize.get(size), `${size}px PNG`);
  const pickArgb = (size: PngSize): Buffer => encodeArgb(size, size, must(rgbaBySize.get(size), `${size}px 픽셀`));

  const svgFile = path.join(OUT_DIR, `${name}.svg`);
  fs.writeFileSync(svgFile, toSvg(main));
  written.push(svgFile);

  const icoFile = path.join(OUT_DIR, `${name}.ico`);
  fs.writeFileSync(icoFile, encodeIco(ICO_SIZES.map((size) => ({ size, png: pick(size) }))));
  written.push(icoFile);

  const icnsFile = path.join(OUT_DIR, `${name}.icns`);
  fs.writeFileSync(icnsFile, encodeIcns(ICNS_TYPES.map(([type, size, payload]) => ({ type, data: payload === "png" ? pick(size) : pickArgb(size) }))));
  written.push(icnsFile);

  return written;
}

// 인수의 시안 이름 — 없으면 src 의 *.txt 전부 (.small.txt 제외). 경로·확장자를 넘겨도 이름만 취한다
export function resolveNames(args: readonly string[]): string[] {
  if (args.length > 0) return args.map((a) => path.basename(a).replace(/\.small\.txt$|\.txt$/, ""));
  if (!fs.existsSync(SRC_DIR)) throw new Error(`${SRC_DIR} 이 없다`);
  return fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".txt") && !f.endsWith(".small.txt"))
    .map((f) => f.slice(0, -".txt".length))
    .sort();
}

export async function build(): Promise<void> {
  const names = resolveNames(process.argv.slice(2));
  if (names.length === 0) throw new Error(`${SRC_DIR} 에 지도(*.txt)가 없다`);
  for (const name of names) {
    const files = buildLogo(name);
    process.stdout.write(`${name}: ${files.length}개 → ${path.relative(PROJECT_ROOT, OUT_DIR)}${path.sep}${name}-*.png · .svg · .ico · .icns\n`);
  }
}

if (require.main === module) runBuild(build);
