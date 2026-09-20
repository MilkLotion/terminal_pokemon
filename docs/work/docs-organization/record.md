# 문서 구조와 작성 절차 정리

갱신: 2026-09-21
상태: 문서 구조 정리 완료

## 설계

목표: 현재 기준과 작업 이력을 분리한다. 한국어 문서에 적용할 작성 원칙을 검수 절차에 연결한다.
범위: 문서 이동, 참조 갱신, 작업 규칙, 문서 검사 도구.
제외: 게임 규칙 변경, Figma 수정, 앱 구현, 사용자 저장 변경.

| 위치 | 역할 |
|---|---|
| `docs/` | 입구와 현재 기준 문서 |
| `docs/specs/` | 현재 기능 계약 |
| `docs/work/<작업명>/` | 작업 기록과 해당 검수 자료 |
| `docs/history/` | 월별 완료 이력 |
| `docs/contributing/` | 작성 규칙과 작업 절차 |
| `docs/archive/` | 대체된 설계와 시안 |

새 작업은 `record.md` 하나에 설계·작업·검수·피드백·수정을 기록한다. 기존 작업은 해당 폴더의 기록을 갱신한다. 작은 후속 수정마다 파일을 추가하지 않는다.
기존 기록은 이동한다. 과거 검수 결과를 현재 결과로 다시 쓰지 않는다.

위험: 상대 링크, 코드 주석의 경로, HTML 참조가 끊길 수 있다. 근거 JSON은 이동 전후 해시를 비교한다.
사용자가 제공한 [Platty 동작 원리](https://github.com/paradigmshift-labs/platty/blob/main/guide/ko/how-platty-works.md)를 확인했다. 근거 추적과 정정 보존 방식을 적용한다. 폴더 구조는 이 프로젝트에 맞춘 결정이다.

수용 조건:

- `docs/` 바로 아래에는 README·설계·현황·명칭·사용 설명서만 둔다.
- 기존 파일의 이동 목적지를 모두 기록한다.
- 이동한 문서의 상대 링크와 저장소 참조를 갱신한다.
- 작성 규칙에 근거·용어·문장·완료 판정을 포함한다.
- 자동 검사와 사람의 의미 검수를 구분한다.
- 문서 검사와 `git diff --check`를 통과한다.

## 작업

문서 루트의 파일을 24개에서 5개로 줄였다. 파일 24개를 이동했다. 역할 지침 5개도 새 규칙 경로로 이동했다.
이동 직후 모든 파일의 SHA-256이 원본과 같았다. 이후 문서 참조와 역할 지침을 갱신했다.

| 이전 위치 | 현재 위치 |
|---|---|
| `docs/plan-s5.md` | `docs/specs/s5.md` |
| `docs/history.md` | `docs/history/2026-09.md` |
| `docs/review-s3.md` | `docs/work/s3/review.md` |
| `docs/plan-s4.md` | `docs/work/s4/plan.md` |
| `docs/review-s4.md` | `docs/work/s4/review.md` |
| `docs/plan-logo.md` | `docs/work/logo/plan.md` |
| `docs/review-logo.md` | `docs/work/logo/review.md` |
| `docs/plan-icon-concepts.md` | `docs/work/icon-concepts/plan.md` |
| `docs/review-icon-concepts.md` | `docs/work/icon-concepts/review.md` |
| `docs/feedback-icon-concepts.md` | `docs/work/icon-concepts/feedback.md` |
| `docs/plan-s5-design-system-v2.md` | `docs/work/s5-design-system-v2/plan.md` |
| `docs/review-s5-design-system-v2.md` | `docs/work/s5-design-system-v2/review.md` |
| `docs/feedback-s5-design-system-v2.md` | `docs/work/s5-design-system-v2/feedback.md` |
| `docs/figma-s5-v2-inventory.json` | `docs/work/s5-design-system-v2/evidence/inventory.json` |
| `docs/figma-s5-v2-screens-inventory.json` | `docs/work/s5-design-system-v2/evidence/screens-inventory.json` |
| `docs/plan-s5-record-cleanup.md` | `docs/work/s5-record-cleanup/plan.md` |
| `docs/review-s5-record-cleanup.md` | `docs/work/s5-record-cleanup/review.md` |
| `docs/plan-s5-terminology.md` | `docs/work/s5-terminology/plan.md` |
| `docs/review-s5-terminology.md` | `docs/work/s5-terminology/review.md` |
| `docs/roles/design.md` | `docs/contributing/roles/design.md` |
| `docs/roles/work.md` | `docs/contributing/roles/work.md` |
| `docs/roles/review.md` | `docs/contributing/roles/review.md` |
| `docs/roles/feedback.md` | `docs/contributing/roles/feedback.md` |
| `docs/roles/revision.md` | `docs/contributing/roles/revision.md` |

현재 현황에서 자산 수와 과거 검수 설명의 중복을 줄였다. 상세 근거는 해당 작업 기록으로 연결했다.
설명서의 이전 육성 수치 표를 제거했다. 현재 규칙의 코드와 설계로 연결했다.
작성 규칙에 문장·근거·상태 검수를 추가했다. 역할 지침과 AGENTS.md에 완료 전 검사를 연결했다.
문서 검사 도구를 추가했다. 구조·파일 링크·JSON 구문만 자동으로 검사한다.

## 검수

- 이동: 목적지 24개가 존재한다. 이전 경로 24개는 없다.
- 근거 보존: Figma JSON 2개의 해시가 이동 전과 같다.
- 문서 구조: 루트 파일은 README·설계·현황·명칭·설명서 5개다.
- 명령: `node scripts/check-docs.cjs`.
- 결과: 문서 44개, 파일 링크 324개, JSON 4개를 확인했다. 누락과 구문 오류는 없다.
- 명령: `git diff --check`.
- 결과: 통과.
- 앱 코드·저장·Figma 변경: 없음.
- 빌드·린트·앱 기능 검사: 미실행. 문서와 문서 검사 도구만 변경했다.

의미 검수 범위는 이번에 작성하거나 수정한 문장이다. README·작성 규칙·역할 지침·현황·설명서의 육성 절·이 기록을 확인했다.
문장마다 사실과 지시를 구분했다. 현재 구현과 제안의 근거를 분리했다. 과거 통과를 이번 검사 결과로 사용하지 않았다.
과거 문서 전체의 문체를 소급 수정하지 않았다. 공식 ASD-STE100 준수 검사를 수행했다고 기록하지 않는다.

## 피드백과 수정

| 발견 | 조치 | 상태 |
|---|---|---|
| 현재 문서와 작업 이력이 루트에 섞였다. | 기능 계약·작업 기록·월별 이력을 분리했다. | 해결 |
| 작은 후속 수정에도 새 기록 파일을 만들었다. | 기존 작업 기록 갱신을 기본으로 바꿨다. | 해결 |
| 작성 원칙이 완료 검사와 연결되지 않았다. | 역할 지침과 AGENTS.md에 의미 검수를 추가했다. | 해결 |
| 사용자 의도와 코드 존재를 같은 근거로 취급했다. | 출처와 확정 여부를 기록하도록 했다. | 해결 |
| 설명서에 오래된 육성 수치가 남았다. | 현재 코드 규칙으로 연결했다. | 해결 |
| 첫 검사에서 HTML 스크립트의 템플릿 문자열을 파일로 해석했다. | 정적 파일 검사에서 스크립트 본문을 제외했다. | 해결 |

사용자가 제공한 platty 문서를 확인했다. 관련 대상에 근거를 연결하는 방식을 작업 절차에 추가했다.
platty의 자동 분석이나 데이터베이스를 설치하지 않았다. 문서 구조는 이 저장소의 선택이다.
기존 Figma 문제와 미확정 상품은 해당 작업 기록에 남아 있다. 문서 구조 정리 완료와 구분한다.
