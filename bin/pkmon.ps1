# pkmon — 명령을 실행하는 동안 펫 오버레이를 띄운다 (Windows PowerShell)
#
# 사용:
#   pkmon <펫> [이름=값 ...] [-- <명령> [인자 ...]]
#   pwsh -File bin/pkmon.ps1 eevee -- claude
#
# 예:
#   pkmon eevee                            명령을 생략하면 claude
#   pkmon eevee gif=off dot=4 -- claude
#
# 인자 경계는 env(1)·nice(1) 과 같다 — 우리 옵션은 앞에, 대상 명령은 '--' 뒤에.
# 대상 명령의 인자는 한 글자도 건드리지 않는다.

# 자기 위치에서 프로젝트를 찾는다 (PATH 에 걸어 두어도 동작하도록)
if (-not $env:PKMON_HOME -or -not (Test-Path (Join-Path $env:PKMON_HOME "config.js"))) {
  $env:PKMON_HOME = Split-Path -Parent $PSScriptRoot
}

function Invoke-Pkmon {
  param([string[]]$Arguments)

  $pet = ""; $pos = ""; $gif = ""; $dot = ""; $fps = ""; $keep = ""; $click = ""; $art = ""
  $i = 0
  # 첫 인자가 옵션도 이름=값 도 아니면 펫 이름으로 받는다
  if ($Arguments.Count -gt 0 -and $Arguments[0] -notmatch '^-' -and $Arguments[0] -notmatch '=') {
    $pet = $Arguments[0]; $i = 1
  }
  while ($i -lt $Arguments.Count) {
    $a = $Arguments[$i]
    if ($a -eq '--') { $i += 1; break }
    elseif ($a -eq '--pet')   { $pet   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--pos')   { $pos   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--gif')   { $gif   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--art')   { $art   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--dot')   { $dot   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--fps')   { $fps   = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--keep')  { $keep  = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -eq '--click') { $click = $Arguments[$i + 1]; $i += 2 }
    elseif ($a -match '^(pkmon|pokemon|pet)=(.+)$') { $pet = $Matches[2]; $i += 1 }
    elseif ($a -match '^pos=(.+)$')   { $pos   = $Matches[1]; $i += 1 }
    elseif ($a -match '^gif=(.+)$')   { $gif   = $Matches[1]; $i += 1 }
    elseif ($a -match '^art=(.+)$')   { $art   = $Matches[1]; $i += 1 }
    elseif ($a -match '^dot=(.+)$')   { $dot   = $Matches[1]; $i += 1 }
    elseif ($a -match '^fps=(.+)$')   { $fps   = $Matches[1]; $i += 1 }
    elseif ($a -match '^keep=(.+)$')  { $keep  = $Matches[1]; $i += 1 }
    elseif ($a -match '^click=(.+)$') { $click = $Matches[1]; $i += 1 }
    else { Write-Error "알 수 없는 옵션: $a"; return }
  }

  $tail = @()
  if ($i -lt $Arguments.Count) { $tail = $Arguments[$i..($Arguments.Count - 1)] }
  if ($tail.Count -eq 0) { $tail = @("claude") }   # 명령을 생략하면 claude
  $Command = $tail[0]
  $rest = if ($tail.Count -gt 1) { $tail[1..($tail.Count - 1)] } else { @() }

  if (-not $pet) {
    Write-Error "펫 이름이 없음 — 사용: pkmon eevee -- claude"
    return
  }

  $real = Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $real) {
    Write-Error "$Command 을(를) 찾을 수 없음"
    return
  }
  if (-not $pet) {
    & $real.Source @rest
    return
  }

  $electron = Join-Path $env:PKMON_HOME "node_modules/.bin/electron.cmd"
  $overlays = @()
  # 떠 있는 펫 목록 — pid 파일로 관리한다 (Electron 은 한 마리가 여러 프로세스를 만들어 프로세스 수로는 셀 수 없음)
  $runDir = Join-Path $env:TEMP "pkmon-pets"
  New-Item -ItemType Directory -Force $runDir | Out-Null
  $base = 0
  foreach ($f in @(Get-ChildItem -Path $runDir -Filter *.pid -ErrorAction SilentlyContinue)) {
    $petPid = (Get-Content $f.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($petPid -and (Get-Process -Id $petPid -ErrorAction SilentlyContinue)) {
      $base += 1
    } else {
      Remove-Item $f.FullName -ErrorAction SilentlyContinue  # 죽은 펫의 흔적 정리
    }
  }

  if (Test-Path $electron) {
    # 터미널 종류에 따라 따라갈 앱 — 그 앱 창 모서리에 붙고, 앞에 없을 때는 숨는다
    $anchor = switch ($env:TERM_PROGRAM) {
      "vscode" { "Code" }
      default { if ($env:WT_SESSION) { "WindowsTerminal" } else { "" } }
    }
    $env:PKMON_MATCH_CWD = (Get-Location).Path
    $env:PKMON_ANCHOR_APP = $anchor
    if ($pos) { $env:PKMON_POS = $pos }
    if ($gif) { $env:PKMON_USE_GIF = $gif }
    if ($art) { $env:PKMON_ART = $art }
    if ($dot) { $env:PKMON_DOT_SIZE = $dot }
    if ($fps) { $env:PKMON_FPS = $fps }
    if ($keep) { $env:PKMON_KEEP_VISIBLE = $keep }
    if ($click) { $env:PKMON_CLICK_THROUGH = $click }
    # 이 PowerShell 자신이 터미널 탭의 프로세스 — VS Code 가 보는 번호와 같다
    $env:PKMON_TERM_PID = "$PID"

    $slot = 0
    foreach ($slug in ($pet -split ',')) {
      $slug = $slug.Trim()
      if (-not $slug) { continue }
      $env:PKMON_SLUG = $slug
      $env:PKMON_INDEX = "$($base + $slot)"
      $proc = Start-Process -FilePath $electron -ArgumentList $env:PKMON_HOME -PassThru -WindowStyle Hidden
      $overlays += $proc
      Set-Content -Path (Join-Path $runDir "$($proc.Id).pid") -Value $proc.Id
      $slot += 1
    }
  } else {
    Write-Warning "펫을 건너뜀 — Electron 미설치: $env:PKMON_HOME 에서 npm install 필요"
  }

  try {
    & $real.Source @rest
  } finally {
    foreach ($o in $overlays) {
      if (-not $o) { continue }
      if (-not $o.HasExited) { Stop-Process -Id $o.Id -ErrorAction SilentlyContinue }
      Remove-Item (Join-Path $runDir "$($o.Id).pid") -ErrorAction SilentlyContinue
    }
  }
}

Invoke-Pkmon -Arguments $args
