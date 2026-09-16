# pkmon — claude·codex 실행 시 펫을 함께 띄운다 (Windows PowerShell)
#   claude pkmon=pikachu
#   codex pkmon=charizard-3d
# PowerShell 프로필($PROFILE)에서 이 파일을 dot-source 해 사용한다: . "C:/경로/pkmon.ps1"

if (-not $env:PKMON_HOME) {
  $env:PKMON_HOME = Join-Path $HOME "dev/project/1.personal/terminal_pkmon"
}

function Invoke-PkmonWrapped {
  param(
    [string]$Command,
    [string[]]$Arguments
  )

  $pet = ""
  $pos = ""
  $rest = @()
  foreach ($a in $Arguments) {
    if ($a -match '^(pkmon|pokemon|pet)=(.+)$') { $pet = $Matches[2] }
    elseif ($a -match '^pos=(.+)$') { $pos = $Matches[1] }  # fix(기본, 창 안에 가둠) · free
    else { $rest += $a }
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

function claude { Invoke-PkmonWrapped -Command "claude" -Arguments $args }
function codex { Invoke-PkmonWrapped -Command "codex" -Arguments $args }
