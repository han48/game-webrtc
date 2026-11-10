export function getConcertBoundarySegments(boundary) {
  const { minX, maxX, minZ, maxZ, entryWidth, thickness } = boundary;
  const halfEntryWidth = entryWidth / 2;
  const rearSegments = [
    [minX, -halfEntryWidth],
    [halfEntryWidth, maxX],
  ].filter(([start, end]) => end > start);

  return [
    { x: minX, z: (minZ + maxZ) / 2, width: thickness, depth: maxZ - minZ + thickness },
    { x: maxX, z: (minZ + maxZ) / 2, width: thickness, depth: maxZ - minZ + thickness },
    { x: (minX + maxX) / 2, z: minZ, width: maxX - minX + thickness, depth: thickness },
    ...rearSegments.map(([start, end]) => ({
      x: (start + end) / 2,
      z: maxZ,
      width: end - start,
      depth: thickness,
    })),
  ];
}
