# 앵커 앱의 창 위치·크기와 현재 맨 앞 앱을 JSON 으로 출력 (Windows)
# 사용: powershell -NoProfile -File winbounds.ps1 Code
param([string]$App = "")

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PkmonWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@ -ErrorAction SilentlyContinue

$front = ""
$fg = [PkmonWin]::GetForegroundWindow()
if ($fg -ne [IntPtr]::Zero) {
  $ownerId = 0
  [void][PkmonWin]::GetWindowThreadProcessId($fg, [ref]$ownerId)
  $fgProc = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
  if ($fgProc) { $front = $fgProc.ProcessName }
}

$windows = @()
if ($App) {
  foreach ($p in @(Get-Process -Name $App -ErrorAction SilentlyContinue)) {
    if ($p.MainWindowHandle -ne [IntPtr]::Zero) {
      $rect = New-Object PkmonWin+RECT
      if ([PkmonWin]::GetWindowRect($p.MainWindowHandle, [ref]$rect)) {
        $windows += [ordered]@{
          app = $p.ProcessName
          x = $rect.Left
          y = $rect.Top
          w = ($rect.Right - $rect.Left)
          h = ($rect.Bottom - $rect.Top)
        }
      }
    }
  }
}

[ordered]@{ frontmost = $front; windows = @($windows) } | ConvertTo-Json -Depth 4 -Compress
