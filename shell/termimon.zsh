# git clone 으로 설치했을 때 termimon 을 PATH 에 올린다. ~/.zshrc 에서 이 파일을 source 한다.
# npm 으로 설치했으면 필요 없다.
#
# claude 안에서 ! 를 붙여 실행한다 — claude 의 ! 명령도 이 PATH 를 쓴다.
#
#   !termimon eevee                           이 claude 세션에 펫 (claude 가 끝나면 사라진다)
#   !termimon eevee dot=3                     크게 — 떠 있던 펫이 이걸로 바뀐다
#   !termimon zapdos+pikachu                  여러 마리
#   !termimon stop                            내리기
#
# claude·codex 를 셸 함수로 덮지 않는다. 남의 명령에 없는 문법을 얹는 것은 관례가 아니고
# (pyenv·conda 는 문법을 늘리지 않고, direnv 는 환경변수를 쓴다), 프롬프트 토큰을 먹거나
# 셸 스냅샷에서 깨지는 문제를 부른다.
_termimon_bin="${${(%):-%x}:A:h:h}/bin"
[[ ":$PATH:" == *":$_termimon_bin:"* ]] || export PATH="$_termimon_bin:$PATH"
unset _termimon_bin
