# pkmon — claude·codex 실행 시 펫을 함께 띄운다
#   claude pkmon=pikachu
#   codex pkmon=charizard-3d
#   claude                    (pkmon= 없으면 평소와 동일)
# ~/.zshrc 에서 이 파일을 source 해 사용한다.

# 이 파일 위치에서 프로젝트 경로를 구한다 — 옛 경로가 환경변수에 남아 있어도 올바르게 잡히도록
_pkmon_script_dir=${${(%):-%x}:A:h}
if [[ -z "${PKMON_HOME:-}" || ! -x "${PKMON_HOME}/bin/pkmon" ]]; then
  export PKMON_HOME="${_pkmon_script_dir:h}"
fi
unset _pkmon_script_dir

_pkmon_wrap() {
  local cmd="$1"
  shift
  local pet=""
  local pos=""
  local -a args=()
  for a in "$@"; do
    case "$a" in
      pkmon=*|pokemon=*|pet=*) pet="${a#*=}" ;;
      pos=*) pos="${a#*=}" ;; # fix(기본, 창 안에 가둠) · free
      *) args+=("$a") ;;
    esac
  done

  if [[ -z "$pet" ]]; then
    command "$cmd" "${args[@]}"
    return $?
  fi
  # zsh 는 확장 결과를 단어로 나누지 않는다 — 배열로 넘겨야 --pos 와 값이 따로 전달된다
  local -a pos_args=()
  [[ -n "$pos" ]] && pos_args=(--pos "$pos")
  "$PKMON_HOME/bin/pkmon" --pet "$pet" "${pos_args[@]}" -- "$cmd" "${args[@]}"
}

claude() { _pkmon_wrap claude "$@"; }
codex() { _pkmon_wrap codex "$@"; }
