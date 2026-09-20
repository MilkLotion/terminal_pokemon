# S5 디자인 시스템 v2 검수

날짜: 2026-09-21. 상태: 두 공유 대화와 00~05 검수·문서 동기화 완료. 디자인 수정 항목은 열림.

## 근거와 검사 범위

- [현재 Figma](https://www.figma.com/design/MA3K41Y6omAi5mRu6YDFly/pokebuddy?node-id=113-245)의 페이지, 컴포넌트, 변수, 글꼴 스타일을 직접 읽었다.
- [공유 대화](https://chatgpt.com/share/6aaffb44-3534-83ee-874e-9a63888658eb)에는 Template 조립, 상세 높이 확장, 메뉴 아이콘 교체, 내비게이션 선택 표시 수정 기록이 있다.
- [추가 공유 대화](https://chatgpt.com/share/6aaffe73-d0e0-83ee-8d3c-8a674cbcb916)에는 05의 6개 화면, 카드 숨김 마커, 모달 Template 변형의 작업 기록이 있다.
- [검수 계획](plan.md)과 [관측 자산 목록](evidence/inventory.json)을 함께 사용한다.
- 05의 상세 근거는 [화면 자산 목록](evidence/screens-inventory.json)에 있다.
- Figma는 여러 번에 나누어 읽었다. 자산 목록은 단일 시점의 전체 백업이 아니다.
- 이번 작업에서 Figma 노드를 생성·수정·삭제하지 않았다.

## 페이지별 현재 구성

상위 자산 수는 독립 COMPONENT와 COMPONENT_SET을 각각 하나로 센다. 세트 내부 variant는 상위 자산 수에 더하지 않는다.

| 페이지 | ID | 상위 자산 | 확인한 내용 |
|---|---|---:|---|
| 00 · Foundations | `113:245` | 안내 프레임 1 | `114:996`에 계층과 PB 토큰 사용 원칙을 표시한다. 색상 견본과 글꼴 비교표는 없다. |
| 01 · Atoms | `113:246` | 29 | Button 16종, Type Badge 18종, Portrait, Status Dot, Size Step, Text, 아이콘, 선택 밑줄을 제공한다. |
| 02 · Molecules | `113:247` | 12 | Navigation Item, Friendship, Traits, Debuff Badge, Size Selector, Notice, Care Action, Setting Row, App Brand, Point Balance, Party Slot, Action Group을 제공한다. |
| 03 · Organisms | `113:248` | 13 | 기존 12개에 Modal Scrim을 추가했다. |
| 04 · Templates | `113:249` | 3 | App Shell, Party Layout, Pokemon Detail Layout 세트를 제공한다. 상세 세트는 3개 variant다. |
| 05 · Screens | `113:250` | 화면 FRAME 6 | 파티와 상세 기본·숨김·성공·확인·오류를 제공한다. |

- 기존 `Page 1`, `S5 · Design System`, `S5 · Components`, `S5 · Screens`는 남아 있다. 실제 페이지 이름에 Legacy 접두어는 없다.
- 새 화면의 원본은 v2의 01~04다. 기존 S5 자산 목록은 이전 작업의 기록이다.
- Molecule의 직접 인스턴스 의존 대상은 Atom이다.
- Organism은 Atom과 Molecule을 조합한다. 모든 참조를 바로 아래 한 계층으로 제한한 구조는 아니다.
- Template의 직접 인스턴스 의존 대상은 Organism뿐이다. Template끼리 중첩하지 않는다.
- 02~04에서 인스턴스 내부를 제외한 직접 TEXT·도형은 0개다. 배치용 FRAME은 남아 있다.
- `Portrait` `120:121`은 `Artwork` INSTANCE_SWAP을 제공한다. 이전 문서의 Portrait 미생성 기록은 v2에 적용하지 않는다.
- `Traits` `119:969`은 Type Badge 두 개와 성격 텍스트 원자를 조합한다. v2에는 별도 Type Tags Molecule이 없다.

## 스타일 작업과 현재값

기존 S5는 아이보리 헤더와 Outfit·Inter 혼용이었다. v2는 흰 헤더·카드, 회녹색 본문, 청록색 행동 버튼과 Inter 글꼴을 사용한다. 검사한 01~04 노드의 효과는 0개다.

### 변수와 색상

| 컬렉션 | 변수 수 | 모드 | 역할 |
|---|---:|---|---|
| PB / Primitive | 33 | Value | 원시 색상 |
| PB / Color | 36 | Light | Primitive를 가리키는 의미별 색상 |
| PB / Dimension | 18 | Value | 간격·반경·컨트롤 높이·선 굵기 |
| S5 Tokens | 47 | Light | 이전 자산 보존 |

PB 변수는 87개다. 파일 전체 변수는 134개다. PB 색상 별칭의 누락 대상은 0개다. 이 수는 변수 정의 수이며 사용 완료 수가 아니다.

| 역할 | PB / Color 이름 | 현재값 |
|---|---|---|
| 본문 배경 | `bg/canvas` | `#F1F2EE` |
| 헤더·카드 배경 | `bg/surface` | `#FFFFFF` |
| 선택 배경 | `bg/accent` | `#EBF4F1` |
| 기본 문자 | `text/primary` | `#1A3330` |
| 보조 문자 | `text/secondary` | `#4A6663` |
| 테두리 | `border/default` | `#DDE1DB` |
| 주요 행동 | `action/primary` | `#0F766E` |
| 호버·선택 밑줄 | `action/primary-hover` | `#0A5F56` |
| 성공·경고·오류 | `status/success`, `status/warning`, `status/error` | `#10B981`, `#F59E0B`, `#DC2626` |

- Dimension 간격 값은 0·4·8·12·16·20·24·32px다.
- 반경 값은 4·8·12·16·999px다. 컨트롤 높이는 22·32·36px다. 선 굵기는 1·2px다.
- 사용자 내비게이션의 10px padding과 10px radius는 이 목록에 없다. 가장 가까운 값으로 바꾸지 않는다.
- Type Badge는 `pokemon/type/*` 18색과 `text/on-color`를 사용한다.
- 이전 이름 `type/electric`, `type/fire`, `type/flying`도 PB 컬렉션에 남아 있다. 현재 배지에 쓰는 색상과 값이 다르다.

### 글꼴

PB 글꼴 스타일은 9개다. 모두 Inter다. 기존 S5 스타일 14개는 별도로 남아 있다.

| PB/Type 아래 이름 | 굵기 | 크기 / 행간(px) |
|---|---|---|
| Title | Bold | 24 / 32 |
| Heading | Semi Bold | 18 / 26 |
| Body | Regular | 14 / 20 |
| Label/Regular | Regular | 13 / 18 |
| Label/Semibold | Semi Bold | 13 / 18 |
| Caption/Regular | Regular | 12 / 16 |
| Caption/Semibold | Semi Bold | 12 / 16 |
| Badge/Semibold | Semi Bold | 11 / 16 |
| Micro/Semibold | Semi Bold | 10 / 14 |

01~04의 검사한 TEXT는 모두 PB 스타일을 참조한다. 00 안내 프레임의 설명용 TEXT 5개는 제품 컴포넌트 검사에서 제외했다. 실제 앱의 한국어 대체 글꼴과 플랫폼 렌더링은 검증하지 않았다.

## 내비게이션 검수

기준은 사용자가 수정한 `114:967`이다. 현재는 `Primary Navigation` 세트 `208:542`의 `Active=Party` variant다.

| 항목 | 확인값 |
|---|---|
| Primary Navigation | 720×52px, 왼쪽 정렬 |
| Navigation padding | 위·아래 10px, 좌·우 32px |
| 메뉴 사이 간격 | 8px |
| Navigation 하단 테두리 | 1px, `border/default` |
| Navigation Item | 80×32px, 좌·우 padding 10px, radius 10px |
| Selected Item 자체 선 | `strokes=[]`. `strokeWeight` 숫자가 남아 있어도 그릴 선은 없다. |
| 선택 표시 Atom | `Indicator / Navigation Selected` `207:122` |
| 선택 밑줄 | 60×2px, 네 모서리 1px |
| Item 안의 밑줄 위치 | x=10px, y=31.5px |
| 밑줄 색상 | `action/primary-hover` |

- Party·Pokédex·Shop·Bag·Settings의 5개 Active variant를 확인했다.
- 각 variant에는 Selected Item 1개와 선택 밑줄 1개가 있다.
- 아이콘 연결은 파티 `202:126`, 도감 `202:133`, 상점 `202:140`, 가방 `140:135`, 설정 `202:144`다.
- 아이콘은 로컬 Atom 인스턴스다. `Navigation Item.Icon` INSTANCE_SWAP으로 교체한다.
- 공유 대화는 게임 메뉴를 참고한 벡터 재구성이라고 설명한다. 이번 검수에서 원본 게임 이미지와의 일치 여부는 재검증하지 않았다.
- 세 Template은 이 Primary Navigation의 인스턴스를 사용한다.

## 템플릿과 후속 화면

| 자산 | ID | 크기 | 구조 |
|---|---|---|---|
| App Shell | `195:319` | 720×780 | 헤더, 내비게이션, 본문, 하단 여백 |
| Party Layout | `196:189` | 720×780 | Page Header와 2열×3행 파티 그리드 |
| Pokemon Detail Layout | 세트 `226:913` | 각 variant 720×1030 | None `197:413`, Confirm `226:845`, Error `226:858` |

- Pokemon Card `123:149`와 Party Slot Card `194:317`의 각 상태는 320×160px다.
- Party grid는 폭 656px다. 열·행 간격은 16px다. 카드 3개, 빈 칸 1개, 잠긴 칸 2개를 배치한다.
- Page Header `157:971`의 `Show Action`으로 돌아가기 버튼을 숨긴다.
- 상세 Template 본문 `197:450`은 720×888px다. `clipsContent=false`, `overflowDirection=NONE`이다.
- 상세 구역 묶음은 656×768px다. 구역 간격은 20px다.
- 공유 대화의 초기 720×780 상세 Template은 이후 720×1030 전체 콘텐츠 형태로 변경됐다.
- 실제 실행 화면에서 높이 780px와 본문 638px 스크롤을 적용해야 한다. 추가 Screens 검사에서는 본문이 여전히 888px이며 스크롤 설정이 없었다. V2-06을 따른다.
- 05에는 `Party / Approved UI` `217:1705`가 있다. 720×780 프레임 안에서 Party Layout 인스턴스를 사용한다. 이름의 Approved는 노드 이름이며 이번 검수의 승인 판정이 아니다.
- 초기 관측에서는 파티와 상세 기본 두 화면을 확인했다. 추가 대화 수신 후에는 아래 6개 화면을 다시 검사했다.
- 05의 정적 상태 6개는 구성됐다. 스크롤·프로토타입·표시값 문제 때문에 전체 이행 완료 판정은 보류한다.

## 검사 결과와 한계

| 검사 | 결과 |
|---|---|
| 01~04 상위 자산 겹침 | 0쌍 |
| 02~04 인스턴스 밖 TEXT·도형 | 0개 |
| Template의 Organism 외 직접 인스턴스 의존 | 0개 |
| 01~04 누락 컴포넌트 | 0개 |
| 01~04 확인한 노드·paint 바인딩의 S5 또는 누락 변수 참조 | 0개 |
| 01~04 PB 외 글꼴 스타일 | 0개 |
| 01~04 효과 | 0개 |
| 변수에 연결되지 않은 단색 paint | 숨김 마커 원본 4개. 아래 예외 기록을 따른다. |
| 대표 시각 검사 | 내비게이션 5상태, 전체 상세 Template, 파티 화면 캡처 확인 |

- 첫 구조 조회는 API 기본값 `skipInvisibleInstanceChildren=true`를 사용했다.
- 색상·참조 최종 검사는 이를 `false`로 설정해 숨김 자식까지 포함했다.
- 추가 작업 후 단색 paint 미연결 수는 Atoms 4, Molecules 0, Organisms 8, Templates 24, Screens 32다. 상위 계층의 값은 같은 마커의 인스턴스 복제로 증가한다. 초기 Template 검사값 16은 모달 변형 추가 전 기록이다.
- 따라서 공유 대화의 `하드코딩 paint 0`을 현재 전체 자산에 대한 판정으로 옮기지 않는다.
- 캡처에서는 내비게이션 정렬과 선택 밑줄, 상세 전체 구역, 파티 카드 배치를 확인했다. 모든 상태의 잘림이나 접근성을 통과했다는 판정은 아니다.

## 열린 항목

수정 우선순위와 다음 행동은 [피드백](feedback.md)을 따른다.

### V2-01 — 타입 배지 문자 대비

18개 배지는 11px 흰 글자를 사용한다. sRGB 변수값으로 계산하면 13개가 4.5:1 미만이다. 일반 크기 문자의 최소 대비 기준은 [W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)을 따른다. 아래 표시는 소수 둘째 자리로 반올림했다. 판정에는 반올림 전 값을 사용한다.

| 타입 | 흰 글자 대비 | 타입 | 흰 글자 대비 |
|---|---:|---|---:|
| Bug | 2.87 | Dark | 7.80 |
| Dragon | 5.12 | Electric | 1.67 |
| Fairy | 2.55 | Fighting | 2.52 |
| Fire | 4.47 | Flying | 2.08 |
| Ghost | 7.84 | Grass | 3.31 |
| Ground | 6.17 | Ice | 1.85 |
| Normal | 2.60 | Poison | 5.49 |
| Psychic | 3.68 | Rock | 2.38 |
| Steel | 2.88 | Water | 3.87 |

계산식은 `(밝은 상대 휘도 + 0.05) / (어두운 상대 휘도 + 0.05)`다. 흰색 휘도는 1이다. 원시 RGB 값은 [자산 목록](evidence/inventory.json)에 있다. 어두운 문자 또는 배경 조정의 선택은 미확정이다. 전체 앱 접근성 감사는 실행하지 않았다.

### V2-02 — 숨김 마커 색상 예외

`Visibility Marker` `154:1010`의 `154:1013`~`154:1016`은 흰색·빨강 `#FF1C1C`·검정을 직접 지정한다. 브랜드 그림 예외로 둘지 PB 변수로 연결할지 정해야 한다. 예외 결정 전에는 `PB 토큰만 사용` 규칙의 완전 충족으로 표시하지 않는다.

### V2-03 — 변수 정의와 실제 연결의 차이

01~04에서 Dimension 변수 18개 중 직접 연결을 확인한 것은 `spacing/2`, `radius/md`, `radius/full`, `stroke/thin`의 4개다. 나머지 값은 변수 정의가 있어도 해당 범위 노드에서 직접 참조되지 않는다. 내비게이션 10px 값과 밑줄 좌표는 사용자 기준값으로 유지한다. 토큰 이행 시 값과 연결을 함께 검수한다. 이전 `type/*` 3개는 해당 범위에서 직접 참조가 없다. 전 파일 사용처 검사 전에는 삭제하지 않는다.

### V2-04 — 대표 데이터와 그림 연결

Portrait의 Artwork 기본값은 `Icon / Placeholder`다. 파티 화면과 상세 Template 캡처에서도 원형 자리표시자가 보인다. 타입·성격·친밀도·상태명은 예시 자료다. 상세 Template의 피카츄에 보조 비행 타입이 보인다. 이를 실제 종 데이터의 계약으로 사용하지 않는다. 그림 교체와 Screens 데이터 검수가 필요하다.

추가된 상세 Screen 5개는 피카츄를 전기 단일 타입으로 재정의했다. 이 부분은 확인됐다. 그림 자리표시자와 파티의 리자드 타입 문제는 남아 있다.

### V2-05 — 돌봄 버튼 위계

이전 S5 기록은 밥 주기를 강조 버튼, 놀아주기를 보조 버튼으로 정의한다. 현재 상세 Template 캡처는 두 버튼 모두 강조색이다. v2에서 두 행동을 동등하게 강조할지 결정해야 한다. 이번 작업에서는 Figma 값을 변경하지 않았다.

## 추가 공유 대화와 05 전체 검수

두 번째 대화의 생성 결과를 현재 파일에서 모두 확인했다. 생성 사실과 검수 통과 범위는 구분한다.

| 대화의 작업 내용 | 직접 확인한 결과 | 판정 |
|---|---|---|
| 파티 3마리·빈 칸 1·잠긴 칸 2 | `217:1705`가 Party Layout을 사용한다. 세 번째 카드만 숨김 마커를 표시한다. | 구조 일치. 종 타입과 막대는 수정 필요. |
| 상세 기본 데이터 | `217:1968`의 Warning, Lv.36, 전기 단일, 느긋, 85 / 100을 확인했다. | 문자·상태 일치. 스크롤·막대는 수정 필요. |
| 상세 숨김 | `222:1063`의 숨김 메타, 마커 true, 다시 표시 버튼을 확인했다. | 설정 설명에 반대 상태가 남았다. |
| 돌봄 성공 | `222:1228`의 Success, 돌봄 완료, 배고픔 해소 문구를 확인했다. | 정적 상태 일치. 성공 전후 이동은 없다. |
| Dialog None·Confirm·Error | 세트 `226:913`에 3개 variant가 있다. | 구조 일치. |
| Modal Scrim Organism | `226:464`가 Scrim Atom `141:125`를 사용한다. | 계층 일치. 불투명도 문제는 남았다. |
| 확인창 중앙 정렬 | `227:1397`에서 440×204px, x=140, y=288이다. | 720×780 viewport 중앙과 일치한다. |
| 오류 확인창 자동 확장 | `227:1929`에서 440×288px, x=140, y=246이다. | 중앙 정렬과 84px 높이 증가를 확인했다. |
| Screen에서 원시 레이어 추가 없음 | 각 루트에는 Template 인스턴스 하나가 있다. 모달은 Template 아래에 있다. | 일치. |
| 주요 화면 상태 이행 완료 | 여섯 정적 화면은 존재한다. 전체 후손의 reaction과 스크롤 설정은 0개다. | 동작을 포함한 완료 판정은 보류한다. |

### 화면 목록

| 화면 | Screen ID | Template 원본 | 상태 |
|---|---|---|---|
| Party / Approved UI | `217:1705` | `196:189` | 세 번째 카드 숨김 |
| Detail / Base | `217:1968` | `197:413` | Dialog=None, Warning |
| Detail / Hidden | `222:1063` | `197:413` | Dialog=None, Warning, 숨김 |
| Detail / Care Success | `222:1228` | `197:413` | Dialog=None, Success |
| Detail / Dismiss Confirm | `227:1397` | `226:845` | Dialog=Confirm, Show Error=false |
| Detail / Dismiss Save Error | `227:1929` | `226:858` | Dialog=Error, Show Error=true |

- 여섯 화면 모두 720×780이며 `clipsContent=true`다.
- 다섯 상세 화면의 내부 Template은 720×1030이다.
- 03~05를 다시 조회했다. 누락 컴포넌트·PB 외 변수 참조·상위 노드 겹침은 0개다.
- 05의 직접 의존은 04 Template뿐이다. 인스턴스 밖 TEXT·도형은 0개다.
- 여섯 루트 화면을 1배율 캡처로 확인했다. 확인·오류 화면의 배경이 완전히 가려지는 현상도 캡처에서 재현했다.
- `effectiveVisible` 자료는 visible 플래그만 검사한다. viewport 밖이거나 배경막 뒤에 있는 문자가 실제 보인다는 뜻은 아니다.

### V2-06 — 상세 화면의 본문 스크롤 누락

다섯 상세 Screen과 내부 모든 후손의 `overflowDirection`은 `NONE`이다. 본문은 888px이며 루트 780px 프레임에서 잘린다. Base의 진화 조건·가방 버튼은 y=830, 교체·소환 해제 버튼은 y=924에 있다. 현재 설정으로는 이 버튼에 스크롤로 도달할 수 없다. 예를 들어 Base 본문은 `I217:1969;197:450`이다.

전체 콘텐츠 Template은 유지하되 실행 Screen의 본문 638px 스크롤, 고정 헤더와 모달 위치를 함께 설계해야 한다. 상세 기본·숨김·성공과 모달 상태 모두 재검사한다. [현재 S5 수용 기준](../../specs/s5.md)의 본문 스크롤 조건은 아직 충족하지 않는다.

### V2-07 — 숨김 화면의 상태 설명 불일치

Hidden 화면의 상단은 `파티 1번 · 숨김`이다. 마커도 표시된다. 버튼은 `다시 표시`다. 그러나 `I222:1064;197:559;162:203;184:180;182:159`에는 `지금 화면에 표시 중이에요.`가 남아 있다. 숨김 상태에 맞는 설명으로 바꿔야 한다. Base와 Hidden이 같은 설정 설명을 그대로 공유하지 않도록 확인한다.

### V2-08 — 모달 배경막이 완전히 불투명함

Scrim Atom `141:125`의 노드 opacity와 fill opacity는 모두 1이다. `overlay/scrim` 별칭의 색상 alpha도 1이다. Modal Scrim과 Screen 인스턴스의 opacity도 1이다. 결과적으로 Confirm과 Error에서 기존 화면이 보이지 않는다.

Legacy에서는 같은 문제를 노드 opacity 0.16으로 수정했다. [이전 F-02 기록](../../archive/s5-legacy/review-s5.md)을 참고한다. v2의 최종 불투명도는 정해야 한다. 검수 판정에서는 현재 모달을 반투명 오버레이로 기록하지 않는다.

### V2-09 — 친밀도 숫자와 막대 비율 불일치

파티 카드 3개와 상세 프로필 5개에서 track은 모두 220px, fill은 모두 156px다. 156 / 220은 약 70.91%다. 85 / 100과 71 / 100 사이에 fill 차이가 없다.

파티 카드의 progress 래퍼는 182px이고 `clipsContent=true`다. 220px track이 잘려 세 카드 모두 약 85.71% 길이로 보인다. 상세 progress 래퍼는 492px이지만 track은 220px에 머문다. 숫자만 바꾼 현재 재정의로는 값 비율과 폭 대응이 유지되지 않는다. 기준 폭과 value/max 연결 방식을 정한 뒤 0·71·85·100 값과 카드·프로필 폭을 확인해야 한다. 숫자를 variant 축으로 추가하지 않는 규칙은 유지한다.

### V2-10 — 파티 예시의 종과 타입 불일치

파티 두 번째와 세 번째 카드는 `리자드`와 `불꽃+비행`을 표시한다. [종 데이터](../../../data/species.defaults.json)의 `charmeleon.types`는 `["fire"]`다. [한국어 이름](../../../lib/names.json)의 `charmeleon.ko`는 `리자드`다. 불꽃·비행 조합은 `charizard`인 `리자몽`에 해당한다. 리자드를 유지하면 보조 타입을 숨긴다. 리자몽 의도라면 이름과 관련 예시 데이터를 함께 바꾼다.

### V2-11 — 상태 간 프로토타입 연결 없음

6개 Screen의 루트와 전체 후손을 검사했다. reaction은 0개다. 파티 카드→상세, 파티로, 숨기기↔다시 표시, 밥 주기→성공, 소환 해제→확인, 취소·실패·재시도 이동은 연결되지 않았다. 정적 화면 상태 구성과 프로토타입 이행을 구분한다.

### V2-12 — 저장 실패의 재시도 조작 미정

Error 화면은 `기존 파티를 유지했어요. 다시 시도해 주세요.`라고 안내한다. 버튼은 Confirm과 같은 `취소 / 소환 해제`다. `다시 시도` 라벨은 없다. 기존 상세 계약의 재시도·취소 흐름에 맞춰 버튼 명칭과 목적지를 정해야 한다. 저장을 실제로 실행하거나 기존 파티 유지 동작을 검증한 화면은 아니다.

## 문서 수정과 검증

- 이전 완료 기록은 삭제하지 않았다. 날짜와 Legacy 적용 범위를 추가했다.
- 현재 결정, 현황, 용어, 문서 지도에 v2 기록을 연결했다.
- 자산 목록은 관측 근거다. 앱 구현이나 Figma 백업을 대신하지 않는다.
- 임시 Node 검사 스크립트로 `docs/` 최상위 Markdown 23개의 상대 파일 링크 162개를 확인했다. 누락 경로는 0개다. 제목 앵커와 외부 URL의 전체 검사는 포함하지 않았다.
- `node <임시 경로>/pokebuddy-v2-doc-check.cjs`는 통과했다. JSON 구문, 변수 별칭, 자산 수, 글꼴 수, 내비게이션 5종, Dialog 3종, Screen 6개가 문서와 일치했다.
- 대비 미달 13개, 스크롤·reaction 0개, Hidden 설명, 모달 크기·좌표·opacity, 막대 8개의 폭, 리자드 종 데이터도 기록과 일치했다. 문제의 재현 확인이며 디자인 통과 판정이 아니다.
- `git diff --check`는 통과했다. 이는 문서 무결성 검사이며 열린 디자인 항목의 해결 판정이 아니다.
- 런타임 코드 변경이 없어 빌드·타입 검사·자체 검사는 실행하지 않았다.
