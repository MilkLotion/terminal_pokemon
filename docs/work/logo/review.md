# 로고 개선 검수 — 앱 타일 몬스터볼

## 범위

2026-09-18. `assets/logo/src/`의 32×32·16×16 픽셀 맵과 생성 결과를 검수했다.

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npm run logo:build` | 통과. TypeScript 빌드 후 PNG 8종, SVG, ICO, ICNS를 합쳐 총 11개를 생성했다. |
| `npm run check` | 통과. main·renderer TypeScript 타입 검사를 완료했다. |
| `file assets/logo/out/logo-16.png assets/logo/out/logo-32.png assets/logo/out/logo-128.png assets/logo/out/logo-512.png` | 통과. 각 PNG가 올바른 크기와 RGBA 형식이다. |
| `view_image assets/logo/out/logo-512.png` | 통과. 터미널 창, 빨강 상단, 중앙 밴드·버튼, 흰색 하단이 보인다. |

## 피드백

- 잔여 이전 캐릭터 픽셀이 첫 시안에서 몬스터볼과 붙었다. 상태: 해결. 해당 픽셀을 원본 맵에서 제거했다. 다시 생성했다.
- 16px 맵은 작은 크기용으로 단순화했다. 상태: 해결.
- 큰 래스터 결과에서 볼이 타원·반쪽처럼 보였다. 상태: 해결. 32×32 원본의 볼을 약 18×17 대칭 계단 형태로 확대했다. 다시 생성했다.
- 사용자가 볼을 더 크게 요청했다. 상태: 해결. 16px 맵도 큰 단순형으로 갱신했다.
- 터미널 창이 길다는 피드백이 있었다. 상태: 해결. 본문 폭을 20px에서 16px로 줄였다. 몬스터볼 겹침 구도를 다시 맞췄다.
- 런타임 코드 변경은 필요하지 않다. 상태: 확인.

## 최종 판정

기존 픽셀 로고 산출물을 새 공식 SVG 로고로 교체했다. `npm run logo:build`가 공식 SVG를 기준으로 PNG 8종, SVG, ICO, ICNS, VS Code PNG를 갱신한다. 미해결 항목은 없다.

## 2026-09-18 공식 로고 채택 검수

| 명령 | 결과 |
|---|---|
| `npm run logo:build` | 통과. 공식 SVG에서 앱 산출물을 생성했다. |
| `file assets/logo/out/logo.svg assets/logo/out/logo-128.png assets/logo/out/logo-512.png assets/logo/out/logo.ico assets/logo/out/logo.icns vscode-extension/logo.png` | 통과. SVG, PNG, Windows ICO, macOS ICNS, VS Code PNG가 존재한다. |
| `sips -g pixelWidth -g pixelHeight ...` | 통과. 16·128·512·VS Code 아이콘 크기가 맞다. |
| `view_image assets/logo/out/logo-512.png` | 통과. 앱 타일, 터미널 창, 프롬프트, 몬스터볼이 보인다. |
| `npm run build:vsix` | 통과. VS Code 패키지에 `extension/logo.png`를 포함했다. |
| `unzip -l vscode-extension/pokebuddy-active-terminal-0.3.0.vsix` | 통과. `extension/logo.png`와 확장 manifest가 패키지에 있다. |

## 실행 표시 검수

- `src/main/tray.ts`는 첫 포켓몬 Idle 스프라이트를 자르지 않는다. 대신 공식 `logo-256.png`를 사용한다.
- 파티를 새로고침해도 트레이 아이콘이 포켓몬 이미지로 바뀌지 않는다.
- 무대에서 트레이용 첫 포켓몬 스프라이트 API를 제거했다.
- Windows BrowserWindow 아이콘, macOS Dock 아이콘, VS Code 아이콘은 기존 공식 로고 경로를 사용한다.

## 2026-09-18 PNG 캔버스 보정

- 발견: `qlmanage`가 1024px PNG 캔버스 안에 256px SVG를 배치했다. 그 결과 시스템 아이콘이 작은 흰 사각형처럼 보였다.
- 수정: 공식 SVG를 `sips -s format png -z 1024 1024`로 직접 래스터화하도록 생성기를 변경했다.
- 수용: 새 PNG는 전체 1024×1024 캔버스를 앱 타일이 채운다. 16·32·128·256·512·1024와 ICO·ICNS·VS Code PNG를 다시 생성한다.

## 결정

- 공식 원본: `assets/logo/src/logo.svg`
- README: `assets/logo/out/logo.svg`
- Electron: `assets/logo/out/logo-256.png`, `logo-512.png`
- Windows: `assets/logo/out/logo.ico`
- macOS: `assets/logo/out/logo.icns`
- VS Code: `vscode-extension/logo.png`
