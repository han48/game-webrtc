# 3D chess models (.glb)

Standalone, viewable 3D models of the game pieces, exported from the same
silhouettes used by the in-game 2.5D renderer (`src/components/chess-pieces-3d.jsx`).

## Files

| File | Piece |
| --- | --- |
| `chess-king.glb` | Cờ Vua — Vua (King), with cross finial |
| `chess-queen.glb` | Cờ Vua — Hậu (Queen), with crown of points |
| `chess-rook.glb` | Cờ Vua — Xe (Rook), with battlements |
| `chess-bishop.glb` | Cờ Vua — Tượng (Bishop), mitre + slit |
| `chess-knight.glb` | Cờ Vua — Mã (Knight), horse head |
| `chess-pawn.glb` | Cờ Vua — Tốt (Pawn) |
| `xiangqi-disc.glb` | Cờ Tướng / Đông Tây — quân đĩa (turned disc) |
| `caro-stone.glb` | Cờ Ca Rô — quân cờ (go stone) |

All are binary glTF 2.0 (`.glb`), units in metres (a piece is ~0.2–0.3 tall,
matching the scene scale).

## How to view

- **Online**: drag a `.glb` onto https://gltf-viewer.donmccurdy.com
- **VS Code**: install the "glTF Tools" extension, then open the file
- **Blender**: File → Import → glTF 2.0 (.glb/.gltf)
- **Windows**: open with the built-in "3D Viewer" app

## Regenerate

```bash
npm run models:export
```

The exporter (`scripts/export-chess-models.js`) builds each piece from lathe
profiles + crown primitives with Three.js and writes a valid GLB — pure Node,
no browser needed.
