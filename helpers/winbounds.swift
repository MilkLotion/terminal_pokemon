import AppKit

// 화면에 떠 있는 창의 소유 앱·위치·크기를 JSON 으로 출력 (접근성 권한 불필요)
// 사용: winbounds [앱이름]   예: winbounds Code
// 출력: {"frontmost":"Code","windows":[{"app":"Code","x":0,"y":30,"w":2560,"h":1324}]}
// 창 목록은 앞에 있는 것부터 나온다 — 첫 항목이 그 앱의 맨 앞 창

let target = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let frontmost = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""

var items: [String] = []
if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
    for w in list {
        guard let owner = w[kCGWindowOwnerName as String] as? String,
              let boundsDict = w[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
              let layer = w[kCGWindowLayer as String] as? Int, layer == 0
        else { continue }
        if !target.isEmpty && owner != target { continue }
        if rect.width < 200 || rect.height < 200 { continue }  // 툴팁·패널 제외
        items.append("{\"app\":\"\(owner)\",\"x\":\(Int(rect.minX)),\"y\":\(Int(rect.minY)),\"w\":\(Int(rect.width)),\"h\":\(Int(rect.height))}")
    }
}
print("{\"frontmost\":\"\(frontmost)\",\"windows\":[\(items.joined(separator: ","))]}")
