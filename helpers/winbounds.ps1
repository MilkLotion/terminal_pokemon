# 모든 최상위 창의 고유 ID·소유 앱·위치·크기를 z-order(앞→뒤)로 출력 (Windows)
# 사용: powershell -NoProfile -File winbounds.ps1 [앱이름]   앱이름은 무시된다 — 목록은 언제나 전체다
#   받는 쪽이 앵커 앱만 골라 쓰고, 동시에 "내 창보다 앞에 있는 창"을 알아야 가림 판정을 할 수 있다
#
# Process.MainWindowHandle 은 프로세스당 하나뿐이라 쓰지 않는다 — Electron 은 창이 여러 개여도
# 최상위 창 전부를 메인 프로세스 하나가 소유하므로, 그 값으로는 창을 하나밖에 못 본다.
# EnumWindows 로 직접 열거해야 창마다 HWND 를 얻을 수 있다.
# 출력: {"frontmost":"Code","frontId":123456,"windows":[{"app":"Code","id":65792,"x":0,"y":0,"w":1600,"h":900}]}
param([string]$App = "")

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public class PkmonWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

  const uint GW_OWNER = 4;
  // 모니터마다 배율이 다를 때 좌표가 가상화되지 않도록 — 창을 읽기 전에 불러야 한다
  static readonly IntPtr DPI_PER_MONITOR_V2 = new IntPtr(-4);
  public static void MakeDpiAware() { try { SetProcessDpiAwarenessContext(DPI_PER_MONITOR_V2); } catch {} }

  // EnumWindows 는 앞→뒤(z-order) 순으로 돌려준다 — 전역 순서이므로 가림 판정에 그대로 쓸 수 있다
  public static List<int[]> List() {
    var found = new List<int[]>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (IsIconic(h)) return true;                       // 최소화 창은 (-32000,-32000) 을 준다
      if (GetWindow(h, GW_OWNER) != IntPtr.Zero) return true; // 대화상자·팝업 제외, 최상위만
      RECT r;
      if (!GetWindowRect(h, out r)) return true;
      int w = r.Right - r.Left, ht = r.Bottom - r.Top;
      if (w < 200 || ht < 200) return true;               // 툴팁·얇은 보조 창 제외
      int pid; GetWindowThreadProcessId(h, out pid);
      found.Add(new int[] { (int)h.ToInt64(), pid, r.Left, r.Top, w, ht });
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@ -ErrorAction SilentlyContinue

[PkmonWin]::MakeDpiAware()

$front = ""
$frontId = 0
$fg = [PkmonWin]::GetForegroundWindow()
if ($fg -ne [IntPtr]::Zero) {
  $frontId = $fg.ToInt64()
  $ownerId = 0
  [void][PkmonWin]::GetWindowThreadProcessId($fg, [ref]$ownerId)
  $fgProc = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
  if ($fgProc) { $front = $fgProc.ProcessName }
}

# pid → 프로세스 이름은 캐시한다. 창마다 Get-Process 를 부르면 폴링 비용이 커진다
$nameCache = @{}
$items = @()
foreach ($row in [PkmonWin]::List()) {
  $hwnd = $row[0]; $pid = $row[1]
  if (-not $nameCache.ContainsKey($pid)) {
    $p = Get-Process -Id $pid -ErrorAction SilentlyContinue
    $nameCache[$pid] = if ($p) { $p.ProcessName } else { "" }
  }
  $items += ('{"app":"' + $nameCache[$pid] + '","id":' + $hwnd +
             ',"x":' + $row[2] + ',"y":' + $row[3] + ',"w":' + $row[4] + ',"h":' + $row[5] + '}')
}

'{"frontmost":"' + $front + '","frontId":' + $frontId + ',"windows":[' + ($items -join ',') + ']}'
