# Game WebRTC

Ứng dụng game chạy trên trình duyệt, có WebRTC mesh mặc định và topology leader-relay tùy chọn. Có thể dùng Node.js/WebSocket hoặc Laravel/PHP với HTTP polling để phục vụ frontend và signaling.

## Chạy bằng Node.js

```bash
npm install
npm run build:node
npm start
```

Mở `http://localhost:3000`. Node phục vụ `dist` và xử lý WebSocket signaling tại `/signal`.

## Google AdSense

Mã publisher `ca-pub-1165865829120124` được nạp trong các layout trang Laravel thông dụng, trang chủ, landing page đơn giản và game SPA trên `132.one` cùng subdomain. Trên localhost hoặc host khác, script không được tải vì Google không phân phát quảng cáo cho các host này. Bật **Auto ads** cho website trong tài khoản AdSense để Google tự chọn vị trí hiển thị; không cần tạo hoặc cấu hình `data-ad-slot` thủ công cho cách này. Các trang quản trị và trang lỗi không nạp script.

Trong AdSense, thêm website tại **Sites**, hoàn tất xác minh/xét duyệt, sau đó bật **Auto ads** trong phần quảng cáo của website. Quảng cáo có thể chưa xuất hiện ngay nếu website chưa được duyệt, chưa có quảng cáo phù hợp hoặc bị trình chặn quảng cáo chặn. Doanh thu phụ thuộc vào lượt hiển thị và lượt nhấp hợp lệ; không tự nhấp quảng cáo, không yêu cầu người khác nhấp và tuân thủ chính sách AdSense cùng yêu cầu đồng ý cookie/riêng tư áp dụng tại khu vực của bạn.

## Chạy toàn bộ bằng Laravel/PHP

Build frontend và dữ liệu floor plan vào `132.one/public/office-game`:

```bash
npm run build:laravel
```

Đặt web root của máy chủ PHP vào `132.one/public`, cấu hình Laravel và cache theo hướng dẫn của dự án rồi mở `/office-game`. Laravel phục vụ trang, file tĩnh và signaling HTTP tại `/api/office-game/signal`; không cần chạy `node server.js`.

Signaling dùng Laravel cache để chia sẻ trạng thái giữa các request. Mặc định dự án dùng cache file, phù hợp khi chạy một máy chủ PHP; thư mục `132.one/storage/framework/cache` cần quyền ghi. Nếu chạy nhiều máy chủ PHP, cấu hình một cache dùng chung như Redis qua `CACHE_DRIVER` để mọi máy đều thấy cùng trạng thái phòng. Người chơi được xem là mất kết nối sau 15 giây không polling.

HTTP polling có độ trễ signaling cao hơn WebSocket một chút; luồng media và data channel sau khi kết nối vẫn truyền WebRTC P2P như trước.

## Topology mạng

Mặc định `VITE_NETWORK_TOPOLOGY=mesh`: mỗi client kết nối trực tiếp tới các peer khác.

Để thử topology `leader-relay`, mọi client trong phòng phải dùng cùng một build/cấu hình. Các client chỉ kết nối WebRTC tới trưởng phòng; trưởng phòng chuyển tiếp data channel và các audio/video track. Có thể chọn topology lúc build qua biến `VITE_NETWORK_TOPOLOGY=leader-relay`, hoặc thử một URL riêng bằng `?topology=leader-relay`. Giá trị URL chỉ áp dụng cho topology, signaling vẫn theo cấu hình build.

- Node: đặt `VITE_NETWORK_TOPOLOGY=leader-relay` trong `.env`, rồi chạy `npm run build:node` và `npm start`.
- Laravel: đặt `VITE_NETWORK_TOPOLOGY=leader-relay` trong `.env.laravel`, rồi chạy `npm run build:laravel`.

Leader-relay là chế độ thử nghiệm: trưởng phòng nhận từng media stream qua P2P rồi gửi lại cho từng người nhận. Điều này giảm số peer connection ở mỗi client, nhưng tăng tải mạng/CPU của trưởng phòng; người rời phòng sẽ khiến các client phải kết nối lại quanh trưởng phòng mới.

Khi trưởng phòng chạy leader-relay, bảng **Luồng dữ liệu** trên màn hình sẽ hiển thị sơ đồ các peer, hiệu ứng gói dữ liệu đi từ user tới trưởng phòng rồi được chuyển tiếp, cùng danh sách nội dung gần đây. Các cập nhật vị trí liên tục được giới hạn tần suất hiển thị để tránh làm nặng giao diện. Audio/video là luồng media P2P riêng, bảng chỉ ghi nhận lúc track được chuyển tiếp chứ không hiển thị từng frame.

Trạng thái nhân vật không còn phát lặp theo timer khi đứng yên: client so sánh snapshot riêng trên từng DataChannel và chỉ gửi khi vị trí/hướng (độ chính xác 0,01), tư thế, avatar hoặc trạng thái media thay đổi; khi DataChannel mới mở, chỉ peer mới nhận snapshot ban đầu. Log network hiển thị vị trí tới 2 chữ số thập phân để phân biệt những thay đổi nhỏ.

Trong sơ đồ network, đường chấm xám là đang kết nối, đường xanh cyan là DataChannel đã mở; khi có dữ liệu, hạt sáng chạy theo chiều User → Host (xanh lá), rồi Host → Users (tím) và đường tương ứng phát sáng.

## Dùng qua Internet

WebRTC yêu cầu secure context để xin camera/microphone. Phục vụ trang qua HTTPS. Mỗi thiết bị tạo một kết nối P2P tới từng peer khác trong phòng; mô hình mesh phù hợp với phòng nhỏ.

STUN server công cộng đã được cấu hình sẵn. Để bổ sung TURN, đặt `VITE_TURN_URLS` (một hoặc nhiều URL, phân cách bằng dấu phẩy, ví dụ `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`), `VITE_TURN_USERNAME` và `VITE_TURN_CREDENTIAL` trong file môi trường dùng để build. Với Laravel, cấu hình `.env.laravel`; với build mặc định, dùng `.env`. Sau đó build lại ứng dụng để các peer nhận cấu hình mới. Thiếu username hoặc credential khi đã khai báo URL sẽ làm ứng dụng báo lỗi cấu hình rõ ràng.

TURN credential được đưa vào bundle phía trình duyệt nên người dùng có thể xem được; không đặt shared secret dài hạn của coturn hoặc credential nhạy cảm ở đây. Hãy dùng thông tin xác thực ngắn hạn do dịch vụ TURN cấp và giới hạn thời hạn/quyền truy cập. Không có TURN URL và credential từ nhà cung cấp thì ứng dụng vẫn chỉ dùng STUN như trước.

## Floor plan

Edit `src/floor-plan.json` to change the office bounds, floor, meeting rooms, entrance, desk islands, camera, and spawn points. Set `entrance.spawn` to move the entrance spawn; member slots are offsets from that point. If `entrance` is omitted, `defaultSpawn` is used and the entrance visuals are hidden; if both are omitted, spawn defaults to the floor bounds' center. The scene loads this JSON asset and derives rendering, collision, and navigation from it; the signaling servers read the same file for player spawns. Rebuild the app after changing the file for production.

The Werewolf room is configured separately in `src/werewolf-floor-plan.json`; its ritual circle, altar, seats, candle placements, bounds, and lighting are editable there.

For a standalone 2.5D scene without joining signaling or waiting for other players, open `/video?roomType=concert&solo=1`. Add `&debug=1` to enable fast free movement with WASD/arrow keys and vertical movement with Page Up/Page Down. Debug mode hides the local avatar, starts in a top-down view, and cycles through camera views with the mouse wheel. Debug mode also works without `solo=1` and opens the scene standalone. The app redirects to the Office 2.5D scene; standalone modes suppress auto-join and multiplayer chat/member controls.

On touch-enabled screens, an on-screen joystick controls movement only; it does not provide action or interaction buttons.

To build a static, single-user site that opens directly into a selected room type, run:

```bash
npm run build:static -- --room-type concert
```

Room types: `office`, `werewolf`, `quiz`, `lucky-number`, `teams`, `chess-room`, `sabitech`, and `concert`. The generated site is written to `dist-static` by default; use `--out-dir <directory>` to choose another output directory. Each build replaces only the generated `assets`, `office`, `index.html`, and `style.css` paths, preserving Git metadata and other files in the output directory. The output directory must not contain the project directory. Static builds open the selected scene at the site root and generate `/office/` as a direct static route for the Office 2.5D link, so no SPA rewrite configuration is needed. They do not connect to signaling and do not support multiplayer or P2P.

The concert venue perimeter and separate entrance gate behind the welcome gate are configured by `layout.eventBoundary` in `src/concert-floor-plan.json`. Approaching from outside, the welcome gate comes first, followed by the entrance gate about 10 m behind it; the spawn is outside the entrance, and collision and click-to-move paths use the same boundary.

The concert stage video is configured in `layout.stage.videoScreen` in `src/concert-floor-plan.json`. Playback is muted for browser autoplay, loops at the configured duration, and seeks against the server's HTTP clock so clients share the same playback phase. The YouTube video must allow embedding.

### Export concert layout for Blender

Export the concert floor plan as a GLB scene with separately named areas and platforms:

```bash
npm run export:concert
npm run export:concert -- --output exports/ATVNCG2026-D1-2.glb
```

By default, the file is written to `public/models/ATVNCG2026-D1-2.glb`. Import the `.glb` file into Blender with **File → Import → glTF 2.0**. The export includes the venue floor, stage and runway, named concert areas, standing tribunes and fences, seating blocks, and seating runways/stairs. Labels are kept as object names rather than text meshes so the geometry remains easy to edit. The live YouTube video is not embedded in GLB; the exported stage includes a static LED panel.

### Export other floor plans for Blender

Export one floor plan by name:

```bash
npm run export:floor -- office
npm run export:floor -- chess-room --output exports/chess-room.glb
```

Supported names are `office`, `werewolf`, `quiz`, `lucky-number`, `teams`, `chess-room`, `sabitech`, and `concert`. Export all floor plans as separate GLB files with:

```bash
npm run export:all-floors
```

The all-floor command writes files to `exports/floors` by default. Use `--output <directory>` to choose another folder. `sabitech.glb` contains all SabiTech building levels together; `concert.glb` uses the full concert export. Import each `.glb` file into Blender with **File → Import → glTF 2.0**.

To bring supported edits back into a floor-plan JSON, export a floor with these project commands, edit the named objects in Blender, then export the edited scene as GLB with **Include → Custom Properties** enabled so the floor-plan metadata is preserved. Import it with:

```bash
npm run import:floor -- exports/floors/quiz.glb --output exports/quiz-edited.json
```

The importer starts from the original JSON embedded in the GLB and applies transforms, mapped dimensions, and material color for supported named objects. The source floor-plan file is not overwritten unless you explicitly choose it as `--output`. This is not a general mesh-to-schema converter: adding/removing objects or editing mesh topology does not create floor-plan entries, and only objects with an exporter binding update JSON fields. Blender must preserve the GLB custom properties (extras); the importer reports an error if that metadata is missing.

## Cấu trúc

- `server.js`: HTTP static server và WebSocket signaling.
- `public/index.html`: giao diện.
- `public/app.js`: WebRTC offer/answer, ICE, media và data channel chat.
- `public/styles.css`: giao diện responsive.
