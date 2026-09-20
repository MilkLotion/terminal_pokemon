# pokebuddy 진행 현황과 다음 작업

> 2026-09-21 정정: 에버스톤은 사용자 구상이 아니다. 상품·부화 관련 사용자 결정 표기는 직접 근거가 확인되지 않았다. [명칭 출처 정정](../../work/s5-terminology/review.md)을 먼저 확인한다.

> 2026-09-21 보관 기록. 현재 기준은 [설계](../../design.md)와 [v2 검수](../../work/s5-design-system-v2/review.md)를 따른다. 아래 결정·수치·상태는 당시 기록이다.

기준: `85daaa7` (S4 구현 커밋) 이후 S5 설계.
갱신: 2026-09-21. S5 제품 설계는 도감 소환과 가방을 기준으로 한다. 두 공유 대화와 Figma 00~05를 검수하고 문서를 동기화했다. 05의 정적 화면은 6개다. 스크롤·모달·상태·막대·프로토타입 수정이 필요하다. 기능 구현은 미시작이다.

새 세션은 이 문서, [설계](../../design.md), [작업 기록](../../history/2026-09.md), [역할 안내](../../contributing/roles/design.md), [S4 검수](../../work/s4/review.md), [설명서](../../guide.md) 순서로 읽는다.

## 현재 상태

## S5 디자인 시스템 v2 — 현재 작업

- 범위: `00 · Foundations`~`05 · Screens`. 기존 S5 페이지는 Legacy 비교 자료다.
- 상태: 현재 속성·계층·6개 화면 캡처의 검수와 문서 동기화 완료. Figma 수정은 이번 범위에 포함하지 않았다.
- 자산: Atoms 29개, Molecules 12개, Organisms 13개, Templates 3개다. 각 수는 페이지의 상위 COMPONENT·COMPONENT_SET 수다.
- 스타일: PB 변수 87개, Inter 글꼴 스타일 9개다. 흰 헤더·카드, 회녹색 본문, 청록색 강조를 사용한다.
- 내비게이션: Active 5종이다. 하단 테두리 1px와 선택 밑줄 2px를 확인했다.
- 상세 Template: `226:913`의 Dialog=None·Confirm·Error는 각각 720×1030이다. 실행 화면의 780px 높이와 구분한다.
- 화면: 파티, 상세 기본·숨김·돌봄 성공·소환 해제 확인·저장 실패의 6개다. 모달 중앙 정렬과 오류 높이 확장은 확인했다.
- 우선 수정: 상세 스크롤 누락, Hidden 설명 불일치, 불투명한 Scrim, 친밀도 값과 막대 불일치, 프로토타입 연결 0개.
- 추가 열린 항목: 배지 대비, 숨김 마커 색상 예외, Dimension 바인딩, 그림·종 데이터, 돌봄 위계, 재시도 조작.
- 근거: [계획](../../work/s5-design-system-v2/plan.md), [검수](../../work/s5-design-system-v2/review.md), [피드백](../../work/s5-design-system-v2/feedback.md), [자산 목록](../../work/s5-design-system-v2/evidence/inventory.json).

## 로고 개선 — 몬스터볼

- 상태: 구현 및 자동 검수 완료.
- 원본: `assets/logo/src/logo.txt`, `assets/logo/src/logo.small.txt`.
- 결과: 터미널 창 구도는 유지했다. 민트 캐릭터를 빨강·흰색 몬스터볼로 교체했다.
- 생성: `npm run logo:build` 통과. PNG, SVG, ICO, ICNS를 갱신했다.
- 상세 계획: `docs/work/logo/plan.md`. 검수: `docs/work/logo/review.md`.

## 앱 아이콘 SVG 시안

- 상태: 시안 제작·자동 검수 완료.
- 결과: `assets/icon-concepts/`에 기존 네 개와 새 앱 타일 시안 세 개를 추가했다.
- 피드백 반영: 기존 시안은 모니터 일러스트 느낌이 강했다. 새 시안은 둥근 사각형 앱 타일과 프로그램 창을 중심으로 한다.
- 새 추천: `app-window-ball.svg`는 프로그램 창과 몬스터볼의 균형이 좋다.
- 상세 계획: [아이콘 시안 계획](../../work/icon-concepts/plan.md). 검수: [아이콘 시안 검수](../../work/icon-concepts/review.md).
- 피드백: [아이콘 시안 피드백](../../work/icon-concepts/feedback.md).

## 정식 로고 채택

- 상태: 구현 및 자동 검수 완료.
- 원본: `assets/logo/src/logo.svg`.
- 산출물: `assets/logo/out/logo.svg`, PNG 8종, `logo.ico`, `logo.icns`, `vscode-extension/logo.png`.
- 생성: `npm run logo:build` 통과.
- 검수: [로고 검수](../../work/logo/review.md).

## 동반자 실행 명령

- 상태: 구현 및 문서 검수 완료.
- 정식 명령: `pokebuddy companion`.
- 포켓몬 이름은 받지 않는다. 첫 실행 선택창에서 고른다. 다음 실행부터 저장된 파티를 복원한다.
- 중단: `pokebuddy companion stop`.

| 단계 | 상태 | 내용 |
|---|---|---|
| S0 설계 | 완료 | 무대 하나, 최대 6마리, 원작 25개 성격, TypeScript |
| S1 기반 | 완료 | 저장 v2, 잠금, mailbox, 명령 처리기, 도감과 에이전트 자료 |
| S2 무대 | 구현 완료 | 마리별 클릭, 드래그, 집 저장. 이번 작업에서 겹침 허용과 소환 순서 표시로 바꿨다 |
| S3 움직임과 육성 | 구현·자동 검사 완료 | 성격, 배고픔, 기분, 친밀도, 토큰, 돌봄. [검수 기록](../../work/s3/review.md) |
| S4 해금·상점·진화 | 구현·자동 검사 완료 | 해금, 칸, 새 종, 민트, 먹이, 에버스톤, 색, 진화, 모습 선택. 메뉴와 CLI에 연결했다 |
| S5 설정창·메뉴·연결 | 도감 소환 재설계 | [상세 설계](../../specs/s5.md), [화면 시안](s5-preview.html). 기능 구현은 미시작이다 |
| S6 배포 | 대기 | 패키징, 게시, 자동 시작, 플랫폼 실기 |

## S5 설계 — 도감 소환과 가방

[계획](../../specs/s5.md), [시안](s5-preview.html), [명칭 사전](../../terms.md)을 갱신했다.
파티·도감·상점·가방·설정의 다섯 탭을 제안한다. 연결은 설정 안으로 이동했다.
별명, 모습 선택, 먹이 판매, 에버스톤을 제거한다. 진화의돌은 별도 상품이다.
랜덤알은 작업하면서 부화한다. 진화 전후 종 모두 등록을 유지한다. 도감에서 소환한다.
종별 육성 기록과 재소환, 진화 승계 설계가 필요하다. 저장 버전과 기존 데이터 이식은 미정이다.
시안은 예시 자료만 사용한다. 기능 코드는 변경하지 않았다.
Figma UI를 사용자 시안 `19:1024` 기준으로 갱신했다.
아래 Figma 자산·개수·완료 상태는 2026-09-19까지의 Legacy S5 기록이다. 현재 재설계는 위 v2 기록을 따른다.
[Foundations](https://www.figma.com/design/MA3K41Y6omAi5mRu6YDFly/pokebuddy?node-id=30-121), [Components](https://www.figma.com/design/MA3K41Y6omAi5mRu6YDFly/pokebuddy?node-id=7-2), [Party screen](https://www.figma.com/design/MA3K41Y6omAi5mRu6YDFly/pokebuddy?node-id=34-219)을 확인한다.
최종 공통 변수는 39개다. 상세 상태 변수 8개를 추가하여 변수는 47개다. 글꼴 스타일은 14개다. 버튼은 16개 상태다. 메뉴는 4개 상태다.
표시·숨김 카드와 빈칸·잠긴 칸을 구성했다. 파티 화면은 720×780이다.
사용자 요청으로 세 S5 페이지의 이전 시안과 미사용 자산을 제거했다. Page 1의 사용자 원본은 보존했다.
네 페이지의 누락 변수·컴포넌트 참조는 0개다.
[UI 작업 계획](plan-s5-figma-ui.md), [상세 화면 계획](plan-s5-figma-detail.md), [공통 자산 목록](figma-s5-inventory.json), [상세 자산 목록](figma-s5-detail-inventory.json)을 확인한다.
검증 범위와 미정 사항은 [S5 검토 기록](review-s5.md)에 남긴다.

## Legacy S5 Figma 상세 화면 — 2026-09-19 기록

[상세 화면 계획](plan-s5-figma-detail.md)을 기준으로 `Components` 페이지에 상세용 컴포넌트를 추가했다.
상태 안내, 프로필, 돌봄, 크기 선택, 설정 행, 소환 해제 확인창을 만들었다.
밥 주기는 강조 버튼이다. 놀아주기는 보조 버튼으로 같은 돌봄 컴포넌트를 재사용한다.
처리 중과 사용 불가 상태를 분리했다. 오류 안내는 기존 파티를 유지한다는 문구를 포함한다.
반복 구역 제목에는 `Detail / Section Header`를 추가했다. 기존 S5 토큰과 글꼴 스타일을 사용했다.
기본·숨김·돌봄 완료·소환 해제 확인·저장 실패 화면을 조립했다. 본문은 720×638px 세로 스크롤이다.
파티 카드, 파티로, 밥 주기, 표시 설정, 소환 해제 확인·실패의 대표 프로토타입 이동을 연결했다.
도감·상점·가방·설정 화면과 해당 컴포넌트는 만들지 않았다. 앱 구현은 다음 작업이다.

## Legacy S5 Figma 원자 조합 — 2026-09-19 기록

[원자 조합 계획](plan-s5-figma-composition.md)을 기준으로 타입 표시 계층을 다시 구성했다.
`Pokemon / Type Badge` `82:233`은 Electric, Fire, Flying VARIANT를 제공한다.
`Pokemon / Type Tags` `85:227`은 Type Badge 인스턴스 두 개와 보조 타입 표시 속성을 제공한다.
`Pokemon / Traits` `87:245`은 Type Tags와 성격을 조합한다.
`Pokemon Card` `32:137`은 Type Tags를 사용한다. 카드의 성격 TEXT 속성과 위치는 유지한다.
`Detail / Profile` `49:177`은 Traits를 사용한다. 평면 `Traits` TEXT 속성은 제거했다.
파티 피카츄 `34:277`과 상세 프로필 다섯 개는 Electric, 보조 타입 숨김, `성격: 느긋`을 사용한다.
새 Figma 화면은 이 계층의 인스턴스를 사용한다. 화면에서 Type Badge 프레임을 직접 만들지 않는다.
검수 근거는 [S5 검토 기록](review-s5.md)과 [공통 자산 목록](figma-s5-inventory.json)에 있다.

## S4 구현 기록

계획 → 설계 → 구현 → 검수 → 피드백 기록 → 수정 순서로 진행했다.
[계획과 가격](../../work/s4/plan.md), [발견한 문제와 수정](../../work/s4/review.md)을 확인한다.

- 포켓몬은 겹칠 수 있다. 시작 시에도 강제로 벌리지 않는다.
- 나중에 소환한 포켓몬이 앞에 보인다. 드래그와 모습 변경은 순서를 유지한다.
- 숨긴 뒤 다시 소환하면 마지막에 그린다. 재시작하면 저장된 파티 순서로 소환한다.
- 상점 구매와 진화는 그림과 최신 상태를 확인한 뒤 저장한다.
- 실패한 거래는 포인트를 차감하지 않는다.
- 먹이는 다음 밥의 효과를 두 배로 만든다. 기본 밥은 무료다.
- 색과 에버스톤 구매 권리는 마리별로 유지한다.
- `pokebuddy game --help`에서 S4 명령을 확인할 수 있다.

## S4 검증 결과

- 타입 검사와 빌드를 통과했다.
- 자체 검사 8벌을 통과했다: save, dex, agents, follow, motion, stage, state, shop.
- 숨긴 Electron 창에서 겹침 픽셀, 투명 영역 히트, 우클릭 대상 검사를 통과했다.
- 실제 PMD 이브이 일반색, 다른 색, 블래키 그림 렌더링을 확인했다.
- 별도 CLI 프로세스와 임시 HOME의 mailbox 왕복을 확인했다.
- 실제 사용자 저장은 변경하지 않았다.

## 다음 작업 — S5

디자인 작업은 [v2 열린 항목](../../work/s5-design-system-v2/feedback.md)을 수정한 뒤 05의 상태·스크롤·모달·막대·프로토타입을 다시 검수한다. 아래는 별도로 남아 있는 기능 설계와 구현 순서다.

1. 수정 시안을 검토한다. 종별 재소환·진화 승계·보상 규칙을 확정한다.
2. 진화의돌 조건, 랜덤알 가격·확률·필요 작업량, 이로치 도구 효과를 확정한다.
3. 동일 종 동시 소환·미소환 중 육성, 지방 분류, 화면 명칭을 확정한다.
4. 기존 저장과 구매 권리의 이식 계약을 정한 뒤 도감 등록·파티 소환·가방 처리를 구현한다.
5. 전체 도감과 지방 필터, 작업 부화, 다섯 탭, 설정 안의 연결을 구현한다.
6. 설정창 진입과 메뉴를 연결한다. 실패·경합·중복 처리를 검수한다.
7. 남은 JS를 TS로 이식한다. 설치 전 `scripts/postinstall.js`는 유지한다.

## 남은 플랫폼 확인

- Windows 125%와 150% DPI, 실제 드래그, 클릭 통과, 우클릭, 앱 전환을 확인해야 한다.
- 6마리의 CPU와 GPU 사용량을 확인해야 한다. 기존 mac 측정값 10.5%는 S2 당시 기록이다.
- macOS 회귀, 다중 화면, 여러 VS Code 창의 파티 배분을 확인해야 한다.
- Codex와 Gemini의 토큰 읽기를 확인해야 한다. 읽지 못하면 작업 시간으로 적립한다.
- PMD 특수 폼 매핑을 확인해야 한다. 기존 그림 로더는 도감번호의 기본 폼을 사용한다.
- S6: 앱 아이콘 번들, npm과 vsix 게시, 로그인 자동 시작을 진행해야 한다.

## 작업 규칙

- 설계와 검사 기준을 먼저 기록한다.
- 검수에서 발견한 문제를 적는다. 문제를 수정한다.
- 새 기능 코드는 `src/`의 TypeScript로 작성한다. 배럴 `index.ts`는 만들지 않는다.
- 주석은 한국어 개조식으로 작성한다. 미확정 항목은 한국어 대괄호 태그로 표시한다.
- 새 npm 의존성은 사용자 승인 후 추가한다.
- 명령은 macOS와 Windows에서 동작해야 한다. `.ps1`의 UTF-8 BOM을 유지한다.
- 시험은 임시 HOME을 사용한다. 실제 게임 저장은 변경하지 않는다.
- 실행한 펫을 종료하려면 해당 pid 파일 또는 `companion.lock`을 삭제한다.
- 커밋과 푸시는 사용자가 요청할 때 진행한다.
- 기존 외부 설계 Artifact는 이전 기록이다. 현재 결정은 `design.md`와 S4 문서를 우선한다.

## 검사 명령

```text
npm run check
npm run selftest
node_modules/.bin/electron dist/tools/smoke-renderer.js
```

Windows에서는 Electron 실행 파일에 `.cmd`를 붙일 수 있다.
`POKEBUDDY_SMOKE_ART`에 실제 시트 JSON이 있는 임시 폴더를 지정하면 실제 그림도 검사한다.
가격과 보상은 `data/shop.json`에서 조정한다. 종별 가격과 해금 조건은 `data/unlocks.json`에 있다.

## 설치 기록 주의

이전 문서의 `npm link`, 훅, 확장 설치 완료 기록은 다른 mac 세션의 상태다.
그 기록을 현재 Windows의 전역 설치 확인 결과로 사용하지 않는다.
