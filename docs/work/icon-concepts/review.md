# 아이콘 시안 검수

## 검수 범위

2026-09-18에 `assets/icon-concepts/`의 네 SVG 시안을 검수했다.

## 명령

```text
rg -n 'width="128"|height="128"|viewBox="0 0 128 128"' assets/icon-concepts/*.svg
for f in assets/icon-concepts/*.svg; do xmllint --noout "$f"; done
qlmanage -t -s 256 -o /tmp/pokebuddy-icon-previews assets/icon-concepts/*.svg
npm run check
```

## 결과

- 네 파일 모두 128×128 크기를 사용한다.
- 네 파일 모두 `0 0 128 128` viewBox를 사용한다.
- 네 파일 모두 외부 이미지, 글꼴, 스크립트를 사용하지 않는다.
- XML 파싱 검사를 통과한다.
- macOS Quick Look으로 네 시안을 256px 썸네일로 렌더링했다.
- `npm run check`를 통과했다.
- `screen-ball`은 몬스터볼 인지가 가장 빠르다.
- `screen-playground`는 “여러 펫이 화면에서 논다”는 컨셉 전달이 가장 강하다.
- `monitor-buddy`는 컴퓨터 화면과 펫의 관계가 가장 명확하다.
- `window-orbit`는 앱 아이콘 배지로 축소했을 때 가장 안정적이다.

## 판단

네 시안을 전달한다. 1차 추천은 `screen-playground.svg`다. 작은 크기에서 앱 성격을 더 우선하면 `window-orbit.svg`를 선택한다.

## 미검수

- 실제 Electron Dock·작업 표시줄 연결은 이번 범위가 아니다.
- PNG·ICO·ICNS 변환과 운영체제별 실기 크기 검사는 후속 작업이다.

## 피드백 반영 검수

- 새 시안 세 개 모두 둥근 사각형 앱 타일을 사용한다.
- 프로그램 창의 상단 바와 앱 아이콘용 고대비 실루엣을 확인했다.
- 새 파일 모두 `xmllint`, macOS Quick Look 렌더링, `npm run check`를 통과했다.
- 현재 추천은 `app-window-ball.svg`다. 창, 펫, 몬스터볼이 가장 균형 있게 보인다.
