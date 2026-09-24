# S5 게임 런타임 구현 기록

S5 새 게임 규칙을 실제 앱에 붙이는 구현 작업의 기록이다. 절마다 작업별 소절을 둔다.
2026-09-25 에 [Figma 2판 작업 기록](../s5-design-system-v2/plan.md)에서 나눴다. 2026-09-24 이전의 구현 절(저장 v3 타입, 거래 실행기, 명령, 관리 창 탭 등)은 그 파일에 남아 있다.
번호의 뜻은 [번호 체계](../../terms.md#번호-체계)를 따른다.

| 작업 | 날짜 | 커밋 |
|---|---|---|
| 실제 앱을 저장 v3 으로 (검수·수정 포함) | 2026-09-24 | `65db4f8` |
| 끊긴 기능 세 가지 | 2026-09-24 | `c58da23` |
| 옛 v2 코드 정리 | 2026-09-25 | 진행 |

## 설계

### 실제 앱을 저장 v3 으로

날짜: 2026-09-24. 사용자 지시: “커밋하고 실제 앱에 v3 연결해봐”. 지금까지 만든 v3 을 실제로 도는 앱에 붙였다.
이 작업은 설계 절을 따로 적지 않고 시작했다. 아래는 작업 뒤에 적은 판단이다.

**저장 하나** — v3 은 따로 두었던 `save-v3.json` 을 버리고 기존 `save.json` 을 쓴다. 처음 열 때 v2 를 v3 으로 옮기고 원본을 `save.json.v2.bak` 에 남긴다. 두 저장이 함께 살면 관리 창에서 밥을 주고 바탕화면에서는 굶는 일이 생긴다. 그래서 반쪽 연결을 하지 않고 한 번에 넘겼다.
`createGame` 에 `canWrite` 를 더했다. `save.lock` 을 잡은 프로세스만 쓴다. reader 는 읽기만 하고 명령은 mailbox 로 보낸다 (docs/specs/modules.md "저장 쓰기는 주 프로세스 하나가 한다").
SSOT: `docs/specs/s5.md` 의 화면 구조와 저장, `docs/specs/modules.md` 의 저장 구조.

### 끊긴 기능 세 가지의 v3 설계

날짜: 2026-09-24. 상태: 구현·검수 완료. 사용자 지시: "A로 진행해". 설계 승인: "진행해".
대상은 v3 전환에서 끊긴 에이전트 보상, 모습 선택, 찌르기다. [실제 앱을 저장 v3 으로](#실제-앱을-저장-v3-으로)의 "끊긴 것"을 닫는다.

**사용자 결정** (2026-09-24)
- 에이전트 보상: 작업 시간 기준. 원문 선택지는 "작업 시간 기준 (권장)"이다.
- 찌르기: 원문은 "포켓몬클릭이 놀아주기인데?"다. 계약도 같다(`docs/specs/s5.md` "직접 돌봄 — 클릭 한 번으로 반응을 구경한다"). 찌르기는 따로 두지 않는다.
- 별명·모습: 계약대로 제거. 원문 선택지는 "계약대로 제거 (권장)"다.

**목표**
1. 에이전트가 작업하는 동안 파티 개체의 시간 적립이 2배가 된다. 기본 적립에 더하는 추가 이득이다. 상한을 두지 않는다.
2. 포켓몬을 클릭하면 놀아주기를 한다. 쿨타임이면 반응만 보인다.
3. 무대는 실제 종의 이름과 그림을 보인다. 옛 별명과 모습은 `legacy` 에 보존만 한다.

**범위**
- 에이전트 보상: `applyTime` 이 작업 시간(`workMs`)을 받는다. 작업 시간만큼 친밀도 진행과 포인트 진행을 한 번 더 쌓는다. 배율(버프·만복도 구간)은 기본 적립과 같다. 파티 칸의 개체만 받는다. 숨김도 받는다. 박스는 받지 않는다. 받은 친밀도는 `daily.work` 에 더한다.
  작업 판정은 v2 와 같다. 무대의 에이전트 상태가 `running` 인 시간이다. writer 의 15초 틱이 판정한다. 토큰량은 보상 계산에 쓰지 않는다.
- 클릭: 무대 클릭은 `play` 명령을 보낸다. 성공하면 놀아주기 연출을 보인다. 실패하면(쿨타임·세션 펫) 클릭 반응만 보인다. `poke` 명령은 반응만 하는 명령으로 남긴다. CLI 호환 때문이다.
- 모습: `src/main/party-v3.ts` 가 `legacy` 의 `look:<id>`·`nick:<id>` 를 읽지 않는다. `pet.look` 은 `removed` 로 답한다.
  같은 날 검수 #4 의 "진화하면 `look:<id>` 를 옮긴다"는 무대가 legacy 모습을 읽을 때만 필요했다. 이번 변경 뒤에는 필요 없으므로 되돌린다. 검사 `selftest-evolve` (11)도 함께 지운다.

**SSOT**: `docs/specs/s5.md` (종료와 재개 뒤의 전환 문단, 직접 돌봄), `docs/specs/balance.md` (버프와 친밀도), `docs/design.md` (적립 표), `docs/terms.md` (작업 시간).

**위험**
- 작업 판정이 무대의 에이전트 상태에 기댄다. 상태가 `running` 으로 남으면 보너스가 계속 쌓인다. v2 와 같은 위험이다.
- 클릭이 놀아주기가 되면 끌기 뒤의 클릭도 놀아주기가 될 수 있다. 무대가 끌기와 클릭을 구분하는지 작업에서 확인한다.
- 옛 별명을 쓰던 사용자는 무대 이름이 종 이름으로 바뀐다. 값은 `legacy` 에 남는다.

**수용 검사**
1. `selftest-time-v3`: 작업 시간이 친밀도·포인트 진행을 2배로 만든다. 작업 시간은 흐른 시간을 넘지 않는다. 박스 개체는 받지 않는다. `daily.work` 에 기록한다.
2. `selftest-manage`: `game.tick` 에 작업 여부를 주면 적립이 늘어난다.
3. 클릭 처리 검사: 놀아주기 성공 시 연출, 쿨타임 시 반응만, 세션 펫은 반응만.
4. `selftest-stage`: v2 에서 옮긴 개체가 종 이름과 종 그림으로 나온다. `legacy` 값은 남는다.
5. `pet.look` 이 `removed` 로 답한다.
6. `npm run selftest`, `node scripts/e2e-companion.cjs` 통과.
7. 문서: 에이전트 보상 수치를 `balance.md` 에 적는다. `s5.md` 의 `[스펙 미확정]` 문장을 닫는다. `design.md` 의 v2 토큰 적립 표를 v3 기준으로 고친다.

**이번 범위 밖으로 관측한 것**
- v3 에는 기분이 바뀌는 규칙이 없다. 우클릭 메뉴의 기분이 늘 같다.
- `docs/design.md` 와 `docs/terms.md` 의 오래 놀아주기 설명(10초 안에 이어 누르며 약 30초)이 구현된 3중첩 규칙과 다르다.

### 옛 v2 코드 정리의 설계

날짜: 2026-09-25. 상태: 커밋 1 작업·검수 완료. 커밋 2 미시작. 사용자 지시: "진행" ([작업 후보](../../progress.md#작업-후보) 2번). 설계 승인: "진행".

**관측** (제품 진입점에서 import 를 따라간 결과. 진입점은 `src/main/app.ts`, `preload.ts`, 렌더러, `src/cli/game.ts`, 훅, `cli/*.js` 가 부르는 `dist/` 모듈이다)
- 앱과 CLI 가 쓰지 않는 모듈 5개: `src/dex/progress.ts`, `src/main/game-menu.ts`, `src/shop/catalog.ts`, `src/shop/core.ts`, `src/state/core.ts`. 검사 `selftest-shop`·`selftest-state`·`smoke-renderer` 만 쓴다.
- 쓰는 모듈 안의 v2 전용 코드: `src/main/party.ts` 의 `createSaveParty` 와 도움 함수, `src/main/paths.ts` 의 `readSavedWindows`, `src/main/text.ts` 의 `stateLine`, `src/main/commands.ts` 의 `PartySource | V3Party` 갈래.
- **결함**: `cli/run.js` 와 `cli/status.js` 가 저장을 v2 읽기(`dist/save/store.js`)로 읽는다. v3 저장을 v2 로 읽으면 "파손"이 된다(임시 v3 파일로 확인). 그래서 2026-09-24 전환 뒤 `pokebuddy status` 는 늘 "저장이 깨짐"을 보이고, `pokebuddy companion` 은 늘 "첫 실행" 안내를 보인다. 저장 파일은 바뀌지 않는다(`repair: false`).
- `selftest-stage` 의 저장 잠금·reader·writer 검사 대부분이 `createSaveParty`(v2)를 본다. `createV3Party` 는 같은 일을 하지만 검사가 적다.

**목표**
1. CLI 가 v3 저장을 바르게 읽는다.
2. 앱이 쓰지 않는 v2 코드를 걷는다. v1·v2 저장을 v3 로 옮기는 길은 남긴다. 옛 저장을 가진 사용자의 진행을 지키기 위해서다.
3. "새 코드"를 뜻하던 `-v3` 꼬리표를 파일·함수 이름에서 뗀다. 저장 형식 자체를 가리키는 이름(`SaveV3`, `PetV3`, `SAVE_V3_RULES`, `save/v3.ts` 의 뜻)은 남긴다. [번호 체계](../../terms.md#번호-체계)와 맞춘다.

**범위** — 커밋 두 개로 나눈다.
- 커밋 1 (동작): CLI 수정, 죽은 모듈 5개와 v2 전용 함수 제거, 관련 검사 정리. `selftest-stage` 의 v2 잠금 검사는 `createV3Party` 로 옮겨 같은 성질(reader 는 쓰지 않는다, 창 펫은 독립 펫에 자리를 내준다, 잠금을 다시 잡는다)을 본다. `smoke-renderer` 는 v2 메뉴 부분을 뺀다.
- 커밋 2 (이름): 파일 이름 변경. 안: `main/game-v3.ts`→`main/game.ts`, `main/party-v3.ts`→`main/save-party.ts`, `main/status-v3.ts`→`main/status.ts`, `state/time-v3.ts`→`state/time.ts`, `state/care-v3.ts`→`state/care.ts`, `state/settings-v3.ts`→`state/settings.ts`, `shop/catalog-v3.ts`→`shop/catalog.ts`, `save/store.ts`→`save/legacy.ts`(v1·v2 읽기), `save/store-v3.ts`→`save/store.ts`, 검사 `selftest-*-v3` 도 같게. 함수 `createV3Party`·`V3Party`·`saveFileV3` 도 뗀다. 문서의 경로 링크를 함께 고친다.

**범위 밖** — 타입과 규칙표 이름(`SaveV3` 등), 데이터 파일, `lib/i18n` 의 쓰지 않게 된 문구 키(따로 정리).

**위험**
- 잠금 검사를 옮기다 빠뜨리면 여러 창의 저장 충돌을 못 잡는다. 옮기기 전 검사 이름 목록을 적고 옮긴 뒤 대조한다.
- 이름 변경이 문서 링크 수십 개를 바꾼다. `check-docs` 와 앵커 확인으로 잡는다.
- `cli/*.js` 는 타입 검사를 받지 않는다. 임시 HOME 으로 `pokebuddy status` 를 실제로 돌려 확인한다.

**수용 검사**
1. 임시 HOME 의 v3 저장으로 `pokebuddy status` 가 포인트·파티를 보이고 "깨짐"을 보이지 않는다. 저장이 없으면 "저장 없음"이다.
2. `pokebuddy companion` 의 첫 실행 판정이 v3 저장을 본다 (E2E 로 확인).
3. 진입점에서 닿지 않는 모듈이 `src/tools` 밖에 없다 (같은 import 추적).
4. v1·v2 저장을 여는 검사(`selftest-save`, `selftest-save-v3`, `selftest-stage` 이전 검사)가 통과한다.
5. 옮긴 잠금 검사가 옛 검사의 성질을 모두 본다.
6. `npm run build`, `npm run selftest`, `node scripts/e2e-companion.cjs`, `node scripts/check-docs.cjs` 통과.
7. 커밋 2 뒤 `src` 파일 이름에 `-v3` 가 없다.

## 작업

### 저장 v3 전환의 작업

**만든 파일** — `src/main/party-v3.ts`(무대가 보는 마리 목록), `src/main/status-v3.ts`(우클릭 메뉴의 상태 문구), `src/party/create.ts`(개체 하나 만들기), `src/party/starter.ts`(첫 선택), `src/party/home.ts`(놓아 둔 자리)다.
`party-v3` 은 저장을 직접 고치지 않는다. 잠금 잡기, 파일 다시 읽기, 무대가 읽을 모양으로 바꾸기 셋만 한다. 변경은 전부 실행기를 거친다.
파일 감시는 writer 와 reader 모두 건다. 자기가 쓴 것도 감시로 돌아와 읽으므로 메모리와 파일이 갈라지지 않는다.
개체 생성이 알 열기와 종 구매 두 곳에 각각 적혀 있었다. `newPet` 하나로 모으고 첫 선택도 같은 것을 쓴다.

**명령** — 저장을 바꾸는 명령은 전부 실행기로 간다. `src/main/commands.ts` 는 인자를 풀어 넘기고, 무대 반응과 그림 준비만 감싼다.
진화는 바뀔 모습의 그림을 먼저 받아 둔다. 못 받으면 저장을 건드리지 않고 `art-missing` 으로 끝낸다. v2 의 보호를 그대로 옮겼다.
`starter.pick` 과 `pet.set`(자리)을 새로 더했다. 첫 선택은 저장이 비었을 때만 한 번 돈다.
`settings.set` 은 창 표시 항목(hidden·clickThrough·keepVisible)만 여기서 처리하고 나머지 키는 저장으로 넘긴다. 한 이름이 두 곳을 맡는다.

**메뉴** — 트레이와 우클릭의 S4 상점·도감·모습·민트 항목을 걷었다. 관리 창이 그 일을 한다.
우클릭 메뉴는 계약대로 이름·상태 / 밥 주기·놀아주기 / 관리 창 열기 세 묶음이다. 상태 줄은 만복도 구간과 기분 구간을 보여 준다.

**시간** — `stateEngine.tick` + `advance` 를 `game.tick()` 으로 바꿨다. `applyTime` 은 흐른 시간을 받아 계산하므로 저장 주기(15초)마다 한 번 불러도 값이 맞는다.
알 준비 완료와 업적 달성은 OS 알림으로 알린다. 배너 화면은 아직 없다.

**옮기며 고친 것** — v2 가방의 `berry` 가 이름 그대로 넘어와 쓸 수 없는 도구가 됐다. 프리미엄먹이의 옛 이름이므로 옮길 때 `premium-food` 로 바꾼다.

**끊긴 것** — 이 전환으로 v2 의 다음 기능이 멈췄다. [끊긴 기능 세 가지의 v3 설계](#끊긴-기능-세-가지의-v3-설계)에서 닫았다.
에이전트 작업·토큰 보상: v3 시간 처리에 그 입력이 없었다.
모습 선택(`pet.look`): v3 개체에 `look` 이 없다. 옮긴 값은 `legacy` 에 남아 있었고 화면에 그대로 쓰였다. 명령은 `not-yet` 을 돌려줬다.
찌르기(`poke`): 무대 반응만 하고 저장을 바꾸지 않았다.

### 끊긴 기능 세 가지의 작업

설계대로 바꿨다.
- 에이전트 보상: `src/state/time-v3.ts` 의 `applyTime` 이 `workMs` 를 받는다. `src/main/game-v3.ts` 의 `tick` 이 그것을 넘긴다. `src/main/app.ts` 의 `stateTick` 이 에이전트 상태가 `running` 인 시간을 쌓는다.
- 클릭: `src/main/commands.ts` 에 `click(id)` 를 더했다. 무대 클릭이 이것을 부른다. `pointer.ts` 는 끌지 않은 짧은 누름만 클릭으로 보낸다. 끌기가 놀아주기가 되지 않는다.
- 모습: `src/main/party-v3.ts` 가 `legacy` 를 읽지 않는다. `pet.look` 은 `removed` 다. `src/dex/evolve.ts` 의 legacy 모습 옮기기와 `selftest-evolve` (11)을 되돌렸다.
- `daily.work` 는 저장이 정수만 받으므로 가중 ms 로 둔다. 친밀도로 보일 때는 `affinityGainMs` 로 나눈다.
- 문서: `balance.md` 에 에이전트 작업 보너스 행, `s5.md` 의 `[스펙 미확정]` 문장을 결정으로, `design.md` 의 적립 표를 v2 규칙으로 표시, `terms.md` 의 작업 시간을 고쳤다.

### 옛 v2 코드 정리의 작업 — 커밋 1

- CLI: `cli/run.js` 의 첫 실행 판정과 꺼낸 첫 마리, `cli/status.js` 의 게임 줄이 `dist/save/store-v3.js` 로 읽는다. 옛 v2 파일이면 읽는 값만 v3 로 옮겨 보이고 파일은 바꾸지 않는다. `status` 는 파티 칸·포인트·파티·전체 마리·알 수와 마리별 레벨·친밀도·만복도·기분을 보인다.
- 지운 모듈: `src/dex/progress.ts`, `src/main/game-menu.ts`, `src/shop/catalog.ts`, `src/shop/core.ts`, `src/state/core.ts`, 검사 `src/tools/selftest-state.ts`.
- 지운 함수: `src/main/party.ts` 의 `createSaveParty`·`shownOf`·`migrateHomes`·`nextPetId`·`starterInto`·`backupV1`·`PARTY_RULES`, `src/main/paths.ts` 의 `readSavedWindows`, `src/main/text.ts` 의 `stateLine`, `src/state/types.ts` 의 `StateInput`. `party.ts` 는 세션 펫 샌드박스와 `PartyPet` 만 남았다.
- `src/state/rules.ts` 는 앱이 쓰는 `maxTickMs`·`saveMs` 만 남겼다. 나머지는 v2 육성 수치였다.
- `src/tools/dev-save.ts` 가 저장 v3 를 만든다. 앞에서부터 파티 칸에 꺼내 놓는다.
- 검사: `selftest-stage` 의 v2 파티 검사를 저장 v3 파티로 옮겼다(아래 대조). `selftest-shop` 은 앱 명령 경로 검사만 남겼다. `smoke-renderer` 는 v2 메뉴 부분을 뺐다. `package.json` 의 `selftest` 에서 `selftest-state` 를 뺐다.
- 곁가지: 이번 변경과 어제 전환으로 쓰지 않게 된 import 를 지웠다(`app.ts` 의 `petName`, `shop/buy.ts` 의 `localDate`·`PetV3`).
- 문서: `design.md` 의 모듈 표·육성 절·옛 상점 문장을 고쳤다. 지운 파일로 가던 옛 기록의 링크 4개는 경로와 "2026-09-25 삭제" 표시로 바꿨다. 본문은 바꾸지 않았다.

**남긴 것과 이유**
- `src/save/store.ts`: v1·v2 파일을 읽어 v3 로 옮기는 데 쓴다. 커밋 2 에서 `save/legacy.ts` 로 이름을 바꾼다.
- `src/agents/usage.ts`: 지금은 앱이 부르지 않는다. 계약의 연결 화면이 "사용량 감지 상태"를 보이게 되어 있어 남긴다(`docs/specs/s5.md` 설정과 연결). v2 전용 코드가 아니다.
- `data/shop.json`: 코드가 읽지 않는다. 설계에서 데이터 파일은 범위 밖으로 두었다.

## 검수

### 저장 v3 전환의 첫 검증

**검사가 찾은 것** — 새 개체는 만복도가 가득 차 있어 밥을 받지 않는다. E2E 가 `feed` 성공을 기대하다 걸렸다. 규칙이 맞으므로 검사를 고쳤다 — `feed` 는 `full` 로 거절되고 `play` 가 성공하는 것을 확인한다.
자체 검사 두 벌이 v2 런타임을 쓰고 있었다. `selftest-stage` 의 명령 왕복과 `selftest-shop` 의 앱 경로를 v3 으로 다시 썼다. v2 규칙 자체를 보는 부분은 그대로 두었다 — 그 모듈들은 아직 트리에 있다.
저장 실패 재현에서 파일을 디렉터리로 바꾸면 읽기도 함께 막힌다. v2 는 메모리 상태가 있어 `save-failed` 였지만 v3 은 읽고 나서 쓰므로 `no-save` 다. 두 경우 모두 실패로 답하는지만 본다.

**검증** — `npm run build` 통과. `npm run selftest` 전체 통과(무대 검사 112건 → 118건). `node scripts/e2e-companion.cjs` 9개 흐름 통과 — 실제 CLI 부터 Electron 종료까지 v3 으로 돈다.
v2 저장을 앱 경로로 열어 옮겨지는지 확인하는 검사를 더했다. 두 마리와 포인트가 그대로 오고, 별명은 `legacy` 에서 되살아나며, 첫 선택을 다시 묻지 않는다. 별명 표시는 끊긴 기능 작업에서 계약대로 뺐다.

### 저장 v3 전환과 관리 창의 검수·수정

날짜: 2026-09-24. 사용자 지시: "그 세션에서 하던거랑 너가 작업들 리뷰한번씩 해봐", "권장대로 작업진행해보자".
검수 범위는 [실제 앱을 저장 v3 으로](#실제-앱을-저장-v3-으로)의 미커밋 변경과 커밋 `b562e92`·`925791b`·`cfc4a6b`·`c30f854`다.
9건을 찾았다. 목록과 고친 내용은 [저장 v3 전환의 피드백과 수정](#저장-v3-전환의-피드백과-수정)에 있다.

**문제 없음으로 확인한 것** — 렌더러는 `innerHTML` 을 쓰지 않는다. CSP 는 `default-src 'none'` 이다. 설정 값은 허용 목록으로 검사한다. 스냅샷 조립에서 오류를 찾지 못했다.

**수정 뒤 검수**
- `npm run selftest`: 전체 통과.
- `node scripts/e2e-companion.cjs`: 9개 흐름 통과.
- `npx electron scripts/dev-manage.cjs --shot <파일> --tab 상점`: 상점 탭이 그려졌다. 화면 캡처는 세 번 중 두 번 `UnknownVizError` 로 실패했다. 이 실패는 캡처 단계에서 났다. 창과 스냅샷은 정상이었다.
- `node scripts/check-docs.cjs`, `git diff --check`: 통과.
- 관리 창 IPC 의 보낸 창 확인과 reader 경로는 자동 검사가 없다. Electron 창 두 개가 필요하다. 이 두 동작은 코드로만 확인했다.

변경 문장은 쓰기 점검표로 검토했다. 한 문장에 한 사실을 두었다.
SSOT: `docs/specs/s5.md` 의 종료와 재개, `docs/specs/modules.md` 의 저장 구조.

### 끊긴 기능 세 가지의 검수

**검수 1회차**
- `npm run selftest`: 전체 통과. 무대 검사 118건 → 127건.
- `node scripts/e2e-companion.cjs`: 9개 흐름 통과.
- 변경분 코드 검수(하위 에이전트): 높음·중간 없음. 낮음 4건.

**검수 2회차** — `npm run selftest` 전체 통과. `node scripts/e2e-companion.cjs` 9개 흐름 통과. `node scripts/check-docs.cjs`, `git diff --check` 통과.
자동 검사가 없는 것: 실제 에이전트 상태로 쌓이는 작업 시간은 코드로만 확인했다. 무대 클릭이 놀이 연출을 보이는 것은 명령 단위 검사로만 확인했다.
변경 문장은 쓰기 점검표로 검토했다. 사용자 결정은 원문과 선택지를 적었다.

### 옛 v2 코드 정리의 검수 — 커밋 1

- `npm run selftest`: 전체 통과. 무대 검사는 127건 → 118건이다. v2 순수 함수 검사(상한·집 이전·번호·스타터·config 읽기)를 지웠고 v3 파티 검사를 더했다.
- `node scripts/e2e-companion.cjs`: 9개 흐름 통과. 지운 모듈의 옛 `dist/` 파일을 먼저 지우고 돌렸다. `tsc` 는 옛 산출물을 지우지 않아 빠진 모듈이 가려질 수 있기 때문이다.
- 임시 HOME 으로 `node bin/pokebuddy status` 를 돌렸다. 저장 없음 → "저장 없음". v3 저장 → "파티 칸 2 · 포인트 321 · 파티 1마리 …". v2 저장 → 옮긴 값을 보이고 파일 해시와 폴더 목록이 그대로다.
- import 추적을 다시 돌렸다. `src/tools` 밖에서 닿지 않는 모듈은 `src/agents/usage.ts` 하나다(위 "남긴 것").
- `tsc --noUnusedLocals`: 이번 범위의 파일에 쓰지 않는 선언이 없다. `src/main/stage.ts` 의 `SpriteSheet`, `selftest-egg` 의 `MIN` 두 개는 이 작업 전부터 있었다.
- `node scripts/check-docs.cjs`, `git diff --check` 통과.

**잠금 검사 대조** — 옛 `createSaveParty` 검사의 성질과 옮긴 곳

| 성질 | 옮긴 검사 |
|---|---|
| writer 가 파일을 읽고 성격이 실린다. 파티가 있으면 첫 실행이 아니다 | writer 블록 |
| 자리·숨김이 파일에 내려간다. 다른 마리의 집은 그대로다. 숨긴 마리는 무대에서 빠진다 | writer 블록 (실행기를 거친다) |
| stop 이 잠금을 놓는다 | writer 블록 |
| v1 원본 사본은 한 번만 남는다 | 옛 저장 v1 블록 (사본 이름은 `save.json.v2.bak`) |
| reader 는 파일을 읽고 첫 실행을 맡지 않고 파일을 쓰지 않는다 | reader 블록. 자리 요청은 mailbox 로 간다. 실행기와 틱도 쓰지 않는다 |
| reader 가 파일 변화를 감시로 읽는다. 남의 잠금을 건드리지 않는다 | reader 블록 |
| 파일이 없으면 writer 이고 첫 실행이다. begin 은 한 번만 된다 | 첫 실행 블록 |
| 잠금을 잃으면 곧바로 알고 쓰지 않는다 | 잠금 상실 블록 |
| 1판 config.json 의 집을 옮긴다(`migrateHomes`) | 옮기지 않았다. 아래 피드백 1 |

## 피드백과 수정

### 저장 v3 전환의 피드백과 수정

[저장 v3 전환과 관리 창의 검수·수정](#저장-v3-전환과-관리-창의-검수수정)에서 찾은 9건이다. 9건을 모두 고쳤다.

| 번호 | 심각도 | 문제 | 고친 것 |
|---|---|---|---|
| 1 | 높음 | `game.tick` 이 앱 종료·절전 동안의 시간을 한 번에 적용했다. `docs/specs/s5.md` 의 "복귀할 때 중단 기간을 소급 진행하지 않는다"와 어긋난다. | `TIME_V3_RULES.maxTickMs` 30초를 더했다. 한 번의 틱은 30초보다 많이 흐르지 않는다. 앱은 15초마다 틱을 부른다. |
| 2 | 중간 | 관리 창 IPC 처리기가 보낸 창을 확인하지 않았다. 무대 창과 선택 창도 같은 preload 를 쓴다. | `src/main/manage-window.ts` 의 네 처리기가 관리 창의 요청만 받는다. 다른 창에는 `denied` 를 돌려준다. |
| 3 | 중간 | reader 프로세스의 관리 창은 모든 조작이 `save-failed` 로 끝났다. | 관리 창 명령이 커맨드 처리기를 거친다. reader 는 mailbox 로 writer 에 보낸다. 진화 그림 준비도 같은 길을 쓴다. |
| 4 | 중간 | v2 에서 모습을 고른 개체는 진화 뒤에도 옛 모습으로 보였다. | 진화하면 `legacy` 의 `look:<id>` 를 `look-before-evolve:<id>` 로 옮겼다. 끊긴 기능 작업에서 무대가 legacy 를 읽지 않게 되어 되돌렸다. |
| 5 | 중간 | 관리 창에서 빠르게 두 번 누르면 구매·사용이 두 번 반영됐다. | 답을 기다리는 동안 렌더러가 새 조작을 받지 않는다. 여러 개 사기는 순서대로 보내므로 막히지 않는다. |
| 6 | 낮음 | reader 도 v2 저장을 v3 으로 바꿔 쓰고 파손 파일을 옮길 수 있었다. | `storeV3.read` 는 `repair` 가 아니면 파일을 바꾸지 않는다. `game.read` 는 writer 일 때만 `repair` 로 읽는다. |
| 7 | 낮음 | 진화 그림을 기다린 뒤의 만료 검사가 v2 에서 빠졌다. 보낸 쪽이 포기한 뒤에 진화할 수 있었다. | 그림 준비 뒤 40초가 지난 요청은 `expired` 로 끝낸다. 보낸 쪽은 45초 기다린다. |
| 8 | 낮음 | 알림과 만복도 구간 문구가 코드에 있었다. | `lib/i18n/ko.json`·`en.json` 에 `game.hatchReady`·`game.achieved`·`zone.*` 를 더했다. |
| 9 | 낮음 | `scripts/dev-manage.cjs` 가 실제 HOME 을 썼다. 설정의 "연결"이 실제 CLI 설정에 훅을 쓸 수 있었다. | 임시 폴더를 HOME 으로 쓴다. Electron 이 준비되기 전에 HOME 을 바꾸면 Electron 이 뜨지 않았다(종료 코드 3). 그래서 준비된 뒤에 바꾸고 앱 모듈을 읽는다. |

**검사를 바꾼 것** — `selftest-manage` (5)는 2시간을 한 번에 흘리는 것을 기대했다. 지금은 하루의 틈이 만복도를 바꾸지 않는 것과 30초 틱 240번이 2시간을 흘리는 것을 본다.
`selftest-save-v3` (14)를 더했다.

### 옛 v2 코드 정리의 피드백 — 커밋 1

1. 1판(v1 이전) 사용자가 `config.json` 에 남긴 마리 자리는 v3 로 옮겨지지 않는다. 2026-09-24 전환 때부터 v3 경로에 이 이전이 없었다. v1 저장을 가진 사용자만 해당한다. 자리는 기본값으로 시작한다. 고치지 않았다. 필요하면 따로 결정한다.
2. 창 펫이 독립 펫에 자리를 내주는 동작은 자동 검사가 없다. 옛 검사에도 없었다. 10초 주기 타이머를 기다려야 해서 이번에도 더하지 않았다.
3. `lib/i18n` 에 옛 육성 문구 키(`state.hungry`, `state.evolution`, `game.unlocked` 등)가 남아 있다. 설계에서 범위 밖으로 두었다.

### 끊긴 기능 세 가지의 피드백과 수정

**피드백**
1. 절전에서 돌아온 첫 폴링이 틈을 30초까지 작업으로 셌다. 주석과 다르다.
2. writer 를 내줬다 다시 받으면 오래된 폴링 시각으로 30초를 더했다.
3. 틱 쓰기에 실패해도 쌓은 작업 시간을 비웠다.
4. v2 의 `daily.work`(친밀도 단위)를 v3(가중 ms)로 그대로 옮겼다.

**수정**
1·2. 폴링 틈이 `STATE_RULES.maxTickMs`(5초)를 넘으면 세지 않는다. writer 가 아니면 쌓은 값과 폴링 시각을 비운다.
3. 틱이 성공했을 때만 비운다. 실패하면 다음 틱에 흐른 시간과 함께 넘긴다.
4. 옮길 때 `daily.work` 를 0 으로 둔다. `selftest-save-v3` (2b)를 더했다.
