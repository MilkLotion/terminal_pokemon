# pokebuddy 진행 현황과 다음 작업

> 기준 2026-09-17 · 커밋 `813b4e5`(origin/main 에 푸시됨).
> 새 세션은 이 문서 → [`docs/design.md`](design.md)(결정의 원본) → [`docs/guide.md`](guide.md)(동작 설명) 순서로 읽는다.
> 이 문서는 "지금 어디까지 왔고 다음에 무엇을 하나" 만 적는다. 결정의 이유는 설계 문서에 있다.

## 지금 어디까지

| 단계 | 상태 | 한 줄 |
|---|---|---|
| S0 설계 확정 | 완료 | 설계 2판 — 무대 하나 · 최대 6마리 · 원작 25 성격 · 기능별 모듈 · TypeScript |
| S1 뼈대 | 완료 (`da9ac04`) | TS 빌드, 저장 v2 · 잠금 · mailbox, 커맨드 처리기, 데이터 빌드(성격 · 종 프로필 · 진화 · 해금) + 도감 모듈, 에이전트 모듈(토큰 증분 · 연결), 훅의 Claude 토큰 누적 |
| S2 무대 | 완료 (`813b4e5`) — **사용자 실기 확인 남음** | 투명 무대 창 하나에 파티 최대 6마리, 마리별 히트 · 드래그 · 집 · 밀어내기. 옛 JS(main · renderer · buddy · lib 추적 · game)와 죽은 옵션 정리. 앱 로고 |
| S3 성격 · 움직임 · 상태 | **다음** | 아래 절 |
| S4 도감 · 해금 · 상점 · 진화 | 대기 | |
| S5 설정창 · 메뉴 · 연결 | 대기 | |
| S6 배포 | 대기 | |

**S2 동안 친밀도 · 기분 · 포인트 적립은 멈춰 있다**(옛 게임 코어를 뺐다). S3 에서 상태 모듈로 되살리는 것이 첫 목표다.

### 이 컴퓨터의 설치 상태 (2026-09-17)

- 전역 `pokebuddy` 는 `npm link` 로 이 저장소를 가리킨다. 저장소를 고치고 `npm run build` 하면 바로 반영된다.
  - 전에는 전역에 옛 0.2.0 복사본이 깔려 있어 `pokebuddy companion` 이 "펫 이름을 찾을 수 없음: companion" 으로 실패했다. 같은 증상이 다시 보이면 `zsh -ic 'whence -va pokebuddy'` 로 무엇이 불리는지 먼저 본다.
- 상태 훅은 `pokebuddy setup` 으로 최신 설치됨(Claude Code · Gemini CLI · Codex CLI). VS Code · Antigravity 확장 0.3.0 설치됨. `~/.claude/pokebuddy/cli.json` 이 이 저장소와 Electron 경로를 가리킨다.
- 진짜 `~/.claude/pokebuddy/save.json` 은 아직 없다. 동반자나 VS Code 창 펫을 처음 띄우면 스타터 선택 창이 뜨고 그때 생긴다.
- 사용자 개인 설정 `~/.zshrc` 38번째 줄이 없어진 `shell/pkmon.zsh` 를 source 해 새 터미널마다 오류가 한 줄 찍힌다. 사용자에게 알렸고 손대지 않았다.

## 바로 다음 — S2 실기 확인 (사용자)

마우스 입력은 서브 에이전트가 흉내 낼 수 없어 확인하지 못했다. 사용자가 본 결과를 받은 뒤 S3 로 간다.

```
pokebuddy eevee dot=3
```

- [ ] 마리를 끌어 옮기고, 다시 띄워도 그 자리에 오는가
- [ ] 클릭 반응 · 우클릭 메뉴(이름 · 성격 / 숨기기 / 종료)
- [ ] 펫 없는 투명한 곳 클릭이 아래 터미널로 들어가는가
- [ ] 다른 앱으로 가면 숨고, 터미널로 돌아오면 보이는가
- [ ] 단축키 Cmd+Alt+H 숨김 · P 고스트 · K 항상 보기 · Q 종료 (세션 펫만 잡는다)

```
pokebuddy companion
```

- [ ] 스타터 선택 창 → 고르면 무대에 나오는가 (진짜 save.json 이 처음 생긴다)
- [ ] 트레이 메뉴(숨기기 · 고스트 모드 · 설정 파일 열기 · 종료)
- [ ] 맨 앞 터미널 창을 바꾸면 따라가는가, 브라우저를 앞으로 하면 제자리에 남는가
- [ ] `pokebuddy companion stop` 으로 내려가는가

문제가 보이면 앞에 `POKEBUDDY_DEBUG=1` 을 붙여 다시 띄우고 로그를 본다(경로는 실행 때 알려 준다, [guide 문제 확인](guide.md#문제-확인)).

## S3 성격 · 움직임 · 상태 — 할 일

끝나면 보이는 것: 성격이 다른 두 마리가 다르게 움직이고, 배고프면 밥을 달라 하고, 켜 두기 · 일한 양 · 밥 · 놀기로 친밀도가 다시 쌓인다.

### 시작 전에 사용자에게 받을 것

설계에서 숫자는 전부 미확정이다. Claude 가 기본값 표를 만들어 **사용자 입장의 말로**(예: "대담한 성격은 20% 빨리 걷고, 만지면 반응이 짧다") 보여 주고 정한 뒤 구현한다.

- 성격 축 → 움직임 배율 숫자 (`data/natures.json` 다섯 축 × `MotionParams` 일곱 자리)
- 시간당 친밀도(켜 두기 · 일한 시간), 토큰 → 친밀도 · 포인트 환율과 하루 상한
- 배고픔이 차는 속도 · 밥 한 번의 양 · 기분이 떨어지는 조건

종 프로필 매핑(체중 → 배고픔 등)은 Claude 가 정한다 — 사용자 검토 항목이 아니다(사용자 결정).

### 작업 단위 (서브 에이전트 병렬 — 파일 경계)

코디네이터가 먼저 깐다: `src/state/types.ts`(마리 상태 입출력 · 규칙표 모양), `MotionParams` 를 채우는 함수 시그니처, 새 i18n 키 목록.

1. **성격 → 움직임** — `src/motion/params.ts` 에 `paramsFor(axes)`(`src/dex/natures.ts` 의 축 → `MotionParams`). `socialPull` 은 `src/motion/arrange.ts` · `brain.ts` 의 산책 목표에 다른 마리 위치를, `cursorPull` 은 커서 자리를 입력으로 받게. `src/main/stage.ts` 가 마리를 만들 때 `pet.nature` 로 params 를 넣는다. 자체 확인: 성격 둘의 걷기 · 쉬기 분포가 배율대로 갈린다, 중립 성격은 지금 숫자와 같다(`selftest-motion` 이 이미 대조).
2. **상태 모듈 `src/state/`** — 마리별 배고픔 · 기분 · 친밀도 · 잠, 종 프로필(`src/dex/species.ts profile`) × 성격 축 배율, 날짜 넘김 · 하루 상한 · 스트릭, 시간 원천(무대에 나온 마리 전원이 **마리마다 다른 양**), 토큰 원천(`src/agents/usage.ts deltaSince`, 본 값은 저장 `acc`), 토큰을 못 읽는 CLI 는 `running` 시간. 순수 모듈 — 시계 주입, `fs` · Electron 모름. 규칙표 하나. 자체 확인 `src/tools/selftest-state.ts`. 1판 규칙표는 `git show da9ac04:game/economy.js` 로 참고한다.
3. **명령 · 메뉴 · 연출 · 배선** — `src/main/commands.ts` 에 `feed` · `play` 등록(`CommandName` 에 이미 있음), 우클릭 첫 줄에 "지금 가장 말할 것" 한 가지(배고픔 / 기분 / 다음 진화까지), 밥 주기 · 놀아주기 항목. 먹기(열매로 걸어가 먹기) · 놀기(커서 쫓기) 연출. writer 무대가 상태를 틱하고 저장을 쓴다(쓰기 절약). `cli/status.js` 게임 줄에 배고픔 · 기분 말.

### S3 에서 같이 볼 것

- 6마리 CPU ≈ 10.5% (메인 1.1 · GPU 4.6 · 렌더러 4.8, mac). 모임 · 커서 추적이 붙으면 다시 잰다. 줄일 곳 후보: 무대를 아래쪽 띠로 줄이기(`src/main/layout.ts` 의 `STAGE_RULES` 에 상수로 새로), 프레임 변화분만 보내기.
- `src/save/rules.ts` 의 `NATURE_IDS` 사본을 `src/dex` 소유로 옮기기(`[리팩토링 대상]` 표시 있음).

## S4 · S5 · S6 — 할 일 요약

**S4 도감 · 해금 · 상점 · 진화**
- 상태 틱에서 `src/dex/unlocks.ts evaluate` 로 해금 판정 → `save.unlocked` · 기록 · 알림
- 상점 모듈 `src/shop/` + `data/shop.json`: 파티 칸(처음 1 → 최대 6, **빈 칸이 없으면 새 종을 못 산다**), 새 종, 민트(성격 바꾸기), 먹이, 에버스톤, 색(shiny — SpriteCollab 경로 확인 필요)
- 진화: 친밀도 문턱 · 분기(`when` 밤 등) · 에버스톤 · 진화 연출 · 포인트 적립
- 모습 선택: `pet.look` 명령 — 같은 진화 사슬에서 해금된 모습 중

**S5 설정창 · 메뉴 · 연결**
- 설정창 탭 다섯. **원작 게임 화면을 참고한다**(사용자 지시): 파티 = 여섯 칸 카드(마리 · 빈 칸 · 잠긴 칸) → 카드를 누르면 요약(상세) 화면, 도감 = 번호 · 이름 목록(미해금은 실루엣), 상점 = 프렌들리숍 목록, 연결 = Claude Code · Codex · Gemini 버튼과 오늘 토큰, 설정 = 표시 · 고스트 모드 · 잠들기 · 언어 · 자동 시작. 와이어프레임은 설계 Artifact 에
- 메뉴 최소화: 우클릭 = 그 마리 한 줄 · 밥 주기 · 놀아주기 · 설정… · 종료, 트레이 = 설정… · 종료. 숨기기 · 고스트 · 크기 · 성격은 설정창으로
- 옛 JS 를 TS 로 옮기고 지운다: `config.js` · `cli/*.js` · `lib/`(i18n · names · dex · zip · electron) · `art/`(PMD 로더), `scripts/build-helper.js` · `build-vsix.js`. `scripts/postinstall.js` 는 빌드보다 먼저 도므로 JS 로 남긴다
- 영어 문구 채우기(`lib/i18n/en.json`), 동반자 크기(`dot`)는 설정창으로
- `src/agents/registry.ts` 가 setup 등록을 흡수할 때 훅 원본 없음 전용 결과 코드 두기(지금은 `settings-error` 재사용)

**S6 배포**
- 앱 번들에 `assets/logo/out/logo.icns` · `logo.ico`(지금 실행 중 아이콘은 PNG 만 씀), npm 게시, vsix 게시, 로그인 자동 시작
- Windows 실기: 물리 → DIP 변환(125% · 150%), `setBounds` 가 크기 고정 창에서 먹는지, 큰 투명 창의 클릭 통과 전달, `focusable:false` 창의 우클릭 메뉴, PowerShell 헬퍼 첫 응답, 큰 창 GPU(DWM), `bin\pokebuddy.cmd status`

## 미확정 · 알려진 제약

- [스펙 미확정] 여러 VS Code 창의 파티 배분 — 임시 규칙: 각 무대에 파티 전원, 집 저장은 저장을 쥔(writer) 무대만. 정하면 `src/main/party.ts` 한 곳만 바꾼다
- [확인 필요] Codex 토큰 읽기(`~/.codex/sessions/` 에서 session_id 로), Gemini 는 방법 미확인 — 못 읽으면 일한 시간으로
- `pokebuddy companion <종>` 은 스타터 29종일 때만 선택 창을 건너뛴다
- `dot=` 은 세션 펫에만 효과가 있다. 동반자 옵션은 `buddy` · `click` 뿐
- 창 모드는 확장 기록이 연속 5회(2초) 없으면 스스로 끝난다(옛 동작과 같음)
- 세션 펫(`!pokebuddy <종>`)은 샌드박스 — 게임 없음(설계 결정)

## 작업 방식 — 새 세션이 지킬 것

- **설계 먼저.** 사용자는 방향을 탄탄히 정한 뒤 단계별로 구현하길 원한다. 설명은 내부 구현이 아니라 사용자가 보는 화면 · 메뉴 · 흐름으로. 화면에 찍힐 글자는 그대로 보여 준다
- **코드는 서브 에이전트, 코디네이터는 오케스트레이션.** 코디네이터가 공유 계약(타입 · 설정)을 먼저 깔고, 파일 경계가 겹치지 않게 브리프를 나눠 병렬로 맡기고, 결과를 빌드 · 자체 확인 · 실기로 검증해 문서에 통합한다
- **새 코드는 전부 TypeScript** (`src/`) — 스크립트 · 훅 · 자체 확인까지. 배럴 `index.ts` 금지(직접 import)
- 주석은 한국어 개조식(`합니다`체 금지). 소스 · 문서 · 커밋 어디에도 영문 미완성 표식 대신 `[스펙 미확정]` 같은 한국어 대괄호 태그. `console.error` 는 catch 안에서만. 새 npm 의존성은 승인 뒤. 명령은 mac · Windows 양쪽 호환, `.ps1` 은 UTF-8 BOM 유지
- **커밋 · 푸시는 사용자가 말할 때만**, 이번 작업 파일만 하나씩 지정해 스테이징
- 시험은 **임시 HOME** 으로 — 진짜 `~/.claude/pokebuddy/save.json` 은 건드리지 않는다. 펫은 프로세스를 죽이지 않고 pid 파일(세션 `<tmpdir>/pokebuddy-pets/*.pid` · 창 `w-<host>-<pid>.pid` · 동반자 `~/.claude/pokebuddy/companion.lock`)을 지워 끝낸다
- 설계가 바뀌면 `docs/design.md` · 설계 Artifact · 이 문서를 같이 고친다

### 명령

```
npm run check          # 두 tsconfig 타입 검사 (메인 · 렌더러)
npm run build          # dist/ 빌드
npm run selftest       # 자체 확인 6벌 — save · dex · agents · follow · motion · stage
npm run data:build     # PokeAPI → data/*.json · lib/names.json (결정적 — 다시 돌려도 바이트 같음)
npm run logo:build     # assets/logo/src/logo.txt → assets/logo/out/
```

임시 HOME 에 여러 마리 저장을 만들어 무대를 띄워 보는 법 (mac · zsh):

```
PB_HOME=$(mktemp -d)
node dist/tools/dev-save.js $PB_HOME eevee,pikachu,squirtle --same-home
HOME=$PB_HOME POKEBUDDY_MODE=companion POKEBUDDY_DEBUG=1 POKEBUDDY_LOG=$PB_HOME/stage.log node_modules/.bin/electron .
```

끝낼 때는 다른 터미널에서 `rm $PB_HOME/.claude/pokebuddy/companion.lock`. 그림 캐시를 `~/.claude/pokebuddy/pmd/*.zip` 에서 `$PB_HOME/.claude/pokebuddy/pmd/` 로 복사해 두면 빨리 뜬다.

## 코드 지도

| 자리 | 내용 |
|---|---|
| `src/shared/` | `types.ts`(저장 · 명령 · 상태) · `stage.d.ts`(메인 ↔ 렌더러 무대 계약, 타입만) · `clock.ts` |
| `src/main/` | Electron 메인 — `app.ts`(기동 · 모드) · `anchor.ts`(창 추적) · `stage-window.ts` · `stage.ts`(무대 틱) · `party.ts`(마리 출처 · 저장) · `commands.ts` · `menus.ts` · `tray.ts` · `picker-window.ts` · `lifetime.ts` |
| `src/follow/` | 창 추적 · 에이전트 상태 판정 (CLI 도 `dist/follow` 를 부른다) |
| `src/motion/` | 마리별 움직임 — `brain.ts` · `pet-motion.ts` · `rules.ts` · `params.ts`(성격 배율 자리) · `arrange.ts` |
| `src/renderer/` | 무대 캔버스 · 스프라이트 · 히트 · 포인터, 스타터 선택 창 (ESM, `tsconfig.renderer.json`) |
| `src/save/` · `src/commands/` · `src/dex/` · `src/agents/` · `src/hooks/` | 저장 v2 · 커맨드 처리기 · 도감 판정 · 에이전트 연결과 토큰 · CLI 상태 훅 |
| `src/tools/` | 데이터 · 로고 빌드, 자체 확인, `dev-save.ts` |
| `data/` | `natures.json` · `species.defaults.json` · `species.overrides.json` · `evo.json` · `unlocks.json` |
| 옛 JS (S5 에 이식) | `config.js` · `cli/` · `lib/` · `art/` · `scripts/` |
| `assets/logo/` | 로고 원본 지도와 출력 |

## 참고

- 설계 Artifact (와이어프레임 · 모듈 · 순서): https://claude.ai/artifact/Dn8NVamjBPvcgWyxiCe2Y6
- 로고 시안 비교 · 확정본: https://claude.ai/artifact/H2NsN8ZCEgHn9jdzw6Gvce
- Claude 토큰 읽기 방식의 원출처: 사용자 프로젝트 `1.personal/claude_status_line`
