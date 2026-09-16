# pkmon 을 PATH 에 올린다. ~/.zshrc 에서 이 파일을 source 한다.
#
#   pkmon eevee                            명령을 생략하면 claude
#   pkmon eevee gif=off -- claude -p "고쳐줘"
#   pkmon zapdos,pikachu                   쉼표로 여러 마리
#
# claude·codex 를 셸 함수로 덮지 않는다. 남의 명령에 없는 문법을 얹는 것은 관례가 아니고
# (pyenv·conda 는 문법을 늘리지 않고, direnv 는 환경변수를 쓴다), 프롬프트 토큰을 먹거나
# 셸 스냅샷에서 깨지는 문제를 부른다. pkmon 은 env(1)·nice(1) 과 같은 별도 명령이다.
_pkmon_script_dir=${${(%):-%x}:A:h}
export PKMON_HOME="${_pkmon_script_dir:h}"
unset _pkmon_script_dir
[[ ":$PATH:" == *":$PKMON_HOME/bin:"* ]] || export PATH="$PKMON_HOME/bin:$PATH"
