@echo off
rem termimon - git clone 으로 설치한 Windows 명령 프롬프트(cmd)용 입구. 실제 동작은 같은 폴더의 termimon(Node) 이 한다.
rem PowerShell 에서 스크립트 실행이 막혀 termimon.ps1 이 안 돌 때도 termimon.cmd eevee 처럼 부를 수 있다.
rem npm 으로 설치했으면 npm 이 만든 termimon 명령을 쓰면 되고 이 파일은 필요 없다.
node "%~dp0termimon" %*
