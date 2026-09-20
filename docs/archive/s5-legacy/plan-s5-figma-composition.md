# S5 Figma 원자 조합 재구성

> 2026-09-21 보관 기록. 현재 기준은 [설계](../../design.md)와 [v2 검수](../../work/s5-design-system-v2/review.md)를 따른다. 아래 결정·수치·상태는 당시 기록이다.

> 2026-09-21 추가: 이 문서는 Legacy S5 계층과 API 기록이다. 현재 v2는 별도 00~04 페이지와 PB 자산을 사용한다. [v2 검수](../../work/s5-design-system-v2/review.md)를 따른다.

날짜: 2026-09-19. 상태: Figma 원자·조합·상위 자산 이행과 화면 검증 완료. 앱 기능 구현 미시작.

## 목표

- 사용자 원본 컨테이너 `19:1024`의 반복 구조를 원자·조합·화면 계층으로 정리한다.
- 타입은 일반 텍스트가 아니라 공통 타입 배지 인스턴스로 표시한다.
- `Pokemon Card`와 `Detail / Profile`은 같은 타입 배지와 특성 조합을 사용한다.

## 범위와 SSOT

- 결정: [design.md](../../design.md). 현재 상태: [progress.md](../../progress.md). 상세 계약: [plan-s5-figma-detail.md](plan-s5-figma-detail.md).
- 시각 기준: 원본 컨테이너 `19:1024`. 기존 파티 화면 `34:219`. 상세 프로필 `49:177`.
- 자산 기준: [공통 자산 목록](figma-s5-inventory.json). 상세 자산 목록: [figma-s5-detail-inventory.json](figma-s5-detail-inventory.json).
- Components 페이지 `7:2`의 기존 구조를 유지한다. 새 Figma 페이지는 만들지 않는다.
- 앱 코드, Code Connect, 전체 도감·상점·가방·설정 화면은 범위 밖이다.

## 감사 결과

- Code Connect 파일은 없다.
- 외부 라이브러리의 Badge와 색상 변수는 로컬 S5 토큰·속성 모델과 맞지 않는다.
- `32:151`과 `32:153`은 `Pokemon Card` 내부의 `TypeBadge` 프레임이다. 두 노드는 독립 컴포넌트가 아니다.
- `49:190` `Traits`는 타입과 성격을 한 문자열로 표시한다.
- 기존 Button, Navigation Item, Icon, Friendship Bar는 인스턴스 조합을 사용한다.
- 기존 `color/type-electric`, `color/type-fire`, `color/type-flying`, `color/paper`, `S5/Type/Type Badge`는 새 조합에 필요한 기반이다.

## 계층과 API

| 계층 | Figma 자산 | 구성 | API |
|---|---|---|---|
| Foundations | 기존 S5 Tokens·글꼴 스타일 | 색상·간격·반경·글꼴 | 새 변수와 스타일을 만들지 않는다 |
| Atom | `Pokemon / Type Badge` | 전기·불꽃·비행의 배경과 라벨 | `Type` VARIANT: Electric, Fire, Flying |
| Molecule | `Pokemon / Type Tags` | Primary Type Badge, Secondary Type Badge | `Primary Type`, `Secondary Type` INSTANCE_SWAP. `Show Secondary` BOOLEAN |
| Molecule | `Pokemon / Traits` | Pokemon / Type Tags, 성격 | `Type Tags` INSTANCE_SWAP. `Nature` TEXT |
| Organism | `Pokemon Card` | Portrait, Identity, Nature, Pokemon / Type Tags, Friendship Bar | 기존 Visibility, Name, Level, Debuff, Nature, Friendship Bar를 유지한다 |
| Organism | `Detail / Profile` | Portrait, Identity, Pokemon / Traits, Friendship Bar | Hidden, Meta, Name, Friendship Bar를 유지한다. 기존 `Traits` TEXT를 제거한다 |
| Screen | Party와 Detail 화면 | Header, Navigation, Organism 인스턴스 | 화면은 직접 그리지 않는다 |

- `Pokemon / Type Badge`의 라벨은 Type VARIANT가 결정한다. 임의 Label TEXT 속성은 제공하지 않는다.
- `Pokemon / Type Tags`는 Type Badge 인스턴스 두 개를 직접 포함한다.
- `Pokemon / Traits`는 Pokemon / Type Tags 인스턴스와 성격 텍스트를 직접 포함한다.
- `Pokemon Card`는 Pokemon / Type Tags를 사용한다. 카드의 Nature는 이름 행의 기존 위치와 TEXT 속성을 유지한다.
- `Detail / Profile`은 Pokemon / Traits를 사용한다.
- Portrait는 이번 범위에서 새 컴포넌트로 만들지 않는다. 포켓몬 그림의 이미지 입력 API가 확정되지 않았다.
- 범용 Surface Card는 이번 범위에서 새 컴포넌트로 만들지 않는다. Card별 구조와 슬롯 계약이 확정되지 않았다.

## 이행

- `Pokemon Card` Visible·Hidden 변형의 원시 `TypeBadge` 프레임을 `Pokemon / Type Tags` 인스턴스로 교체한다.
- `Pokemon Card`의 기존 `Nature` TEXT 속성과 배치 위치를 유지한다.
- `Detail / Profile`의 `Traits` TEXT 노드와 속성을 `Pokemon / Traits` 인스턴스로 교체한다.
- 파티의 피카츄 카드 `34:277`은 Electric, Secondary hidden, 느긋 값을 사용한다.
- 상세 화면의 프로필은 Electric, Secondary hidden, 느긋 값을 사용한다.

## 위험과 수용 검사

- 기존 인스턴스의 문자 재정의가 새 중첩 인스턴스와 충돌할 수 있다. 변경 뒤 파티와 상세 화면 값을 다시 설정한다.
- Type Badge 배경과 글자 색이 반드시 기존 변수와 `S5/Type/Type Badge` 스타일을 참조해야 한다.
- `Pokemon Card`와 `Detail / Profile` 안에 원시 `TypeBadge` FRAME 또는 `Traits` TEXT가 남으면 실패다.
- `Pokemon / Type Tags`는 Type Badge 인스턴스를 정확히 두 개 포함해야 한다.
- `Pokemon / Traits`는 Pokemon / Type Tags 인스턴스 하나와 Nature TEXT 하나를 포함해야 한다.
- 기본·숨김·돌봄 완료·확인·실패 화면을 캡처로 확인한다.
- Figma 프로토타입 연결은 유지한다.
- 런타임 코드가 없으므로 앱 검사는 실행하지 않는다.

## 완료 근거

- `Pokemon / Type Badge` `82:233`은 세 Type VARIANT와 변수·글꼴 바인딩을 제공한다.
- `Pokemon / Type Tags` `85:227`은 Type Badge 인스턴스 두 개를 사용한다.
- `Pokemon / Traits` `87:245`은 Type Tags 인스턴스와 Nature TEXT를 사용한다.
- `Pokemon Card` `32:137`의 원시 TypeBadge FRAME은 0개다.
- `Detail / Profile` `49:177`의 평면 Traits TEXT는 0개다.
- 파티 `34:219`와 기본 상세 `64:320` 캡처에서 타입 배지, 성격, 카드와 프로필의 배치가 맞다.
