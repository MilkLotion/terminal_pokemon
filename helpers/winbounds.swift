import AppKit

// 화면에 떠 있는 창의 소유 앱·고유 ID·위치·크기를 JSON 으로 출력 (접근성 권한 불필요)
// 사용: winbounds [앱이름]   앱이름은 무시된다 — 목록은 언제나 전체다
//   받는 쪽이 앵커 앱만 골라 쓰고, 동시에 "내 창보다 앞에 있는 창"을 알아야 가림 판정을 할 수 있다
// 출력: {"frontmost":"Code","windows":[{"app":"Code","id":12345,"x":0,"y":30,"w":2560,"h":1324}]}
// id 는 CGWindowNumber — 창마다 고유하므로 좌표가 변해도 같은 창을 추적할 수 있다
// 순서는 전역 z-order(앞→뒤) — 앱으로 걸러낸 뒤의 첫 항목이 "그 앱의 맨 앞 창"이다
//   주의: frontmost 앱의 창이 목록에 아예 없을 수 있다(그 앱 창이 전부 다른 Space 일 때). 실측 32.5%
// 다른 Space 의 창은 정지 상태에서는 안 나오지만, Space 전환 애니메이션 중에는 섞여 들어오고
//   좌표가 가상 스트립 값(실좌표 + Space인덱스 × (디스플레이폭+64))으로 바뀐다 — 받는 쪽에서 걸러야 한다

let frontmost = NSWorkspace.shared.frontmostApplication?.localizedName ?? ""

var items: [String] = []
if let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
    for w in list {
        guard let owner = w[kCGWindowOwnerName as String] as? String,
              let boundsDict = w[kCGWindowBounds as String] as? [String: Any],
              let rect = CGRect(dictionaryRepresentation: boundsDict as CFDictionary),
              let layer = w[kCGWindowLayer as String] as? Int, layer == 0,
              let number = w[kCGWindowNumber as String] as? Int,
              let pid = w[kCGWindowOwnerPID as String] as? Int
        else { continue }
        if rect.width < 200 || rect.height < 200 { continue }  // 툴팁·패널 제외
        items.append("{\"app\":\"\(owner)\",\"pid\":\(pid),\"id\":\(number),\"x\":\(Int(rect.minX)),\"y\":\(Int(rect.minY)),\"w\":\(Int(rect.width)),\"h\":\(Int(rect.height))}")
    }
}
print("{\"frontmost\":\"\(frontmost)\",\"windows\":[\(items.joined(separator: ","))]}")
