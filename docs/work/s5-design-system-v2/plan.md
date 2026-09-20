# S5 디자인 시스템 v2 검수와 문서 동기화

날짜: 2026-09-21. 상태: 00~05 검수와 문서 동기화 완료. 디자인 수정 항목은 열림. 앱 기능 구현 미시작.

## 목표와 범위

- Figma `00 · Foundations`부터 `04 · Templates`까지 현재 구조와 스타일을 확인한다.
- 공유 대화의 작업 기록을 현재 Figma 속성과 대조한다.
- 기존 S5 자산과 PB v2 자산의 기준을 구분한다.
- 추가 사용자 요청으로 `05 · Screens` 6개와 모달 Template 변형을 검수 범위에 포함했다.
- 이번 변경 대상은 `docs/`다. Figma 자산과 앱 코드는 편집하지 않는다.

## 근거와 SSOT

- 현재 디자인: [Figma 00 · Foundations](https://www.figma.com/design/MA3K41Y6omAi5mRu6YDFly/pokebuddy?node-id=113-245).
- 이전 작업 설명: [공유 대화](https://chatgpt.com/share/6aaffb44-3534-83ee-874e-9a63888658eb).
- 추가 작업 설명: [두 번째 공유 대화](https://chatgpt.com/share/6aaffe73-d0e0-83ee-8d3c-8a674cbcb916).
- 결정: [design.md](../../design.md). 현황: [progress.md](../../progress.md).
- 제품 계약: [S5 계획](../../specs/s5.md). 사용자 명칭: [terms.md](../../terms.md).
- 이전 자산: [공통 목록](../../archive/s5-legacy/figma-s5-inventory.json), [상세 목록](../../archive/s5-legacy/figma-s5-detail-inventory.json).
- 공유 대화의 완료 주장은 당시 기록이다. 현재값은 Figma를 직접 읽어 확인한다.
- Figma 시안은 런타임 구현의 증거로 사용하지 않는다.

## 위험과 수용 검사

- 이전 S5 완료 기록을 v2 전체 완료로 해석하지 않는다.
- 페이지별 자산 ID와 직접 의존 계층을 기록한다.
- 색상 변수, 글꼴 스타일, 대표 간격과 치수를 기록한다.
- 내비게이션 하단 테두리 1px와 선택 밑줄 2px를 각각 확인한다.
- 상세 템플릿 전체 높이와 실행 화면의 스크롤 높이를 구분한다.
- 하드코딩 색상, 누락 참조, 상위 노드 겹침의 검사 범위를 명시한다.
- 대표 화면을 캡처로 확인한다. 미확정 디자인은 열린 항목으로 남긴다.
- 추가 6개 화면의 표시·숨김·성공·확인·오류 상태를 캡처와 속성으로 확인한다.
- 본문 스크롤, 화면 이동, 모달 불투명도, 친밀도 막대 비율과 종 데이터를 확인한다.
- 문서 상대 링크, JSON 구문, `git diff --check`를 확인한다.
- 런타임 코드 변경이 없으므로 빌드·타입 검사·자체 검사는 실행하지 않는다.

## 결과

- 현재 스타일·컴포넌트·내비게이션·Template 기준은 [검수 기록](review.md)에 있다.
- PB 자산과 관측값은 [v2 자산 목록](evidence/inventory.json)에 있다.
- 6개 화면의 문자·상태·스크롤·모달·막대 근거는 [화면 자산 목록](evidence/screens-inventory.json)에 있다.
- 디자인 수정 항목은 [피드백](feedback.md)에 남겼다.
- 기존 S5 기록에 Legacy 적용 범위를 추가했다. 앱 구현은 시작하지 않았다.
