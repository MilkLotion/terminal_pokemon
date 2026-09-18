# 로고 개선 계획 — 앱 타일 몬스터볼

## 목표

프로그램 아이콘처럼 읽히는 앱 타일 SVG를 공식 로고로 채택한다. 터미널 창과 몬스터볼을 하나의 작은 배지로 묶고, 터미널 안의 펫은 표시하지 않는다.

## 범위

- `assets/logo/src/logo.svg`를 공식 원본으로 둔다.
- `assets/logo/out/`의 SVG, PNG, ICO, ICNS를 공식 원본에서 만든다.
- `vscode-extension/logo.png`를 같은 원본의 128px 산출물로 갱신한다.
- 로고 설명과 변경 이력을 갱신한다.

범위 밖:

- 로고를 사용하는 런타임 코드 변경
- 새 이미지 생성 의존성 추가
- 생성 결과물의 수동 편집

## SSOT

- 설계 결정: `docs/design.md`
- 상태: `docs/progress.md`
- SVG 원본: `assets/logo/src/logo.svg`
- 시안 원본: `assets/icon-concepts/app-window-ball-empty.svg`
- 생성기: `scripts/sync-official-logo.js` (macOS의 `sips`, `iconutil` 사용)
- 결과물: `assets/logo/out/`

## 디자인 결정

- 둥근 사각형 앱 타일을 기본 실루엣으로 사용한다.
- 터미널 제목줄의 신호등과 짧은 프롬프트를 표시한다.
- 오른쪽 아래에 검은 외곽선, 빨강 상단, 어두운 중앙 밴드, 흰색 버튼을 가진 몬스터볼을 배치한다.
- 터미널 안에는 펫을 표시하지 않는다.

## 위험과 수용 기준

- 위험: 작은 크기에서 몬스터볼이 터미널 본문과 섞일 수 있다.
- 위험: 앱·VS Code·README의 산출물이 서로 다른 원본을 사용할 수 있다.
- 수용 기준: 공식 원본과 산출물의 SVG가 동일한 디자인을 사용한다.
- 수용 기준: PNG 8종, SVG, ICO, ICNS, VS Code PNG가 생성된다.
- 수용 기준: 16px·32px·128px·512px 결과에서 앱 타일, 터미널 창, 몬스터볼이 식별된다.
