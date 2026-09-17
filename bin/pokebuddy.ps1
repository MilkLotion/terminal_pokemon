# pokebuddy — git clone 으로 설치한 Windows PowerShell 용 입구. 실제 동작은 같은 폴더의 pokebuddy(Node) 가 한다.
# npm 으로 설치했으면 npm 이 만든 pokebuddy 명령을 쓰면 되고 이 파일은 필요 없다.
#
# PowerShell 프로필($PROFILE)에:  $env:PATH = "<클론한 경로>\bin;$env:PATH"
& node (Join-Path $PSScriptRoot "pokebuddy") @args
exit $LASTEXITCODE
